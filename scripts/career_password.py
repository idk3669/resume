"""Run locally; prints a one-way hash only. Never put the password in Git or arguments."""
from getpass import getpass
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from api.career_support import password_hash

if __name__ == '__main__':
    password = getpass('개인 채용 보드 비밀번호 (6자 이상): ')
    if not 6 <= len(password) <= 256 or password != getpass('비밀번호 확인: '):
        raise SystemExit('6~256자여야 하며 두 입력이 같아야 합니다.')
    print(password_hash(password))
