import { useEffect, useMemo, useState } from "react";
import { collectMessageValuePaths, normalizeValueColumnPaths } from "../../../consumeValuePaths";
import type { ConsumePanelProps } from "./consumePanelTypes";
import type { ValueColumnTreeNode } from "./valueColumnTree";
import { createValueColumnTree, getValueColumnLeafPaths } from "./valueColumnTree";
const MAX_VALUE_COLUMN_CANDIDATES = 160;
const VALUE_COLUMN_SAMPLE_SIZE = 200;
export type ConsumeValueColumnsProps = Pick<ConsumePanelProps, "valueColumnPaths" | "messages" | "topic" | "onValueColumnPaths">;
export function useConsumeValueColumns(props: ConsumeValueColumnsProps) {
  const [showValueColumns, setShowValueColumns] = useState(false);
  const [valueColumnSearch, setValueColumnSearch] = useState("");
  const [expandedValueColumnGroups, setExpandedValueColumnGroups] = useState<Set<string>>(() => new Set());
  const valueColumnPaths = useMemo(() => normalizeValueColumnPaths(props.valueColumnPaths), [props.valueColumnPaths]);
  const valueColumnCandidates = useMemo(() => {
    return collectMessageValuePaths(props.messages, VALUE_COLUMN_SAMPLE_SIZE, MAX_VALUE_COLUMN_CANDIDATES);
  }, [props.messages]);

  const visibleValueColumnPaths = useMemo(
    () => Array.from(new Set([...valueColumnPaths, ...valueColumnCandidates])),
    [valueColumnPaths, valueColumnCandidates]
  );

  const filteredValueColumnPaths = useMemo(() => {
    const query = valueColumnSearch.trim().toLowerCase();
    if (!query) return visibleValueColumnPaths;
    return visibleValueColumnPaths.filter((path) => path.toLowerCase().includes(query));
  }, [valueColumnSearch, visibleValueColumnPaths]);

  const valueColumnTree = useMemo(() => createValueColumnTree(filteredValueColumnPaths), [filteredValueColumnPaths]);
  const rootValueColumnGroupPaths = useMemo(() => {
    return Array.from(createValueColumnTree(visibleValueColumnPaths).children.values())
      .filter((node) => node.children.size > 0)
      .map((node) => node.fullPath);
  }, [visibleValueColumnPaths]);

  useEffect(() => {
    setShowValueColumns(false);
    setValueColumnSearch("");
    setExpandedValueColumnGroups(new Set());
  }, [props.topic]);

  useEffect(() => {
    setExpandedValueColumnGroups((current) => {
      if (current.size > 0 || rootValueColumnGroupPaths.length === 0) return current;
      return new Set(rootValueColumnGroupPaths);
    });
  }, [rootValueColumnGroupPaths]);

  function toggleValueColumn(path: string) {
    props.onValueColumnPaths(valueColumnPaths.includes(path)
      ? valueColumnPaths.filter((item) => item !== path)
      : [...valueColumnPaths, path]);
  }

  function toggleValueColumnGroup(path: string) {
    setExpandedValueColumnGroups((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  function toggleValueColumnGroupSelection(node: ValueColumnTreeNode) {
    const leafPaths = getValueColumnLeafPaths(node);
    const current = new Set(valueColumnPaths);
    const allSelected = leafPaths.every((path) => current.has(path));
    for (const path of leafPaths) {
      if (allSelected) {
        current.delete(path);
      } else {
        current.add(path);
      }
    }
    props.onValueColumnPaths(normalizeValueColumnPaths(Array.from(current)));
  }
  return {
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
  };
}
