# 개인 채용 보드 — 백엔드와 배포 안내

## 구현 범위

- `/` 공개 이력서 페이지는 유지합니다. `/jobs`와 `/jobs/profile`은 개인 비밀번호로 로그인합니다.
- PDF·DOCX·UTF-8 TXT에서 텍스트를 추출합니다. 추출한 내용을 확인하고 회사 실무·개인 프로젝트·학습 중 적절한 영역에 반영한 뒤 저장합니다.
- 원본 파일은 저장하지 않습니다. 저장 버튼을 누른 프로필과 공고·지원 상태·수집처는 SQLite에 저장되어 다른 브라우저에서도 사용할 수 있습니다.
- 회사별 Greenhouse·Lever(global) 공개 채용 게시판을 등록해 `공고 가져오기`로 조회합니다. 같은 공고는 갱신하며 수집 실패 시 기존 공고는 유지합니다. 완전한 목록 조회에 성공한 경우에만 사라진 공고를 비활성화합니다.
- 공고를 직접 등록·수정·삭제하고 관심/지원 완료/제외 상태를 관리할 수 있습니다.
- 출발지와 실제 근무지의 좌표가 모두 있으면 직선거리(km)를 계산합니다. Kakao REST API 키가 있으면 장소 검색도 가능합니다. 회사 규모는 확인된 직원 수를 직접 입력하며 추측하지 않습니다.
- 추천 정렬은 기술 키워드 비교입니다. 회사 실무와 개인 구축·학습 경험의 가중치를 구분합니다. LLM 분석이나 합격 확률은 아닙니다.

아직 제공하지 않는 기능: 전국 채용 사이트 통합 검색, 원티드·리멤버 자동 크롤링, 주기 수집 스케줄러, 스캔 문서 OCR, 통근시간/대중교통 경로, LLM 평가. 수집처를 추가한 것만으로 자동 반복 수집되지는 않습니다.

기존 화면 버전에서 localStorage에 저장했던 자료는 삭제하지 않습니다. 다만 개인 데이터의 자동 서버 전송을 피하기 위해 새 서버 저장소로 자동 이전하지 않습니다. 필요한 내용을 확인해 다시 등록해 주세요.

## 구성과 보안

Nginx는 `/api/jobs/`를 `career-api:8000`으로 전달합니다. 기존 `/api/`는 공개 `resume-api:8000`을 그대로 사용합니다.

`career-api`는 기존 `resume-api` 이미지 안의 별도 FastAPI 앱(`api.career:app`)입니다. GitHub Actions의 기존 API 이미지 빌드와 digest 갱신으로 함께 배포됩니다. 세 번째 이미지나 별도 레지스트리는 필요하지 않습니다.

개인 서비스만 PVC를 사용합니다. SQLite/local-path 조합이므로 **1 replica + Recreate + Uvicorn 1 worker**로 구성합니다. 업데이트 중 채용 보드는 잠시 중단될 수 있지만 공개 이력서 API의 2 replica 구성은 유지합니다. local-path 데이터는 특정 Worker 디스크에 묶이므로 노드 장애 시 자동으로 다른 노드에서 복구되지 않습니다. 운영 확장 시 PostgreSQL과 내구성 있는 저장소로 이전해야 합니다.

- 비밀번호는 PBKDF2-SHA256 해시만 Secret에 보관합니다. 기본 비밀번호는 없습니다. 미설정이면 개인 API를 열지 않습니다.
- 세션은 8시간이며 HttpOnly·Secure·SameSite=Strict 쿠키를 사용합니다. DB에는 세션 토큰 해시만 저장합니다.
- 수정 요청은 허용 Origin과 세션별 CSRF 토큰을 검사합니다. 로그인은 전체 15분당 10회로 제한합니다. 개인용 설계상 반복적인 외부 로그인 시도는 본인 로그인도 잠시 제한할 수 있습니다.
- 파일은 최대 10MB/30,000자/PDF 80페이지입니다. 별도 프로세스에서 최대 15초로 분석하고 Linux에서는 메모리·CPU 제한도 적용합니다. 암호화 PDF와 텍스트 없는 스캔 PDF에는 안내 오류를 반환합니다.
- 공고 저장은 최대 1,000개 또는 본문 JSON 합계 12MB입니다. 수집처는 최대 30개이며 동일 수집처 재조회 간격은 최소 1분입니다.
- 수집 주소는 서버에 지정된 3개 HTTPS 호스트만 허용하고 리다이렉트를 따르지 않습니다. 사용자가 넣은 공고 URL을 서버가 임의로 열지 않습니다.
- 공개 API의 기존 네트워크 제한은 유지합니다. `career-api`에만 공인 IPv4 HTTPS 송신을 허용합니다. 표준 NetworkPolicy는 도메인 제한을 지원하지 않으므로 애플리케이션에서 별도로 호스트를 제한합니다.
- SQLite는 암호화되지 않은 개인 데이터입니다. VM·디스크·백업 접근 권한을 관리해야 합니다. DB와 `.env`는 Git 및 Docker 빌드 컨텍스트에서 제외했습니다.

## Kubernetes 적용 전 준비

이번 변경은 코드 구현입니다. 현재 클러스터에 적용하거나 Git Push하지 않았습니다. 아래 두 설정은 실제 배포 시 필요합니다.

### 1. 로그인 비밀번호 해시 생성 — Windows 개발 PC

저장소 루트에서 실행합니다. 실제 비밀번호를 채팅이나 명령행 인자로 보내지 마세요.

```powershell
.\.venv\Scripts\python.exe scripts/career_password.py
```

가상환경이 없다면 Python 가상환경을 생성하고 `api/requirements.lock`을 설치한 뒤 실행합니다. 6~256자 비밀번호를 두 번 입력하면 `pbkdf2_sha256$...` 형태의 해시만 출력됩니다. 인터넷에 공개되는 로그인 페이지이므로 짧은 숫자만의 비밀번호는 피하고 가능하면 더 긴 비밀번호를 사용하세요.

### 2. Secret 등록 — master의 Bash

생성된 **해시**를 입력합니다. 아래 명령은 신규 설치용입니다. 이미 지도 키가 들어 있는 Secret을 변경할 때는 기존 키를 보존하세요.

```bash
read -r -s -p 'Career password hash: ' CAREER_HASH
echo
kubectl -n resume create secret generic career-secrets \
  --from-literal=password-hash="$CAREER_HASH" \
  --dry-run=client -o yaml | kubectl apply -f -
unset CAREER_HASH
```

Kakao 장소 검색이 필요하면 동일 Secret의 `kakao-rest-api-key` 항목에 앱 REST API 키를 추가합니다. 키는 Git에 넣지 않습니다. 지도 키가 없어도 로그인·파일 추출·공고 저장·수집과 좌표 직접 입력은 사용할 수 있습니다.

### 3. Argo CD의 PVC 배포 권한 허용

**이번 변경본** `k8s/platform/argocd/application.yaml`을 master로 전달한 뒤 적용합니다. 기존 GitOps 애플리케이션은 `k8s` 루트만 관리하므로 하위 `platform/argocd`의 AppProject 파일이 자동 적용된다고 가정하면 안 됩니다.

```bash
kubectl apply -f k8s/platform/argocd/application.yaml
kubectl get storageclass local-path
```

수정본 AppProject는 `PersistentVolumeClaim`을 추가로 허용합니다. 이전 모니터링 설치 때와 마찬가지로 리소스 허용이 빠지면 동기화가 실패할 수 있습니다. local-path-provisioner도 정상 동작해야 합니다.

### 4. 준비 후 소스 배포

검토한 변경을 commit/push하면 GitHub Actions가 테스트·이미지 빌드 후 `deploy` 브랜치를 갱신하고 Argo CD가 반영합니다. 이 작업에서는 commit/push를 수행하지 않았습니다.

새 Deployment는 비밀번호 Secret이 없어도 시작하지만 로그인 화면에서 설정 필요 메시지를 보여 주며 개인 API는 차단합니다. 이후 Secret을 추가하거나 변경했다면 환경 변수 갱신을 위해 재시작합니다.

```bash
kubectl -n resume rollout restart deployment/career-api
kubectl -n resume rollout status deployment/career-api
kubectl -n resume get pods,pvc,svc
```

`https://kjh-resume.cloud/jobs`에서 로그인합니다. 비밀번호 해시 변경 후에는 기존 세션이 무효화됩니다. 운영 환경의 Secure 쿠키 때문에 노드 IP의 HTTP 주소로는 로그인하지 않도록 구성했습니다. HTTPS 사용자 도메인을 사용하세요.

## 처음 사용할 때

1. `/jobs/profile`에서 파일을 선택합니다. 추출된 텍스트의 줄바꿈과 경력 구분을 확인한 뒤 프로필을 저장합니다. 복잡한 PDF 표는 수동 정리가 필요할 수 있습니다.
2. 출퇴근 기준 위치는 신림역으로 설정되어 있습니다. 정확한 좌표는 임의 입력하지 않았습니다. 장소 검색 결과를 확인하거나 좌표를 직접 입력하고 `좌표 적용` 후 프로필을 저장합니다.
3. `공고 수집처 관리`에서 기업의 실제 채용 게시판 식별자를 추가하고 `공고 가져오기`를 누릅니다. Greenhouse는 `boards.greenhouse.io/{식별자}` 또는 `job-boards.greenhouse.io/{식별자}`, Lever는 `jobs.lever.co/{식별자}` 형식입니다. API 지원 여부와 게시판 식별자를 먼저 확인하세요.
4. 수집되지 않는 사이트의 공고는 URL과 본문을 직접 등록합니다. 원문을 자동 수집하거나 지원서를 자동 제출하지 않습니다.
5. 공고 상세의 `근무지·회사 규모 수정`에서 실제 사무실 좌표와 확인된 직원 수를 저장합니다. 거리 필터는 좌표 미확인 공고를 제외합니다. 규모는 법적 대기업/중견기업 분류가 아닙니다.

완전한 수집 목록에서 사라진 공고는 신규 목록에서 숨기고 `종료·미게시` 탭에서 확인·삭제할 수 있습니다. 관심·지원 완료·제외 상태도 유지합니다. 실제 채용 중인지 원문에서 최종 확인하세요. 직접 보정한 근무지 좌표는 재수집 때 유지하지만 원문 근무지 자체가 변경되면 좌표를 초기화하므로 다시 확인해야 합니다.

## 로컬 개발

Docker Compose: `.env.example`을 참고해 `.env`에 해시를 넣습니다. 해시의 `$` 문자가 치환되지 않도록 값을 작은따옴표로 감싸세요. `docker compose up --build`로 실행한 뒤 `http://localhost:8080/jobs`에 접속합니다. Compose의 HTTP/비보안 쿠키 설정은 loopback 개발용이며 외부에 그대로 노출하지 마세요.

Python/Vite 개발은 공개 API 8000, 개인 API 8001, Vite 5173을 사용합니다. 개인 API 실행 터미널에서 `CAREER_PASSWORD_HASH`, `CAREER_ALLOWED_ORIGINS=http://127.0.0.1:5173`, `CAREER_COOKIE_SECURE=false`를 설정한 뒤 다음을 실행합니다.

```text
python -m uvicorn api.career:app --host 127.0.0.1 --port 8001 --no-access-log
```

## 백업과 한계

PVC는 Argo CD prune/delete에서 보존하도록 표시했습니다. 그렇더라도 수동 PVC 삭제·VM 디스크 손실을 막아 주지는 않습니다. SQLite 실행 중 DB 파일만 복사하면 WAL 변경분이 누락될 수 있으므로 제공한 SQLite backup 명령을 사용합니다.

```bash
kubectl -n resume exec deployment/career-api -- \
  python -m api.career_backup /tmp/career-backup.db
# 생성된 파일을 해당 Pod에서 별도 안전한 장소로 복사합니다.
# kubectl cp에는 실제 Pod 이름을 사용합니다.
```

같은 이름의 백업 파일이 이미 있으면 덮어쓰지 않습니다. 새로운 파일명을 사용하세요. `/tmp` 백업은 Pod 재시작 시 사라지므로 반드시 다른 디스크로 보관합니다. 복구 시에는 서비스 쓰기를 중단하고 현재 DB를 별도로 보존한 뒤 백업을 교체해야 합니다. 자동 백업·복구 검증은 아직 구성하지 않았습니다.

## 검증

```text
python -m unittest discover -s tests -v
node --test tests/jobs-model.test.mjs
pnpm build
kubectl kustomize k8s
```

`tests/jobs-browser.cjs`는 로그인부터 서버 저장·업로드·거리 계산·로그아웃까지 확인합니다. 일반 실행은 `tests/career_server.py`와 5174번 Vite preview를 사용합니다. loopback 제한 환경에서는 `CAREER_TEST_INPROCESS=1`로 Python TestClient에 실제 브라우저 요청을 전달합니다. 이 모드도 실제 FastAPI 인증·파서·SQLite를 사용하지만 실제 네트워크/Ingress/Kubernetes 동작을 검증하는 것은 아닙니다. 테스트용 비밀번호/서버는 프로덕션에서 실행하지 않습니다.

이번 로컬 검증에서는 OneDrive realpath 권한 문제로 Vite의 symlink 보존 옵션과 별도 `test-results/career-build` 출력 경로를 사용했습니다. GitHub Actions의 Linux 표준 빌드는 Push 이후 확인해야 합니다. Docker 데몬이 실행 중이 아니므로 컨테이너 실행 검증은 수행하지 않았습니다.

## 공식 API 참고

- [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html)
- [Lever Postings API](https://github.com/lever/postings-api)
- [Kakao Local 장소 검색](https://developers.kakao.com/docs/ko/local/dev-guide#search-by-keyword)
