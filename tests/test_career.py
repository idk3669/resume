import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from fastapi.testclient import TestClient
from pypdf import PdfWriter
from api.career import create_app
from api.career_support import collect, distance_km, password_hash, password_matches, Job, Source, Profile
from api.resume_parser import extract

PASSWORD = 'test-password-not-for-production'
HASH = password_hash(PASSWORD)
ORIGIN = 'https://testserver'
JOB = {'company': '테스트 회사', 'title': '플랫폼 엔지니어', 'description': 'Kubernetes, BOSH 운영',
       'coordinates': {'lat':37.5, 'lng':127.0}}


class CareerTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.path = Path(self.folder.name) / 'career.db'
        self.app = create_app(self.path, HASH, [ORIGIN])
        self.client = TestClient(self.app, base_url=ORIGIN)
        self.client.__enter__()
        self.headers = {'Origin': ORIGIN}

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.folder.cleanup()

    def login(self):
        response = self.client.post('/api/jobs/auth/login', json={'password': PASSWORD}, headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.headers['X-CSRF-Token'] = response.json()['csrf']
        return response

    def add(self):
        response = self.client.post('/api/jobs/items', json=JOB, headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()['id']

    def test_auth_isolation_csrf_logout_and_cookie(self):
        self.assertEqual(self.client.get('/api/jobs/state').status_code, 401)
        self.assertEqual(self.client.post('/api/jobs/auth/login', json={'password': PASSWORD}).status_code, 403)
        result = self.login()
        self.assertIn('HttpOnly', result.headers['set-cookie'])
        self.assertIn('Secure', result.headers['set-cookie'])
        self.assertIn('SameSite=strict', result.headers['set-cookie'])
        self.assertEqual(self.client.post('/api/jobs/items', json=JOB, headers={'Origin': ORIGIN}).status_code, 403)
        self.assertEqual(self.client.post('/api/jobs/items', json=JOB, headers={**self.headers, 'Origin':'https://attacker.invalid'}).status_code, 403)
        self.add()
        self.assertEqual(self.client.get('/api/jobs/state').headers['cache-control'], 'no-store')
        self.client.post('/api/jobs/auth/logout', headers=self.headers)
        self.assertEqual(self.client.get('/api/jobs/state').status_code, 401)

    def test_profile_jobs_status_distance_persistence(self):
        self.login()
        identifier = self.add()
        profile = Profile(professional='BOSH 운영', coordinates={'lat':37.5, 'lng':127.0}).model_dump()
        self.assertEqual(self.client.put('/api/jobs/profile', json=profile, headers=self.headers).status_code, 200)
        self.assertEqual(self.client.patch(f'/api/jobs/items/{identifier}/status', json={'status':'saved'}, headers=self.headers).status_code, 200)
        state = self.client.get('/api/jobs/state').json()
        self.assertEqual(state['jobs'][0]['distance'], 0)
        self.assertEqual(state['statuses'][identifier], 'saved')
        self.assertEqual(state['profile']['professional'], 'BOSH 운영')
        with TestClient(create_app(self.path,HASH,[ORIGIN]),base_url=ORIGIN) as other:
            other.cookies.update(self.client.cookies)
            self.assertEqual(other.get('/api/jobs/state').json()['jobs'][0]['id'], identifier)
        self.assertEqual(self.client.delete(f'/api/jobs/items/{identifier}',headers=self.headers).status_code,200)
        self.assertEqual(self.client.get('/api/jobs/state').json()['jobs'],[])

    def test_upload_txt_docx_pdf_errors_and_no_original_storage(self):
        self.login()
        xml = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>금융권 BOSH 운영</w:t></w:r></w:p></w:body></w:document>'
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as z:
            z.writestr('word/document.xml',xml)
        for name, content in [('resume.txt','TAS 운영'.encode()), ('resume.docx',buffer.getvalue())]:
            result = self.client.post('/api/jobs/resume/extract',params={'filename':name},content=content,headers=self.headers)
            self.assertEqual(result.status_code,200,result.text)
            self.assertIn('운영',result.json()['text'])
            self.assertFalse(result.json()['stored'])
        writer = PdfWriter()
        from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
        page = writer.add_blank_page(width=300, height=200)
        font = DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')})
        page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):font})})
        stream = DecodedStreamObject(); stream.set_data(b'BT /F1 12 Tf 20 100 Td (BOSH Kubernetes) Tj ET')
        page[NameObject('/Contents')] = writer._add_object(stream)
        text_pdf = io.BytesIO(); writer.write(text_pdf)
        result = self.client.post('/api/jobs/resume/extract?filename=resume.pdf',content=text_pdf.getvalue(),headers=self.headers)
        self.assertEqual(result.status_code,200,result.text)
        self.assertIn('BOSH Kubernetes',result.json()['text'])
        writer = PdfWriter()
        writer.add_blank_page(width=100,height=100)
        blank = io.BytesIO();writer.write(blank)
        self.assertEqual(self.client.post('/api/jobs/resume/extract?filename=scan.pdf',content=blank.getvalue(),headers=self.headers).status_code,422)
        self.assertEqual(self.client.post('/api/jobs/resume/extract?filename=file.exe',content=b'x',headers=self.headers).status_code,422)
        self.assertEqual(self.client.post('/api/jobs/resume/extract?filename=huge.txt',content=b'x'*(10*1024*1024+1),headers=self.headers).status_code,413)
        self.assertEqual(self.client.get('/api/jobs/state').json()['profile'],None)
        self.assertTrue(all(p.name.startswith('career.db') for p in Path(self.folder.name).iterdir()))

    def test_source_sync_atomic_upsert_failure_and_status_preserved(self):
        self.login()
        source = {'provider':'greenhouse','slug':'test','company':'테스트'}
        self.client.post('/api/jobs/sources',json=source,headers=self.headers)
        item = {**Job(**JOB).model_dump(),'id':'external-1'}
        with patch('api.career.collect',return_value=[item.copy()]):
            self.assertEqual(self.client.post('/api/jobs/sources/greenhouse-test/sync',headers=self.headers).status_code,200)
        self.client.patch('/api/jobs/items/external-1/status',json={'status':'saved'},headers=self.headers)
        corrected = {**JOB, 'address':'실제 근무지 확인 주소', 'size':'50~99명'}
        self.assertEqual(self.client.put('/api/jobs/items/external-1',json=corrected,headers=self.headers).status_code,200)
        import sqlite3
        def reset_cooldown():
            db = sqlite3.connect(self.path)
            try:
                with db: db.execute('UPDATE sources SET last_attempt=0')
            finally: db.close()
        self.assertEqual(self.client.post('/api/jobs/sources/greenhouse-test/sync',headers=self.headers).status_code,429)
        reset_cooldown()
        with patch('api.career.collect',side_effect=ValueError('secret internal error')):
            response=self.client.post('/api/jobs/sources/greenhouse-test/sync',headers=self.headers)
            self.assertEqual(response.status_code,502)
            self.assertNotIn('secret internal',response.text)
        state=self.client.get('/api/jobs/state').json()
        self.assertTrue(state['jobs'][0]['active'])
        reset_cooldown()
        with patch('api.career.collect',return_value=[item.copy()]):
            self.client.post('/api/jobs/sources/greenhouse-test/sync',headers=self.headers)
        self.assertEqual(len(self.client.get('/api/jobs/state').json()['jobs']),1)
        job = self.client.get('/api/jobs/state').json()['jobs'][0]
        self.assertEqual(job['address'], corrected['address'])
        self.assertEqual(job['coordinates'], corrected['coordinates'])
        self.assertEqual(job['size'], corrected['size'])
        reset_cooldown()
        with patch('api.career.collect',return_value=[]):
            self.client.post('/api/jobs/sources/greenhouse-test/sync',headers=self.headers)
        state=self.client.get('/api/jobs/state').json()
        self.assertFalse(state['jobs'][0]['active'])
        self.assertEqual(state['statuses']['external-1'],'saved')

    def test_rate_limit_missing_config_and_password_rotation(self):
        for _ in range(10):
            self.assertEqual(self.client.post('/api/jobs/auth/login',json={'password':'wrong'},headers=self.headers).status_code,401)
        self.assertEqual(self.client.post('/api/jobs/auth/login',json={'password':PASSWORD},headers=self.headers).status_code,429)
        with TestClient(create_app(self.path,'',[ORIGIN]),base_url=ORIGIN) as client:
            self.assertFalse(client.get('/api/jobs/auth/session').json()['configured'])
            self.assertEqual(client.get('/api/jobs/state').status_code,503)

    def test_expired_session_and_rotated_password(self):
        self.login()
        with TestClient(create_app(self.path,password_hash('another-secure-password'),[ORIGIN]),base_url=ORIGIN) as client:
            client.cookies.update(self.client.cookies)
            self.assertEqual(client.get('/api/jobs/state').status_code,401)
        import sqlite3
        db = sqlite3.connect(self.path)
        try:
            with db: db.execute('UPDATE sessions SET expires=0')
        finally: db.close()
        self.assertEqual(self.client.get('/api/jobs/state').status_code,401)

    def test_invalid_inputs_and_geocoding_key_required(self):
        self.login()
        for body in [{**JOB,'url':'javascript:alert(1)'},{**JOB,'coordinates':{'lat':100,'lng':0}},{**JOB,'admin':True}]:
            self.assertEqual(self.client.post('/api/jobs/items',json=body,headers=self.headers).status_code,422)
        self.assertEqual(self.client.post('/api/jobs/sources',json={'provider':'greenhouse','company':'x','slug':'../../localhost'},headers=self.headers).status_code,422)
        with patch.dict('os.environ',{'KAKAO_REST_API_KEY':''}):
            self.assertEqual(self.client.get('/api/jobs/places?query=신림역').status_code,503)


class ReaderTests(unittest.TestCase):
    def test_greenhouse_and_lever_fixtures(self):
        with patch('api.career_support.fetch_json',return_value={'jobs':[{'id':123,'title':'Cloud Engineer','content':'&lt;p&gt;AWS 운영&lt;/p&gt;','absolute_url':'https://example.org/job','location':{'name':'Seoul'}}],'meta':{'total':1}}):
            job=collect(Source(provider='greenhouse',slug='sample',company='샘플').model_dump())[0]
            self.assertEqual(job['role'],'클라우드');self.assertEqual(job['region'],'서울')
            self.assertEqual(job['description'],'AWS 운영')
        with patch('api.career_support.fetch_json',return_value=[{'id':'abc','text':'DevOps Engineer','descriptionPlain':'Kubernetes','lists':[{'text':'Requirements','content':'<li>Python</li>'}],'hostedUrl':'https://example.org/job','categories':{'location':'Seoul'}}]):
            job=collect(Source(provider='lever',slug='sample',company='샘플').model_dump())[0]
            self.assertIn('Python',job['description']);self.assertEqual(job['role'],'DevOps')

    def test_guards_and_distance(self):
        from api.career_support import fetch_json
        for url in ['http://localhost','https://169.254.169.254/latest','https://api.lever.co:8080/a','https://api.lever.co.evil.test/a']:
            with self.assertRaises(ValueError): fetch_json(url)
        self.assertTrue(password_matches(PASSWORD,HASH))
        self.assertFalse(password_matches('wrong',HASH))
        self.assertIsNone(distance_km(None,{'lat':0,'lng':0}))
        self.assertAlmostEqual(distance_km({'lat':0,'lng':0},{'lat':0,'lng':1}),111.19,places=2)
        with self.assertRaises(ValueError): extract(b'',' .txt')
        buffer=io.BytesIO()
        with zipfile.ZipFile(buffer,'w') as z:z.writestr('word/document.xml','<!DOCTYPE foo><doc/>')
        with self.assertRaises(ValueError):extract(buffer.getvalue(),'.docx')


if __name__=='__main__':
    unittest.main()
