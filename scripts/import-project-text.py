"""Replace matching project descriptions from the supplied plain-text export.

Preserves portfolio cases, unmatched projects and existing project metadata.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROJECTS = [
    ('nh-maintenance', 'NH농협은행 프라이빗 클라우드 플랫폼 유지보수'),
    ('nh-card', 'NH카드 통합 디지털 플랫폼 구축 프로젝트'),
    ('nh-central-development', 'NH중앙회 프라이빗 클라우드 구축 프로젝트'),
    ('allone-aws-dr', 'NH농협은행 올원뱅크 퍼블릭 클라우드 재해복구시스템 구성'),
    ('kb-life-dr', 'KB생명보험 재해복구 인프라 도입 및 재구성'),
    ('nh-information', 'NH농협은행 정보계 차세대 시스템 구축 사업'),
    ('nh-elk', 'NH농협은행 로그 모니터링 고도화 (ELK 연계 사업)'),
]


def main(source):
    text = Path(source).read_text(encoding='utf-8-sig')
    # Restore words split by the source document's visual line wrapping.
    for before, after in [
        ('프\n로젝트', '프로젝트'), ('인\n프라', '인프라'),
        ('기\n반', '기반'), ('구\n축', '구축'),
        ('주\n요', '주요'), ('분리하\n고', '분리하고'),
        ('데\n이터', '데이터'), ('프로젝트였\n습니다', '프로젝트였습니다'),
    ]:
        text = text.replace(before, after)
    path = ROOT / 'k8s/resume.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    original_portfolio = [p for p in data['projects'] if p['collection'] == 'portfolio']
    index = {p['id']: p for p in data['projects']}
    positions = [text.index(title + '\n') for _, title in PROJECTS] + [len(text)]
    assert positions == sorted(positions), 'Unexpected project order'
    for i, (project_id, title) in enumerate(PROJECTS):
        chunk = text[positions[i] + len(title):positions[i + 1]].strip()
        overview, duties = chunk.split('[주요 수행 내용 및 성과]', 1)
        overview = ' '.join(overview.replace('[프로젝트 개요]', '').split())
        overview = overview.replace('사용자는 VMware TAS 측', 'VMware TAS 측')
        lines = []
        count = 0
        for line in duties.strip().splitlines():
            line = line.strip()
            if not line:
                continue
            if line.startswith('- '):
                # Two source bullets were merged into one visual line.
                for j, bullet in enumerate(line[2:].split(' - DR용')):
                    if j:
                        bullet = 'DR용' + bullet
                    lines.append('    - ' + bullet)
            else:
                lines.append('- **' + line + '**')
                count += 1
        project = index[project_id]
        project.update(title=title, context=overview, analysis='', actions=[], outcome='',
                       result=f'{count}개 주요 수행 영역 · 상세 내역 보기',
                       sections=[{'title': '프로젝트 개요', 'lines': [overview]},
                                 {'title': '주요 수행 내용 및 성과', 'lines': lines}])
        print(project_id, count)
    assert original_portfolio == [p for p in data['projects'] if p['collection'] == 'portfolio']
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main(sys.argv[1])
