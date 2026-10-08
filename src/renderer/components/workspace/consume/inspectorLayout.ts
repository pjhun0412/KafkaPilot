export const INSPECTOR_RESIZER_HEIGHT = 8;

// Keep both panes reachable, including when a compact window cannot fit two 120px panes.
export function clampMessagePaneHeight(containerHeight: number, requestedHeight: number, toolbarHeight = 0): number {
  const availableHeight = Math.max(0, containerHeight - INSPECTOR_RESIZER_HEIGHT);
  const minimumHeight = Math.min(120, availableHeight / 4);
  const minimumViewerHeight = Math.min(Math.max(120, toolbarHeight + 64), availableHeight * 2 / 3);
  const preferredHeight = Number.isFinite(requestedHeight) ? requestedHeight : 230;
  return Math.min(availableHeight - minimumViewerHeight, Math.max(minimumHeight, preferredHeight));
}

export function getInspectorGridRows(containerHeight: number, messagePaneHeight: number, collapsed: boolean, toolbarHeight = 0): string {
  return collapsed
    ? "minmax(0, 1fr) 34px"
    : `${clampMessagePaneHeight(containerHeight, messagePaneHeight, toolbarHeight)}px ${INSPECTOR_RESIZER_HEIGHT}px minmax(0, 1fr)`;
}
