import { useAppLanguage } from "../../../hooks/state/useAppLanguage";
import { t } from "../../../i18n";
import { renderHighlightedText, renderRawJsonText } from "../../../utils";
import type { MessageInspectorProps } from "./inspectorTypes";
import { MessageTreeNode } from "./MessageTreeNode";

export type InspectorContentProps = Pick<MessageInspectorProps, "selectedMessage" | "mode" | "payload" | "search" | "valueColumnPaths" | "onApplyFilter" | "onValueColumnPath" | "previewMode" | "rawText">;

export function MessageInspectorContent({ source: props, previewText, rememberInspectorSelectable }: { source: InspectorContentProps; previewText: string; rememberInspectorSelectable: (element: HTMLElement) => void; }) {
  const language = useAppLanguage();
  const canShowTree = Boolean(props.payload);
  return <>{props.selectedMessage ? (
    props.mode === "tree" ? (
      canShowTree ? (
        <div
          className="message-tree"
          tabIndex={0}
          onFocus={(event) => rememberInspectorSelectable(event.currentTarget)}
          onMouseDown={(event) => rememberInspectorSelectable(event.currentTarget)}
        >
          <MessageTreeNode
            name="message"
            value={props.payload}
            path="message"
            search={props.search}
            valueColumnPaths={props.valueColumnPaths}
            onApplyFilter={props.onApplyFilter}
            onValueColumnPath={props.onValueColumnPath}
          />
        </div>
      ) : (
        <pre
          className="message-view"
          tabIndex={0}
          onFocus={(event) => rememberInspectorSelectable(event.currentTarget)}
          onMouseDown={(event) => rememberInspectorSelectable(event.currentTarget)}
        >
          {t(language, "label.noStructuredPayload")}
        </pre>
      )
    ) : props.mode === "preview" ? (
      <pre
        className={props.previewMode === "hex" ? "message-view message-preview hex-preview" : "message-view message-preview"}
        tabIndex={0}
        onFocus={(event) => rememberInspectorSelectable(event.currentTarget)}
        onMouseDown={(event) => rememberInspectorSelectable(event.currentTarget)}
      >
        {renderHighlightedText(previewText || t(language, "label.emptyPayload"), props.search)}
      </pre>
    ) : (
      <pre
        className="message-view"
        tabIndex={0}
        onFocus={(event) => rememberInspectorSelectable(event.currentTarget)}
        onMouseDown={(event) => rememberInspectorSelectable(event.currentTarget)}
      >
        {renderRawJsonText(props.rawText, props.search)}
      </pre>
    )
  ) : (
    <pre
      className="message-view"
      tabIndex={0}
      onFocus={(event) => rememberInspectorSelectable(event.currentTarget)}
      onMouseDown={(event) => rememberInspectorSelectable(event.currentTarget)}
    >
      {t(language, "label.selectMessageToInspect")}
    </pre>
  )}</>;
}
