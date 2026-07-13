<div align="center">

# KafkaPilot

**A local desktop client for Apache Kafka that goes beyond topic browsing.**

Consume · Replay · Produce · Map Viewer · Consumer Group Management

[한국어](README.ko.md) &nbsp;·&nbsp; [Changelog](CHANGELOG.md) &nbsp;·&nbsp; [Docs](docs/)

![Version](https://img.shields.io/badge/version-2.0.7-3b82f6?style=flat-square) &nbsp;![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-64748b?style=flat-square) &nbsp;![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square) &nbsp;![Electron](https://img.shields.io/badge/Electron-33-47848F?style=flat-square)

[![PayPal](https://img.shields.io/badge/donate-PayPal-00457C?style=flat-square&logo=paypal&logoColor=white)](https://www.paypal.com/ncp/payment/R6DBD3HSJ9TPE)

</div>

---

Most Kafka UIs let you browse topics and read messages. KafkaPilot adds the workflows that come next: **replaying messages to another cluster**, **resetting consumer group offsets safely**, and **visualizing live coordinate streams on a map** — all from one app that runs locally with no server to deploy.

---

## What's inside

| | |
|---|---|
| **Consume** | Offset, Time, and Live modes with virtualized grids, payload format selectors, and Value Columns for extracting structured JSON fields |
| **Message Replay** | Send consumed messages to any connected server. Single or batch, with Dynamic Field overrides and background job progress |
| **Produce** | Single-message and interval publishing with a Dynamic Template engine for repeatable test data |
| **Map Viewer** | A standalone window for Kafka topics that carry coordinate data — supports WGS84, Korea TM, and UTM with vehicle markers, trails, and follow mode |
| **Consumer Groups** | Lag by topic and partition with a safe Offset Reset flow: preview, active-group protection, and explicit confirmation |
| **Split Pane** | Two topics side by side with independent consume, produce, and group state |
| **Avro** | Decode via Schema Registry or manually registered topic schemas |

---

## Consume

Three modes for every use case:

- **Offset** — read from a specific start offset with a configurable limit
- **Time** — query by timestamp range
- **Live** — stream from the latest offset in real time without pulling old committed group offsets

Large queries paginate automatically beyond `10,000` messages. Key and Value can be viewed and exported as **Text, JSON, Hex, or Base64**.

**Value Columns** let you pin specific `value.*` paths — like `vehicleId`, `latitude`, or `status` — as dedicated columns in the consume grid. Fields can be added directly from the Message Viewer Tree. Selections persist per topic and are included in CSV exports.

Live Record writes messages to a `JSONL` file stream without buffering the full dataset in renderer memory.

---

## Message Replay

Send any consumed message to another server and topic from the Message Viewer toolbar — without switching to the Produce tab.

- **Scope**: single message, selected rows, filtered results, or all loaded messages
- **Single replay**: edit the payload directly before sending
- **Batch replay**: override Value fields with Dynamic Field tokens (`${uuid}`, `${seq:1..100}`, `${date:...}`)
- **Background jobs**: large replays run with progress, per-message delay control, and abort

---

## Map Viewer

A dedicated window for Kafka topics that carry location data. Open it from any Consume message toolbar.

- Per-topic **field mapping** for custom JSON paths (latitude, longitude, heading, speed, vehicle ID)
- **Coordinate conversion**: WGS84 degree, WGS84 millisecond, Korea TM (EPSG:5186), UTM Zone 52N
- Vehicle markers with **heading-aware rotation** and smooth movement interpolation
- **Trails** showing recent movement history per vehicle
- **Follow mode** locks the camera to a selected vehicle; auto-fit and free-move also available
- Speed display in `km/h` or `m/s`
- Vehicle list with topic, speed, heading, and coordinates

Built for smart-city, BIS, C-ITS, and autonomous-driving Kafka pipelines where inspecting live coordinate streams is part of the daily workflow.

---

## Produce

Single-message publishing and **Interval Produce** with Count or Duration limits. No unlimited mode — KafkaPilot shows a confirmation summary before any interval job starts.

Dynamic fields work in Key, Headers, and Value:

| Token | Output |
|---|---|
| `${seq}` | 1, 2, 3 … |
| `${seq:1..10}` | Sequential, wraps at 10 |
| `VMS${seq:1..100\|pad=7}` | `VMS0000001` … `VMS0000100` |
| `${random:1..100}` | Random integer in range |
| `${float:0..1\|fixed=2}` | Random decimal, fixed precision |
| `${choice:READY\|RUNNING\|ERROR}` | Randomly picks one value |
| `${timestamp}` | Epoch milliseconds |
| `${timestamp:s}` | Epoch seconds |
| `${date:yyyy-MM-dd HH:mm:ss}` | Formatted local date/time |
| `${now}` | ISO 8601 |
| `${uuid}` | Random UUID v4 |
| `\${uuid}` | Literal `${uuid}` (escaped) |

**Produce Preview** renders the full payload before send. Invalid syntax is shown inline and blocks interval jobs from starting. Per-topic templates are saved in preferences and travel with settings export/import.

---

## Consumer Groups

Group detail shows committed offsets, beginning and end offsets, and lag by topic partition.

**Offset Reset** is available from any Group detail view with four target modes:

- `Earliest` · `Latest` · `Timestamp` · `Specific offset`

The reset flow requires three steps: select partitions → run preview (shows target offsets and diff per partition) → type `RESET` to confirm. Execution is blocked while the Consumer Group has active members.

---

## Server Profiles

Each profile stores broker addresses, optional SSL/TLS, optional SASL/OAUTHBEARER, and optional Schema Registry settings. The **Test** button in the dialog verifies the Kafka Admin connection against the current form values — no save required.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd+P` · `Ctrl/Cmd+K` | Open Quick Search |
| `Ctrl/Cmd+Right` | Move current topic to right pane |
| `Ctrl/Cmd+Left` | Move right-pane topic to left pane |
| `Ctrl/Cmd+1` / `2` | Focus left / right pane |
| `Ctrl/Cmd+W` | Close current topic tab |
| `Ctrl/Cmd+Shift+W` | Close split pane |

All shortcuts can be rebound in `Preferences > Editor > Shortcuts`.

---

## Build

**Windows**

```bash
npm ci
npm run build
npm run release:win
```

**macOS** *(must run on a Mac)*

```bash
npm ci
npm run release:mac
```

---

## Security

> [!WARNING]
> Client secrets, Schema Registry credentials, and bearer tokens are stored in the local settings file. Treat exported settings files like credentials — do not commit them to version control.

---

## Documentation

- [Changelog](CHANGELOG.md)
- [Release guide](docs/release.md)
- [macOS internal install](docs/macos-install.md)
- [Consume filters](docs/consume-filters.md)
- [Avro](docs/avro.md)
- [Project structure](PROJECT_STRUCTURE.md)

---

## License

MIT — see [LICENSE](LICENSE) for details.

Copyright (c) 2026 PJHUN.
