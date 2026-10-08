import type React from "react";

import { useLayoutEffect, useRef } from "react";
import { clampMessagePaneHeight, getInspectorGridRows } from "./inspectorLayout";

function getToolbarHeight(gridElement: HTMLDivElement): number {
  const toolbar = gridElement.querySelector<HTMLElement>(".message-inspector-toolbar");
  return toolbar ? Math.max(toolbar.scrollHeight, toolbar.getBoundingClientRect().height) : 0;
}

export function useInspectorResize(params: {
  consumeGridRef: React.RefObject<HTMLDivElement | null>;
  inspectorCollapsed: boolean;
  messagePaneHeight: number;
  onMessagePaneHeight: (value: number) => void;
}) {
  const activeDrag = useRef<{ resize: () => void; cancel: () => void } | null>(null);

  useLayoutEffect(() => {
    const gridElement = params.consumeGridRef.current;
    if (!gridElement) return;
    const resize = () => {
      if (activeDrag.current) {
        activeDrag.current.resize();
      } else {
        gridElement.style.gridTemplateRows = getInspectorGridRows(
          gridElement.getBoundingClientRect().height, params.messagePaneHeight, params.inspectorCollapsed, getToolbarHeight(gridElement)
        );
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(gridElement);
    const toolbar = gridElement.querySelector(".message-inspector-toolbar");
    if (toolbar) observer.observe(toolbar);
    return () => {
      observer.disconnect();
      activeDrag.current?.cancel();
    };
  }, [params.consumeGridRef, params.messagePaneHeight, params.inspectorCollapsed]);

  return function startInspectorResize(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || params.inspectorCollapsed || activeDrag.current) return;
    event.preventDefault();
    const gridElement = params.consumeGridRef.current;
    if (!gridElement) return;
    const resizeHandle = event.currentTarget;
    const pointerId = event.pointerId;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    resizeHandle.setPointerCapture(event.pointerId);
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    const startY = event.clientY;
    const startHeight = gridElement.firstElementChild?.getBoundingClientRect().height ?? params.messagePaneHeight;
    let requestedHeight = startHeight;
    let nextHeight = startHeight;
    let animationFrame = 0;
    const applyHeight = () => {
      const containerHeight = gridElement.getBoundingClientRect().height;
      const toolbarHeight = getToolbarHeight(gridElement);
      nextHeight = clampMessagePaneHeight(containerHeight, requestedHeight, toolbarHeight);
      gridElement.style.gridTemplateRows = getInspectorGridRows(containerHeight, nextHeight, false, toolbarHeight);
    };
    const onPointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      requestedHeight = startHeight + moveEvent.clientY - startY;
      if (!animationFrame) {
        animationFrame = window.requestAnimationFrame(() => {
          animationFrame = 0;
          applyHeight();
        });
      }
    };
    const cleanup = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      activeDrag.current = null;
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      resizeHandle.removeEventListener("lostpointercapture", onPointerCancel);
      if (resizeHandle.hasPointerCapture(pointerId)) {
        resizeHandle.releasePointerCapture(pointerId);
      }
    };
    const onPointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      requestedHeight = startHeight + upEvent.clientY - startY;
      applyHeight();
      cleanup();
      if (upEvent.clientY !== startY) params.onMessagePaneHeight(nextHeight);
    };
    const cancel = () => {
      cleanup();
      gridElement.style.gridTemplateRows = getInspectorGridRows(
        gridElement.getBoundingClientRect().height, params.messagePaneHeight, params.inspectorCollapsed, getToolbarHeight(gridElement)
      );
    };
    const onPointerCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId === pointerId) cancel();
    };
    activeDrag.current = { resize: applyHeight, cancel };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    resizeHandle.addEventListener("lostpointercapture", onPointerCancel);
  };
}
