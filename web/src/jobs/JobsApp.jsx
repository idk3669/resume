import React, {useEffect, useRef, useState} from 'react';
import {demoJobs, emptyFilters, roles, safeUrl, selectJobs} from './model.js';
import './jobs.css';
import {CareerGate, careerApi, useCareer, WorkspaceTools, LocationEditor, JobMaintenance} from './Backend.jsx';

const sizes = ['1~49명', '50~99명', '100~299명', '300~999명', '1,000명 이상', '미확인'];
function Select({label, value, onChange, options, placeholder='전체'}) {
  return <label className="job-field">{label}<select aria-label={label} value={value} onChange={e => onChange(e.target.value)}><option value="">{placeholder}</option>{options.map(x => <option key={x} value={x}>{x}</option>)}</select></label>;
}
function Modal({title, children, onClose}) {
  const ref = useRef(null);
  useEffect(() => {const previous = document.activeElement; ref.current.showModal(); return () => previous?.focus();}, []);
  return <dialog className="job-dialog" ref={ref} onCancel={onClose} onClick={e => {if(e.target === ref.current) onClose();}} aria-labelledby="job-dialog-title"><div className="job-dialog-head"><h2 id="job-dialog-title">{title}</h2><button onClick={onClose} aria-label="닫기">×</button></div>{children}</dialog>;
}
function AddJob({onAdd, onClose}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const {notice} = useCareer();
  async function submit(e) {
    e.preventDefault(); const form = Object.fromEntries(new FormData(e.target));
    if (!form.company.trim() || !form.title.trim() || !form.description.trim()) {setError('회사명, 포지션, 공고 본문을 입력해 주세요.'); return;}
    if (form.url && !safeUrl(form.url)) {setError('원문 주소는 http 또는 https 주소로 입력해 주세요.'); return;}
    setBusy(true);setError('');
    try {await onAdd({...form, company:form.company.trim(), title:form.title.trim()});}
    catch(e) {setError(e.message);} finally {setBusy(false);}
  }
  return <Modal title="관심 있는 공고 추가" onClose={onClose}><p className="job-muted">공고 본문으로 내 경험과의 연결점을 확인합니다. URL의 내용을 자동으로 수집하지 않습니다.</p><form onSubmit={submit} className="job-form">
    <div className="job-two"><label className="job-field">회사명<input name="company" required maxLength={100}/></label><label className="job-field">포지션<input name="title" required maxLength={150}/></label></div>
    <label className="job-field">원문 URL<input name="url" type="url" placeholder="https://" maxLength={2000}/></label>
    <div className="job-two"><label className="job-field">직무<select name="role">{roles.map(x => <option key={x}>{x}</option>)}</select></label><label className="job-field">근무지역<select name="region">{['미확인','서울','경기','인천','그 외 지역'].map(x => <option key={x}>{x}</option>)}</select></label></div>
    <div className="job-two"><label className="job-field">직원 수<select name="size" defaultValue="미확인">{sizes.map(x => <option key={x}>{x}</option>)}</select></label><label className="job-field">근무방식<select name="mode">{['미확인','출근','하이브리드','원격'].map(x => <option key={x}>{x}</option>)}</select></label></div>
    <label className="job-field">실제 근무지<input name="address" placeholder="본사와 근무지가 다르면 공고의 근무지를 입력하세요" maxLength={200}/></label>
    <label className="job-field">공고 본문<textarea name="description" required rows={7} maxLength={30000} placeholder="주요 업무, 자격 요건, 우대 사항을 붙여 넣어 주세요."/></label>
    {(error || notice) && <p role="status">{error || notice}</p>}<div className="job-actions"><button type="button" className="job-btn" onClick={onClose}>취소</button><button className="job-btn primary" disabled={busy}>{busy?'저장 중…':'공고 추가'}</button></div>
  </form></Modal>;
}
function Profile({profile, onSave}) {
  const [draft,setDraft] = useState(profile);
  const [fileMessage,setFileMessage] = useState('');
  const [importText,setImportText] = useState('');
  const [target,setTarget] = useState('professional');
  const input = useRef(null);
  const [busy,setBusy] = useState(false);
  async function filePicked(file) {
    if (!file) return;
    setImportText(''); setFileMessage('');
    if(file.size > 10 * 1024 * 1024) {setFileMessage('10MB 이하 파일을 선택해 주세요.'); return;}
    if(!/\.(pdf|docx|txt)$/i.test(file.name)) {setFileMessage('PDF, DOCX, TXT 파일을 선택해 주세요.'); return;}
    setBusy(true);
    try {const {text} = await careerApi(`/resume/extract?filename=${encodeURIComponent(file.name)}`,{method:'POST',file}); if(text.length > 30000) throw new Error('본문은 30,000자 이내로 입력해 주세요.'); setImportText(text); setFileMessage(`${file.name}의 텍스트를 읽었습니다. 내용을 확인한 후 반영해 주세요.`);} catch(e) {setFileMessage(e.message || '파일을 읽지 못했습니다.');} finally {setBusy(false);}
  }
  return <div className="job-profile-layout"><section className="job-panel"><h2>이력서 가져오기</h2><p className="job-muted">파일 또는 텍스트로 경력 정보를 업데이트하세요.</p><div className="job-upload" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault(); if(!busy) filePicked(e.dataTransfer.files[0]);}}><span aria-hidden="true">↑</span><strong>이력서 파일을 선택하거나 놓아주세요</strong><p>PDF · DOCX · TXT / 최대 10MB</p><button className="job-btn" disabled={busy} onClick={()=>input.current.click()}>파일 선택</button><input ref={input} className="sr-only" type="file" accept=".pdf,.docx,.txt" onChange={e=>{filePicked(e.target.files[0]);e.target.value='';}} tabIndex={-1}/></div><p className="job-muted">PDF·DOCX·TXT에서 텍스트를 추출합니다. 원본은 저장하지 않으며 내용을 확인한 뒤 추천 프로필을 저장하세요. 스캔 PDF의 OCR은 지원하지 않습니다.</p><p role="status">{busy ? '텍스트를 읽는 중입니다.' : fileMessage}</p><label className="job-field">가져올 이력서 본문<textarea aria-label="가져올 이력서 본문" rows={7} value={importText} maxLength={30000} onChange={e=>setImportText(e.target.value)} placeholder="이력서에서 복사한 내용을 붙여 넣으세요."/></label><div className="job-import"><label className="job-field">반영 위치<select aria-label="반영 위치" value={target} onChange={e=>setTarget(e.target.value)}><option value="professional">회사 실무 경험</option><option value="personal">개인 프로젝트</option><option value="learning">테스트·학습 경험</option></select></label><button className="job-btn" disabled={!importText.trim()} onClick={()=>{setDraft({...draft,[target]:importText});setFileMessage('편집 영역에 반영했습니다. 확인 후 아래 저장 버튼을 눌러 주세요.');}}>편집 영역에 반영</button></div></section>
    <form className="job-panel" onSubmit={e=>{e.preventDefault();onSave(draft);}}><h2>추천에 사용할 내 경험</h2><p className="job-muted">회사 실무와 개인 구축 경험을 구분해 공고를 비교합니다.</p>{[['professional','회사 실무 경험'],['personal','개인 프로젝트'],['learning','테스트·학습 경험']].map(([key,label])=><label className="job-field" key={key}>{label}<textarea aria-label={label} rows={key==='professional'?6:4} value={draft[key]} maxLength={30000} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}<fieldset className="job-role-set"><legend>희망 직무</legend>{roles.map(role=><label key={role}><input type="checkbox" checked={draft.roles.includes(role)} onChange={e=>setDraft({...draft,roles:e.target.checked?[...draft.roles,role]:draft.roles.filter(x=>x!==role)})}/>{role}</label>)}</fieldset><label className="job-field">출퇴근 기준 위치<input value={draft.origin} maxLength={100} onChange={e=>setDraft({...draft,origin:e.target.value,coordinates:null})} placeholder="예: 집 근처 역 이름"/></label><LocationEditor value={draft.coordinates} onChange={coordinates=>setDraft({...draft,coordinates})} query={draft.origin}/><button className="job-btn primary" type="submit">추천 프로필 저장</button></form></div>;
}
export default function JobsApp() {return <CareerGate><JobsWorkspace/></CareerGate>;}
function JobsWorkspace() {
  const isProfile = window.location.pathname.replace(/\/$/,'') === '/jobs/profile';
  const valid = ['/jobs','/jobs/profile'].includes(window.location.pathname.replace(/\/$/,''));
  const {profile,jobs,statuses,notice,setNotice,mutate} = useCareer();
  const [demoStatuses,setDemoStatuses] = useState({});
  const [demo,setDemo] = useState(false);
  const [tab,setTab] = useState('all');
  const [filters,setFilters] = useState(emptyFilters);
  const [selected,setSelected] = useState(null);
  const [adding,setAdding] = useState(false);
  useEffect(()=>{document.title = `${isProfile?'내 이력서 관리':'회사 찾기'} | 김진현`;},[isProfile]);
  const pool = demo ? demoJobs : jobs;
  const activeStatuses = demo ? demoStatuses : statuses;
  const visible = selectJobs(pool,activeStatuses,tab,filters,profile);
  const updateFilter = (key,value)=>setFilters({...filters,[key]:value});
  const changeStatus = (id,status)=>id.startsWith('demo-') ? setDemoStatuses({...demoStatuses,[id]:status}) : mutate(`/items/${id}/status`,'PATCH',{status});
  const statusLabel = {saved:'관심',applied:'지원 완료',excluded:'제외'};
  return <div className="jobs-app"><a className="skip" href="#jobs-main">본문 바로가기</a><header className="jobs-header"><a className="brand" href="/"><span className="monogram small">JK</span><span>김진현<span className="brand-sub"> / Career workspace</span></span></a><nav aria-label="주요 메뉴"><a href="/">이력서</a><a href="/jobs" aria-current={!isProfile?'page':undefined}>회사 찾기</a><a href="/jobs/profile" aria-current={isProfile?'page':undefined}>내 이력서 관리</a></nav></header><main id="jobs-main" className="jobs-main">
    {!valid ? <section className="job-panel"><h1>페이지를 찾을 수 없습니다</h1><a href="/jobs">회사 찾기로 돌아가기 →</a></section> : <><div className="jobs-heading"><div><p className="job-eyebrow">MY NEXT CHAPTER</p><h1>{isProfile?'내 이력서 관리':'경험에 맞는 다음 회사를 찾아보세요.'}</h1><p>{isProfile?'내 경험과 희망 조건을 업데이트하세요.':'플랫폼 운영 경험을 다음 커리어로 연결하는 개인 채용 보드'}</p></div>{!isProfile && <button className="job-btn primary" onClick={()=>setAdding(true)}>＋ 공고 직접 추가</button>}</div>
    <div className="jobs-status"><span><i/> {demo?'예시 공고 미리보기':'개인 채용 보드'}</span><p>로그인 전용 · 서버 저장 · 이력서 텍스트 추출 · 공개 채용 API 수집. 추천은 기술 키워드 비교이며 AI 평가가 아닙니다.</p></div><p className="job-notice" role="status">{notice}</p><WorkspaceTools/>
    {isProfile ? <Profile profile={profile} onSave={value=>mutate('/profile','PUT',value)}/> : <><section className="job-overview"><div><span className="job-avatar">JK</span><div><strong>김진현 님의 추천 프로필</strong><p>{profile.professional.split('\n')[0] || '프로필을 작성해 주세요.'}</p><small>실무 / 개인 프로젝트 / 테스트 경험을 구분해 비교합니다.</small></div></div><a href="/jobs/profile">프로필 수정 ↗</a></section><div className="job-layout"><aside className="job-panel job-filters"><div className="job-filter-heading"><h2>검색 조건</h2><button className="job-link" onClick={()=>setFilters(emptyFilters)}>초기화</button></div><label className="job-field">검색<input placeholder="회사명, 포지션, 기술" value={filters.query} onChange={e=>updateFilter('query',e.target.value)}/></label><Select label="직무" value={filters.role} onChange={x=>updateFilter('role',x)} options={roles}/><Select label="근무지역" value={filters.region} onChange={x=>updateFilter('region',x)} options={['서울','경기','인천','그 외 지역','미확인']}/><Select label="직원 수" value={filters.size} onChange={x=>updateFilter('size',x)} options={sizes}/><Select label="근무방식" value={filters.mode} onChange={x=>updateFilter('mode',x)} options={['출근','하이브리드','원격','미확인']}/><label className="job-field">직선거리<select aria-label="직선거리" value={filters.distance} onChange={e=>updateFilter('distance',e.target.value)}><option value="">제한 없음</option>{[5,10,20,30].map(x=><option key={x} value={x}>{x}km 이내</option>)}</select></label><p className="job-muted">출발지와 근무지 좌표가 모두 저장된 공고의 직선거리입니다. 미확인 공고는 거리 제한 시 제외됩니다.</p><a className="job-link" href="/jobs/profile">출퇴근 기준 위치 설정 →</a></aside><section aria-label="채용공고 목록"><div className="job-tabs" role="group" aria-label="공고 상태">{[['all','전체 공고'],['saved','관심 공고'],['applied','지원 완료'],['excluded','제외'],['closed','종료·미게시']].map(([key,name])=><button key={key} aria-pressed={tab===key} onClick={()=>setTab(key)}>{name}<span>{pool.filter(j=>key==='closed'?j.active===false:key==='all'?j.active!==false && activeStatuses[j.id]!=='excluded':activeStatuses[j.id]===key).length}</span></button>)}</div><div className="job-list-toolbar"><p><strong>{visible.length}</strong>개 공고 {demo && <span className="job-demo-label">가상 예시</span>}</p><label>정렬 <select aria-label="공고 정렬" value={filters.sort} onChange={e=>updateFilter('sort',e.target.value)}><option value="match">경험 연결순</option><option value="latest">최근 추가순</option><option value="distance">가까운 거리순</option></select></label></div>
    {demo && <p className="job-demo-note">화면 확인용 가상 회사입니다. 실제 채용·AI 추천 결과가 아닙니다. <button className="job-link" onClick={()=>{setDemo(false);setTab('all');}}>내 공고로 돌아가기</button></p>}
    {!visible.length ? <div className="job-empty"><span aria-hidden="true">⌕</span><h2>{!pool.length?'첫 공고를 추가해 보세요':'조건에 맞는 공고가 없습니다'}</h2><p>{!pool.length?'관심 있는 공고를 붙여 넣으면 내 경험과 비교하고 지원 상태를 관리할 수 있습니다.':'검색 조건이나 공고 상태를 변경해 보세요. 거리 미확인 공고는 거리 제한 시 표시되지 않습니다.'}</p><div className="job-actions">{!pool.length?<><button className="job-btn primary" onClick={()=>setAdding(true)}>공고 추가하기</button><button className="job-btn" onClick={()=>{setDemo(true);setTab('all');setFilters(emptyFilters);}}>예시 공고로 미리보기</button></>:<button className="job-btn" onClick={()=>{setFilters(emptyFilters);setTab('all');}}>전체 공고 보기</button>}</div></div> : <div className="job-cards">{visible.map(job=><article className="job-card" key={job.id}><div className="job-card-top"><span className="job-company-icon">{job.company.slice(0,1)}</span><div><p>{job.company}{job.demo && ' · 예시'}</p><h2><button onClick={()=>setSelected(job)}>{job.title}</button></h2></div><button className="job-save" aria-label={`${job.company} 관심 공고 ${activeStatuses[job.id]==='saved'?'해제':'저장'}`} aria-pressed={activeStatuses[job.id]==='saved'} onClick={()=>changeStatus(job.id,activeStatuses[job.id]==='saved'?'new':'saved')}>{activeStatuses[job.id]==='saved'?'★':'☆'}</button></div><p className="job-card-meta">{job.region} · {job.size} · {job.mode} · {job.distance == null ? '거리 미확인' : `직선 ${job.distance}km`}{job.active === false && ' · 원문에서 내려간 공고'}</p><div className="job-match"><span>{job.match.label}</span><p>{job.match.work.length?`실무 경험과 일치하는 키워드: ${job.match.work.join(', ')}`:job.match.personal.length?`개인 프로젝트에서 확인한 키워드: ${job.match.personal.join(', ')}`:'본문과 내 경력을 직접 비교해 보세요.'}</p>{job.match.missing.length>0 && <small>추가 확인: {job.match.missing.join(', ')}</small>}</div><div className="job-card-bottom"><span>{statusLabel[activeStatuses[job.id]] || '검토 전'} · {job.demo?'화면 예시':job.source==='manual'?'직접 등록':'공개 API 수집'}</span><button className="job-link" onClick={()=>setSelected(job)}>경험 비교 및 상세 →</button></div></article>)}</div>}<p className="job-method">현재 비교는 등록된 기술 키워드와 희망 직무 기준입니다. 경력 연차·필수 조건 충족이나 합격 가능성을 판단하는 AI 결과가 아닙니다.</p></section></div></> }</>}
    </main><div className="jobs-footer">JINHYUN KIM <span>나의 경험에서 다음 기회로.</span></div>
    {adding && <AddJob onClose={()=>setAdding(false)} onAdd={async job=>{const {id,createdAt,distance,...body}=job;if(await mutate('/items','POST',body)){setAdding(false);setDemo(false);setTab('all');setFilters(emptyFilters);}}}/>}
    {selected && <Modal title={selected.title} onClose={()=>setSelected(null)}><p className="job-muted">{selected.company} · {selected.region} · {selected.size}{selected.demo?' · 가상 예시':''}</p><div className="job-detail-note">키워드 기반 비교입니다. 실제 담당 범위와 필수 요건은 공고 원문에서 확인하세요.</div>{[['work','회사 실무에서 연결되는 기술'],['personal','개인 프로젝트에서 확인한 기술'],['learning','테스트·학습에서 확인한 기술'],['missing','추가 확인이 필요한 기술']].map(([key,title])=><section className="job-detail-section" key={key}><h3>{title}</h3><p>{selected.match[key].join(' · ') || '일치 키워드 없음'}</p></section>)}<section className="job-detail-section"><h3>실제 근무지</h3><p>{selected.address || '미확인'}</p></section><section className="job-detail-section"><h3>공고 본문</h3><p className="job-description">{selected.description}</p></section><>{!selected.demo && <JobMaintenance key={selected.id} job={selected} onDone={()=>setSelected(null)}/>}</><div className="job-actions">{safeUrl(selected.url) && <a className="job-btn" href={safeUrl(selected.url)} target="_blank" rel="noopener noreferrer">원문 보기 ↗</a>}<label className="job-field">공고 상태<select aria-label="공고 상태" value={activeStatuses[selected.id]||'new'} onChange={e=>changeStatus(selected.id,e.target.value)}><option value="new">검토 전</option><option value="saved">관심 공고</option><option value="applied">지원 완료</option><option value="excluded">제외</option></select></label><button className="job-btn" onClick={()=>setSelected(null)}>닫기</button></div></Modal>}
  </div>;
}
