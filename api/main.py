"""Read-only resume API. Dataset is validated once per process startup."""
from contextlib import asynccontextmanager
import logging
import os
from pathlib import Path
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')

class Profile(StrictModel):
    name: str
    englishName: str
    role: str
    headline: str
    intro: str
    email: str
    experience: str
    employmentStart: str
    employmentEnd: str
    focus: str
    growth: str

class Highlight(StrictModel):
    value: str
    unit: str
    label: str
    detail: str
    projectId: str

class Skill(StrictModel):
    title: str
    description: str
    items: list[str]

class Career(StrictModel):
    company: str
    position: str
    period: str
    description: str
    bullets: list[str]

class Credential(StrictModel):
    name: str
    detail: str

class ProjectSection(StrictModel):
    title: str
    lines: list[str]

class Project(StrictModel):
    id: str = Field(pattern=r'^[a-z0-9-]+$')
    category: str
    title: str
    subtitle: str
    period: str
    tags: list[str]
    result: str
    context: str
    analysis: str
    actions: list[str]
    outcome: str
    client: str = ''
    contractor: str = ''
    role: str = ''
    sections: list[ProjectSection] = Field(default_factory=list)
    collection: str = 'projects'
    sourcePages: str = ''

class Resume(StrictModel):
    profile: Profile
    highlights: list[Highlight]
    skills: list[Skill]
    career: list[Career]
    education: list[Credential]
    certifications: list[Credential]

class Dataset(Resume):
    projects: list[Project] = Field(min_length=1)

    @model_validator(mode='after')
    def valid_references(self):
        ids = [p.id for p in self.projects]
        if len(ids) != len(set(ids)):
            raise ValueError('Project ids must be unique')
        if any(h.projectId not in ids for h in self.highlights):
            raise ValueError('Highlight references an unknown project')
        return self

def create_app(data_path: Path | None = None):
    path = data_path or Path(os.getenv('RESUME_DATA_PATH', Path(__file__).resolve().parents[1] / 'k8s' / 'resume.json'))

    @asynccontextmanager
    async def lifespan(app):
        app.state.dataset = None
        try:
            app.state.dataset = Dataset.model_validate_json(path.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            # Liveness stays healthy; readiness blocks traffic until a corrected rollout.
            logging.getLogger('uvicorn.error').error('Resume dataset missing or invalid; readiness disabled')
        yield
        app.state.dataset = None

    app = FastAPI(title='Resume API', version='1.0.0', lifespan=lifespan,
                  docs_url=None, redoc_url=None, openapi_url=None)

    def dataset():
        result = app.state.dataset
        if result is None:
            raise HTTPException(503, 'Resume data is not ready')
        return result

    @app.middleware('http')
    async def headers(request, call_next):
        response = await call_next(request)
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Cache-Control'] = 'no-store'
        return response

    @app.get('/health/live')
    def live():
        return {'status': 'alive'}

    @app.get('/health/ready')
    def ready():
        dataset()
        return {'status': 'ready'}

    @app.get('/api/resume', response_model=Resume)
    def resume():
        return dataset()

    @app.get('/api/projects', response_model=list[Project])
    def projects():
        return dataset().projects

    @app.get('/api/projects/{project_id}', response_model=Project)
    def project(project_id: str):
        for item in dataset().projects:
            if item.id == project_id:
                return item
        raise HTTPException(404, 'Project not found')

    return app

app = create_app()
