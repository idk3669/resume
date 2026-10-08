export const roles = ['클라우드', '플랫폼', 'DevOps', 'SRE', 'MLOps·AI 플랫폼'];
export const initialProfile = {
  roles, origin: '대한민국 서울특별시 신림역',
  professional: 'VMware Tanzu Application Service(TAS) 기반 금융권 Private Cloud PaaS 구축 및 운영\nBOSH 운영 자동화 · 로그 분석 · 장애 대응 · 리소스 튜닝\nGrafana · Prometheus · RabbitMQ · GemFire · AWS DR 운영',
  personal: 'Kubernetes · containerd · Calico 구축\nGitHub Actions · GHCR · Argo CD 기반 CI/CD 및 GitOps\nEnvoy Gateway · Cloudflare Tunnel · React · FastAPI',
  learning: 'Private AI 연동 MLOps 플랫폼 테스트',
};
export const emptyFilters = {query: '', role: '', region: '', size: '', mode: '', distance: '', sort: 'match'};
const skillNames = ['Kubernetes', 'TAS', 'BOSH', 'Grafana', 'Prometheus', 'RabbitMQ', 'GemFire', 'AWS', 'Argo CD', 'GitOps', 'CI/CD', 'Python', 'Terraform', 'GPU', 'Kubeflow', 'MLflow'];
export function safeUrl(value) {
  try {const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null;} catch {return null;}
}
export function matchJob(job, profile) {
  const text = `${job.title} ${job.description}`.toLowerCase();
  const required = skillNames.filter(skill => text.includes(skill.toLowerCase()));
  const inText = (field, skill) => (profile[field] || '').toLowerCase().includes(skill.toLowerCase());
  const work = required.filter(skill => inText('professional', skill));
  const personal = required.filter(skill => !work.includes(skill) && inText('personal', skill));
  const learning = required.filter(skill => !work.includes(skill) && !personal.includes(skill) && inText('learning', skill));
  const missing = required.filter(skill => !work.includes(skill) && !personal.includes(skill) && !learning.includes(skill));
  const fitRole = profile.roles.includes(job.role);
  const rank = (fitRole ? 3 : 0) + work.length * 2 + personal.length + learning.length * .5;
  return {work, personal, learning, missing, rank, label: !required.length ? '요건 확인 필요' : work.length >= 2 && fitRole ? '경력 연결 높음' : work.length || personal.length ? '경험 연결 가능' : '추가 확인 필요'};
}
export function selectJobs(jobs, statuses, tab, filters, profile) {
  const results = jobs.filter(job => {
    const status = statuses[job.id] || 'new';
    if (tab === 'closed') {if (job.active !== false) return false;}
    else if (tab === 'all' ? status === 'excluded' || job.active === false : status !== tab) return false;
    if (filters.query && !`${job.company} ${job.title} ${job.description}`.toLowerCase().includes(filters.query.trim().toLowerCase())) return false;
    if (filters.role && job.role !== filters.role) return false;
    if (filters.region && job.region !== filters.region) return false;
    if (filters.size && job.size !== filters.size) return false;
    if (filters.mode && job.mode !== filters.mode) return false;
    if (filters.distance && (!Number.isFinite(job.distance) || job.distance > Number(filters.distance))) return false;
    return true;
  }).map(job => ({...job, match: matchJob(job, profile)}));
  return results.sort((a,b) => filters.sort === 'distance' ? (a.distance ?? Infinity) - (b.distance ?? Infinity) : filters.sort === 'latest' ? b.createdAt.localeCompare(a.createdAt) : b.match.rank - a.match.rank);
}
export const demoJobs = [
  ['플랫폼 랩', '금융 클라우드 플랫폼 엔지니어', '플랫폼', '서울', '100~299명', '하이브리드', 'TAS 플랫폼 운영 및 BOSH 자동화. Grafana, Prometheus 기반 장애 분석. Kubernetes 운영 경험 우대.'],
  ['클라우드 스튜디오', 'DevOps 엔지니어', 'DevOps', '경기', '50~99명', '출근', 'AWS 및 Kubernetes 서비스 운영. Argo CD, GitOps, CI/CD 배포 자동화. Terraform 경험 필요.'],
  ['데이터 웍스', 'AI 플랫폼 인프라 엔지니어', 'MLOps·AI 플랫폼', '서울', '300~999명', '하이브리드', 'Kubernetes 기반 GPU 클러스터 관리. Kubeflow, MLflow 운영 및 Python 개발 경험.'],
  ['서비스 테크', '서비스 신뢰성 엔지니어', 'SRE', '서울', '1,000명 이상', '출근', 'Prometheus, Grafana 모니터링. RabbitMQ 장애 대응 및 Python 운영 자동화.'],
].map((x,i) => ({id: `demo-${i}`, company:x[0], title:x[1], role:x[2], region:x[3], size:x[4], mode:x[5], description:x[6], demo:true, createdAt:'2026-01-01', distance:null, url:'', address:'상세 근무지 미확인'}));
