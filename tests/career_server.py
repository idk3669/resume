"""Loopback-only browser-test server with disposable state (never production)."""
from pathlib import Path
import os
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import uvicorn
from api.career import create_app
from api.career_support import password_hash

if __name__ == '__main__':
    with tempfile.TemporaryDirectory() as directory:
        app = create_app(Path(directory)/'test.db', password_hash('browser-test-password'),
                         ['http://127.0.0.1:5174'], secure_cookie=False)
        uvicorn.run(app, host='127.0.0.1', port=8001, access_log=False)
