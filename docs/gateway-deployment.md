# Gateway API와 공개 HTTPS URL

최종 외부 경로는 다음과 같다.

```text
Internet browser → Cloudflare Quick Tunnel (HTTPS) → Envoy Gateway NodePort
                 → HTTPRoute → resume-web ClusterIP → resume-api ClusterIP
```

`resume-web`과 `resume-api`는 외부 NodePort를 사용하지 않는다. VMware NAT 환경에는 클라우드 LoadBalancer가 없으므로 Envoy Gateway가 관리하는 프록시 Service만 NodePort로 노출한다.

## 1. Envoy Gateway 설치

Control Plane에서 Envoy Gateway `v1.9.1`을 설치한다. 이 매니페스트는 Gateway API와 Envoy Gateway CRD를 함께 설치한다.

```bash
kubectl apply --server-side -f https://github.com/envoyproxy/gateway/releases/download/v1.9.1/install.yaml
kubectl wait -n envoy-gateway-system --for=condition=Available deployment/envoy-gateway --timeout=5m
```

## 2. 애플리케이션과 Gateway 매니페스트 반영

프로젝트 루트에서 실행한다.

```bash
kubectl apply -k k8s
kubectl apply -k k8s/platform/gateway
kubectl -n resume rollout status deployment/resume-web --timeout=180s
kubectl -n resume get gateway,httproute,svc
```

`resume-web` Service는 `ClusterIP`여야 한다. `resume-gateway`가 생성한 Envoy Service는 `NodePort`여야 한다.

Gateway가 프로그래밍될 때까지 확인한다.

```bash
kubectl -n resume get gateway resume-gateway
kubectl -n resume get httproute resume-web
kubectl -n resume get svc -o wide
```

`resume` namespace의 Envoy Service에서 HTTP NodePort 번호를 확인한 다음, 같은 NAT 네트워크의 Windows에서 `http://192.168.96.11:<GATEWAY_NODEPORT>`로 접속한다. 기존 `:30080` 앱 NodePort는 이 단계 후 사라진다.

## 3. 임시 공개 HTTPS URL

Windows에 `cloudflared`를 설치한 뒤, Gateway NodePort를 원본으로 연결한다.

```powershell
cloudflared tunnel --url http://192.168.96.11:<GATEWAY_NODEPORT>
```

명령이 출력하는 `https://*.trycloudflare.com` URL이 인터넷 공개 주소다. 이 터널은 프로세스가 실행되는 동안만 유효하고 URL도 임시다. 고정 도메인과 지속 URL이 필요하면 Cloudflare 계정·도메인 기반 named tunnel로 전환한다.
