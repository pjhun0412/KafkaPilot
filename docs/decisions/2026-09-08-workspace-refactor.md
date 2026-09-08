# Workspace UI 책임 분리

- 날짜: 2026-09-08
- 상태: 적용
- 기준 커밋: `10d56e2` (기존 수정과 지도 차량 아이콘 개선)

## 배경과 결정

MessageInspector, ConsumePanel, ProducePanel에 화면 렌더링과 여러 기능의 상태·검증·비동기 동작이 함께 있어 변경의 영향 범위를 파악하기 어려웠다. 기존 컴포넌트 진입점을 유지하면서 같은 기능 디렉터리 안에서 화면, hook, 순수 함수를 분리했다.

- MessageInspector는 toolbar와 하위 화면을 조립한다. Replay와 Map 설정은 각각 dialog와 hook으로 나누고, Raw/Tree/Preview 출력과 텍스트 선택 처리를 분리했다.
- ConsumePanel은 기존 paging/filter/grid 조합과 memo 비교를 유지한다. 체크 선택, Value Columns, 지도 전송은 독립 hook으로 옮겼다.
- ProducePanel은 화면을 담당하고, 발행·확인 상태와 템플릿 저장·삭제 상태를 별도 hook에 둔다. 반복 발행 시작 전 중복 검증은 공통 함수로 묶었다.
- `prepareReplayDrafts`는 성공 시 정렬된 원본 메시지와 발행 초안을 반환하고, 실패 시 오류만 반환한다. 전체 배치가 유효한 경우에만 기존 background job을 시작한다.
- 상태를 전역 store로 이동하지 않았다. pane별 상태 수명, topic 변경 시 초기화, 기존 IPC와 저장 형식은 유지한다.

## 유지한 동작

- Replay의 단건 편집, 배치 정렬, Dynamic Field 적용 여부와 순번, key/headers/value 제외 옵션
- Value Columns의 부모·자식 경로 선택과 Replay override의 말단 경로 선택 차이
- 지도 전송의 250ms 배치, 메시지 중복 방지, 선택 메시지 focus, unmount 시 타이머 취소
- 반복 발행의 확인 단계와 오류 우선순위, 발행 직전 템플릿 렌더링
- 템플릿 갱신 시 식별자 유지, 두 번의 삭제 동작을 통한 확인
- `MessageTreeNode`의 기존 MessageInspector 모듈 재노출

## 검증

- 회귀 테스트: Replay 정렬·초안·오류·대상 routing, pane별 체크 선택, 지도 배치·cleanup, 반복 발행 확인, 템플릿 갱신·삭제
- 기준 커밋과 현재 코드에 동일 fixture를 넣은 React 정적 렌더 출력 비교: Inspector 3개 모드와 빈 선택·Replay/Map dialog, Produce 모드·preview·확인, Consume 3개 모드와 빈 목록·Value Columns 등 15개 사례
- `npm test`: 기존 테스트 포함 25개 통과
- `npm run typecheck`: 통과
- `npm run build`: 통과. main JS 번들이 약 502kB로 Vite의 500kB 경고 기준을 넘으며, 코드 분할은 후속 검토 대상이다.

정적 렌더 비교는 DOM 출력 비교이며 Electron 창의 실제 클릭·키보드·지도 렌더를 검증한 것은 아니다. Kafka 서버에 실제 발행하거나 offset을 변경하는 통합 검증은 수행하지 않는다. Hook 테스트는 상태 전이와 effect 정리를 위한 가벼운 테스트 실행기를 사용하므로 React 동시 렌더링 전체를 검증하지 않는다.

## 후속 작업

Workspace refresh/navigation의 분기 정리는 별도 범위로 남긴다. 이 변경은 해당 흐름이나 Main/Preload 구현을 변경하지 않는다. 변경된 모듈 목록은 [프로젝트 구조](../../PROJECT_STRUCTURE.md)에 정리했다.
