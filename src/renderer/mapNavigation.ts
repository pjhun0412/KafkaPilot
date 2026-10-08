import type { Map as LeafletMap } from "leaflet";

// zoomstart also fires for fitBounds/setView. Only explicit user navigation
// should interrupt tracking, including keyboard, zoom buttons and pinch zoom.
export function onUserMapNavigation(map: Pick<LeafletMap, "on" | "off" | "getContainer">, onNavigate: () => void) {
  const container = map.getContainer();
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "_"].includes(event.key)) onNavigate();
  };
  const onClick = (event: MouseEvent) => {
    if (event.target instanceof Element && event.target.closest(".leaflet-control-zoom a")) onNavigate();
  };
  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length > 1) onNavigate();
  };
  map.on("dragstart", onNavigate);
  map.on("boxzoomstart", onNavigate);
  container.addEventListener("wheel", onNavigate, { capture: true, passive: true });
  container.addEventListener("dblclick", onNavigate, true);
  container.addEventListener("keydown", onKeyDown, true);
  container.addEventListener("click", onClick, true);
  container.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
  return () => {
    map.off("dragstart", onNavigate);
    map.off("boxzoomstart", onNavigate);
    container.removeEventListener("wheel", onNavigate, true);
    container.removeEventListener("dblclick", onNavigate, true);
    container.removeEventListener("keydown", onKeyDown, true);
    container.removeEventListener("click", onClick, true);
    container.removeEventListener("touchstart", onTouchStart, true);
  };
}
