import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';

async function getJSON(path, signal) {
  const response = await fetch(path, {signal});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function InlineText({text}) {
  return text.split(/(\*\*.*?\*\*|`[^`]+`|~~.*?~~)/g).map((part, i) =>
    part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> :
    part.startsWith('~~') ? <del key={i}>{part.slice(2, -2)}</del> :
    part.startsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : part);
}

function SectionImages({images = []}) {
  return images.map(image => <figure className="detail-figure" key={image.src}><a href={image.src} target="_blank" rel="noopener noreferrer" aria-label={`${image.alt} 원본 이미지 새 탭에서 보기`}><img src={image.src} alt={image.alt} loading="lazy"/></a><figcaption>{image.caption}<span>이미지를 누르면 원본 크기로 볼 수 있습니다 ↗</span></figcaption></figure>);
}

function DetailSection({section, anchor}) {
  if (section.blocks?.length) return <section id={anchor} className="project-detail-section">
    <h3>{section.title}</h3>
    {section.blocks.map((block, i) => {
      if (block.type === 'image') return <SectionImages key={i} images={[block.image]}/>;
      if (block.type === 'code') return <pre className="detail-code" key={i} tabIndex={0} aria-label={`${section.title} 코드 예시`}><code>{block.text}</code></pre>;
      if (block.type === 'table') return <div className="detail-table-scroll" key={i} tabIndex={0} role="region" aria-label={`${section.title} 표`}><table className="detail-table"><thead><tr>{block.headers.map((cell, j) => <th key={j} scope="col"><InlineText text={cell}/></th>)}</tr></thead><tbody>{block.rows.map((row, j) => <tr key={j}>{row.map((cell, k) => <td key={k}><InlineText text={cell}/></td>)}</tr>)}</tbody></table></div>;
      const bullet = block.text.match(/^(\s*)(?:- |(\d+)\. )(.*)$/);
      return bullet ? <p className={`detail-bullet ${bullet[1].length ? 'nested' : ''}`} key={i}><span aria-hidden="true">{bullet[2] ? `${bullet[2]}.` : '•'}</span><InlineText text={bullet[3]}/></p> : <p key={i}><InlineText text={block.text}/></p>;
    })}
  </section>;
  const blocks = [];
  for (const line of section.lines) {
    const bullet = line.match(/^(\s*)- (.*)$/);
    if (!bullet) { blocks.push({text: line}); continue; }
    const last = blocks.at(-1);
    if (bullet[1].length && last?.items) last.items.push(bullet[2]);
    else blocks.push({text: bullet[2], items: []});
  }
  const groups = [];
  for (const block of blocks) {
    if (block.items) {
      if (!Array.isArray(groups.at(-1))) groups.push([]);
      groups.at(-1).push(block);
    } else groups.push(block);
  }
  return <section id={anchor} className="project-detail-section"><h3>{section.title}</h3>{section.imageFirst && <SectionImages images={section.images}/>} {groups.map((group, i) => Array.isArray(group)
    ? <ul className="detail-list" key={i}>{group.map((item, j) => <li key={j}><strong><InlineText text={item.text}/></strong>{item.items.length > 0 && <ul>{item.items.map((text, k) => <li key={k}><InlineText text={text}/></li>)}</ul>}</li>)}</ul>
    : <p key={i}><InlineText text={group.text}/></p>)}{!section.imageFirst && <SectionImages images={section.images}/>}</section>;
}

function ProjectDialog({id, onClose}) {
  const dialog = useRef(null);
  const [project, setProject] = useState(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    document.body.classList.add('modal-open');
    return () => {document.body.classList.remove('modal-open'); previous?.focus();};
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setProject(null); setError(false);
    getJSON(`/api/projects/${encodeURIComponent(id)}`, controller.signal)
      .then(setProject).catch(e => {if (e.name !== 'AbortError') setError(true);});
    return () => controller.abort();
  }, [id, retry]);
  return <dialog ref={dialog} className="project-dialog" aria-labelledby="detail-title" onCancel={onClose} onClick={e => {if (e.target === dialog.current) onClose();}}>
    <div className="dialog-inner">
      <button className="close" onClick={onClose} aria-label="프로젝트 상세 닫기" autoFocus>×</button>
      {!project ? <><h2 id="detail-title">프로젝트 상세</h2><p role="status">{error ? '프로젝트를 불러오지 못했습니다.' : '내용을 불러오는 중입니다.'}</p>{error && <button className="button" onClick={() => setRetry(x => x + 1)}>다시 시도</button>}</> : <>
        <p className="eyebrow">CASE STUDY / {project.category}</p>
        <h2 id="detail-title">{project.title}</h2>
        <p className="muted">{project.period}</p>
        {project.client && <dl className="project-meta"><div><dt>고객사</dt><dd>{project.client}</dd></div><div><dt>수행사</dt><dd>{project.contractor}</dd></div><div><dt>역할</dt><dd>{project.role}</dd></div></dl>}
        <h3 className="stack-label">사용 기술 스택</h3>
        <div className="tags">{project.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
        <p className="result-banner">{project.result}</p>
        {project.sections?.length > 6 && <details className="detail-toc"><summary>목차 · {project.sections.length}개 항목</summary><nav aria-label="상세 내용 목차">{project.sections.map((section, i) => <a key={i} href={`#detail-section-${i}`} onClick={event => {event.preventDefault(); document.getElementById(`detail-section-${i}`)?.scrollIntoView({block:'start'});}}>{section.title}</a>)}</nav></details>}
        {project.sections?.length ? project.sections.map((section, i) => <DetailSection key={i} anchor={`detail-section-${i}`} section={section}/>) : <>
        <section><h3>01 · 상황</h3><p>{project.context}</p></section>
        <section><h3>02 · 분석</h3><p>{project.analysis}</p></section>
        <section><h3>03 · 조치</h3><ul>{project.actions.map(action => <li key={action}>{action}</li>)}</ul></section>
        <section><h3>04 · 결과</h3><p>{project.outcome}</p></section>
        </>}
        <button className="button detail-done" onClick={onClose}>목록으로 돌아가기</button>
      </>}
    </div>
  </dialog>;
}

const covers = {
  'cf-push': ['CF PUSH', 'Upload → Staging → Startup'],
  rabbitmq: ['RabbitMQ', 'Network Partitioning'],
  routing: ['Tanzu / BOSH', 'Multi-NIC · Routing Automation'],
  'gemfire-ha': ['GemFire', 'Multi-center · HA Test'],
  'marketing-performance': ['PERFORMANCE', 'Load Balancer · Throughput'],
  allone: ['AVAILABILITY', 'Autoscaler · Session'],
  'log-cache': ['OBSERVABILITY', 'Log Pipeline · Resource Tuning'],
};

function portfolioThumbnail(project) {
  for (const section of project.sections || []) {
    const image = section.blocks?.find(block => block.type === 'image')?.image || section.images?.[0];
    if (image) return image;
  }
  return null;
}

function ProjectCollection({items, portfolio = false, onSelect}) {
  const [filter, setFilter] = useState('전체');
  const categories = ['전체', ...new Set(items.map(p => p.category))];
  const visible = filter === '전체' ? items : items.filter(p => p.category === filter);
  const title = portfolio ? '포트폴리오' : '프로젝트 내역';
  return <section className={`section collection ${portfolio ? 'portfolio-section' : ''}`} id={portfolio ? 'portfolio' : 'projects'}>
    <div className="section-heading"><div><p className="eyebrow">{portfolio ? 'TECHNICAL PORTFOLIO' : 'PROJECT EXPERIENCE'}</p><h2>{title}</h2></div><p>{portfolio ? '장애 분석, 성능 검증과 자동화 개선을 기록했습니다.' : '고객 프로젝트별 구축·운영 경험과 수행 내역입니다.'}</p></div>
    <div className="collection-label">{portfolio ? '▦ 포트폴리오 갤러리' : '▤ 프로젝트 내역'} <span>{items.length}</span></div>
    <div className="filters" role="group" aria-label={`${title} 분류`}>{categories.map(category => <button key={category} aria-pressed={category === filter} onClick={() => setFilter(category)}>{category}</button>)}</div>
    <div className={portfolio ? 'portfolio-grid' : 'project-grid'}>{visible.map(project => <article className={`project-card ${portfolio ? 'portfolio-card' : ''}`} key={project.id}>
      {portfolio && <button className={`portfolio-cover cover-${project.id} ${portfolioThumbnail(project) ? 'has-thumbnail' : ''}`} onClick={() => onSelect(project.id)} aria-label={`${project.title} 상세 보기`}>{portfolioThumbnail(project) ? <><img className="portfolio-thumbnail" src={portfolioThumbnail(project).src} alt={portfolioThumbnail(project).alt} loading="lazy"/><span className="thumbnail-label">{covers[project.id]?.[0]} · 상세 보기 ↗</span></> : <><span className="cover-kicker">ENGINEERING CASE STUDY</span><strong>{covers[project.id]?.[0]}</strong><span>{covers[project.id]?.[1]}</span><span className="cover-art" aria-hidden="true">◇ ─ ◇ ─ ◇</span></>}</button>}
      <div className="project-card-body"><div className="project-top"><span>{project.category}</span></div><h3><button className="project-title" onClick={() => onSelect(project.id)}>{project.title}<span aria-hidden="true">↗</span></button></h3><p>{project.subtitle}</p><div className="tags">{project.tags.slice(0, 3).map(tag => <span key={tag}>{tag}</span>)}{project.tags.length > 3 && <span>+{project.tags.length - 3}</span>}</div><p className="card-period">{project.period}</p><div className="project-result">{project.result}</div></div>
    </article>)}</div>
    {portfolio && <p className="source-note">직접 정리한 분석 문서와 원본 이미지로 구성한 7개 사례입니다. 성능 수치와 제품 버전, 조치 방안은 당시 테스트·운영 환경 기준입니다.</p>}
  </section>;
}

function App() {
  const [data, setData] = useState(null);
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    Promise.all([getJSON('/api/resume', controller.signal), getJSON('/api/projects', controller.signal)])
      .then(([resume, items]) => {setData(resume); setProjects(items);})
      .catch(e => {if (e.name !== 'AbortError') setError(true);});
    return () => controller.abort();
  }, [retry]);
  if (!data) return <main className="loading"><div className="monogram">JK</div><h1>김진현 · Cloud Engineer</h1><p role={error ? 'alert' : 'status'}>{error ? '이력서 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' : '이력서 정보를 불러오고 있습니다.'}</p>{error && <button className="button" onClick={() => setRetry(x => x + 1)}>다시 시도</button>}</main>;
  const {profile, skills, career, education, certifications} = data;
  return <>
    <a className="skip" href="#main">본문 바로가기</a>
    <header className="site-header"><a className="brand" href="#main" aria-label="김진현 홈"><span className="monogram small">JK</span><span>{profile.name}<span className="brand-sub"> / Cloud Engineer</span></span></a><nav aria-label="주요 메뉴"><a href="#projects">프로젝트 내역</a><a href="#portfolio">포트폴리오</a><a href="#experience">경력</a><a href="#credentials">학력·자격</a><a className="nav-contact" href={`mailto:${profile.email}`}>연락하기 ↗</a></nav></header>
    <main id="main">
      <section className="hero hero-resume" aria-labelledby="hero-title">
        <div className="hero-copy"><p className="eyebrow">{profile.englishName} / CLOUD ENGINEER</p><h1 id="hero-title">금융 서비스를 지탱하는<br/><span className="hero-accent">클라우드 엔지니어 {profile.name}입니다.</span></h1><p className="hero-intro">{profile.intro}</p><div className="hero-actions"><a className="button" href="#projects">프로젝트 살펴보기 <span aria-hidden="true">↗</span></a><a className="text-link" href="#portfolio">포트폴리오 보기 <span aria-hidden="true">→</span></a></div></div>
        <div className="hero-facts" aria-label="경력 요약"><span>{profile.employmentStart.slice(0, 7).replace('-', '.')} — {profile.employmentEnd.slice(0, 7).replace('-', '.')}</span><span>VMware Tanzu · Cloud Foundry</span><span>구축 / 운영 / 장애 대응</span></div>
      </section>
      <ProjectCollection items={projects.filter(p => p.collection !== "portfolio")} onSelect={setSelected}/>
      <ProjectCollection portfolio items={projects.filter(p => p.collection === "portfolio")} onSelect={setSelected}/>
      <section className="skills-section section" id="skills"><div className="section-heading"><div><p className="eyebrow">CAPABILITIES</p><h2>서비스를 지탱하는 기술</h2></div></div><div className="skills-grid">{skills.map((skill, index) => <article key={skill.title}><span className="skill-number">0{index + 1}</span><h3>{skill.title}</h3><p>{skill.description}</p><div className="tags">{skill.items.map(item => <span key={item}>{item}</span>)}</div></article>)}</div></section>
      <section className="section career-section" id="experience"><div><p className="eyebrow">EXPERIENCE</p><h2>경력</h2><p className="muted">기술을 운영 경험으로 연결합니다.</p></div><div>{career.map(job => <article className="career" key={job.company}><p className="period">{job.period}</p><h3>{job.company}</h3><p className="position">{job.position}</p><p>{job.description}</p><ul>{job.bullets.map(item => <li key={item}><InlineText text={item}/></li>)}</ul></article>)}</div></section>
      <section className="section credentials" id="credentials"><div><p className="eyebrow">EDUCATION</p><h2>학력</h2>{education.map(item => <article key={item.name}><h3>{item.name}</h3><p>{item.detail}</p></article>)}</div><div><p className="eyebrow">CERTIFICATIONS</p><h2>자격 취득 이력</h2>{certifications.map(item => <article key={item.name}><h3>{item.name}</h3><p>{item.detail}</p></article>)}<p className="source-note">자격 취득 시점을 기재했습니다.</p></div></section>
      <footer><div><p className="eyebrow">LET’S CONNECT</p><h2>다음 프로젝트에서 만나요.</h2><a href={`mailto:${profile.email}`}>{profile.email} ↗</a></div><p>{profile.name}<br/>Cloud Engineer</p></footer>
    </main>
    {selected && <ProjectDialog id={selected} onClose={() => setSelected(null)} />}
  </>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
