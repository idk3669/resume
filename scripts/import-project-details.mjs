// Mechanical import of the user's project notes; preserves paragraphs and list nesting.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/import-project-details.mjs <notes.txt>');
const source = fs.readFileSync(input, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const blocks = source.trim().split(/\n---\s*\n/);
const ids = ['nh-maintenance', 'nh-card', 'nh-central-production', 'allone-aws-dr', 'nh-central-development', 'kb-life-dr', 'nh-information', 'nh-elk'];
if (blocks.length !== ids.length) throw new Error(`Expected 8 projects, found ${blocks.length}`);
const plain = s => s.replace(/\*\*/g, '').replace(/`/g, '');
const projects = blocks.map((block, index) => {
  const title = block.match(/^### (.+)/)[1];
  const field = name => block.match(new RegExp(`\\*\\*${name}\\*\\*: (.+)`))?.[1] || '';
  const parts = block.split(/^### /m).slice(2);
  const sections = parts.map(part => {
    const [title, ...lines] = part.trimEnd().split('\n');
    return {title, lines: lines.filter(line => line.trim())};
  });
  const overview = sections.find(s => s.title === '프로젝트 개요');
  const tags = [...block.split('### 프로젝트 개요')[0].matchAll(/`([^`]+)`/g)].map(m => m[1]);
  return {id: ids[index], category: index === 0 ? '플랫폼 운영' : index === 3 || index === 5 ? '재해복구 구축' : index === 7 ? '모니터링 구축' : '플랫폼 구축',
    title, subtitle: field('역할'), period: field('기간'), client: field('고객사'), contractor: field('수행사'), role: field('역할'), tags,
    result: `${sections.filter(s => s.title.startsWith('주요')).flatMap(s => s.lines).filter(l => l.startsWith('- ')).length}개 주요 수행 영역 · 상세 내역 보기`,
    context: overview?.lines.join('\n') || '', analysis: '', actions: [], outcome: '', sections};
});
const target = path.join(root, 'k8s/resume.json');
const data = JSON.parse(fs.readFileSync(target, 'utf8'));
data.projects = [...projects, ...data.projects.filter(p => !ids.includes(p.id))];
fs.writeFileSync(target, JSON.stringify(data, null, 2) + '\n');
console.log(`Imported ${projects.length} full projects; retained ${data.projects.length - projects.length} case studies.`);
