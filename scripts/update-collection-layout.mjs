import fs from 'node:fs';
const file = new URL('../web/src/main.jsx', import.meta.url);
let text = fs.readFileSync(file, 'utf8');
text = text.replace('<a href="#projects">프로젝트</a>', '<a href="#projects">프로젝트 내역</a><a href="#portfolio">포트폴리오</a>');
text = text.split('\n').filter(line => !line.includes('<section className="highlights"')).map(line => line.includes('<section className="section" id="projects">')
  ? '      <ProjectCollection items={projects.filter(p => p.collection !== "portfolio")} onSelect={setSelected}/>' + '\n' + '      <ProjectCollection portfolio items={projects.filter(p => p.collection === "portfolio")} onSelect={setSelected}/>' : line).join('\n');
fs.writeFileSync(file, text);
