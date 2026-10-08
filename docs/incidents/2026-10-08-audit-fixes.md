# 전체 감사 후속 수정

- 날짜: 2026-10-08 (Asia/Seoul)
- 기준: `e55db57` (현재 버전 보존 커밋, `origin/main` 푸시 완료)
- 상태: 수정·전체 회귀 검증·독립 리뷰 완료. 2026-10-08 사용자 배포 요청에 따라 2.0.9 릴리스에 포함한다. 배포 검증은 [릴리스 기록](../release.md)을 참조한다.
- 관련: [전체 감사](../codebase-analysis-2026-10-08.md), [이전 감사](../codebase-analysis-2026-09-25.md)

## 증상과 원인, 수정

아래 번호는 전체 감사 보고서와 같다. 실제 클러스터나 사용자의 프로필·설정 파일을 변경하지 않고 현재 소스, 제어 가능한 비동기 fixture, 격리된 임시 파일로 확인했다.

| 번호 | 원인과 영향 | 수정 및 주요 증거 |
|---|---|---|
| 1 | 일부 설정을 전체 대체 API에 보내 다른 override 삭제 | API 44 v0의 incremental SET 사용. 기존 민감 설정 조회·병합 없이 변경 항목만 전송. 실제 KafkaJS 인코더·요청 헤더·응답 계약, 설정 유지와 실패 경로 시험 |
| 2 | Interval 실행 boolean 재사용으로 중지한 루프 재개 | 실행별 토큰, 전송 전후·정리 시 현재 실행 검사. 재시작·진행 중 요청·언마운트 시험 |
| 3 | Offset/Time 요청이 동일 Consumer Group 공유 | 요청별 UUID를 추가하고 해당 그룹만 정리. 동시 세 요청 격리 시험 |
| 4 | Avro 디코딩 중 idle 종료로 결과 누락 | 처리 중 idle 중지, 종료 요청 후 이미 수락한 메시지 완료 대기. 지연 디코딩·전체 deadline 시험 |
| 5 | Live identity를 pane 이름으로 재사용 | UUID session ID를 pane과 별도로 유지하고 이동 시 목적지와 pending 작업 키도 변경. 이동 후 재시작·각 세션 Stop·연결 대기 중 이동/취소 시험 |
| 6 | Live 연결/녹화 시작 중 닫힌 탭으로 늦은 응답 복귀 | pending 단계부터 session 추적 및 Main 취소 신호. 대화상자 이후 파일 생성 차단, 늦은 디코딩·이벤트 무시 |
| 7 | 늦은 Topic Info 응답이 현재 선택 표시 덮음 | 선택 토픽별 캐시 조회, split 선택을 요청 전에 갱신. 응답 순서 역전 시험 |
| 8 | 검색 tokenizer가 regex의 역슬래시 제거 | regex literal을 보존하고 매 비교마다 lastIndex 초기화. 숫자·공백·인용부호·slash·g/y 시험 |
| 9 | fitBounds의 zoomstart가 수동 탐색으로 처리됨 | drag 및 실제 DOM 휠·확대 버튼·키보드·핀치 입력만 추적 해제. 자동 zoom 이벤트는 유지 |
| 10 | 설정 Import에서 언어·sidebarCollapsed 적용 누락 | 두 setter를 가져오기 흐름에 연결. ko/auto, 접힘 true/false 적용 시험 |
| 11 | Font Reset이 export template 변경, weight 유지 | family/size/weight만 기본값 복원. 실제 dialog 버튼 callback 시험 |
| 12 | ID 없는 메시지가 offset마다 새 지도 점으로 무한 누적 | Main·Renderer에서 최근 갱신 ID 5,000개 유지. 퇴출 시 animation·marker·trail·alert layer 정리. 20,000개 입력으로 한도 검증 |
| 13 | 역순 Export가 low 도달 후 offset 0을 latest로 재해석 | 후속 요청에 endOffsetExclusive 명시. low=0과 19에서 각 5,000행 중복 없이 종료 |
| 14 | .recovery 디렉터리가 없어 backup rotation 실패 | 저장 전 backup 부모 생성. 파일 읽기/이동 오류를 JSON 오류와 분리하여 정상 원본 삭제 방지. 실제 임시 FS에서 두 번째 저장·실패 시험 |
| 15 | 원본 ENOENT에서 정상 backup 조회 생략 | 원본 누락도 backup 복원 시도. 파일별 읽기·쓰기·복원 직렬화로 저장 중 임시 누락을 복원으로 오판하지 않음. 누락·손상·동시 읽기·실패 후 다음 저장·마이그레이션 시험 |
| 16 | connect/subscribe가 cleanup 범위 밖에 있음 | 공통 transient lifecycle에 시작부터 finally 적용. connect/subscribe/run/seek/CRASH/decoder 실패의 정리 시험 |

독립 리뷰에서 추가 발견한 느린 group join 문제도 수정했다. `run()`이 완료되기 전에 idle 시간이 소진되어 빈 결과가 반환되던 경로는 시작 완료 이후 idle을 계산하도록 바꿨다. 전체 deadline은 유지하고 5초 지연 시작 후에도 수신 메시지를 반환하는 Offset/Time 시험을 추가했다.

리뷰 과정에서 백업 회전 중 읽기가 최신 저장을 이전 백업으로 덮는 경쟁, Shift+드래그 영역 확대 누락, Live 시작·중지 문구 역전, 연결 대기 중 pane 이동의 작업 키 잔류도 재현했다. 파일별 직렬화, `boxzoomstart` 처리, 새 세션 수명주기에 맞춘 버튼 표시, session ID에 따른 pending 작업 소유권 이동으로 보완하고 해당 회귀 시험을 추가했다.

## 호환성과 운영 기준

- Kafka 설정 변경에는 Kafka 2.3 이상 및 실제 목적지 브로커의 IncrementalAlterConfigs v0 지원이 필요하다. 미지원 시 명시적으로 실패하며 전체 대체 API로 돌아가지 않는다.
- KafkaJS 2.2.4의 인증된 내부 cluster/connection transport를 재사용한다. package와 lock의 버전을 정확히 고정하고 실행 시 버전·내부 계약·API 지원을 검사한다. KafkaJS 변경 시 반드시 어댑터와 패키징을 재검증한다.
- 토픽 설정은 controller, 특정 broker 설정은 해당 broker에 전송한다. 불확실한 전송 실패는 자동 재전송하지 않는다. broker가 제공한 원본 오류 문자열은 설정값 노출을 막기 위해 사용자에게 전달하지 않는다.
- 지도 보관 한도는 ID 기준 최근 갱신 순서다. 안정적인 차량 ID가 없으면 topic/partition/offset을 사용하므로 오래된 좌표가 한도에서 제외된다. Kafka 데이터와 녹화 파일에는 영향을 주지 않는다.
- 소비 종료는 이미 시작된 디코딩과 Kafka 시작 작업이 끝나 정리될 때까지 기다린다. 전체 deadline은 새로운 메시지 수락을 멈추는 기준이며 외부 요청을 강제로 중단하는 보장은 아니다.

## 검증

- 전체 `npm test`: 115개 통과 (기존 34개 포함).
- `npm run build`: Renderer/Main/Preload 타입 검사 및 Vite 빌드 통과 (1,986 modules). main chunk 510.15 kB로 기존 500 kB 경고는 남아 있다.
- Consumer·설정 어댑터·Renderer 수명주기·설정/지도 영역을 독립 코드 리뷰로 분담했다. 지적을 반영한 부분과 통합 wiring·프로세스 경계를 재검토했고, 최종 범위에서 근거 있는 추가 결함은 보고되지 않았다.
- `git diff --check`: 통과. 린트 스크립트는 없다.
- Windows sandbox의 임시 파일 rename 제한(EPERM) 때문에 실제 FS 복원 시험은 승인된 sandbox 외 실행에서 통과했다. 테스트는 새로 생성한 전용 임시 폴더만 사용·정리한다.
- MockTimers 실험 API 경고는 테스트 도구 경고이며 실패가 아니다.

## 남은 검증 범위

실제 Kafka 브로커의 TLS/OAuth 인증, 실제 발행·녹화, 운영 설정 변경, 패키징된 Electron의 E2E는 수행하지 않았다. 감사 당시 관찰한 Consume·Preferences 화면은 수정 전 실행 창이므로 이번 소스의 전체 화면 검증 증거로 재사용하지 않는다. 대량 payload의 byte 단위 메모리 한도와 전체 키보드/focus 접근성 점검은 별도 후속 범위다.

## 관련 코드와 회귀 시험

- `src/main/incrementalConfigs.ts`, `tests/config-updates.test.cjs`
- `src/main/ipc/transientConsumerRunner.ts`, `tests/consume-lifecycle.test.cjs`
- `src/main/ipc/liveConsume.ts`, `src/renderer/hooks/actions/useConsumeActions.ts`, `tests/frontend-lifecycle.test.cjs`
- `src/main/storage.ts`, `tests/settings-recovery.test.cjs`
- `src/renderer/messageFilters.ts`, `src/shared/liveMapRetention.ts`, `src/renderer/mapNavigation.ts`, `tests/filter-map-lifecycle.test.cjs`
