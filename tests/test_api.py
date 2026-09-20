import json
from pathlib import Path
import tempfile
import unittest
from fastapi.testclient import TestClient
from api.main import create_app

DATA = Path(__file__).resolve().parents[1] / 'k8s' / 'resume.json'

class ApiTests(unittest.TestCase):
    def test_reads_and_project_consistency(self):
        with TestClient(create_app(DATA)) as client:
            self.assertEqual(client.get('/health/live').status_code, 200)
            self.assertEqual(client.get('/health/ready').status_code, 200)
            response = client.get('/api/resume')
            self.assertEqual(response.status_code, 200)
            resume = response.json()
            self.assertEqual(resume['profile']['employmentStart'], '2021-09-06')
            self.assertEqual(resume['profile']['employmentEnd'], '2026-05-15')
            self.assertNotIn('projects', resume)
            projects = client.get('/api/projects').json()
            self.assertEqual(len(projects), 15)
            maintenance = next(p for p in projects if p['id'] == 'nh-maintenance')
            self.assertEqual(maintenance['client'], 'NH농협은행 / 농협중앙회')
            self.assertIn('NH 내부 세미나 발표 3회 진행', str(maintenance['sections']))
            card = next(p for p in projects if p['id'] == 'nh-card')
            self.assertIn('본인 기여도', [s['title'] for s in card['sections']])
            for project in projects:
                self.assertEqual(client.get('/api/projects/' + project['id']).json(), project)
            self.assertEqual(client.get('/api/projects/missing').status_code, 404)

    def test_write_methods_denied(self):
        with TestClient(create_app(DATA)) as client:
            for path in ['/api/resume', '/api/projects', '/api/projects/nh-card']:
                for method in ['POST', 'PUT', 'PATCH', 'DELETE']:
                    with self.subTest(path=path, method=method):
                        self.assertEqual(client.request(method, path, json={}).status_code, 405)
            self.assertEqual(client.get('/api/resume').json()['profile']['name'], '김진현')

    def test_missing_invalid_and_bad_references_stay_unready(self):
        invalids = ['{', '{}']
        source = json.loads(DATA.read_text(encoding='utf-8'))
        source['projects'][1]['id'] = source['projects'][0]['id']
        invalids.append(json.dumps(source))
        source = json.loads(DATA.read_text(encoding='utf-8'))
        source['highlights'][0]['projectId'] = 'nonexistent'
        invalids.append(json.dumps(source))
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'data.json'
            for content in [None, *invalids]:
                if content is not None:
                    path.write_text(content, encoding='utf-8')
                with self.subTest(content=content), TestClient(create_app(path)) as client:
                    self.assertEqual(client.get('/health/live').status_code, 200)
                    self.assertEqual(client.get('/health/ready').status_code, 503)
                    self.assertEqual(client.get('/api/resume').status_code, 503)

    def test_unapproved_personal_fields_absent(self):
        with TestClient(create_app(DATA)) as client:
            text = client.get('/api/resume').text
            for private_value in ['010-6540-6684', '1997.01.08', '남부순환로', '504호']:
                self.assertNotIn(private_value, text)

if __name__ == '__main__':
    unittest.main()
