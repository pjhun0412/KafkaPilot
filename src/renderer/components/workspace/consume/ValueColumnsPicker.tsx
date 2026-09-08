import { ChevronDown, ChevronRight, Columns3, Folder, X } from "lucide-react";
import { t } from "../../../i18n";
import type { ConsumePanelProps } from "./consumePanelTypes";
import type { useConsumeValueColumns } from "./useConsumeValueColumns";
import type { ValueColumnTreeNode } from "./valueColumnTree";
import { formatValueColumnLabel, getValueColumnGroupHintKey, getValueColumnLeafPaths } from "./valueColumnTree";
export type ValueColumnsPickerProps = Pick<ConsumePanelProps, "language" | "onValueColumnPaths">;
export function ValueColumnsPicker({ source: props, controller }: { source: ValueColumnsPickerProps; controller: ReturnType<typeof useConsumeValueColumns>; }) {
  const {
    showValueColumns,
    setShowValueColumns,
    valueColumnSearch,
    setValueColumnSearch,
    expandedValueColumnGroups,
    valueColumnPaths,
    visibleValueColumnPaths,
    filteredValueColumnPaths,
    valueColumnTree,
    toggleValueColumn,
    toggleValueColumnGroup,
    toggleValueColumnGroupSelection
  } = controller;
  function renderValueColumnNode(node: ValueColumnTreeNode, depth: number) {
    const children = Array.from(node.children.values()).sort((left, right) => left.name.localeCompare(right.name));
    const hasChildren = children.length > 0;
    const isExpanded = valueColumnSearch.trim().length > 0 || expandedValueColumnGroups.has(node.fullPath);
    const leafPaths = hasChildren ? getValueColumnLeafPaths(node) : [];
    const selectedLeafCount = leafPaths.filter((path) => valueColumnPaths.includes(path)).length;
    const isGroupChecked = leafPaths.length > 0 && selectedLeafCount === leafPaths.length;
    const isGroupMixed = selectedLeafCount > 0 && selectedLeafCount < leafPaths.length;
    const hintKey = hasChildren ? getValueColumnGroupHintKey(node.name) : "";

    if (!hasChildren) {
      const path = node.leafPath ?? node.fullPath;
      return (
        <label key={path} className="value-column-tree-row leaf" style={{ paddingLeft: 8 + depth * 28 }}>
          <span className="value-column-tree-indent" />
          <input
            type="checkbox"
            checked={valueColumnPaths.includes(path)}
            onChange={() => toggleValueColumn(path)}
          />
          <span className="value-column-leaf-icon-spacer" />
          <span className="value-column-leaf-name" title={path}>{node.name}</span>
        </label>
      );
    }

    return (
      <div key={node.fullPath} className="value-column-tree-group">
        <div className="value-column-tree-row group" style={{ paddingLeft: 8 + depth * 28 }}>
          <button
            type="button"
            className="value-column-tree-expander"
            onClick={() => toggleValueColumnGroup(node.fullPath)}
            aria-label={isExpanded ? "Collapse group" : "Expand group"}
          >
            {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          <input
            type="checkbox"
            checked={isGroupChecked}
            ref={(input) => {
              if (input) input.indeterminate = isGroupMixed;
            }}
            onChange={() => toggleValueColumnGroupSelection(node)}
          />
          <Folder size={13} />
          <span className="value-column-group-name" title={node.fullPath}>{node.name}</span>
          {hintKey && <span className="value-column-group-hint">{t(props.language, hintKey)}</span>}
          <span className="value-column-group-count">{selectedLeafCount}/{leafPaths.length}</span>
        </div>
        {isExpanded && children.map((child) => renderValueColumnNode(child, depth + 1))}
      </div>
    );
  }
  return <>{visibleValueColumnPaths.length > 0 && (
    <div className="value-column-bar">
      <button
        type="button"
        className={showValueColumns ? "value-column-trigger active" : "value-column-trigger"}
        onClick={() => setShowValueColumns((current) => !current)}
      >
        <Columns3 size={14} />
        {t(props.language, "label.valueColumns")}
        {valueColumnPaths.length > 0 && <span>{valueColumnPaths.length}</span>}
      </button>
      {valueColumnPaths.length > 0 && (
        <button type="button" className="ghost compact" onClick={() => props.onValueColumnPaths([])}>
          {t(props.language, "label.clear")}
        </button>
      )}
      {showValueColumns && (
        <div className="value-column-picker">
          {valueColumnPaths.length > 0 && (
            <div className="value-column-selected-list" aria-label={t(props.language, "label.selectedValueColumns")}>
              {valueColumnPaths.map((path) => (
                <span className="value-column-chip" key={path} title={path}>
                  <span>{formatValueColumnLabel(path)}</span>
                  <button
                    type="button"
                    onClick={() => toggleValueColumn(path)}
                    title={t(props.language, "title.removeValueColumn")}
                    aria-label={t(props.language, "title.removeValueColumn")}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            className="value-column-search"
            value={valueColumnSearch}
            onChange={(event) => setValueColumnSearch(event.target.value)}
            placeholder={t(props.language, "placeholder.searchValueColumns")}
          />
          <div className="value-column-tree">
            {Array.from(valueColumnTree.children.values())
              .sort((left, right) => left.name.localeCompare(right.name))
              .map((node) => renderValueColumnNode(node, 0))}
          </div>
          {filteredValueColumnPaths.length === 0 && (
            <div className="value-column-empty">{t(props.language, "label.noValueColumnsMatched")}</div>
          )}
        </div>
      )}
    </div>
  )}</>;
}
