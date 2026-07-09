# KafkaPilot Enhancement Roadmap

이 문서는 KafkaPilot에 추가하면 좋은 고도화 항목을 기능 영역별로 정리합니다.

목표는 KafkaPilot을 단순 조회용 클라이언트가 아니라 운영, 장애 재현, 메시지 분석, 좌표 데이터 디버깅을 함께 처리하는 데스크톱 워크벤치로 확장하는 것입니다.

## 우선순위 요약

권장 구현 순서:

1. Consumer Group Reset Offset
2. Message Replay
3. Saved Consume Presets
4. Map Viewer Outlier Detection
5. Produce Scenario Runner
6. Schema Registry Browser
7. Field Statistics
8. Map Viewer Playback
9. Topic/Group Health Dashboard

## Consumer Group

### Consumer Group Reset Offset

Kafka 관리 도구에서 기대되는 표준 운영 기능입니다. 운영 데이터에 직접 영향을 주므로 dry-run과 확인 UX를 필수로 둡니다.

1차 구현 범위:

- Consumer Group 상세 화면에서 `Reset Offsets` 진입
- 대상 Topic/Partition 선택
- 현재 offset, end offset, lag 표시
- reset 방식 선택
  - earliest
  - latest
  - timestamp
  - specific offset
- dry-run preview
- 변경 전/후 offset diff 표시
- 최종 apply 전 확인 문구 입력
- 실행 후 Consumer Group lag 자동 refresh

안전장치:

- dry-run 없이 apply 불가
- active group 상태 경고
- 변경 대상 partition 수와 총 lag 변화 표시
- 성공/실패 partition 분리 표시
- reset 전 상태 JSON/CSV export

권장 파일 구조:

```text
src/main/ipc/consumerGroupOffsets.ts
src/renderer/components/workspace/groups/ConsumerGroupResetOffsetsDialog.tsx
src/renderer/hooks/actions/useConsumerGroupOffsetResetActions.ts
```

## Consumer

### Saved Consume Presets

자주 쓰는 Consume 조건을 토픽별로 저장해 반복 작업을 줄입니다.

저장 대상:

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

- 특정 토픽의 자주 쓰는 분석 조건을 즉시 복원
- 장애 분석 시 같은 조건으로 재조회 가능
- 팀 내 사용 패턴을 설정 export/import로 공유 가능

### Message Replay

Consume한 메시지를 같은 topic 또는 다른 topic으로 다시 produce합니다.

1차 구현 완료:

- Consume grid 선택 메시지 replay
- 대상 server/topic 선택
- key/header/value 유지 여부 선택
- value 편집
- 팝업 내 직접 실행
- produce 결과 partition/offset 표시
- 대상 서버가 미연결 상태일 때 replay 팝업 안에서 연결
- Replay Payload 편집 시 Produce Dynamic Field 문법 렌더링

남은 확장 항목:

- 선택 메시지 다중 replay
- 필터 결과 전체 replay
- JSON field 치환
- header 추가/삭제
- replay 전 batch preview
- replay 진행률/취소
- 실패 메시지만 재시도

### Message Diff

두 메시지 또는 두 Consume 결과를 비교합니다.

기능:

- key/header/value diff
- JSON tree diff
- schema field diff
- 배포 전후 topic 샘플 비교
- diff 결과 export

### Field Statistics

Consume한 메시지 샘플에서 Value 필드 통계를 계산합니다.

표시 항목:

- 필드 path
- 출현율
- 타입 분포
- null/empty 비율
- number min/max/avg
- string unique count 추정

Value Columns와 연결하면 필드 선택 경험을 개선할 수 있습니다.

### Advanced Filter Builder

현재 텍스트 필터는 강력하지만, UI 기반 builder를 제공하면 비개발자도 쉽게 사용할 수 있습니다.

기능:

- field 선택
- operator 선택
- value 입력
- AND/OR 그룹
- filter 저장
- 텍스트 필터 표현식으로 변환

### Live Consume Session 관리

여러 live stream을 운영하기 쉽게 관리합니다.

기능:

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

기능:

- step별 key/header/value template
- step별 count/duration/interval
- step 간 변수 공유
- 실행 로그
- pause/resume/stop
- 실패 step 재실행

### Produce Batch

여러 메시지를 한 번에 produce합니다.

입력 방식:

- JSONL paste/import
- CSV import
- file import
- Consume 결과에서 가져오기

기능:

- row별 preview
- template variable mapping
- 실패 row만 재시도
- batch progress/cancel

### Template Variables 확장

현재 동적 필드 기능을 테스트 데이터 생성에 더 적합하게 확장합니다.

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

기능:

- required field 표시
- enum select
- default value 적용
- type validation
- nested record editor
- schema validation result 표시

### Produce History

최근 produce 이력을 저장해 재실행과 템플릿화를 지원합니다.

기능:

- topic별 history
- 성공/실패 결과
- 재실행
- template 저장
- 민감 정보 masking

### Rate Control

간단한 부하/흐름 테스트를 위한 rate 제어 기능입니다.

기능:

- messages/sec
- burst size
- jitter
- ramp-up/ramp-down
- max in-flight
- success/fail count

## Map Viewer

### Outlier / Jump Detection

좌표 데이터 이상치를 감지해 지도와 차량 목록에서 강조합니다.

감지 후보:

- 이전 좌표 대비 순간 이동 거리 초과
- 비정상 속도
- heading 급변
- timestamp 역행
- lat/lng 0 또는 범위 오류
- 동일 vehicle의 partition/offset 역전

UI:

- 차량 목록 warning badge
- 이상 구간 trail 강조
- marker highlight
- 이상 이벤트 로그
- threshold 설정

### Playback / Time Travel

Live 또는 기록된 좌표 메시지를 시간축으로 다시 재생합니다.

기능:

- play/pause
- 재생 배속
- 시간 slider
- 특정 차량만 playback
- replay 중 trail 표시
- 특정 timestamp로 이동

### Vehicle Detail Timeline

선택 차량의 최근 상태 변화를 한 패널에서 보여줍니다.

표시 항목:

- speed 변화
- heading 변화
- lat/lng 변화
- 최근 offset/timestamp
- route/link/cross id 변화
- raw message preview

### Geofence

지도 영역을 정의하고 차량 enter/exit 이벤트를 감지합니다.

기능:

- polygon/circle 영역 생성
- enter/exit 이벤트 로그
- 특정 topic/vehicle 대상 설정
- geofence 설정 저장
- 이벤트 export

### Route / Stop Overlay

노선, 정류장, 링크 데이터를 지도 layer로 표시합니다.

기능:

- GeoJSON import
- stop point layer
- route polyline layer
- link id highlight
- vehicle의 route/link 매칭 정보 표시

### Layer Control

지도 tile과 overlay를 선택할 수 있게 합니다.

기능:

- OpenStreetMap
- dark map
- custom tile URL
- 내부망 tile server
- layer visibility toggle

### Map Field Mapping Preset

좌표 필드 매핑을 더 빠르게 설정하고 재사용합니다.

기능:

- 자동 후보 추천 강화
- mapping preset 저장
- topic 간 mapping 복사
- 샘플 메시지 기반 mapping test
- 자주 쓰는 패턴 템플릿

## Schema Registry

### Schema Registry Browser

Avro 기능과 연결되는 schema 탐색 화면입니다.

기능:

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

## 릴리즈 단위 제안

### 2.x 운영 기능 강화

- Consumer Group Reset Offset
- Message Replay
- Saved Consume Presets

### 2.x 좌표 데이터 디버깅 강화

- Map Viewer Outlier Detection
- Vehicle Detail Timeline
- Playback / Time Travel

### 2.x 테스트 데이터 생성 강화

- Produce Scenario Runner
- Produce Batch
- Produce History

### 3.x 분석/관제 확장

- Field Statistics
- Schema Registry Browser
- Topic/Group Health Dashboard
- Geofence
- Route / Stop Overlay
