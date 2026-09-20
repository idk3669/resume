import fs from 'node:fs';
const file = new URL('../k8s/resume.json', import.meta.url);
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const project = data.projects.find(p => p.id === 'cf-push');
const section = (title, lines, image, caption) => ({title, lines, ...(image ? {images: [{src: `/portfolio/cf-push/${image}.png`, alt: caption, caption}]} : {})});
project.title = 'CF Push 상세 분석';
project.sections = [
 section('개요', [
  '- cf push 소요시간을 정밀하게 분석하기 위해 전체 프로세스를 세분화하여 정리',
  '- Upload, Staging, Startup 각 단계별로 세세하게 나누어 총 46단계로 분류',
  '- 이를 기반으로 실제 테스트 및 로그 분석을 통해 병목 구간을 식별하고 최적화 여부를 판단']),
 section('분석 목적', ['- **농협 개발환경 내 cf push 성능 최적화 여부 검증**', '- 각 단계별 상세 흐름을 세분화하여 병목 현상 유무 및 개선 포인트 도출']),
 section('분석 구성', ['- **1. cf push 세분화 (총 46단계)**', '    - Upload(16단계), Staging(16단계), Startup(14단계)', '- **2. 실제 테스트 수행**', '    - 앱 3종(CLCN, EFIP, EFAB) 대상 cf push 실행', '    - 각 앱의 크기/서비스 바인딩 유무 비교', '- **3. 로그 기반 상세 분석**', '    - `cf trace log`, `VM syslog`, `CCDB Jobs 테이블` 활용', '    - 단계별 API 호출 타이밍 및 소요시간 측정']),
 section('소요시간 분석 방법', ['- cf push 세분화, cf push 테스트 수행, 로그 분석 및 결론 도출 단계를 거쳐 농협 개발환경 내 cf push 소요시간 분석을 진행'], 'page-3-1', 'cf push 소요시간 분석 절차'),
 section('cf push 명령어 동작방식', ['`cf push` 명령어는 Tanzu Application Service(TAS)에서 애플리케이션을 배포할 때 사용되는 기본 명령으로, **Upload → Staging → Startup**의 세 가지 Phase로 구성된다. 전체 과정은 Cloud Foundry의 핵심 컴포넌트 간에 발생하는 API 호출을 통해 순차적으로 처리되며, 아래 흐름도를 기반으로 각 단계를 상세히 설명한다.'], 'page-4-1', 'Cloud Foundry 컴포넌트 간 cf push 동작 흐름 (대표 흐름 1~11번, 상세 분석은 총 46단계)'),
 section('① Upload Phase (1~3단계)', ['- 사용자가 cf CLI를 통해 배포 명령을 입력하면, 앱의 **메타데이터와 소스 패키지**가 Cloud Controller(CCNG)로 전달', '- CCNG는 메타데이터를 CCDB(MySQL)에 저장하고 앱 패키지를 Blobstore로 전송', '- 이 단계의 소요시간은 패키지 크기와 서비스 바인딩 여부에 영향을 받음']),
 section('② Staging Phase (4~8단계)', ['- CCNG는 **Droplet(실행 이미지)** 생성을 위해 Diego Brain에 요청을 전달하고, Diego Brain은 빌드 가능한 Staging Cell을 선택해 Droplet 생성을 지시', '- Droplet 생성 후 Blobstore에 저장되며 생성 완료 여부는 Diego BBS에 기록되고 CCNG로 다시 Staging 완료 상태 업데이트', '- 분석 결과, 이 단계는 전체 cf push 시간 중 가장 많은 비중을 차지했으며, 앱 구조 및 의존성에 따라 120초 이상 소요됨']),
 section('③ Startup Phase (9~11단계)', ['- CCNG는 앱 실행을 요청하고 Diego Brain은 실행 가능한 Diego Cell을 선택한다', '- 해당 Cell이 Droplet을 불러와 앱을 실행하며 상태 정보는 Diego BBS에 반영', '- 초기화 로직 복잡도, 리소스 크기에 따라 평균 60초 내외의 시간이 소요되었고 특히 대용량 앱에서 Startup 지연 현상이 관찰됨']),
 section('cf push 동작 중 VM 자원 사용량', ['- 농협 개발환경에서 cf push에 연관된 VM의 자원 사용량 기준으로 병목현상이 발생하지 않았으므로, VM scale up / out을 통한 cf push 시간 단축 어려움'], 'page-5-1', 'cf push 수행 중 VM 자원 사용량'),
 section('단계별 소요시간 분석 결과 (1/2)', ['- 일반적으로 App의 소스(WAR or JAR) 크기와 cf push 소요시간은 정비례하나 Startup 단계에서 큰 증가율이 나타나므로, App의 기동시간 단축 방안 모색이 필요해 보임'], 'page-5-2', '앱별 단계별 소요시간 비교'),
 section('단계별 소요시간 분석 결과 (2/2)', ['- cf trace 로그 기반 분석 결과, 모든 단계에서 파일 크기에 비례한 소요시간 증가 경향이 관찰됨'], 'page-5-3', 'cf trace 로그 기반 소요시간 분석'),
 section('cf push 소요시간 분석 결론 및 시사점', ['cf push 소요시간 분석 결과, Upload(서비스 바인딩), Staging(앱 구조 및 의존성), Startup(초기화 로직) 단계 주요 영향을 확인하였고, VM 자원 사용률이 안정적으로 유지되어 해당 개발환경의 cf push는 최적의 배포 성능을 제공하는 것으로 판단됨', '- **1. Upload 단계**', '    - 서비스 바인딩이 있는 경우, Cloud Controller와 MySQL 사이의 처리 부하가 증가하면서 소요시간이 늘어남', '    - 앱 패키지 사이즈가 커질수록 Blobstore 전송 시간도 함께 증가하는 경향을 보임', '- **2. Staging 단계**', '    - 앱 구조 복잡도 및 패키지 용량에 따라 빌드 시간이 결정됨', '    - 전체 cf push 시간의 과반 이상(최대 65%)을 차지하며, 가장 지연이 큰 단계로 나타남', '- **3. Startup 단계**', '    - 초기화 로직, 할당된 메모리 용량, 앱 사이즈에 따라 실행 대기 시간이 달라짐', '    - 특히 대용량 앱에서 Startup 시간이 70초 이상 소요됨', '- **4. 공통 분석 결과**', '    - 테스트 대상 3종 앱(CLCN, EFIP, EFAB) 모두에서 VM 자원 사용률은 안정적으로 유지되었음', '    - 리소스 병목 징후는 관찰되지 않았음', '    - 따라서 테스트 범위에서 cf push 성능은 **TAS 기준 최적화된 상태**로 판단됨'], 'page-6-1', 'cf push 소요시간 분석 결론'),
 section('별첨 - 상세분석 (Upload)', ['- cf push Upload 단계는 App 정보 검증과 패키지 등록을 위해 CCNG가 CCDB 및 Blobstore와 다수의 API를 호출하여 처리함'], 'page-7-1', 'Upload 상세 API 호출 흐름'),
 section('Upload 단계 로그 상세 분석 및 소요 시간', [], 'page-7-2', 'Upload 단계 로그 분석 및 소요시간 표'),
 section('별첨 - 상세분석 (Staging)', ['- Staging 단계는 Diego Brain의 build auction 처리와 Diego Cell에서의 Droplet 생성 및 업로드 과정을 포함하며, Blobstore 및 CCDB와 연동을 통해 최종 완료됨'], 'page-8-1', 'Staging 상세 API 호출 흐름'),
 section('Staging 단계 로그 상세 분석 및 소요 시간', [], 'page-8-2', 'Staging 단계 로그 분석 및 소요시간 표'),
 section('별첨 - 상세분석 (Startup)', ['- Startup 단계는 Diego Brain이 Diego Cell에 App 실행을 요청한 뒤, 실행 상태를 지속적으로 확인하며 최종적으로 실행 완료 및 상태를 업데이트하는 절차로 구성됨'], 'page-9-1', 'Startup 상세 API 호출 흐름'),
 section('Startup 단계 로그 분석 기반 소요시간', [], 'page-9-2', 'Startup 단계 로그 분석 및 소요시간 표'),
];
fs.writeFileSync(file, JSON.stringify(data, null, 2)+'\n');
