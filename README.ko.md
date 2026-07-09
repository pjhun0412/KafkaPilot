<div align="center">

# KafkaPilot

**토픽 브라우징을 넘어선 로컬 Kafka 데스크톱 클라이언트.**

Consume · Replay · Produce · Map Viewer · Consumer Group 관리

[English](README.md) &nbsp;·&nbsp; [변경 이력](CHANGELOG.md) &nbsp;·&nbsp; [문서](docs/)

![Version](https://img.shields.io/badge/version-2.0.6-3b82f6?style=flat-square) &nbsp;![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-64748b?style=flat-square) &nbsp;![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square) &nbsp;![Electron](https://img.shields.io/badge/Electron-33-47848F?style=flat-square)

[![PayPal](https://img.shields.io/badge/donate-PayPal-00457C?style=flat-square&logo=paypal&logoColor=white)](https://www.paypal.com/ncp/payment/R6DBD3HSJ9TPE)

</div>

---

대부분의 Kafka UI는 토픽 조회와 메시지 읽기에서 멈춥니다. KafkaPilot은 그 다음 워크플로우까지 다룹니다. **다른 클러스터로 메시지 재전송**, **Consumer Group Offset 안전한 리셋**, **실시간 좌표 스트림 지도 시각화** — 서버 없이 로컬에서 실행되는 하나의 앱으로.

---

## 주요 기능

| | |
|---|---|
| **Consume** | Offset, Time, Live 모드, 가상화 그리드, Payload 포맷 선택, JSON 필드 추출용 Value Columns |
| **Message Replay** | Consume 메시지를 원하는 서버로 재전송. 단건·배치 지원, Dynamic Field 치환, Background Job |
| **Produce** | 단건 발행과 Interval Produce, 반복 테스트 데이터를 위한 Dynamic Template 엔진 |
| **Map Viewer** | 좌표 데이터 토픽 전용 독립 창 — WGS84, Korea TM, UTM 지원, 차량 마커, Trail, Follow 모드 |
| **Consumer Groups** | 토픽·Partition별 Lag 조회, 안전한 Offset Reset 플로우(미리보기, 활성 Group 보호, 명시적 확인) |
| **Split Pane** | 두 토픽을 나란히, Consume·Produce·Group 상태 완전 독립 |
| **Avro** | Schema Registry 또는 수동 등록 토픽 스키마 기반 디코딩 |

---

## Consume

모든 상황에 맞는 세 가지 모드:

- **Offset** — 시작 Offset과 Limit을 지정해 메시지 조회
- **Time** — Timestamp 범위로 메시지 조회
- **Live** — 최신 Offset 이후 새 메시지를 실시간 스트리밍 (이전 Group Offset 영향 없음)

`10,000`건을 초과하면 자동으로 페이지 조회로 전환됩니다. Key와 Value는 **Text, JSON, Hex, Base64** 형식으로 조회·Export 가능합니다.

**Value Columns**로 `vehicleId`, `latitude`, `status` 같은 `value.*` 경로를 그리드 전용 컬럼으로 고정할 수 있습니다. Message Viewer Tree에서 leaf 값을 바로 추가할 수 있으며, 선택 항목은 토픽별로 저장되고 CSV Export에 포함됩니다.

Live Record는 메시지를 `JSONL` 파일 스트림으로 직접 기록합니다. 장시간 수집 중 Renderer 메모리에 데이터를 쌓지 않습니다.

---

## Message Replay

Message Viewer 툴바에서 Consume 메시지를 다른 서버와 토픽으로 재전송할 수 있습니다. Produce 탭으로 이동할 필요 없습니다.

- **범위**: 단건 메시지, 선택 행, 필터 결과, 조회된 전체 메시지
- **단건 Replay**: 전송 전 Payload 직접 편집
- **Batch Replay**: `${uuid}`, `${seq:1..100}`, `${date:...}` 등 Dynamic Field로 Value 필드 치환
- **Background Job**: 대량 Replay는 진행률, Delay, 전송 중단을 제어하며 백그라운드 실행

---

## Map Viewer

좌표 데이터가 포함된 Kafka 토픽을 위한 독립 시각화 창. Consume 메시지 툴바에서 열 수 있습니다.

- 커스텀 JSON 경로 지정을 위한 **토픽별 Field Mapping** (위도, 경도, heading, 속도, 차량 ID)
- **좌표 변환**: WGS84 degree, WGS84 millisecond, Korea TM (EPSG:5186), UTM Zone 52N
- **Heading 반영 회전** 차량 마커와 부드러운 이동 보간
- 차량별 최근 이동 경로 **Trail**
- **Follow 모드** — 선택 차량 카메라 고정, auto-fit, free-move 지원
- 속도 표시 `km/h` 또는 `m/s`
- Topic, 속도, heading, 좌표를 보여주는 차량 리스트

스마트시티, BIS, C-ITS, 자율주행 Kafka 파이프라인처럼 실시간 좌표 스트림 확인이 일상인 개발 워크플로우를 위해 설계했습니다.

---

## Produce

단건 발행과 **Interval Produce** — Count 또는 Duration 제한 필수, 무제한 모드 없음. 시작 전에 토픽, 주기, 종료 조건, 예상 발행 건수를 확인합니다.

Key, Headers, Value 모두에서 동적 필드 사용 가능:

| 문법 | 출력 |
|---|---|
| `${seq}` | 1, 2, 3 … |
| `${seq:1..10}` | 10에서 순환 |
| `VMS${seq:1..100\|pad=7}` | `VMS0000001` … `VMS0000100` |
| `${random:1..100}` | 범위 내 랜덤 정수 |
| `${float:0..1\|fixed=2}` | 소수점 고정 랜덤 실수 |
| `${choice:READY\|RUNNING\|ERROR}` | 목록 중 랜덤 선택 |
| `${timestamp}` | Epoch milliseconds |
| `${timestamp:s}` | Epoch seconds |
| `${date:yyyy-MM-dd HH:mm:ss}` | 포맷된 현재 날짜/시간 |
| `${now}` | ISO 8601 |
| `${uuid}` | 랜덤 UUID v4 |
| `\${uuid}` | Literal `${uuid}` (이스케이프) |

**Produce Preview**로 발행 전 최종 Payload를 확인합니다. 잘못된 문법은 인라인으로 표시되고 Interval Produce 시작을 차단합니다. 토픽별 템플릿은 Preferences에 저장되며 설정 Export/Import에 포함됩니다.

---

## Consumer Groups

Group 상세 화면에서 토픽·Partition별 committed offset, beginning/end offset, lag를 확인할 수 있습니다.

Group 상세 화면의 **Offset Reset**에서 선택한 Partition을 네 가지 모드로 리셋할 수 있습니다:

- `Earliest` · `Latest` · `Timestamp` · `Specific offset`

리셋 플로우는 세 단계: Partition 선택 → 미리보기 실행(Partition별 target offset과 diff 표시) → `RESET` 타이핑 후 확인. Consumer Group이 활성 상태면 실행이 차단됩니다.

---

## 서버 프로필

각 프로필에는 Broker 주소, 선택적 SSL/TLS, 선택적 SASL/OAUTHBEARER, 선택적 Schema Registry 설정이 포함됩니다. 팝업의 **Test** 버튼으로 현재 입력값 기준 Kafka Admin 연결을 저장 없이 바로 확인할 수 있습니다.

---

## 단축키

| 단축키 | 동작 |
|---|---|
| `Ctrl/Cmd+P` · `Ctrl/Cmd+K` | Quick Search 열기 |
| `Ctrl/Cmd+Right` | 현재 Topic을 오른쪽 Pane으로 이동 |
| `Ctrl/Cmd+Left` | 오른쪽 Pane의 Topic을 왼쪽으로 이동 |
| `Ctrl/Cmd+1` / `2` | 왼쪽 / 오른쪽 Pane 포커스 |
| `Ctrl/Cmd+W` | 현재 Topic 탭 닫기 |
| `Ctrl/Cmd+Shift+W` | Split Pane 닫기 |

모든 단축키는 `Preferences > Editor > Shortcuts`에서 변경할 수 있습니다.

---

## 빌드

**Windows**

```bash
npm ci
npm run build
npm run release:win
```

**macOS** *(macOS에서 실행해야 합니다)*

```bash
npm ci
npm run release:mac
```

---

## 보안

> [!WARNING]
> Client Secret, Schema Registry 인증 정보, Bearer Token은 로컬 설정 파일에 저장됩니다. Export한 설정 파일은 버전 관리에 포함하지 않도록 주의하세요.

---

## 문서

- [변경 이력](CHANGELOG.md)
- [릴리즈 가이드](docs/release.md)
- [macOS 사내 설치](docs/macos-install.md)
- [Consume 필터](docs/consume-filters.md)
- [Avro](docs/avro.md)
- [프로젝트 구조](PROJECT_STRUCTURE.md)

---

## 라이선스

MIT — 자세한 내용은 [LICENSE](LICENSE)를 확인하세요.

Copyright (c) 2026 PJHUN.
