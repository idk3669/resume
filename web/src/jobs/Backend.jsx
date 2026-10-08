import React, {createContext, useContext, useEffect, useState} from 'react';
import {initialProfile} from './model.js';

let csrf = '';
export async function careerApi(path, {method='GET', body, file} = {}) {
  const response = await fetch(`/api/jobs${path}`, {
    method, credentials:'same-origin', cache:'no-store',
    headers: {...(method !== 'GET' ? {'X-CSRF-Token':csrf} : {}), ...(file ? {'Content-Type':'application/octet-stream'} : body ? {'Content-Type':'application/json'} : {})},
    body: file || (body ? JSON.stringify(body) : undefined),
  });
  let data;
  try {data = await response.json();} catch {throw new Error('채용 보드 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');}
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('career-session-expired'));
    throw new Error(typeof data.detail === 'string' ? data.detail : '입력값을 확인해 주세요.');
  }
  return data;
}

const CareerContext = createContext(null);
export const useCareer = () => useContext(CareerContext);

export function CareerGate({children}) {
  const [auth,setAuth] = useState(null);
  const [state,setState] = useState(null);
  const [notice,setNotice] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  async function refresh() {setState(await careerApi('/state'));}
  async function boot() {
    setError('');
    try {
      const session = await careerApi('/auth/session');
      csrf = session.csrf || ''; setAuth(session);
      if (session.authenticated) await refresh();
    } catch(e) {setError(e.message);}
  }
  useEffect(()=>{
    boot();
    const expired = ()=>{csrf='';setAuth({authenticated:false,configured:true});setState(null);};
    window.addEventListener('career-session-expired',expired);
    return ()=>window.removeEventListener('career-session-expired',expired);
  },[]);
  async function login(e) {
    e.preventDefault(); setBusy(true); setError('');
    const password = new FormData(e.target).get('password');
    e.target.reset();
    try {const session = await careerApi('/auth/login',{method:'POST',body:{password}});csrf=session.csrf;setAuth(session);await refresh();}
    catch(e) {setError(e.message);} finally {setBusy(false);}
  }
  async function mutate(path, method, body) {
    try {await careerApi(path,{method,body});await refresh();setNotice('서버에 저장했습니다.');return true;}
    catch(e) {setNotice(e.message);return false;}
  }
  async function logout() {
    try {await careerApi('/auth/logout',{method:'POST'});csrf='';setAuth({authenticated:false,configured:true});setState(null);}
    catch(e) {setNotice(e.message);}
  }
  if (!auth?.authenticated || !state) return <div className="jobs-app"><main className="jobs-main"><section className="job-panel career-login"><a href="/">← 공개 이력서로 돌아가기</a><h1>개인 채용 보드</h1><p>이력서와 관심 공고는 로그인 후 확인할 수 있습니다.</p>{auth?.configured === false ? <p role="alert">서버 비밀번호 설정이 필요합니다. 배포 가이드의 CAREER_PASSWORD_HASH 설정을 완료해 주세요.</p> : !auth || auth.authenticated ? <p>서버 연결 확인 중…</p> : <form onSubmit={login}><label className="job-field">비밀번호<input name="password" type="password" autoComplete="current-password" required maxLength={256}/></label><button className="job-btn primary" disabled={busy}>{busy?'확인 중…':'로그인'}</button></form>}{error && <p role="alert">{error}</p>}<button className="job-link" onClick={boot}>연결 다시 확인</button></section></main></div>;
  return <CareerContext.Provider value={{...state,profile:state.profile || initialProfile,notice,setNotice,refresh,mutate,logout}}>{children}</CareerContext.Provider>;
}

export function LocationEditor({value, onChange, query=''}) {
  const [search,setSearch] = useState(query);
  const [results,setResults] = useState([]);
  const [message,setMessage] = useState('');
  const [lat,setLat] = useState(value?.lat ?? '');
  const [lng,setLng] = useState(value?.lng ?? '');
  const [busy,setBusy] = useState(false);
  useEffect(()=>{setLat(value?.lat ?? '');setLng(value?.lng ?? '');},[value?.lat,value?.lng]);
  async function lookup() {
    setBusy(true);setMessage('');setResults([]);
    try {const places=await careerApi(`/places?query=${encodeURIComponent(search)}`);setResults(places);if(!places.length)setMessage('검색 결과가 없습니다.');}
    catch(e){setMessage(e.message);}finally{setBusy(false);}
  }
  return <fieldset className="career-location"><legend>거리 계산용 위치</legend><p className="job-muted">지도 키가 있으면 장소를 검색해 선택하세요. 키가 없으면 위도·경도를 직접 입력할 수 있습니다. 실제 통근시간이 아닌 직선거리입니다.</p><label className="job-field">장소 검색어<input value={search} onChange={e=>setSearch(e.target.value)} maxLength={200}/></label><button type="button" className="job-btn" disabled={busy || search.trim().length<2} onClick={lookup}>{busy?'검색 중…':'장소 검색'}</button>{results.map((x,i)=><button className="career-place" type="button" key={i} onClick={()=>{onChange(x.coordinates);setResults([]);setMessage(`${x.name} 선택됨: 저장 버튼을 눌러 주세요.`);}}>{x.name} · {x.address}</button>)}<div className="job-two"><label className="job-field">위도<input type="number" step="any" min="-90" max="90" value={lat} onChange={e=>setLat(e.target.value)}/></label><label className="job-field">경도<input type="number" step="any" min="-180" max="180" value={lng} onChange={e=>setLng(e.target.value)}/></label></div><button type="button" className="job-btn" onClick={()=>{if(lat==='' || lng==='' || !Number.isFinite(+lat) || !Number.isFinite(+lng) || Math.abs(+lat)>90 || Math.abs(+lng)>180){setMessage('유효한 위도와 경도를 모두 입력해 주세요.');return;}onChange({lat:+lat,lng:+lng});setMessage('좌표 적용됨: 저장 버튼을 눌러 주세요.');}}>좌표 적용</button> <button type="button" className="job-link" onClick={()=>{onChange(null);setMessage('좌표 삭제됨: 저장 버튼을 눌러 주세요.');}}>좌표 지우기</button><p role="status">{message}</p></fieldset>;
}

export function WorkspaceTools() {
  const {sources,mutate,refresh,setNotice,logout} = useCareer();
  const [open,setOpen] = useState(false);
  const [busy,setBusy] = useState('');
  async function sync(id) {
    setBusy(id);
    try {const result = await careerApi(`/sources/${id}/sync`,{method:'POST'});await refresh();setNotice(`${result.count}개 공고를 수집했습니다. 원문으로 모집 여부를 최종 확인해 주세요.`);}
    catch(e){setNotice(e.message);await refresh().catch(()=>{});}finally{setBusy('');}
  }
  return <section className="job-panel career-tools"><div className="job-actions"><button className="job-btn" onClick={()=>setOpen(!open)} aria-expanded={open}>공고 수집처 관리 ({sources.length})</button><button className="job-link" onClick={logout}>로그아웃</button></div>{open && <><h2>회사 채용 게시판 연결</h2><p className="job-muted">Greenhouse·Lever를 사용하는 회사별 공개 게시판을 조회합니다. 국내 모든 공고를 검색하는 기능은 아닙니다. 회사 채용 URL에서 게시판 식별자를 확인해 등록한 뒤 ‘공고 가져오기’를 누르세요. 등록만으로 주기 수집되지는 않습니다.</p><form className="job-form" onSubmit={async e=>{e.preventDefault();const form=e.target;setBusy('add');try{if(await mutate('/sources','POST',Object.fromEntries(new FormData(form))))form.reset();}finally{setBusy('');}}}><div className="job-two"><label className="job-field">수집 API<select name="provider"><option value="greenhouse">Greenhouse</option><option value="lever">Lever (global)</option></select></label><label className="job-field">회사명<input name="company" required maxLength={100}/></label></div><label className="job-field">게시판 식별자<input name="slug" required pattern="[a-zA-Z0-9_-]{1,80}" placeholder="채용 URL의 회사 식별자 (전체 URL 아님)"/></label><button className="job-btn" disabled={!!busy}>수집처 추가</button></form>{sources.map(source=><article className="career-source" key={source.id}><strong>{source.company} · {source.provider}/{source.slug}</strong><p>마지막 성공: {source.lastSuccess ? new Date(source.lastSuccess).toLocaleString('ko-KR'):'아직 수집하지 않음'}</p>{source.error && <p role="alert">{source.error}</p>}<div className="job-actions"><button className="job-btn primary" disabled={!!busy} onClick={()=>sync(source.id)}>{busy===source.id?'수집 중…':'공고 가져오기'}</button><button className="job-link" disabled={!!busy} onClick={()=>{if(window.confirm('수집처 연결을 삭제할까요? 기존 공고는 유지됩니다.'))mutate(`/sources/${source.id}`,'DELETE');}}>연결 삭제</button></div></article>)}</>}</section>;
}

export function JobMaintenance({job,onDone}) {
  const {mutate} = useCareer();
  const [address,setAddress] = useState(job.address || '');
  const [size,setSize] = useState(job.size || '미확인');
  const [coordinates,setCoordinates] = useState(job.coordinates || null);
  const [busy,setBusy] = useState(false);
  return <details className="job-detail-section"><summary>근무지·회사 규모 수정 / 공고 삭제</summary><p className="job-muted">본사 대신 해당 포지션의 실제 근무지를 확인해 입력하세요. 회사 규모는 확인된 직원 수만 입력합니다.</p><label className="job-field">근무지 주소<input value={address} onChange={e=>{setAddress(e.target.value);setCoordinates(null);}} maxLength={500}/></label><label className="job-field">직원 수<select value={size} onChange={e=>setSize(e.target.value)}>{['미확인','1~49명','50~99명','100~299명','300~999명','1,000명 이상'].map(s=><option key={s}>{s}</option>)}</select></label><LocationEditor value={coordinates} onChange={setCoordinates} query={address}/><div className="job-actions"><button className="job-btn primary" disabled={busy} onClick={async()=>{setBusy(true);const body=Object.fromEntries(['company','title','description','url','role','region','mode'].map(k=>[k,job[k] ?? '']));if(await mutate(`/items/${job.id}`,'PUT',{...body,address,size,coordinates}))onDone();setBusy(false);}}>공고 정보 저장</button><button className="job-btn" disabled={busy} onClick={async()=>{if(window.confirm('이 공고와 지원 상태를 삭제할까요? 수집 공고는 다음 수집 시 다시 나타날 수 있습니다.')){setBusy(true);if(await mutate(`/items/${job.id}`,'DELETE'))onDone();setBusy(false);}}}>공고 삭제</button></div></details>;
}
