<<<<<<< HEAD
# 김진현 · Resume Platform

React + Vite / Nginx / FastAPI로 구성한 읽기 전용 이력서 서비스입니다.
VM 없이 로컬에서 개발할 수 있고, 동일 소스로 컨테이너를 만들어 kubeadm 클러스터에 배포합니다.

```text
브라우저 → Nginx(웹 화면 + /api 프록시) → FastAPI → resume.json
```

## 먼저 보기

Windows 로컬 개발: Python 3.12+, Node.js 22.12+ 및 pnpm 10.11.0이 필요합니다.
저장소 루트에서 실행하세요. Python 실행 명령이 `py`인 환경에서는 `python` 대신 `py -3.12`를 사용합니다.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r api/requirements.lock
corepack enable
corepack prepare pnpm@10.11.0 --activate
pnpm install --frozen-lockfile
```

터미널 1에서 API:

```powershell
.\.venv\Scripts\python.exe -m uvicorn api.main:app --host 127.0.0.1 --port 8000
```

터미널 2에서 웹:

```powershell
pnpm dev
```

브라우저: http://127.0.0.1:5173 . 개발 서버의 `/api` 요청은 8000번 API로 프록시됩니다.
API가 내려가면 UI에 오류와 재시도 버튼이 표시됩니다. API를 먼저 시작하세요.

Windows 샌드박스에서 Vite 설정 파일 번들링 접근 오류가 나면 아래 명령을 사용합니다.

```powershell
pnpm exec vite web --configLoader native --host 127.0.0.1 --port 5173 --strictPort
```

## Docker Compose

Docker Engine 또는 Linux 컨테이너 모드의 Docker Desktop + Compose v2가 있는 환경에서:

```sh
docker compose up --build -d
docker compose ps
curl -f http://127.0.0.1:8080/api/resume
```

웹 주소는 http://127.0.0.1:8080 입니다. API는 호스트에 포트를 공개하지 않습니다.
`docker compose down`으로 이 프로젝트 컨테이너를 종료할 수 있습니다.
이 구성은 개발·검증용이며 Kubernetes 복제본·RBAC·NetworkPolicy를 재현하지 않습니다.

## 이력서 수정

- 데이터의 단일 원본: `k8s/resume.json`
- 웹 화면: `web/src/main.jsx`, 스타일: `web/src/styles.css`
- API: `api/main.py`
- API는 시작할 때만 데이터를 읽습니다. 로컬에서는 API를 재시작하고 Compose에서는 `docker compose restart resume-api`를 실행합니다.
- Kubernetes에서는 `kubectl apply -k k8s` 시 ConfigMap의 내용 해시가 바뀌어 새 Pod로 롤아웃됩니다. 이전 ConfigMap은 롤백을 위해 보존됩니다.
- 사용자 API에는 쓰기 엔드포인트가 없습니다. 관리자 권한으로 소스와 배포를 변경하는 것은 가능합니다.
- 개인 정보·문서 불일치 처리 기준은 `docs/content-review.md`를 참고하세요.

## 검증

```sh
python -m pip install -r api/requirements-dev.txt
python -m unittest discover -s tests -v
pnpm build
```

API의 조회, 쓰기 거부, 잘못된 데이터 처리, 개인정보 제외, 배포 YAML의 기본 일관성을 검사합니다.
YAML 정적 검사는 실제 API 서버 스키마·이미지 실행·CNI 동작을 검증하지 않습니다.
Docker/Kubernetes에서 수행할 검증 절차와 아직 미검증인 항목은 `docs/deployment.md`, `docs/verification.md`에 명시했습니다.

## Kubernetes 배포

클러스터 구성 시 Calico VXLAN 설정은 `k8s/platform/calico/installation.yaml`으로 관리한다. 설치 순서는 해당 디렉터리의 `README.md`를 참고한다.
최종 외부 진입은 `k8s/platform/gateway/`의 Gateway API 매니페스트와 `docs/gateway-deployment.md`를 따른다. 앱 Service의 NodePort는 초기 검증용이며 Gateway 전환 시 제거한다.

`docs/deployment.md` 순서대로 이미지 준비 후 실행합니다.

```sh
kubectl apply -k k8s
kubectl -n resume rollout status deployment/resume-api --timeout=180s
kubectl -n resume rollout status deployment/resume-web --timeout=180s
kubectl -n resume get pods -o wide
bash scripts/verify-rbac.sh
```

같은 NAT 네트워크에 접근 가능한 Windows 호스트에서 `http://<노드 IP>:30080`으로 접속합니다.
이 주소만으로 인터넷에 공개되지는 않습니다. 외부 공개는 `docs/deployment.md`의 터널 절차를 따릅니다.

## 범위

- 금융권 클라우드 경력과 8개 프로젝트 사례, 분류 필터, 상세 모달, 모바일 레이아웃
- Web/API 각각 2개 복제본, Probe, PDB, 자원 제한, Worker 분산 선호
- `service-resume`, namespace 한정 읽기 RBAC, 토큰 자동 마운트 해제
- 기본 거부 NetworkPolicy 및 Web→API/DNS 예외
- 비루트 컨테이너, 읽기 전용 루트 파일시스템, capability 제거
- 컨트롤 플레인 및 물리 PC는 단일 장애 지점입니다. 이 프로젝트는 운영급 HA를 주장하지 않습니다.

## 참고 문서

- https://fastapi.tiangolo.com/advanced/events/
- https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/
- https://kubernetes.io/docs/concepts/security/service-accounts/
- https://kubernetes.io/docs/concepts/services-networking/network-policies/
=======
# resume
>>>>>>> origin/main
