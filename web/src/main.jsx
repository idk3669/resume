import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';

async function getJSON(path, signal) {
  const response = await fetch(path, {signal});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
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
        <div className="tags">{project.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
        <p className="result-banner">{project.result}</p>
        <section><h3>01 · 상황</h3><p>{project.context}</p></section>
        <section><h3>02 · 분석</h3><p>{project.analysis}</p></section>
        <section><h3>03 · 조치</h3><ul>{project.actions.map(action => <li key={action}>{action}</li>)}</ul></section>
        <section><h3>04 · 결과</h3><p>{project.outcome}</p></section>
      </>}
    </div>
  </dialog>;
}

function App() {
  const [data, setData] = useState(null);
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [filter, setFilter] = useState('전체');
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
  const {profile, highlights, skills, career, education, certifications} = data;
  const categories = ['전체', ...new Set(projects.map(p => p.category))];
  const visible = filter === '전체' ? projects : projects.filter(p => p.category === filter);
  return <>
    <a className="skip" href="#main">본문 바로가기</a>
    <header className="site-header"><a className="brand" href="#main" aria-label="김진현 홈"><span className="monogram small">JK</span><span>{profile.name}<span className="brand-sub"> / Cloud Engineer</span></span></a><nav aria-label="주요 메뉴"><a href="#projects">프로젝트</a><a href="#experience">경력</a><a href="#credentials">학력·자격</a><a className="nav-contact" href={`mailto:${profile.email}`}>연락하기 ↗</a></nav></header>
    <main id="main">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy"><p className="eyebrow">CLOUD ENGINEER / {profile.englishName}</p><h1 id="hero-title">안정적인 서비스의<br/>기반을 만듭니다<span className="mint">.</span></h1><p className="hero-intro">{profile.intro}</p><div className="hero-actions"><a className="button mint-button" href="#projects">프로젝트 살펴보기 <span>↗</span></a><a className="text-link" href={`mailto:${profile.email}`}>이메일 보내기 ↗</a></div><p className="hero-caption">{profile.focus}</p></div>
        <aside className="profile-card" aria-label="경력 요약"><div className="card-top"><span>ENGINEER PROFILE</span><span>01 / JK</span></div><p className="profile-name">{profile.name}<span>{profile.role}</span></p><div className="experience-number">{profile.experience}<span>금융권 클라우드 구축·운영</span></div><dl><div><dt>주요 환경</dt><dd>Private Cloud · PaaS</dd></div><div><dt>업무 영역</dt><dd>구축 / 운영 / 장애 대응</dd></div><div><dt>근무 이력</dt><dd>2021.09 — 2026.05</dd></div></dl><p className="growth">{profile.growth}</p></aside>
      </section>
      <section className="highlights" aria-label="주요 프로젝트 결과">{highlights.map((item, index) => <button key={item.projectId} className="highlight" onClick={() => setSelected(item.projectId)}><span className="metric-index">0{index + 1} / {item.label}</span><span className="metric-value">{item.value}<small>{item.unit}</small></span><span className="metric-detail">{item.detail}<span aria-hidden="true"> ↗</span></span></button>)}</section>
      <section className="section" id="projects"><div className="section-heading"><div><p className="eyebrow">SELECTED WORK</p><h2>문제에서 개선까지</h2></div><p>구축, 분석, 검증으로 이어진 실무 경험입니다.</p></div><div className="filters" role="group" aria-label="프로젝트 분류">{categories.map(category => <button key={category} aria-pressed={category === filter} onClick={() => setFilter(category)}>{category}</button>)}</div><p className="sr-only" aria-live="polite">{visible.length}개 프로젝트</p><div className="project-grid">{visible.map((project, index) => <article className="project-card" key={project.id}><div className="project-top"><span>{project.category}</span><span className="project-index">{String(index + 1).padStart(2, '0')}</span></div><h3><button className="project-title" onClick={() => setSelected(project.id)}>{project.title}<span aria-hidden="true">↗</span></button></h3><p>{project.subtitle}</p><div className="tags">{project.tags.slice(0, 3).map(tag => <span key={tag}>{tag}</span>)}</div><div className="project-result">{project.result}</div></article>)}</div><p className="source-note">성과 수치는 수행 당시 포트폴리오의 테스트 조건을 기준으로 합니다.</p></section>
      <section className="skills-section section" id="skills"><div className="section-heading"><div><p className="eyebrow">CAPABILITIES</p><h2>서비스를 지탱하는 기술</h2></div></div><div className="skills-grid">{skills.map((skill, index) => <article key={skill.title}><span className="skill-number">0{index + 1}</span><h3>{skill.title}</h3><p>{skill.description}</p><div className="tags">{skill.items.map(item => <span key={item}>{item}</span>)}</div></article>)}</div></section>
      <section className="section career-section" id="experience"><div><p className="eyebrow">EXPERIENCE</p><h2>경력</h2><p className="muted">기술을 운영 경험으로 연결합니다.</p></div><div>{career.map(job => <article className="career" key={job.company}><p className="period">{job.period}</p><h3>{job.company}</h3><p className="position">{job.position}</p><p>{job.description}</p><ul>{job.bullets.map(item => <li key={item}>{item}</li>)}</ul></article>)}</div></section>
      <section className="section credentials" id="credentials"><div><p className="eyebrow">EDUCATION</p><h2>학력</h2>{education.map(item => <article key={item.name}><h3>{item.name}</h3><p>{item.detail}</p></article>)}</div><div><p className="eyebrow">CERTIFICATIONS</p><h2>자격 취득 이력</h2>{certifications.map(item => <article key={item.name}><h3>{item.name}</h3><p>{item.detail}</p></article>)}<p className="source-note">자격 취득 시점을 기재했습니다.</p></div></section>
      <footer><div><p className="eyebrow">LET’S CONNECT</p><h2>다음 프로젝트에서 만나요.</h2><a href={`mailto:${profile.email}`}>{profile.email} ↗</a></div><p>{profile.name}<br/>Cloud Engineer</p></footer>
    </main>
    {selected && <ProjectDialog id={selected} onClose={() => setSelected(null)} />}
  </>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
