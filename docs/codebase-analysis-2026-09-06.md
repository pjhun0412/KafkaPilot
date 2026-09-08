# KafkaPilot 문서·소스 분석

- 날짜: 2026-09-06
- 대상: KafkaPilot 2.0.7, 현재 작업 트리
- 상태: 분석 후 발견한 실행·타입 오류, Reset 보호 처리와 문서 불일치 수정 완료.
- 수정 후 검증: 전체 타입 검사를 포함한 production build 성공, 회귀 테스트 14개 통과.

> 아래 분석 본문은 수정 전 확인한 증거를 보존한 기록이다. 현재 적용 내용과 검증 결과는 마지막의 **수정 결과**를 기준으로 한다.

## 범위와 한계

README 영문/한글, CHANGELOG, PROJECT_STRUCTURE, docs의 기능·로드맵·배포 문서를 읽고 코드 그래프와 주요 구현을 대조했다. Main/Preload/Renderer 경계, Consume/Record, Replay/Produce, Consumer Group Reset, Avro, 설정 저장, Map Viewer, controller wiring을 중심으로 확인했다. 모든 소스 행을 정밀 감사하거나 실제 Kafka 클러스터 및 Electron UI를 통합 시험한 결과는 아니다. 외부 제품 비교표의 정확성, 라이브러리 취약점, macOS 패키징은 검증하지 않았다.

분석 시작 시 `.codebase-memory/`가 이미 untracked 상태였다. 기존 소스를 수정하지 않았으며 빌드 산출물은 커밋 대상이 아니다. 프로젝트 기억 검색에서는 이 프로젝트에 해당하는 기존 기록을 찾지 못했다.

## 제품과 구조

KafkaPilot은 개발자가 직접 Kafka에 연결해 메시지를 분석·재현하는 로컬 데스크톱 워크벤치다. README의 대상은 애플리케이션 개발자이고, 로드맵은 장기적으로 운영·관제 기능까지 확장한다. 현재 제품의 차별점은 Split Pane, Replay, Value Columns, 독립 Map Viewer의 결합이다.

| 영역 | 주요 책임과 구현 |
|---|---|
| Main | `src/main/main.ts`, `window.ts`: 창·앱 수명주기. `ipc/`: Kafka Admin/Consumer/Producer, 파일 작업. `storage.ts`: 프로필·설정 저장 |
| Preload | `src/preload/preload.ts`, `liveMapPreload.ts`: 기능별 IPC bridge |
| Renderer | React UI, Zustand stores, controller/hooks, 메시지 필터·템플릿·Replay 작업 관리 |
| Shared | `src/shared/types.ts`: 프로세스 간 요청/응답·환경설정 타입 |
| Map Viewer | 별도 BrowserWindow와 renderer entry. Leaflet 마커·트레일, proj4 좌표 변환 |

Main 창은 `contextIsolation: true`, `nodeIntegration: false`로 생성된다. Kafka와 파일 접근을 Main에 배치하는 구조는 명확하다. 최상위 `useWorkspaceAppController`는 여러 controller를 조립하고 실제 로직은 하위 hook에 나뉘어 있다. 다만 단계별 입력 객체가 많아 콜백 전달 누락과 타입 불일치를 추적하는 비용이 크다.

기존 그래프에는 312개 TypeScript 파일과 1,281개 Function 노드가 잡혔다. 이는 그래프 스냅샷 통계다. 일부 i18n 문자열이 Route로, 일반 함수 관계가 재귀로 분류되어 있어 HTTP API 수나 순환 참조의 증거로 사용하면 안 된다. 실제 추적 파일은 `git ls-files src` 기준 338개다.

## 주요 실행 흐름

### Consume와 Record

Renderer 요청 → Preload → `consumeHandlers` → Offset/Time/Live 전용 구현 → KafkaJS → `toConsumedMessage` → Renderer 반환 또는 이벤트 전달 순서다.

- Offset: broker offset 범위를 확인하고 `resolveOffsetWindow` 및 전용 runner로 읽는다.
- Time: timestamp에서 partition별 시작 offset을 구한 뒤 전용 runner로 읽는다.
- Live: 시작 시 topic offset을 캡처하고, 그 이전 메시지를 필터링한다. seek 실패 시에도 필터가 과거 메시지의 UI/Record 유입을 막는다.
- Live consumer 식별에는 server/topic/consumerId가 쓰여 pane별 소비를 구분할 수 있다.
- Record는 Main에서 JSONL을 쓰고 각 write 완료를 기다린 후 UI 이벤트를 보낸다. 순차 쓰기 구조가 확인된다.
- raw payload는 크기 한도 초과 시 base64 보관을 생략하지만 UTF-8 문자열은 남는다. raw 제한이 전체 메시지 메모리의 절대 상한을 의미하지는 않는다.

### Produce와 Replay

템플릿 검증·렌더링은 `produceTemplate.ts`, 발행은 Main의 `produceMessages`가 담당한다. Replay는 `replayJobs.ts`의 모듈 수준 작업 저장소와 비동기 루프로 진행되므로 다이얼로그 수명과 분리된다. 각 메시지는 순차 전송하며 지연과 중단 요청을 확인한다. 이 background는 Renderer 내부 실행이며 앱 종료 후 재개되는 영속 작업 큐는 아니다. 이미 전송 중인 요청은 abort 시 되돌릴 수 없다.

### Avro와 설정

Confluent magic byte/schema ID를 감지하면 Registry schema로 decode한다. Registry decode 실패 시 manual schema fallback을 시도하고, 실패 정보는 decoded error로 반환한다. manual schema는 서버·토픽 범위다.

프로필 secret은 `safeStorage.encryptString`으로 암호화하는 구현이 있다. 프로필 읽기 실패 시 백업 복원을 시도한다. 로컬 저장 보호와 설정 export 취급은 구분해야 하며, README의 export 비밀정보 경고는 유지할 가치가 있다.

### Consumer Group Reset

선택 partition과 모드를 검증하고 그룹 상태를 조회한 뒤 target offset을 계산해 `admin.setOffsets`를 실행한다. stable 상태 또는 member 존재 시 차단하며 실행 timeout과 로그가 있다. 다만 아래의 상태 조회 실패 처리는 보완 대상이다.

## 우선순위별 발견 사항

### 1. 빌드 성공이 Renderer 타입 안전성을 보장하지 않음 — 높음

`package.json`의 build는 `tsc -p tsconfig.electron.json && vite build`다. Electron tsconfig는 main/preload/shared만 포함한다. Renderer는 Vite 변환을 거치지만 전체 TypeScript 검사를 통과해야 한다는 조건이 없다.

실제 `npm run build`는 성공했지만 `npm run typecheck`는 아래 7개 진단으로 실패했다. package/release 스크립트도 build를 사용하므로 같은 검증 공백이 전파된다. 기능 수정과 함께 배포 전 필수 검증에 전체 typecheck를 포함하는 것이 우선이다.

| 위치 | 진단 | 해석 |
|---|---|---|
| `src/renderer/produceTemplate.ts:157` | 정의되지 않은 `kind` | 실제 실행 오류 재현 |
| `src/renderer/hooks/callbacks/useSplitPaneCallbacks.ts:148` | `activateSplitTopic` 전달 누락 | 해당 callback 분기에 런타임 오류 가능 |
| `src/renderer/hooks/app/controller/interactions/workspaceInteractionParams.ts:69` | `closeActiveTopicTab` 누락 | 내부 생성 콜백을 외부 입력 타입에서 요구하는 불일치 |
| `src/renderer/hooks/app/controller/panes/primaryPaneComposition.ts:188` | `templates` implicit any | 명시 타입 보완 필요 |
| `src/renderer/hooks/app/controller/panes/splitPaneComposition.ts:144` | `templates` implicit any | 명시 타입 보완 필요 |
| `src/renderer/map-viewer.ts:645` | `lastHeading` 속성 없음 | 초기 객체 추론 타입과 후속 대입 불일치 |
| `src/renderer/map-viewer.ts:646` | `lastPointAt` 속성 없음 | 초기 객체 추론 타입과 후속 대입 불일치 |

단축키 콜백은 `useWorkspaceControllerInteractions` 내부에서 생성해 전달한다. 따라서 이 진단만으로 Ctrl/Cmd+W가 작동하지 않는다고 결론 내릴 수 없다. Map Viewer의 두 속성 역시 JavaScript 객체에 추가할 수 있으므로 타입 오류와 실행 고장을 구분해야 한다.

### 2. 잘못된 Dynamic Field 입력이 예외를 발생시킴 — 높음

`getTokenIssue`는 `kind`를 `normalizedKind`로 구조 분해했지만 마지막 오류 메시지에서 존재하지 않는 `kind.trim()`을 참조한다. 알 수 없는 토큰이면 정상적인 검증 결과 대신 예외가 발생한다.

설치된 TypeScript로 원본 모듈을 메모리에서 CommonJS 변환한 뒤 `validateProduceTemplateDraft`를 호출했다:

```text
${uuid}    → []
${unknown} → ReferenceError: kind is not defined
```

호출 경로에는 ProducePanel과 MessageInspector의 submitReplay가 있다. 두 기능의 입력 오류 처리에 영향을 줄 수 있다. Electron 화면 전체의 구체적 반응은 미검증이다.

### 3. Split Pane의 다른 토픽 Produce 이동 콜백 누락 — 중간

`useSplitPaneCallbacks`는 `activateSplitTopic`을 받지만 `createSplitConsumeCallbacks`로 넘기지 않는다. 하위 `sendToProduce`가 같은 서버의 다른 토픽을 대상으로 실행되면 이 누락된 함수를 호출한다.

근거는 `src/renderer/hooks/callbacks/useSplitPaneCallbacks.ts:148`과 `splitPaneCallbackGroups.ts`의 `sendToProduce` 분기다. 타입 검사와 정적 호출 경로로 확인했으며 현재 UI에서 해당 분기까지의 조작 재현은 수행하지 않았다.

### 4. Offset Reset 상태 조회 실패 시 앱의 사전 보호가 통과됨 — 높음

`src/main/ipc/consumerGroupQueries.ts:62` 부근에서 `describeGroups` 실패를 `{ groups: [] }`로 치환한다. 이 경우 state는 빈 문자열, members는 0으로 평가되어 앱의 활성 그룹 검사를 통과하고 후속 offset 변경을 시도할 수 있다.

그룹 상태를 확인하지 못했으면 요청을 중단하도록 바꾸는 것이 적절하다. Kafka broker가 최종적으로 요청을 거절할 수 있으므로 실제 활성 그룹 offset 변경이 성공한다는 의미는 아니다. 네트워크/권한 오류를 주입한 통합 검증은 미실시다.

## 문서와 구현의 차이

- `docs/macos-install.md`는 KafkaPilot.app 설치를 안내하지만 quarantine 제거 명령은 `/Applications/Kafka\ Tool.app`을 대상으로 한다. 리브랜딩 전 이름이 남아 있다.
- `PROJECT_STRUCTURE.md`의 stores/domain 목록에는 serverClusterStore만 있으나 실제 그래프에는 kafkaNavigationStore 등 분리된 store가 있다. 전체 파일 목록이 아니라는 점을 명시하거나 현재 책임 분담으로 갱신할 필요가 있다.
- 로드맵은 date/timestamp offset을 확장 후보로 적지만 `produceTemplate.ts`에는 offset 해석·검증·렌더링이 이미 있다. 세부 문법과 테스트 상태를 확인한 뒤 부분 구현/완료 여부를 갱신해야 한다.
- 영문·한글 README와 package 버전은 2.0.7로 맞는다. 주요 기능 설명과 보안 경고도 대체로 정렬되어 있다.
- README의 Build 예시는 로컬 package가 아닌 `release:*`를 사용한다. 로컬 빌드와 원격 게시 절차를 구분하면 새 기여자가 이해하기 쉽다.
- 개발·릴리즈 문서에서 build만으로 검증을 마치는 흐름은 현재 Renderer 오류를 탐지하지 못한다.

## 유지보수와 다음 작업

그래프 기준 MessageInspector 함수는 1,262행, ConsumePanelView는 498행, ProducePanel은 477행이다. MessageInspector에 Replay, field picker, map action, viewer 렌더링이 집중되어 있어 로드맵의 분리 우선순위와 실제 소스가 일치한다. 최상위 controller는 분기 복잡성보다 조립과 타입 전달의 복잡성이 문제다.

권장 순서:

1. Dynamic Field 실행 오류 및 Split callback 누락 수정, 나머지 타입 진단 해소.
2. build/release 필수 검사에 전체 typecheck 포함.
3. Offset Reset 상태 조회 실패 시 중단 처리와 실패 경로 검증.
4. 템플릿 유효/무효 입력, pane 간 이동, reset 실패 경로에 회귀 테스트 추가.
5. 문서의 앱 이름·store 구조·템플릿 구현 상태 갱신.
6. 새 기능이 필요한 시점에 MessageInspector의 Replay와 Viewer 책임부터 점진 분리.

현재 package scripts에는 test/lint 명령이 없고, 추적 파일 검색에서도 전용 테스트 파일과 CI workflow를 확인하지 못했다. 테스트 부재는 현재 오류들의 유일한 원인이라는 뜻은 아니지만, 타입 검사 공백과 결합해 회귀를 놓치기 쉽다.

## 검증 결과

- `npm run build`: 성공, Vite 1,980 modules transformed.
- `npm run typecheck`: 실패, Renderer 7개 진단. 첫 명령 실패로 뒤의 Electron 검사 명령은 실행되지 않았지만 build에서 Electron 검사는 통과했다.
- Dynamic Field 모듈 독립 재현: 정상 uuid 검증 통과, unknown 토큰 ReferenceError 확인.
- 실제 Kafka 연결, produce/reset 실행, UI 조작, 대량 스트림 메모리 측정, installer 생성: 미실시.
- 소스 수정과 장애 해결: 수행하지 않음. 이 문서는 확인된 사실과 후속 검증 항목을 기록한다.

## 수정 결과 (2026-09-06)

사용자의 수정 요청에 따라 다음 변경을 적용했다.

- `produceTemplate.ts`: 미정의 `kind` 대신 파싱한 `normalizedKind`로 오류 메시지를 반환한다. 알 수 없는 토큰은 예외가 아닌 validation issue가 된다.
- `useSplitPaneCallbacks.ts`: `activateSplitTopic`을 하위 Consume 콜백에 전달한다. 같은 서버의 다른 토픽으로 Produce 이동 시 초안 저장과 Split 토픽 활성화가 이어진다.
- `useWorkspaceControllerInteractions.ts`: 내부에서 만드는 `closeActiveTopicTab`은 외부 입력 타입에서 제외했다. 기존 단축키 실행 흐름은 유지한다.
- Primary/Split composition의 템플릿 인자에 `ProduceTemplatePreference[]`, 지도 차량 객체에 `VehicleState`를 명시했다.
- `consumerGroupQueries.ts`: 그룹 상태 조회 오류를 그대로 전파하고, 요청한 groupId 정보가 없거나 state가 비어 있으면 offset 변경 전에 중단한다. 정상 inactive 그룹의 네 가지 reset 모드와 기존 active-group 차단은 유지한다.
- `package.json`: build의 첫 단계에서 Renderer 타입 검사를 실행한다. package/release도 이 build를 거치며 같은 검사를 받는다. 새 의존성 없이 Node.js 내장 회귀 테스트 명령 `npm test`를 추가했다.
- README 영문·한글: 로컬 package 명령과 Reset 상태 확인 조건을 맞췄다. macOS quarantine 경로, domain store 목록, 이미 구현된 시간 offset 옵션의 로드맵 상태, 릴리즈 검증 명령, CHANGELOG도 갱신했다.

### 검증 근거

- `npm test`: 14개 통과. `tests/regressions.test.cjs`에서 unknown/정상/escaped 토큰, 시간 offset 렌더링, 실제 Split callback hook의 같은 토픽·다른 토픽·다른 서버 이동을 확인했다.
- Kafka Admin mock으로 상태 조회 예외, 빈 응답, 다른 groupId, 빈 state에서 offset 읽기·변경이 호출되지 않는 것을 확인했다. Stable/활성 member 차단과 inactive 그룹의 Earliest/Latest/Specific/Timestamp target도 검증했다.
- `npm run build`: Renderer 타입 검사, Electron 검사·컴파일, Vite production build 모두 통과했다.
- `git diff --check`: 통과했다.
- 테스트 실행기의 자식 프로세스 생성이 제한 환경에서 EPERM으로 실패하여, 허용된 실행 권한으로 표준 `npm test`를 다시 실행했고 통과했다.

### 남은 범위

실제 Kafka 클러스터 및 Electron UI 통합 시험, 설치 파일 생성은 수행하지 않았다. 회귀 테스트는 TypeScript 소스를 변환해 실행하며 Kafka와 React hook 수명주기는 mock으로 대체한다. MessageInspector 책임 분리와 대량 스트림 성능 측정은 별도 후속 작업이다.
