import { useEffect, useRef } from "react";

export function useInspectorTextSelection() {
  const inspectorSelectableRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    function selectInspectorContents(element: HTMLElement) {
      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
      element.focus({ preventScroll: true });
    }

    function selectAllInspectorText(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "a" || (!event.metaKey && !event.ctrlKey) || event.altKey) return;
      const eventTarget = event.target instanceof Element ? event.target : null;
      if (eventTarget?.closest("input, textarea, select, [contenteditable='true']")) return;
      const selection = window.getSelection();
      const anchorElement = selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement;
      const focusElement = selection?.focusNode instanceof Element ? selection.focusNode : selection?.focusNode?.parentElement;
      const selectedElement = anchorElement?.closest<HTMLElement>(".message-view, .message-tree")
        ?? focusElement?.closest<HTMLElement>(".message-view, .message-tree")
        ?? eventTarget?.closest<HTMLElement>(".message-view, .message-tree")
        ?? inspectorSelectableRef.current;
      if (!selectedElement || !document.body.contains(selectedElement)) return;
      event.preventDefault();
      event.stopPropagation();
      selectInspectorContents(selectedElement);
    }

    function copySelectedInspectorText(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "c" || (!event.metaKey && !event.ctrlKey) || event.altKey) return;
      const selection = window.getSelection();
      const selectedText = selection?.toString() ?? "";
      if (!selection || selection.isCollapsed || !selectedText) return;
      const anchorNode = selection.anchorNode;
      const focusNode = selection.focusNode;
      const anchorElement = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement;
      const focusElement = focusNode instanceof Element ? focusNode : focusNode?.parentElement;
      const isInspectorSelection = Boolean(
        anchorElement?.closest(".message-inspector")
        || focusElement?.closest(".message-inspector")
      );
      if (!isInspectorSelection) return;
      event.preventDefault();
      void navigator.clipboard.writeText(selectedText);
    }

    window.addEventListener("keydown", selectAllInspectorText, true);
    window.addEventListener("keydown", copySelectedInspectorText, true);
    return () => {
      window.removeEventListener("keydown", selectAllInspectorText, true);
      window.removeEventListener("keydown", copySelectedInspectorText, true);
    };
  }, []);

  function rememberInspectorSelectable(element: HTMLElement) {
    inspectorSelectableRef.current = element;
  }
  return rememberInspectorSelectable;
}
