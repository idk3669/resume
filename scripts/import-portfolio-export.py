"""Import the supplied Notion case studies, retaining text/image/table/code order.

Generated dataset and binary assets are derived mechanically from the archive.
Existing CF Push and cases without a full chapter are deliberately preserved.
"""
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
CASE_IDS = {2: 'rabbitmq', 3: 'routing', 4: 'gemfire-ha',
            5: 'marketing-performance', 6: 'allone'}
BOUNDARY = re.compile(r'^## 프로젝트외 활동 내역\((\d+)\).*$', re.M)
IMAGE = re.compile(r'^!\[[^\]]*\]\((.+)\)$')


def parse_case(text, archive, case_id):
    sections = []
    current = None
    lines = text.splitlines()
    i = 0

    def section(title):
        nonlocal current
        current = {'title': title.replace('**', '').strip(), 'lines': [], 'blocks': []}
        sections.append(current)

    while i < len(lines):
        line = lines[i]
        i += 1
        clean = line.strip()
        if clean.startswith('<aside>'):
            break  # Closing thank-you block is not part of a case study.
        if not clean or clean == '---':
            continue
        # The chapter title may continue on the next line. Its card already names it.
        if current is None and not re.match(r'^#{2,6}\s', clean) and not IMAGE.match(clean):
            continue
        if clean.startswith('```'):
            code = []
            while i < len(lines) and not lines[i].strip().startswith('```'):
                code.append(lines[i])
                i += 1
            if i == len(lines):
                raise ValueError('Unclosed code block')
            i += 1
            current['blocks'].append({'type': 'code', 'language': 'text', 'text': '\n'.join(code)})
            continue
        heading = re.match(r'^#{2,6}\s+(.+)', clean)
        if heading:
            section(heading[1])
            continue
        if current is None:
            section('구성 개요')
        match = IMAGE.match(clean)
        if match:
            member = unquote(match[1])
            content = archive.read(member)  # No archive path is extracted to disk.
            if content.startswith(b'\x89PNG\r\n\x1a\n'):
                ext = '.png'
            elif content.startswith(b'\xff\xd8\xff'):
                ext = '.jpg'
            else:
                raise ValueError(f'Unsupported image format: {member}')
            filename = 'notion-' + hashlib.sha256(content).hexdigest()[:16] + ext
            directory = ROOT / 'web/public/portfolio' / case_id
            directory.mkdir(parents=True, exist_ok=True)
            (directory / filename).write_bytes(content)
            current['blocks'].append({'type': 'image', 'image': {
                'src': f'/portfolio/{case_id}/{filename}',
                'alt': current['title'], 'caption': current['title'] + ' · 원본 자료'}})
            continue
        if clean.startswith('|'):
            rows = []
            while True:
                row = clean
                # Notion exports some table cells across physical lines.
                while not row.rstrip().endswith('|') and i < len(lines):
                    row += '\n' + lines[i].strip()
                    i += 1
                cells = [c.strip() for c in row.strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-+:?', c) for c in cells):
                    rows.append(cells)
                if i >= len(lines) or not lines[i].strip().startswith('|'):
                    break
                clean = lines[i].strip()
                i += 1
            width = len(rows[0])
            if any(len(row) != width for row in rows):
                raise ValueError(f'Malformed table in {case_id}: {current["title"]}')
            current['blocks'].append({'type': 'table', 'headers': rows[0], 'rows': rows[1:]})
            continue
        current['blocks'].append({'type': 'text', 'text': line.rstrip()})
    return sections


def main(path):
    target = ROOT / 'k8s/resume.json'
    data = json.loads(target.read_text(encoding='utf-8'))
    with zipfile.ZipFile(path) as archive:
        notes = [n for n in archive.namelist() if n.endswith('.md')]
        if len(notes) != 1:
            raise ValueError('Expected one complete portfolio document')
        text = archive.read(notes[0]).decode('utf-8-sig')
        chapters = list(BOUNDARY.finditer(text))
        if [int(c[1]) for c in chapters] != list(range(1, 7)):
            raise ValueError('Unexpected portfolio chapter structure')
        for index, chapter in enumerate(chapters):
            case_id = CASE_IDS.get(int(chapter[1]))
            if not case_id:
                continue
            end = chapters[index + 1].start() if index + 1 < len(chapters) else len(text)
            project = next(p for p in data['projects'] if p['id'] == case_id)
            project['sections'] = parse_case(text[chapter.end():end], archive, case_id)
            blocks = [b for s in project['sections'] for b in s['blocks']]
            print(case_id, len(project['sections']), 'sections,',
                  sum(b['type'] == 'image' for b in blocks), 'images,',
                  sum(b['type'] == 'table' for b in blocks), 'tables')
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main(sys.argv[1])
