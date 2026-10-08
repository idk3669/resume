"""JSON-lines ASGI test bridge for environments without loopback networking.

Used only by Playwright tests: every browser request still runs the actual FastAPI
middleware, authentication, parsers and SQLite repository. No API fixtures.
"""
import base64
import json
from pathlib import Path
import sys
import tempfile

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from api.career import create_app
from api.career_support import password_hash

with tempfile.TemporaryDirectory() as directory:
    app=create_app(Path(directory)/'browser.db',password_hash('browser-test-password'),['http://career.test'],False)
    with TestClient(app,base_url='http://career.test') as client:
        for line in sys.stdin:
            command=json.loads(line)
            try:
                client.cookies.clear()  # Each browser owns its cookies, not this bridge.
                result=client.request(command['method'],command['path'],headers=command['headers'],content=base64.b64decode(command['body']))
                reply={'id':command['id'],'status':result.status_code,'headers':dict(result.headers),'body':base64.b64encode(result.content).decode()}
            except Exception as error:
                reply={'id':command['id'],'error':str(error)}
            print(json.dumps(reply),flush=True)
