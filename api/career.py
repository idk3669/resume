"""Single-owner private API. Run separately from the public resume API (one worker)."""
import asyncio
from contextlib import asynccontextmanager, contextmanager
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import sqlite3
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from api.career_support import Job, Location, Login, Profile, Source, Status
from api.career_support import collect, distance_km, password_matches, search_places
from api.resume_parser import MAX_BYTES

COOKIE = 'career_session'
SESSION_SECONDS = 8 * 60 * 60


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def create_app(db_path=None, password=None, allowed_origins=None, secure_cookie=None):
    database = Path(db_path or os.getenv('CAREER_DB_PATH', '.career/career.db'))
    encoded = password if password is not None else os.getenv('CAREER_PASSWORD_HASH', '')
    origins = set(allowed_origins or os.getenv('CAREER_ALLOWED_ORIGINS', 'https://kjh-resume.cloud').split(','))
    secure = secure_cookie if secure_cookie is not None else os.getenv('CAREER_COOKIE_SECURE', 'true').lower() == 'true'
    epoch = hashlib.sha256(encoded.encode()).hexdigest()
    collect_lock, parser_lock = threading.Lock(), asyncio.Lock()

    @contextmanager
    def db():
        connection = sqlite3.connect(database, timeout=10)
        connection.row_factory = sqlite3.Row
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    @asynccontextmanager
    async def lifespan(app):
        database.parent.mkdir(parents=True, exist_ok=True)
        with db() as conn:
            conn.execute('PRAGMA journal_mode=WAL')
            conn.executescript('''
                CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires REAL NOT NULL, epoch TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS attempts (at REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, source TEXT, data TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', active INTEGER NOT NULL DEFAULT 1, created TEXT NOT NULL, updated TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, data TEXT NOT NULL, last_attempt REAL DEFAULT 0, last_success TEXT, error TEXT);
            ''')
        yield

    app = FastAPI(title='Private Career Workspace', lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    def check_quota(conn):
        count, size = conn.execute('SELECT COUNT(*), COALESCE(SUM(length(CAST(data AS BLOB))),0) FROM jobs').fetchone()
        if count > 1000 or size > 12 * 1024 * 1024:
            raise HTTPException(409, '개인 보드 저장 한도(1,000개 또는 본문 12MB)입니다. 불필요한 공고를 삭제해 주세요.')

    @app.middleware('http')
    async def guards(request, call_next):
        if request.url.path.startswith('/api/jobs/'):
            if request.method not in ('GET', 'HEAD', 'OPTIONS') and request.headers.get('origin') not in origins:
                return JSONResponse({'detail': '허용되지 않은 요청 출처입니다.'}, status_code=403)
            limit = MAX_BYTES if request.url.path == '/api/jobs/resume/extract' else 256 * 1024
            # Bound actual streamed bodies as well as Content-Length before JSON validation.
            if request.method in ('POST', 'PUT', 'PATCH'):
                body = bytearray()
                async for chunk in request.stream():
                    body.extend(chunk)
                    if len(body) > limit:
                        return JSONResponse({'detail': '요청 크기 제한을 초과했습니다.'}, status_code=413)
                request._body = bytes(body)
        result = await call_next(request)
        result.headers['Cache-Control'] = 'no-store'
        result.headers['X-Content-Type-Options'] = 'nosniff'
        return result

    def session(request: Request):
        if not encoded:
            raise HTTPException(503, '관리자 비밀번호가 아직 설정되지 않았습니다.')
        token = hashlib.sha256(request.cookies.get(COOKIE, '').encode()).hexdigest()
        with db() as conn:
            row = conn.execute('SELECT * FROM sessions WHERE token=? AND expires>? AND epoch=?', (token, time.time(), epoch)).fetchone()
        if not row:
            raise HTTPException(401, '로그인이 필요합니다.')
        if request.method not in ('GET', 'HEAD') and not hmac.compare_digest(row['csrf'], request.headers.get('x-csrf-token', '')):
            raise HTTPException(403, '세션을 새로고침한 후 다시 시도해 주세요.')
        return dict(row)

    @app.get('/health/live')
    def live():
        return {'status': 'alive'}

    @app.get('/health/ready')
    def ready():
        with db() as conn:
            conn.execute('SELECT 1 FROM settings LIMIT 1').fetchone()
        return {'status': 'ready'}

    @app.get('/api/jobs/auth/session')
    def auth_session(request: Request):
        try:
            current = session(request)
            return {'authenticated': True, 'configured': True, 'csrf': current['csrf']}
        except HTTPException as error:
            if error.status_code not in (401, 503):
                raise
            return {'authenticated': False, 'configured': bool(encoded)}

    @app.post('/api/jobs/auth/login')
    def login(payload: Login, response: Response):
        if not encoded:
            raise HTTPException(503, '관리자 비밀번호가 아직 설정되지 않았습니다.')
        stamp = time.time()
        # Single-owner global limit. Never trust forwarded IP headers for authentication.
        with db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            conn.execute('DELETE FROM attempts WHERE at<?', (stamp - 900,))
            if conn.execute('SELECT COUNT(*) FROM attempts').fetchone()[0] >= 10:
                raise HTTPException(429, '로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.')
            conn.execute('INSERT INTO attempts VALUES (?)', (stamp,))
        if not password_matches(payload.password, encoded):
            raise HTTPException(401, '비밀번호가 일치하지 않습니다.')
        raw, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        with db() as conn:
            conn.execute('DELETE FROM sessions WHERE expires<? OR epoch!=?', (stamp, epoch))
            conn.execute('INSERT INTO sessions VALUES (?,?,?,?)', (hashlib.sha256(raw.encode()).hexdigest(), csrf, stamp + SESSION_SECONDS, epoch))
        response.set_cookie(COOKIE, raw, max_age=SESSION_SECONDS, httponly=True, secure=secure, samesite='strict', path='/api/jobs')
        return {'authenticated': True, 'csrf': csrf}

    @app.post('/api/jobs/auth/logout')
    def logout(response: Response, current=Depends(session)):
        with db() as conn:
            conn.execute('DELETE FROM sessions WHERE token=?', (current['token'],))
        response.delete_cookie(COOKIE, path='/api/jobs', secure=secure, httponly=True, samesite='strict')
        return {'ok': True}

    @app.get('/api/jobs/state', dependencies=[Depends(session)])
    def state():
        with db() as conn:
            row = conn.execute("SELECT value FROM settings WHERE key='profile'").fetchone()
            profile = json.loads(row['value']) if row else None
            jobs, statuses = [], {}
            for item in conn.execute('SELECT * FROM jobs ORDER BY created DESC'):
                job = json.loads(item['data'])
                job.update(id=item['id'], source=item['source'] or 'manual', active=bool(item['active']), createdAt=item['created'], updatedAt=item['updated'])
                job['distance'] = distance_km((profile or {}).get('coordinates'), job.get('coordinates'))
                jobs.append(job)
                statuses[item['id']] = item['status']
            sources = [{**json.loads(row['data']), 'id': row['id'], 'lastSuccess': row['last_success'], 'error': row['error']} for row in conn.execute('SELECT * FROM sources')]
        return {'profile': profile, 'jobs': jobs, 'statuses': statuses, 'sources': sources,
                'capabilities': {'geocoding': bool(os.getenv('KAKAO_REST_API_KEY')), 'llm': False}}

    @app.put('/api/jobs/profile', dependencies=[Depends(session)])
    def save_profile(profile: Profile):
        with db() as conn:
            conn.execute("INSERT INTO settings VALUES ('profile',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (profile.model_dump_json(),))
        return {'ok': True}

    def parse_document(content, extension):
        try:
            result = subprocess.run([sys.executable, '-m', 'api.resume_parser', extension], input=content,
                                    capture_output=True, timeout=15, cwd=Path(__file__).resolve().parents[1])
            parsed = json.loads(result.stdout)
            if result.returncode or 'error' in parsed:
                raise HTTPException(422, parsed.get('error', '파일 분석에 실패했습니다.'))
            return {'text': parsed['text'], 'stored': False, 'method': 'text-extraction'}
        except (subprocess.TimeoutExpired, json.JSONDecodeError):
            raise HTTPException(422, '파일이 너무 복잡하거나 손상되어 분석을 완료하지 못했습니다.') from None

    @app.post('/api/jobs/resume/extract', dependencies=[Depends(session)])
    async def extract_resume(request: Request, filename: str = Query(max_length=200)):
        extension = Path(filename).suffix.lower()
        if extension not in ('.pdf', '.docx', '.txt'):
            raise HTTPException(422, 'PDF, DOCX, TXT만 지원합니다.')
        if parser_lock.locked():
            raise HTTPException(429, '다른 파일을 분석 중입니다. 잠시 후 다시 시도해 주세요.')
        async with parser_lock:
            return await run_in_threadpool(parse_document, await request.body(), extension)

    @app.post('/api/jobs/items', dependencies=[Depends(session)])
    def add_job(job: Job):
        identifier, stamp = secrets.token_hex(16), now_iso()
        with db() as conn:
            conn.execute('INSERT INTO jobs(id,data,created,updated) VALUES (?,?,?,?)', (identifier, job.model_dump_json(), stamp, stamp))
            check_quota(conn)
        return {'id': identifier}

    @app.patch('/api/jobs/items/{identifier}/status', dependencies=[Depends(session)])
    def set_status(identifier: str, value: Status):
        with db() as conn:
            if not conn.execute('UPDATE jobs SET status=? WHERE id=?', (value.status, identifier)).rowcount:
                raise HTTPException(404, '공고를 찾을 수 없습니다.')
        return {'ok': True}

    @app.put('/api/jobs/items/{identifier}', dependencies=[Depends(session)])
    def update_job(identifier: str, job: Job):
        with db() as conn:
            old = conn.execute('SELECT data,source FROM jobs WHERE id=?', (identifier,)).fetchone()
            if not old:
                raise HTTPException(404, '공고를 찾을 수 없습니다.')
            value = job.model_dump()
            if old['source']:
                previous = json.loads(old['data'])
                value['sourceAddress'] = previous.get('sourceAddress', previous.get('address', ''))
                value['locationOverride'] = bool(value['coordinates'] or value['address'] != value['sourceAddress'])
            conn.execute('UPDATE jobs SET data=?,updated=? WHERE id=?', (json.dumps(value,ensure_ascii=False),now_iso(),identifier))
            check_quota(conn)
        return {'ok': True}

    @app.delete('/api/jobs/items/{identifier}', dependencies=[Depends(session)])
    def delete_job(identifier: str):
        with db() as conn:
            conn.execute('DELETE FROM jobs WHERE id=?', (identifier,))
        return {'ok': True}

    @app.post('/api/jobs/sources', dependencies=[Depends(session)])
    def add_source(source: Source):
        identifier = f'{source.provider}-{source.slug}'
        with db() as conn:
            if conn.execute('SELECT COUNT(*) FROM sources').fetchone()[0] >= 30:
                raise HTTPException(409, '수집처는 최대 30개입니다.')
            conn.execute('INSERT INTO sources(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data', (identifier, source.model_dump_json()))
        return {'id': identifier}

    @app.delete('/api/jobs/sources/{identifier}', dependencies=[Depends(session)])
    def delete_source(identifier: str):
        if not collect_lock.acquire(blocking=False):
            raise HTTPException(409, '수집 완료 후 다시 시도해 주세요.')
        try:
            with db() as conn:
                conn.execute('DELETE FROM sources WHERE id=?', (identifier,))
        finally:
            collect_lock.release()
        return {'ok': True}

    @app.post('/api/jobs/sources/{identifier}/sync', dependencies=[Depends(session)])
    def sync_source(identifier: str):
        if not collect_lock.acquire(blocking=False):
            raise HTTPException(409, '이미 수집 중입니다. 완료 후 다시 시도해 주세요.')
        try:
            with db() as conn:
                source = conn.execute('SELECT * FROM sources WHERE id=?', (identifier,)).fetchone()
                if not source:
                    raise HTTPException(404, '수집처를 찾을 수 없습니다.')
                if source['last_attempt'] > time.time() - 60:
                    raise HTTPException(429, '같은 수집처는 1분 후 다시 조회해 주세요.')
                conn.execute('UPDATE sources SET last_attempt=? WHERE id=?', (time.time(), identifier))
            try:
                jobs = collect(json.loads(source['data']))
                stamp = now_iso()
                with db() as conn:
                    old = {r['id']: r for r in conn.execute('SELECT * FROM jobs WHERE source=?', (identifier,))}
                    all_count = conn.execute('SELECT COUNT(*) FROM jobs').fetchone()[0]
                    if all_count + sum(j['id'] not in old for j in jobs) > 1000:
                        raise ValueError('공고 저장 한도입니다.')
                    # Only a complete successful snapshot may mark a post inactive.
                    conn.execute('UPDATE jobs SET active=0 WHERE source=?', (identifier,))
                    for job in jobs:
                        job_id = job.pop('id')
                        job['sourceAddress'] = job['address']
                        if job_id in old:
                            previous = json.loads(old[job_id]['data'])
                            job['size'] = previous.get('size', '미확인')
                            if previous.get('locationOverride') and job['sourceAddress'] == previous.get('sourceAddress',previous.get('address')):
                                job['address'] = previous['address']
                                job['coordinates'] = previous.get('coordinates')
                                job['locationOverride'] = True
                            elif job['address'] == previous.get('address'):
                                job['coordinates'] = previous.get('coordinates')
                        conn.execute('INSERT INTO jobs(id,source,data,created,updated) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,active=1,updated=excluded.updated',
                                     (job_id, identifier, json.dumps(job, ensure_ascii=False), stamp, stamp))
                    conn.execute('UPDATE sources SET last_success=?,error=NULL WHERE id=?', (stamp, identifier))
                    check_quota(conn)
                return {'count': len(jobs), 'syncedAt': stamp}
            except Exception:
                message = '수집하지 못했습니다. 게시판 식별자·API 응답·저장 한도를 확인해 주세요. 기존 공고는 유지합니다.'
                with db() as conn:
                    conn.execute('UPDATE sources SET error=? WHERE id=?', (message, identifier))
                raise HTTPException(502, message) from None
        finally:
            collect_lock.release()

    @app.get('/api/jobs/places', dependencies=[Depends(session)])
    def places(query: str = Query(min_length=2, max_length=200)):
        key = os.getenv('KAKAO_REST_API_KEY')
        if not key:
            raise HTTPException(503, '서버에 Kakao REST API 키가 없습니다. 좌표를 직접 입력할 수도 있습니다.')
        try:
            return search_places(query, key)
        except Exception:
            raise HTTPException(502, '장소 검색에 실패했습니다. API 키·사용 권한·할당량을 확인해 주세요.') from None

    return app


app = create_app()
