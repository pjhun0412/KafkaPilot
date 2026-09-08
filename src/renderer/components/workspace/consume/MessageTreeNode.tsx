import { ChevronDown, ChevronRight, Columns3, Filter } from "lucide-react";
import { useState } from "react";
import { useAppLanguage } from "../../../hooks/state/useAppLanguage";
import { t } from "../../../i18n";
import { getEpochTitle, renderHighlightedText, stringifyPrimitive } from "../../../utils";
import { getValueColumnPathFromTreePath } from "./inspectorFieldPaths";

export function MessageTreeNode(props: {
  name: string;
  value: unknown;
  path: string;
  search: string;
  valueColumnPaths: string[];
  onApplyFilter: (value: string) => void;
  onValueColumnPath: (path: string) => void;
}) {
  const language = useAppLanguage();
  const [expanded, setExpanded] = useState(true);
  const isObject = props.value !== null && typeof props.value === "object";
  const entries = isObject ? Object.entries(props.value as Record<string, unknown>) : [];
  const primitive = stringifyPrimitive(props.value);
  const epochTitle = getEpochTitle(props.value);

  if (!isObject) {
    const valueColumnPath = getValueColumnPathFromTreePath(props.path);
    const isValueColumnSelected = Boolean(valueColumnPath && props.valueColumnPaths.includes(valueColumnPath));
    return (
      <div className="message-tree-node leaf">
        <span className="message-tree-key">{renderHighlightedText(props.name, props.search)}</span>
        <span className="message-tree-separator">:</span>
        <span className="message-tree-value" title={epochTitle}>{renderHighlightedText(primitive, props.search)}</span>
        <button className="message-tree-filter" onClick={() => props.onApplyFilter(primitive)} title={t(language, "title.applyToFilter")}>
          <Filter size={12} />
        </button>
        {valueColumnPath && (
          <button
            className={isValueColumnSelected ? "message-tree-column selected" : "message-tree-column"}
            onClick={() => props.onValueColumnPath(valueColumnPath)}
            title={isValueColumnSelected ? t(language, "title.valueColumnAlreadyAdded") : t(language, "title.addValueColumn")}
            aria-label={isValueColumnSelected ? t(language, "title.valueColumnAlreadyAdded") : t(language, "title.addValueColumn")}
          >
            <Columns3 size={12} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="message-tree-node">
      <button className="message-tree-node-toggle" onClick={() => setExpanded((current) => !current)}>
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span className="message-tree-key">{renderHighlightedText(props.name, props.search)}</span>
        <span className="message-tree-meta">{Array.isArray(props.value) ? `[${entries.length}]` : `{${entries.length}}`}</span>
      </button>
      {expanded && (
        <div className="message-tree-children">
          {entries.map(([key, value]) => (
            <MessageTreeNode
              key={`${props.path}.${key}`}
              name={key}
              value={value}
              path={`${props.path}.${key}`}
              search={props.search}
              valueColumnPaths={props.valueColumnPaths}
              onApplyFilter={props.onApplyFilter}
              onValueColumnPath={props.onValueColumnPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}
