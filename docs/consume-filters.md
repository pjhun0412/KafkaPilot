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
value:/^\d+$/
value:/^"two words"$/
```

Regex literals preserve backslashes, spaces, quotes, and escaped slashes. A field prefix and negation can be combined, for example `!value:/^\d+$/`. Global (`g`) and sticky (`y`) flags are evaluated independently for each field value and record.

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

The full-message Raw/Tree inspector preserves Key as its received text, even when it looks like a JSON number, boolean, or object. For example, `2522026100715025500` remains the exact string `"2522026100715025500"`; it is not converted to a JavaScript number. Value JSON parsing is unchanged.

Filtering works against the displayed message data in the renderer. For large raw payloads, KafkaPilot keeps only a fixed amount of raw bytes per message to protect memory. If a payload exceeds that raw-byte limit, Hex/Base64-only inspection may show a retained-bytes warning.

## Export

Exports use the selected payload format options when available, so a result viewed as Hex or Base64 can be exported in the same representation.
