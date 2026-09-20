"""Import the CF Push Notion export with its original linked image bytes."""
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path
from urllib.parse import unquote

root = Path(__file__).resolve().parents[1]
with zipfile.ZipFile(sys.argv[1]) as archive:
    notes = next(name for name in archive.namelist() if name.endswith('.md'))
    text = archive.read(notes).decode('utf-8-sig')
    sections = []
    current = None
    for line in text.splitlines():
        heading = re.match(r'^#{2,3} (.+)', line)
        if heading:
            current = {'title': heading[1].replace('**', ''), 'lines': [], 'images': [], 'imageFirst': False}
            sections.append(current)
            continue
        if current is None or not line.strip() or line.strip() == '---':
            continue
        image = re.fullmatch(r'!\[[^\]]*\]\(([^)]+)\)', line.strip())
        if image:
            # Read only explicitly referenced members; never extract archive paths.
            member = unquote(image[1])
            content = archive.read(member)
            if not content.startswith(b'\x89PNG\r\n\x1a\n'):
                raise ValueError('Expected PNG image')
            filename = 'notion-' + hashlib.sha256(content).hexdigest()[:16] + '.png'
            destination = root / 'web/public/portfolio/cf-push' / filename
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(content)
            current['imageFirst'] = not current['lines']
            current['images'].append({'src': '/portfolio/cf-push/' + filename, 'alt': current['title'], 'caption': current['title'] + ' · 원본 자료'})
            continue
        numbered = re.match(r'^(\d+)\. (.*)', line)
        if numbered:
            line = '- ' + numbered[1] + '. ' + numbered[2]
        if current['lines'] and not line.startswith(('-', ' ', '`')) and current['lines'][-1].endswith(','):
            current['lines'][-1] += ' ' + line
        else:
            current['lines'].append(line)
    assert sum(len(s['images']) for s in sections) == 12
    target = root / 'k8s/resume.json'
    data = json.loads(target.read_text(encoding='utf-8'))
    project = next(p for p in data['projects'] if p['id'] == 'cf-push')
    project['sections'] = sections
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Imported {len(sections)} sections and 12 original images')
