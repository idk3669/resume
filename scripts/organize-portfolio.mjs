import fs from 'node:fs';
const file = new URL('../k8s/resume.json', import.meta.url);
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const details = {
  'cf-push': ['3–9', [
    ['분석 범위와 방법', 'Upload 16단계, Staging 16단계, Startup 14단계로 총 46개 단계를 구분했습니다.', 'CLCN·EFIP·EFAB 앱 3종을 대상으로 크기와 서비스 바인딩 유무를 비교하고 cf trace, VM syslog, CCDB Jobs로 API 호출 시간과 자원 사용률을 확인했습니다.'],
    ['단계별 확인 결과', 'Upload: 서비스 바인딩 시 Cloud Controller·MySQL 처리와 Blobstore 패키지 전송 시간이 영향을 주었습니다.', 'Staging: 앱 구조와 의존성에 따라 전체 시간의 최대 65%를 차지했습니다.', 'Startup: 초기화 로직·메모리·앱 크기에 영향을 받았으며 대용량 앱은 70초 이상 소요됐습니다.'],
    ['결론', '테스트 범위에서 VM 자원 병목은 관찰되지 않았습니다. 단순 VM 증설보다 앱 구조, 의존성, 초기 기동시간을 개선 대상으로 도출했습니다.']]],
  rabbitmq: ['10–16', [
    ['장애와 서비스 영향', '거래 로그를 비동기로 처리하는 RabbitMQ 3노드 클러스터에서 약 1분간 Heartbeat가 누락됐습니다.', 'RabbitMQ 프로세스 재시작 중 로그 처리 완료를 기다리던 업무 앱의 거래 응답이 지연됐습니다. OS 재부팅과 프로세스 재시작을 구분하여 분석했습니다.'],
    ['원인 추적', 'TCP 25672 통신의 PSH·ACK 재전송과 Sequence 흐름을 추적했습니다.', 'vNIC과 vSwitch 사이 NSX DFW의 DVFilter에서 패킷 드롭이 발생하는지 DROP REASON 카운터와 장애 시점을 대조했습니다.', '애플리케이션 증상에서 하이퍼바이저 네트워크 계층의 TCP 흐름 드롭으로 원인을 좁혔습니다.'],
    ['해결안 검토와 선택', '대상 VM 방화벽 예외, 분산 방화벽 비활성화, NSX 업그레이드를 비교했습니다.', '당시 제품 호환성을 검토하여 NSX 업그레이드 방안을 채택했습니다. 문서에 기재된 버전은 해당 장애 당시 기준입니다.']]],
  routing: ['17–23', [
    ['환경과 요구사항', 'MFT·백업·DB·서비스망 4개 대역을 분리하고 VM 생성 시 Multi-NIC과 라우팅을 자동 구성했습니다.', 'vSphere는 Ops Manager API·BOSH의 네트워크 지정 방식을, AWS는 해당 구축 환경에서 AWS CLI로 인터페이스를 생성·연결하는 방식을 적용했습니다.'],
    ['자동화 구현', 'BOSH custom release 기반 nh-add-route를 제작하고 Monit 프로세스로 등록했습니다.', '환경별 route-tables 스크립트, Job spec, Monit 설정, ERB 템플릿을 구성하고 60초 주기로 라우팅을 점검·복구했습니다.', 'VM 생성 → 보안 솔루션 및 네트워크 설정 → Monit 기동·라우팅 적용 → post-deploy 연결 점검 순서를 정리했습니다.', '개발은 GitLab 배포 컨테이너, 운영은 CI/CD 서버를 통해 릴리즈와 도구를 전달했습니다.'],
    ['문제 해결', '재기동 후 라우팅 유실과 AWS 네트워크 초기화 후 Default Gateway 중복을 분석했습니다.', 'DHCP 임대 갱신으로 Gateway가 다시 생성되고 삭제 순간 순단이 발생하여, 삭제 로직만으로는 해결되지 않음을 확인했습니다.', 'dhclient 의존을 제거하고 systemd-networkd에 IP·서브넷·Gateway·DNS를 명시하는 Static IP 방식으로 전환했습니다.']]],
  'gemfire-ha': ['24–36', [
    ['검증 목표와 구성', '운영·DR 센터의 GSLB 50:50 전환 시 세션 유지, 캐시 공유와 데이터 일관성을 검증했습니다.', 'WAN 복제, 센터 간 단일 GemFire 공유, IaaS Standalone, 여러 GemFire 동시 연결의 네 가지 구성을 비교했습니다.', 'Standalone은 Locator 3대·Server 4대로 구성하고 VM·프로세스 강제 종료 등 8개 장애 시나리오를 수행했습니다.'],
    ['확인한 결과와 제약', 'WAN Gateway 복제 연결은 성공했지만 비동기 복제 지연과 일관성 정책이 필요했습니다.', 'TCP 라우터를 통한 센터 간 공유는 가능했지만 수동 연결 설정이 필요하고 단일 캐시로 부하가 집중될 수 있었습니다.', 'Locator 장애 후 역할 승계와 복구를 확인했습니다. Server 2대 동시 장애에서는 일부 데이터 유실을 확인했습니다.', 'Standalone 구성의 지원 범위 및 IaaS·PaaS 운영 책임, 다중 캐시 연결의 복잡성을 검토했습니다.'],
    ['최종 판단', '기술적 구현 가능성과 운영 도입 판단을 분리했습니다. 테스트 후 인프라 전략이 DR센터 자원 회수 방향으로 바뀌어 멀티센터 강화 구성의 실제 도입은 진행하지 않았습니다.']]],
  'marketing-performance': ['37–47', [
    ['장애와 분석 범위', '마케팅허브 오픈 후 접속량 증가로 정적 리소스·대용량 파일 응답이 지연됐습니다.', '로드밸런서 → Gorouter → Web(Nginx) → Spring Cloud Gateway → 내부 API 경로를 따라 IaaS·PaaS·컨테이너 지표를 대조했습니다.'],
    ['부하 재현과 구성 비교', 'DR에서 동일 GET 요청 시나리오로 L7과 L4를 비교했습니다. 해당 조건에서 L7은 약 5,000 TPS부터 지연됐고 L4는 10,000 TPS를 넘어서도 지연 없이 처리했습니다.', 'Gorouter와 웹 컨테이너의 증설 효과를 분리해 검증하고 CPU·응답시간을 함께 비교했습니다.', '8코어 Gorouter 6대와 웹 컨테이너 4대를 최적 구성으로 도출했습니다. 수치는 포트폴리오의 부하 조건에 한정됩니다.'],
    ['운영 반영', '장애 대응 시 운영·DR 50:50 거래 분산과 긴급 증설을 적용했습니다.', '브라우저 캐시, 거래량 변화와 추가 테스트 결과를 확인한 뒤 단일 운영센터 100:0 처리로 복귀하고 컴포넌트 대수를 재조정했습니다.']]],
  allone: ['48–53', [
    ['계층별 가용성 검증', 'NSX 장비, ESXi 호스트, PaaS VM, 컨테이너 강제 종료로 서비스 영향과 자동 복구를 확인했습니다.', 'NSX 재기동 시 약 40초 서비스 중단이 관찰됐고 LACP 구성 후 중단 없는 동작을 검증했습니다.', 'BOSH와 컨테이너 관리 컴포넌트가 장애 대상을 재생성하는지 확인했습니다.'],
    ['앱 메모리·상태 검사·배포', 'Full GC·OOME·Heap Dump를 근거로 컨테이너 메모리와 JVM 옵션 사이징을 안내했습니다.', '컨테이너 기동만 확인하는 상태 검사 대신 DB·GemFire 등 Backend 준비 여부를 반영하는 endpoint를 안내했습니다.', '신규 앱으로 즉시 라우팅 전환 시 TPS 저하가 발생하여 구·신 버전 공존과 워밍업 후 전환을 테스트했습니다.'],
    ['Autoscaler와 세션 병목', '1,600 TPS 이상에서 증설이 지연되는 현상을 로그 유실·Log Cache 수집 지연과 연계했습니다.', '로그 처리 리소스와 메트릭 수집 주기를 조정했습니다. 당시 높인 max_per_source는 이후 과다 설정으로 확인되어 별도 최적화 사례에서 재조정했습니다.', 'Thread Dump로 GemFire registerInterest 연결 잠금과 스레드 경합을 확인했습니다.', '해당 앱에서 불필요한 Subscription을 해제한 후 1,600 TPS 이상에서도 해당 경합·응답 지연이 나타나지 않았습니다.']]],
  'log-cache': ['54–56', [
    ['증상과 근본 원인', '로그 유실 및 로그 처리 VM의 CPU·메모리 임계값 초과를 분석했습니다.', '이전 Autoscaler 대응에서 max_per_source를 10만에서 1억 건으로 높인 설정이 Log Cache 과부하로 이어졌음을 확인했습니다.'],
    ['실측 기반 분석', '3개월간 Grafana 지표와 ELK 로그·트래픽을 교차 분석하여 평균·피크·배치 시간대 사용률을 비교했습니다.', '로그 count와 Cache Duration으로 초당 Envelope 발생량을 구하고 요청당 메트릭 수·RPS·보관시간을 기준으로 캐시 규모를 재산정했습니다.'],
    ['튜닝과 검증', 'Filebeat·Metricbeat, Traffic Controller, tas-exporter를 단계적으로 조정하면서 유실률을 재측정했습니다.', '과도한 Log Cache 보관량을 조정하고, 상세 본문 기준 Loggregator 10→16대·Doppler 8→12대로 처리 용량을 확보했습니다.', 'Log Cache CPU를 90% 이상에서 50~60%대로 안정화하고 로그 유실을 해소했습니다. 이후 트래픽 증가에 대응할 운영 기준을 정리했습니다.']]]
};
data.highlights = [];
for (const project of data.projects) {
  project.collection = details[project.id] ? 'portfolio' : 'projects';
  if (!details[project.id]) continue;
  const [pages, sections] = details[project.id];
  project.sourcePages = pages;
  project.sections = sections.map(([title, ...lines]) => ({title, lines: lines.map(line => '- ' + line)}));
}
data.projects.sort((a,b) => {
  const order = Object.keys(details);
  if (a.collection !== b.collection) return a.collection === 'projects' ? -1 : 1;
  return a.collection === 'portfolio' ? order.indexOf(a.id)-order.indexOf(b.id) : 0;
});
fs.writeFileSync(file, JSON.stringify(data, null, 2)+'\n');
