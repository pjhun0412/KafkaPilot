# Consume Filters

Consume filters support plain text, field filters, regex, and JSON path comparisons.

## Plain Text

```text
error
!timeout
```

Plain text filters search the visible message fields after the current Key/Value formatting is applied.

## Field Filters

```text
key:PR1001
value:OK
headers.traceId exists
empty:headers
```

## Regex

```text
/timeout|failed/i
```

## JSON Path Comparisons

```text
decoded.speed >= 50
value.proc_id == "PR0116"
headers.traceId exists
```

## Modes

- `Hide`: hide non-matching rows
- `Highlight`: keep all rows visible and highlight matches

## Payload Formats

Consume can display Key and Value as `Text`, `JSON`, `Hex`, or `Base64`.

Filtering works against the displayed message data in the renderer. For large raw payloads, KafkaPilot keeps only a fixed amount of raw bytes per message to protect memory. If a payload exceeds that raw-byte limit, Hex/Base64-only inspection may show a retained-bytes warning.

## Export

Exports use the selected payload format options when available, so a result viewed as Hex or Base64 can be exported in the same representation.
