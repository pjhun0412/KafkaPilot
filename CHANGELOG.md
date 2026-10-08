# Changelog

## Unreleased

### Added

- Add single-level server groups with rename, collapse, drag-and-drop moves, group/member ordering, and a context-menu move selector.
- Persist server groups in preferences and settings export/import; deleting a group keeps its servers in the main list.

### Changed

- Reduce sidebar server rows from 38px to 28px and tighten search spacing.
- Place server and group creation icons together in the SERVER header, with localized tooltips and server creation emphasized.
- Show servers without a group directly in the list without an extra heading; drop onto empty list space to move a server out of its group.
- Include group names and collapsed group members in server search results.
- Position server context menus using their actual dimensions to keep the added group controls inside the window.

### Fixed

- Keep the message grid/viewer divider stable in compact windows, adapt both panes to window and toolbar sizes, and preserve the preferred height across window resizing. See the [resize investigation](docs/incidents/2026-10-08-message-viewer-resize.md).
- Clean up pending divider updates and pointer capture when dragging is cancelled or the pane closes.

## 2.0.8

### Added

- Support WGS84 integer coordinates (E6, degrees multiplied by 1,000,000) in per-topic Map field mapping.

### Fixed

- Preserve Kafka keys as their original strings in the message inspector, including integers beyond JavaScript's safe range.
- Apply saved Map field paths to incoming live messages using the same payload structure as the message inspector.
- Load Map Viewer from the Vite development server in development mode so source changes appear without a separate build.
- Return validation messages for unknown Dynamic Field tokens instead of throwing a ReferenceError.
- Forward topic activation when moving a message to Produce on another topic in the split pane.
- Stop Consumer Group Offset Reset when group state lookup fails or the requested group state is missing.
- Fix Renderer type errors in controller inputs, Produce template callbacks, and Map Viewer vehicle state.

### Changed

- Redraw Map Viewer vehicles with colored top-view bodies, clear heading indicators, selection outlines, separate alert markers, and labels below each vehicle.
- Require Renderer type checking in build and package/release commands.
- Add regression tests for templates, split-pane routing, Consumer Group Offset Reset, original keys, and Map coordinate mapping.
- Align local packaging instructions, macOS app paths, store documentation, and template roadmap status with the implementation.

## 2.0.7

### Changed

- Rebranded the former Kafka-Tool product identity to `KafkaPilot` across the app metadata, installer artifact name, and documentation.
- Kept the legacy Kafka Tool settings migration path so existing users can keep their local profiles after reinstalling under KafkaPilot.

### Fixed

- Keep `Ctrl+A` / `Cmd+A` selection scoped to the active Raw, Tree, or Preview message viewer area after it is clicked.
- Preserve normal select-all behavior inside search inputs, editors, and other form controls.

## 2.0.6

### Added

- Added `Value Columns` for Consume grids so selected `value.*` fields can be shown as dedicated columns.
- Added CSV export support for selected `Value Columns`.
- Added Message Viewer Tree actions for adding leaf values directly to `Value Columns`.
- Added the independent Map Viewer window for coordinate messages, including per-topic field mapping, projection conversion, vehicle markers, heading, trails, and selected-vehicle follow mode.
- Added Consumer Group Offset Reset with partition selection, preview, active-group protection, and Earliest/Latest/Timestamp/Specific offset modes.
- Added Message Replay from Consume results with target server/topic selection, payload editing, Key/Headers/Value toggles, and Dynamic Field rendering.
- Added batch Message Replay for selected messages, filtered results, and all loaded Consume messages.
- Added background Replay Jobs with progress tracking, source/target server display, delay control, and abort support.

### Improved

- Persist `Value Columns` per topic with Viewer preferences.
- Support WGS84 degree, WGS84 millisecond, Korea TM, and UTM Zone 52N coordinate inputs in Map Viewer.
- Support `km/h` and `m/s` speed field handling in Map Viewer.
- Show reset progress and errors inside the Consumer Group reset dialog.
- Keep Message Replay inside its dialog so messages can be reviewed, edited, and sent without switching to the Produce tab.
- Support Grid, Original, and Timestamp ordering for batch Replay.
- Keep Replay sends running in the background when the Replay dialog or Topic pane is closed.
- Improved large Consume tab switching by avoiding unnecessary filter copies and caching message row/value parsing work.
- Improved Map Viewer movement by interpolating vehicle position and heading updates.
- Refactored Consume value-path helpers and Map Viewer vehicle helpers into focused modules.

### Fixed

- Close the `Value Columns` picker when switching topics.
- Close the Map Field Mapping picker immediately after a field is selected.
- Fixed Map Viewer vehicle state ordering during animated updates.

## 2.0.4

### Added

- Added a server profile `Test` action for validating Kafka connectivity before saving.

### Improved

- Show server profile validation and connection test errors inside the dialog.

### Fixed

- Fixed server and topic context menus showing a light background in the dark UI.
- Removed the duplicate center `x` overlay from failed server connection indicators.

## 2.0.3

### Added

- Added Interval Produce with Count or Duration limits.
- Added dynamic Produce fields for Key, Headers, and Value.
- Added rendered Produce Preview for Key, Headers, and Value.
- Added per-topic Produce templates saved in app preferences.
- Added left/right pane move shortcuts for Topic tabs.
- Added a shortcut for closing the current Topic tab in the active pane.

### Improved

- Block Interval Produce when dynamic field syntax is invalid.
- Block invalid Count/Duration stop conditions before Interval Produce starts.
- Refined Topic and Consumer grid cell vertical alignment.

## 2.0.2

### Added

- Added editable in-app keyboard shortcuts in Preferences.
- Added a What’s New dialog that appears once after an app version changes.
- Added a Help menu entry for reopening Release Notes.

### Improved

- Improved shortcut handling for macOS and Windows/Linux by using Cmd/Ctrl-aware bindings.
- Persisted shortcut preferences and release-note acknowledgement in app preferences and settings export/import.

## 2.0.1

### Added

- Added Key/Value payload format selectors for Consume results and exports.
- Added a Message Viewer with `Raw`, `Tree`, and `Preview` modes.
- Added `Text`, `JSON`, `Hex`, and `Base64` preview/export support with UTF-8 and EUC-KR decoding.

### Improved

- Limited retained raw payload bytes per message to reduce memory pressure during large consumes.
- Improved Live Record file writing with sequential write backpressure for long-running captures.
- Kept Message Viewer mode per topic pane, including split panes, when switching tabs.

### Fixed

- Fixed Value/Preview copy actions so they use the currently selected payload target and format.
- Fixed viewer mode unexpectedly returning to `Raw` after navigating away from Consume.
- Fixed large raw payload export behavior for Hex/Base64 by showing a retained-bytes warning instead of rebuilding bytes from fallback text.

## 2.0.0

### Added

- Added split workspace panes for side-by-side Topic workflows.
- Added Topic Settings view with editable Kafka configs.
- Added Topic creation and clear messages actions.
- Added Broker detail pages with configs.
- Added Live Record for streaming messages to JSONL files.
- Added Korean/English UI language support.
- Added Inter and Noto Sans KR font support.
- Added macOS package and release scripts for macOS builds.

### Improved

- Refactored renderer state around Zustand stores and focused hooks/actions.
- Improved large Consume result performance with virtualized grids.
- Improved JSON Viewer resize responsiveness.
- Improved Consumer Group detail layout with collapsible Topic sections.
- Improved Quick Search keyboard navigation and result badges.
- Improved split-pane state preservation per server.

### Fixed

- Fixed large offset paging in Newest mode.
- Fixed split refresh resetting Consume mode back to Offset.
- Fixed Live Consume reading old committed group offsets into the UI or Record output.
- Fixed Topic/Favorite row hit areas triggering unintended navigation.
- Fixed several hard-coded UI strings through i18n cleanup.
