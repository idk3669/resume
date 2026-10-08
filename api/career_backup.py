"""Consistent SQLite backup, including WAL; run inside the career-api container."""
import os
from pathlib import Path
import sqlite3
import sys

if __name__ == '__main__':
    source_path = Path(os.environ.get('CAREER_DB_PATH', '.career/career.db')).resolve()
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python -m api.career_backup /tmp/career-backup.db')
    target = Path(sys.argv[1]).resolve()
    if target == source_path or target.exists():
        raise SystemExit('Choose a new backup filename; existing files are not overwritten.')
    # mode=ro prevents accidentally creating an empty source database.
    source = sqlite3.connect(source_path.as_uri() + '?mode=ro', uri=True)
    destination = sqlite3.connect(target)
    try:
        source.backup(destination)
        if destination.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise SystemExit('Backup integrity check failed.')
    finally:
        destination.close()
        source.close()
    print('Backup completed. Treat the backup as private personal data.')
