# 배포 가이드

## 1. 대상 환경

Ubuntu Server VM 3대(control plane 1, worker 2), containerd, kubeadm, kubectl 및 NetworkPolicy를 지원하는 CNI(Calico 등)를 구성한 뒤 사용합니다.
모든 노드가 Ready이고 CoreDNS가 동작해야 합니다. Kubernetes 설치 자체는 이 소스 패키지의 범위에 포함하지 않습니다.
노드의 실제 IP와 CPU/RAM, Kubernetes/CNI 버전은 아직 확정하지 않았습니다.

## 2. 이미지 준비 — 레지스트리 없이도 가능

Docker가 있는 빌드 머신에서 프로젝트 루트로 이동:

```sh
docker build -f api/Dockerfile -t resume-api:1.0.0 .
docker build -f web/Dockerfile -t resume-web:1.0.0 .
docker save -o resume-images.tar resume-api:1.0.0 resume-web:1.0.0
```

tar 파일을 **두 Worker 모두**에 복사한 뒤 각 Worker에서 실행:

```sh
sudo ctr -n k8s.io images import resume-images.tar
sudo crictl images
```

Control Plane에도 워크로드를 스케줄링하도록 변경했다면 그 노드에도 가져와야 합니다.
Docker의 로컬 이미지 저장소와 containerd의 k8s.io 저장소는 별개입니다.
동일 태그에 새 이미지를 덮어쓰지 말고 새 버전으로 빌드·반입 후 `k8s/kustomization.yaml`의 newTag를 변경하세요.

레지스트리를 사용할 경우 두 이미지의 newName을 레지스트리 경로로 바꾸고 push합니다. Private 레지스트리는 별도 imagePullSecret 설정이 필요합니다.

## 3. 리소스 생성

관리자 kubeconfig를 사용하는 터미널에서:

```sh
kubectl get nodes -o wide
kubectl kustomize k8s
kubectl apply -k k8s
kubectl -n resume rollout status deployment/resume-api --timeout=180s
kubectl -n resume rollout status deployment/resume-web --timeout=180s
kubectl -n resume get pods,svc,pdb -o wide
```

각 계층에서 2개 복제본이 Ready인지 확인합니다. 분산은 soft constraint이므로 실제 노드 배치를 반드시 확인하세요.
노드당 한 Pod를 강제하지 않아 drain 중 남은 Worker에서 대체 Pod를 실행할 수 있지만, 자원 여유가 있어야 합니다.

## 4. 로컬 접근과 외부 공개

Windows 호스트에서 `http://<접근 가능한 노드 IP>:30080` 접속. VMware NAT 대역을 사용합니다.
테스트용 대안은 `kubectl -n resume port-forward svc/resume-web 8080:8080` 후 localhost:8080입니다.
port-forward는 한 Pod에 연결되므로 복구·drain 시연의 고가용성 접속점으로 사용하지 마세요.

무료 임시 공개 URL이 필요하면, NodePort 주소에 접근 가능한 Windows 호스트에 cloudflared를 설치한 뒤:

```sh
cloudflared tunnel --url http://<노드 IP>:30080
```

출력된 HTTPS URL에서 화면과 `/api/resume`을 둘 다 확인하세요. Quick Tunnel은 임시 테스트용으로 URL 지속성·SLA가 없습니다.
PC·VM·터널을 끄면 접속할 수 없습니다. 제출 기간 내 고정 URL이 필요하면 별도의 고정 터널·도메인 구성을 결정해야 합니다.
터널 원본을 한 Worker IP로 고정하면 그 VM 전원 종료 시 외부 경로도 끊깁니다. drain 시연은 해당 VM을 켠 채로 진행하거나 정상 노드 IP를 사용합니다. 이 외부 경로에 HA를 주장하지 않습니다.
https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/

## 5. 계정 검증

```sh
bash scripts/verify-rbac.sh
kubectl -n resume get pods -o custom-columns=NAME:.metadata.name,SA:.spec.serviceAccountName,TOKEN:.spec.automountServiceAccountToken
```

관리자에게 impersonation 권한이 있어야 합니다. 검증 스크립트는 실제 변경 요청 대신 권한 질의를 수행합니다.
SA 권한은 RBAC 전체 바인딩의 합입니다. 다른 ClusterRoleBinding으로 추가 권한을 부여하면 읽기 전용이 깨질 수 있으므로 새 클러스터에서도 검증하세요.
검토자가 SA kubeconfig를 필요로 하면 단기 TokenRequest로 별도 생성하고 비공개 채널로 전달하세요. 토큰·관리자 kubeconfig를 웹·Git·발표 캡처에 넣지 않습니다.

## 6. 네트워크 정책

- 전체 기본 거부.
- Web 8080은 NodePort/터널을 위해 인바운드 허용.
- API 8000은 같은 namespace의 app=resume-web Pod만 허용.
- CoreDNS(`kube-system`, `k8s-app=kube-dns`)로 TCP/UDP 53 허용.
- API는 외부 네트워크를 필요로 하지 않음.

NodeLocal DNSCache나 다른 DNS 라벨을 사용한다면 dns-egress 정책을 해당 구성에 맞게 수정해야 합니다.
NetworkPolicy 리소스가 생성된 것만으로 적용을 증명하지 못합니다. 실제 CNI가 정책을 집행하는지 아래 테스트를 수행하세요.

```sh
# Web → API: 200과 JSON 예상
kubectl -n resume exec deploy/resume-web -- wget -qO- http://resume-api:8000/api/resume
```

허용하지 않은 Pod를 **관리자 권한으로** 생성하는 테스트(이미지 다운로드 필요):

```sh
kubectl -n resume run denied-client --image=busybox:1.37 --restart=Never --overrides='{"spec":{"automountServiceAccountToken":false,"securityContext":{"runAsNonRoot":true,"runAsUser":10001,"seccompProfile":{"type":"RuntimeDefault"}},"containers":[{"name":"denied-client","image":"busybox:1.37","command":["sleep","300"],"securityContext":{"allowPrivilegeEscalation":false,"capabilities":{"drop":["ALL"]}}}]}}'
kubectl -n resume wait --for=condition=Ready pod/denied-client --timeout=90s
kubectl -n resume exec denied-client -- wget -T 3 -qO- http://resume-api:8000/api/resume
kubectl -n resume delete pod denied-client
```

denied-client는 기본 거부로 DNS도 불가하므로 위 실패만으로 API 인바운드 차단을 단독 증명하지는 못합니다. 순수 인바운드 검증은 egress 제한이 없는 별도 시험 namespace의 클라이언트에서 API ClusterIP:8000으로 요청하여 비교하세요.

## 7. 업데이트와 복구

- 데이터: JSON 수정 → 테스트 → `kubectl apply -k k8s` → rollout 확인.
- 코드: 새 태그 이미지 빌드·배포 → newTag 변경 → apply.
- 장애 배포: `kubectl -n resume rollout undo deployment/resume-api` 또는 resume-web → 상태 확인.
- 롤백 후 원하는 상태에 맞게 소스도 되돌려야 다음 apply에서 문제가 재현되지 않습니다.
- ConfigMap 해시 버전은 자동 삭제하지 않습니다. 롤백 기간이 지난 뒤 참조 없는 버전만 확인하여 정리하세요.
- readiness 실패·progressDeadlineSeconds 초과 시 Kubernetes가 자동으로 이전 버전으로 롤백하지는 않습니다.
- 라이브니스는 의존 API 장애를 포함하지 않아 Web의 연쇄 재시작을 방지합니다. API 오류는 UI의 오류·재시도로 처리합니다.

## 한계 및 후속 확인

이미지 태그는 실습 편의를 위한 버전 태그입니다. 제출 환경에서 pull/build 성공 확인 후 digest 고정과 취약점 검사를 권장합니다.
Nginx upstream은 Service ClusterIP를 시작 시 해석하므로 Service를 삭제·재생성해 ClusterIP가 바뀌면 Web도 재시작해야 합니다.
가상 노드 3대는 하나의 물리 호스트를 공유합니다. CP·PC·공개 경로 단일 장애 지점을 구성도에 표시하세요.
