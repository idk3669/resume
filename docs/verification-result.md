# 로컬 검증 결과

검증일: 2026-09-19. 실제 Kubernetes 배포 결과가 아닌 개발 PC에서의 검증입니다.

| 검사 | 결과 |
|---|---|
| API 조회 및 8개 프로젝트 상세 일치 | 통과 |
| POST / PUT / PATCH / DELETE 거부 | 통과: 405 |
| 없는 프로젝트 | 통과: 404 |
| 누락·손상 JSON, 중복 ID, 잘못된 참조 | 통과: live 200, ready/API 503 |
| 공개 API에서 상세 주소·전화번호·생년월일 제외 | 통과 |
| YAML 구문·SA·복제본·RBAC·보안 설정 정적 검사 | 통과 |
| Compose API 포트 비공개 정적 검사 | 통과 |
| Python unittest | 6개 테스트 메서드 및 하위 사례 통과 |
| React/Vite production build | 통과, `--configLoader native` 사용 |
| 로컬 브라우저에서 API 기반 데이터 표시 | 확인 |
| 프로젝트 성능 개선 필터 | 8개에서 2개 표시 확인 |
| Log Cache 상세 모달, 키보드 Enter/Escape | 열기·내용 조회·닫기 확인 |
| 모바일 390px 폭 | 스크린샷 확인, 가로 넘침 없음 |
| 브라우저 오류 로그 | 검사 시 오류 없음 |

## 아직 실행하지 않은 검사

- Docker 이미지 빌드, Nginx reverse proxy/CSP 및 Compose 실제 실행
- Kubernetes API 서버의 manifest 검증 및 Kustomize 실제 렌더링
- 이미지 반입, 노드 분산, Probe·PDB·RBAC·NetworkPolicy 실제 집행
- 외부 URL 공개, Worker drain, 노드 장애·롤백 시 성공률
- API 중단 시 브라우저 오류/재시도 동작(코드는 구현, 브라우저 장애 주입 미실행)

개발 PC에 Docker·kubectl이 없어 위 항목은 VM 준비 후 `deployment.md`와 `verification.md`를 따라 검증해야 합니다.

## 개발 중 실제 시행착오

Vite 기본 설정 로더가 Windows 샌드박스의 상위 디렉터리 접근에서 실패했습니다.
Node의 native 설정 로더(`--configLoader native`)로 같은 소스를 성공적으로 빌드했습니다.
이는 개발 PC의 도구 실행 환경 문제이며 Kubernetes 장애 사례로 표현하지 않습니다.
