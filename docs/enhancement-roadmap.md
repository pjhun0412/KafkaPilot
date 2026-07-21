# KafkaPilot Enhancement Roadmap

이 문서는 KafkaPilot의 고도화 방향을 현재 구현 상태와 앞으로의 후보 기능으로 나누어 정리합니다.

KafkaPilot의 제품 방향은 단순 Kafka 조회 도구가 아니라 운영, 장애 재현, 메시지 분석, 테스트 데이터 생성, 좌표 데이터 디버깅을 한 곳에서 처리하는 로컬 데스크톱 워크벤치입니다.

## 현재 제품 축

2.0.x 기준으로 다음 기능 축은 이미 제품의 핵심 흐름에 들어와 있습니다.

- Consume: Offset, Time, Live 모드, 대량 그리드 가상화, Payload 포맷 선택, Value Columns, CSV Export, Live Record
- Message Replay: 단건/배치 Replay, Dynamic Field 치환, Background Replay Job, 진행률/Abort
- Produce: 단건 Produce, Interval Produce, Dynamic Template, Preview, 토픽별 템플릿 저장
- Consumer Groups: Lag 상세 조회, Offset Reset Preview, 활성 Group 보호, 명시적 확인
- Map Viewer: 독립 지도 창, 좌표 필드 매핑, WGS84/Korea TM/UTM 변환, 차량 마커, Trail, Follow 모드, Outlier 설정/표시
- Avro: Schema Registry 기반 Confluent wire-format decode, 수동 토픽 스키마 등록, 수동 schema 기반 produce encode
- Workspace: Split Pane, Quick Search, 한국어/영어 UI, 단축키 커스터마이징

## 권장 우선순위

새 기능을 추가한다면 다음 순서를 권장합니다.

1. Saved Consume Presets
2. Field Statistics
3. Schema Registry Browser
4. Produce Scenario Runner
5. Produce Batch / Produce History
6. Map Viewer Playback / Vehicle Timeline
7. Topic/Group Health Dashboard
8. Advanced Filter Builder
9. Geofence / Route Overlay / Layer Control

## Consumer

### Saved Consume Presets

자주 쓰는 Consume 조건을 서버/토픽 단위로 저장해 반복 분석을 빠르게 재현합니다.

저장 후보:

- consume mode
- partition
- offset/time range
- limit
- filter
- key/value format
- payload encoding
- inspector mode
- value columns
- map field mapping

기대 효과:

- 장애 분석 시 같은 조건으로 즉시 재조회
- 팀 내 분석 패턴을 설정 export/import로 공유
- Map Viewer와 Value Columns 설정을 Consume 조건과 함께 복원

### Field Statistics

Consume한 메시지 샘플에서 Value 필드 통계를 계산합니다.

표시 후보:

- field path
- 출현율
- 타입 분포
- null/empty 비율
- number min/max/avg
- string unique count 추정
- Value Columns 추가 추천

### Advanced Filter Builder

현재 텍스트 필터는 강력하지만, UI 기반 builder를 제공하면 비개발자도 쉽게 사용할 수 있습니다.

기능 후보:

- field 선택
- operator 선택
- value 입력
- AND/OR 그룹
- filter 저장
- 텍스트 필터 표현식으로 변환

### Message Diff

두 메시지 또는 두 Consume 결과를 비교합니다.

기능 후보:

- key/header/value diff
- JSON tree diff
- schema field diff
- 배포 전후 topic 샘플 비교
- diff 결과 export

### Live Consume Session 관리

여러 live stream을 운영하기 쉽게 관리합니다.

기능 후보:

- active stream 목록
- stream별 pause/resume
- retained message count 표시
- dropped/truncated message count 표시
- record 상태 표시
- session 저장/재개

## Produce

### Produce Scenario Runner

현재 Interval Produce를 여러 step 기반 시나리오 실행기로 확장합니다.

예시:

```text
1. READY 차량 100건 produce
2. RUNNING 차량 5분간 1초 간격 produce
3. ERROR 차량 10건 produce
4. RECOVERED 메시지 100건 produce
```

기능 후보:

- step별 key/header/value template
- step별 count/duration/interval
- step 간 변수 공유
- 실행 로그
- pause/resume/stop
- 실패 step 재실행

### Produce Batch

여러 메시지를 한 번에 produce합니다.

입력 후보:

- JSONL paste/import
- CSV import
- file import
- Consume 결과에서 가져오기

기능 후보:

- row별 preview
- template variable mapping
- 실패 row만 재시도
- batch progress/cancel

### Template Variables 확장

현재 Dynamic Field 기능을 테스트 데이터 생성에 더 적합하게 확장합니다.

후보:

- `${counter:name}`
- `${env:NAME}`
- `${topic}`
- `${partition}`
- `${previous:path}`
- `${jsonpath:path}` replay 원본값 참조
- offset이 적용된 date/timestamp 확장

### Avro/Schema-aware Produce Form

Schema가 있는 topic에서는 JSON textarea 외에 schema 기반 form을 제공합니다.

기능 후보:

- required field 표시
- enum select
- default value 적용
- type validation
- nested record editor
- schema validation result 표시

### Produce History

최근 produce 이력을 저장해 재실행과 템플릿화를 지원합니다.

기능 후보:

- topic별 history
- 성공/실패 결과
- 재실행
- template 저장
- 민감 정보 masking

### Rate Control

간단한 부하/흐름 테스트를 위한 rate 제어 기능입니다.

기능 후보:

- messages/sec
- burst size
- jitter
- ramp-up/ramp-down
- max in-flight
- success/fail count

## Map Viewer

### Playback / Time Travel

Live 또는 기록된 좌표 메시지를 시간축으로 다시 재생합니다.

기능 후보:

- play/pause
- 재생 배속
- 시간 slider
- 특정 차량만 playback
- replay 중 trail 표시
- 특정 timestamp로 이동

### Vehicle Detail Timeline

선택 차량의 최근 상태 변화를 한 패널에서 보여줍니다.

표시 후보:

- speed 변화
- heading 변화
- lat/lng 변화
- 최근 offset/timestamp
- route/link/cross id 변화
- raw message preview
- outlier event 이력

### Geofence

지도 영역을 정의하고 차량 enter/exit 이벤트를 감지합니다.

기능 후보:

- polygon/circle 영역 생성
- enter/exit 이벤트 로그
- 특정 topic/vehicle 대상 설정
- geofence 설정 저장
- 이벤트 export

### Route / Stop Overlay

노선, 정류장, 링크 데이터를 지도 layer로 표시합니다.

기능 후보:

- GeoJSON import
- stop point layer
- route polyline layer
- link id highlight
- vehicle의 route/link 매칭 정보 표시

### Layer Control

지도 tile과 overlay를 선택할 수 있게 합니다.

기능 후보:

- OpenStreetMap
- dark map
- custom tile URL
- 내부망 tile server
- layer visibility toggle

### Map Field Mapping Preset

좌표 필드 매핑을 더 빠르게 설정하고 재사용합니다.

기능 후보:

- 자동 후보 추천 강화
- mapping preset 저장
- topic 간 mapping 복사
- 샘플 메시지 기반 mapping test
- 자주 쓰는 패턴 템플릿

## Schema Registry

### Schema Registry Browser

Avro 기능과 연결되는 schema 탐색 화면입니다.

기능 후보:

- subject 목록
- subject별 version 목록
- schema 보기/검색
- schema diff
- compatibility 확인
- topic과 schema 연결 상태 확인
- manual schema와 registry schema 비교

## Dashboard

### Topic/Group Health Dashboard

앱을 열었을 때 클러스터 상태를 빠르게 파악하는 운영 화면입니다.

표시 후보:

- Consumer Group lag top N
- under replicated partitions
- offline partitions
- broker skew
- topic message count 상위
- 최근 connection failure
- active live consume 상태

## 리팩토링 우선순위

최근 기능이 빠르게 추가되면서 일부 UI 컴포넌트가 커졌습니다. 새 기능 추가 전 다음 영역을 먼저 정리하는 것을 권장합니다.

1. `MessageInspector.tsx`
   - Replay dialog/action
   - viewer mode rendering
   - field picker
   - map action
   - copy/export action
2. `ConsumePanel.tsx`
   - toolbar state
   - grid selection
   - paging/filter/viewer composition
3. `ProducePanel.tsx`
   - template CRUD
   - interval start confirmation
   - preview validation
4. Workspace refresh/navigation hooks
   - server/topic/group refresh 분기 명확화

## 릴리즈 단위 제안

### 2.x 분석 워크플로우 강화

- Saved Consume Presets
- Field Statistics
- Message Diff

### 2.x 테스트 데이터 생성 강화

- Produce Scenario Runner
- Produce Batch
- Produce History
- Rate Control

### 2.x 좌표 데이터 디버깅 강화

- Map Viewer Playback
- Vehicle Detail Timeline
- Map Field Mapping Preset

### 3.x 운영/관제 확장

- Schema Registry Browser
- Topic/Group Health Dashboard
- Geofence
- Route / Stop Overlay
- Layer Control
