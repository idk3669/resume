# 검증 기록과 면접 시연

## 이 환경에서 수행하는 검사

API 단위·통합 검사와 YAML 정적 검사, React production build, 로컬 브라우저 동작 검사를 수행합니다.
실제 결과는 `verification-result.md`를 참고하세요.
Docker/Kubernetes 실행 도구와 클러스터가 없어 이미지 빌드·Nginx 실기동·클러스터 테스트는 미실행입니다.
이 아래 내용은 **시험 절차 및 기대 결과**이며 성공 기록이 아닙니다.

## VM 준비 후 증거 수집

| 항목 | 방법 | 기록할 증거 |
|---|---|---|
| 노드 구성 | kubectl get nodes -o wide | CP 1·Worker 2 상태, 실제 OS/버전 |
| 외부 서비스 | 공개 URL 및 /api/resume | 브라우저 화면, 요청 상태 |
| SA 연결 | custom-columns로 SA 확인 | Pod별 service-resume |
| RBAC | verify-rbac.sh | 조회 yes, 쓰기 no |
| 네트워크 제한 | 허용/비허용 클라이언트 비교 | 성공·실패 및 정책 |
| 배포 복구 | 잘못된 이미지 태그로 테스트 후 undo | Events, rollout, 복구 결과 |
| drain | 아래 절차 | 성공률·지연·배치 변화 |

## 계획된 노드 점검 시연

터미널 1: 켜져 있는 노드의 NodePort로 120초 측정:

```sh
python scripts/probe-service.py http://<정상 노드 IP>:30080 --seconds 120
```

터미널 2: 대상 노드의 기존 워크로드를 먼저 확인한 후, 과제 전용 Worker에 한해 실행:

```sh
kubectl get pods -A -o wide
kubectl drain <worker-name> --ignore-daemonsets --delete-emptydir-data
kubectl -n resume get pods -o wide
kubectl uncordon <worker-name>
```

`--delete-emptydir-data`는 해당 노드의 emptyDir 데이터를 버립니다. 이 프로젝트에서는 임시 파일만 해당되며 다른 워크로드가 있으면 별도 검토하세요.
PDB는 eviction을 제어하며 직접 Pod 삭제·노드 전원 종료를 차단하지 않습니다.
실패율이 0이라고 미리 가정하지 말고 실제 측정값을 기록합니다. uncordon 후 기존 Pod가 자동 재분산되는 것도 보장되지 않습니다.

## 장애 기록 양식

- 구분: 실제 시행착오 / 의도한 장애 주입
- 발생 시각·환경:
- 증상 및 사용자 영향:
- 관측한 Events·로그·응답:
- 가설과 배제 근거:
- 원인:
- 조치:
- 재검증 결과:
- 재발 방지 및 남은 한계:

## 발표 구성

1. 요구사항과 설계 선택(왜 2계층·왜 DB 없음)
2. 실제 물리/논리 구성도와 외부 요청 경로
3. 화면·API·SA/RBAC 시연
4. 장애 분석과 실제 테스트 결과
5. 단일 물리 호스트·CP·외부 경로의 한계와 개선 방향
