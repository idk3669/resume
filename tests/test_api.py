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
            self.assertEqual(len(projects), 14)
            self.assertEqual(sum(p['collection'] == 'projects' for p in projects), 7)
            self.assertNotIn('nh-central-production', [p['id'] for p in projects])
            central = next(p for p in projects if p['id'] == 'nh-central-development')
            self.assertEqual(central['title'], 'NH중앙회 프라이빗 클라우드 구축 프로젝트')
            self.assertEqual(central['period'], '2023.07 ~ 2024.06')
            self.assertEqual(sum(p['collection'] == 'portfolio' for p in projects), 7)
            self.assertEqual(resume['highlights'], [])
            cf = next(p for p in projects if p['id'] == 'cf-push')
            self.assertEqual(len(cf['sections']), 22)
            figures = [image for section in cf['sections'] for image in section['images']]
            self.assertEqual(len(figures), 12)
            for image in figures:
                self.assertTrue((DATA.parents[1] / 'web/public' / image['src'].lstrip('/')).is_file())
            maintenance = next(p for p in projects if p['id'] == 'nh-maintenance')
            self.assertEqual(maintenance['client'], 'NH농협은행 / 농협중앙회')
            self.assertIn('장애 사례 분석 및 사내 세미나 발표', str(maintenance['sections']))
            self.assertNotIn('NH 내부 세미나 발표 3회 진행', str(maintenance['sections']))
            card = next(p for p in projects if p['id'] == 'nh-card')
            self.assertEqual([s['title'] for s in card['sections']], ['프로젝트 개요', '주요 수행 내용 및 성과'])
            expected_counts = {'nh-maintenance': 8, 'nh-card': 7, 'nh-central-development': 8,
                               'allone-aws-dr': 7, 'kb-life-dr': 6, 'nh-information': 4, 'nh-elk': 3}
            for item in projects:
                if item['id'] in expected_counts:
                    self.assertEqual(len(item['sections']), 2)
                    headings = [line for line in item['sections'][1]['lines'] if line.startswith('- **')]
                    self.assertEqual(len(headings), expected_counts[item['id']])
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

    def test_portfolio_rich_content_and_assets(self):
        data = json.loads(DATA.read_text(encoding='utf-8'))
        with TestClient(create_app(DATA)) as client:
            for project in data['projects']:
                if project['id'] not in ['rabbitmq', 'routing', 'gemfire-ha', 'marketing-performance', 'allone', 'log-cache']:
                    continue
                response = client.get('/api/projects/' + project['id'])
                self.assertEqual(response.status_code, 200)
                blocks = [b for s in response.json()['sections'] for b in s['blocks']]
                self.assertTrue(any(b['type'] == 'text' for b in blocks))
                self.assertTrue(any(b['type'] == 'image' for b in blocks))
                for block in blocks:
                    if block['type'] == 'image':
                        path = DATA.parents[1] / 'web/public' / block['image']['src'].lstrip('/')
                        self.assertTrue(path.is_file(), str(path))
                    if block['type'] == 'table':
                        self.assertTrue(all(len(r) == len(block['headers']) for r in block['rows']))

    def test_log_cache_flow_is_last_and_calculation_is_explicit(self):
        with TestClient(create_app(DATA)) as client:
            project = client.get('/api/projects/log-cache').json()
            self.assertEqual(project['title'], '플랫폼 VM 리소스 최적화')
            self.assertEqual(len(project['sections']), 9)
            final = project['sections'][-1]
            self.assertEqual(final['title'], '로그 처리 흐름도')
            self.assertEqual(final['blocks'][0]['type'], 'image')
            self.assertEqual(final['blocks'][0]['image']['src'], '/portfolio/log-cache/log-processing-flow.png')
            text = json.dumps(project, ensure_ascii=False)
            self.assertIn('9,135,000', text)
            self.assertIn('근거 확인이 필요', text)

    def test_missing_invalid_and_bad_references_stay_unready(self):
        invalids = ['{', '{}']
        source = json.loads(DATA.read_text(encoding='utf-8'))
        source['projects'][1]['id'] = source['projects'][0]['id']
        invalids.append(json.dumps(source))
        source = json.loads(DATA.read_text(encoding='utf-8'))
        source['highlights'] = [{'value': '1', 'unit': '', 'label': 'test', 'detail': '', 'projectId': 'nonexistent'}]
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
