import { ChevronDown, ChevronRight, Folder, Search, Send, X } from "lucide-react";
import { useAppLanguage } from "../../../hooks/state/useAppLanguage";
import { t } from "../../../i18n";
import { formatMapFieldPath } from "./inspectorFieldPaths";
import type { ReplayOrder, ReplayOverrideTreeNode } from "./replayDrafts";
import { getReplayOverrideLeafPaths } from "./replayDrafts";
import type { InspectorReplayProps, useInspectorReplay } from "./useInspectorReplay";

export function ReplayDialog({ source: props, controller }: { source: InspectorReplayProps; controller: ReturnType<typeof useInspectorReplay>; }) {
  const language = useAppLanguage();
  const {
    isReplayOpen,
    setIsReplayOpen,
    isReplayServerPickerOpen,
    setIsReplayServerPickerOpen,
    isReplayTopicPickerOpen,
    setIsReplayTopicPickerOpen,
    connectingReplayServerId,
    replayTopic,
    setReplayTopic,
    replayTopicQuery,
    setReplayTopicQuery,
    replayPayload,
    replaySourceKind,
    replayMessages,
    replayDraft,
    setReplayDraft,
    replayNotice,
    replayApplyDynamicFields,
    setReplayApplyDynamicFields,
    replayFieldOverrides,
    replayOverrideSearch,
    setReplayOverrideSearch,
    expandedReplayOverrideGroups,
    replayOrder,
    setReplayOrder,
    replayStopOnFirstError,
    setReplayStopOnFirstError,
    replayDelayEnabled,
    setReplayDelayEnabled,
    replayDelayMs,
    setReplayDelayMs,
    replayServerPickerRef,
    replayTopicPickerRef,
    isSingleReplay,
    replaySourceTopic,
    replayOffsetRange,
    selectedReplayServer,
    replayTopicOptions,
    replayTemplateExamples,
    replayOverrideTree,
    replaySourceOptions,
    changeReplaySource,
    submitReplay,
    toggleReplayPayload,
    addReplayFieldOverride,
    toggleReplayOverridePath,
    toggleReplayOverrideGroup,
    toggleReplayOverrideGroupSelection,
    updateReplayFieldOverride,
    removeReplayFieldOverride,
    changeReplayServer
  } = controller;
  function renderReplayOverrideNode(node: ReplayOverrideTreeNode, depth: number) {
    const children = Array.from(node.children.values()).sort((left, right) => left.name.localeCompare(right.name));
    const hasChildren = children.length > 0;
    const isExpanded = replayOverrideSearch.trim().length > 0 || expandedReplayOverrideGroups.has(node.fullPath);
    const selectedPaths = new Set(replayFieldOverrides.map((override) => override.path));

    if (!hasChildren) {
      const path = node.leafPath ?? node.fullPath;
      return (
        <label key={path} className="replay-override-tree-row leaf" style={{ paddingLeft: 8 + depth * 24 }}>
          <span className="replay-override-tree-indent" />
          <input
            type="checkbox"
            checked={selectedPaths.has(path)}
            onChange={() => toggleReplayOverridePath(path)}
          />
          <span className="replay-override-leaf-spacer" />
          <span className="replay-override-leaf-name" title={path}>{node.name}</span>
        </label>
      );
    }

    const leafPaths = getReplayOverrideLeafPaths(node);
    const selectedLeafCount = leafPaths.filter((path) => selectedPaths.has(path)).length;
    const isGroupChecked = leafPaths.length > 0 && selectedLeafCount === leafPaths.length;
    const isGroupMixed = selectedLeafCount > 0 && selectedLeafCount < leafPaths.length;
    return (
      <div key={node.fullPath} className="replay-override-tree-group">
        <div className="replay-override-tree-row group" style={{ paddingLeft: 8 + depth * 24 }}>
          <button
            type="button"
            className="replay-override-tree-expander"
            onClick={() => toggleReplayOverrideGroup(node.fullPath)}
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
            onChange={() => toggleReplayOverrideGroupSelection(node)}
          />
          <Folder size={13} />
          <span className="replay-override-group-name" title={node.fullPath}>{node.name}</span>
          <span className="replay-override-group-count">{selectedLeafCount}/{leafPaths.length}</span>
        </div>
        {isExpanded && children.map((child) => renderReplayOverrideNode(child, depth + 1))}
      </div>
    );
  }
  return <>{isReplayOpen && (
    <div className="modal-backdrop replay-target-backdrop" role="presentation" onMouseDown={() => setIsReplayOpen(false)}>
      <section className="replay-target-modal" role="dialog" aria-modal="true" aria-labelledby="replay-target-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-title">
          <div>
            <span className="eyebrow">{props.selectedMessage?.topic ?? "Topic"}</span>
            <h2 id="replay-target-title">{t(language, "replay.title")}</h2>
          </div>
          <button className="modal-close" onClick={() => setIsReplayOpen(false)} title={t(language, "title.close")}>
            <X size={16} />
          </button>
        </div>
        <div className="replay-route-grid">
          {replayNotice && <div className="replay-notice" role="alert">{replayNotice}</div>}
          <section className="replay-route-card">
            <h3>{t(language, "label.source")}</h3>
            <div className="replay-source-modes" role="group" aria-label={t(language, "replay.sourceMode")}>
              {replaySourceOptions.map((option) => (
                <button
                  key={option.kind}
                  type="button"
                  className={replaySourceKind === option.kind ? "active" : ""}
                  disabled={option.count === 0}
                  onClick={() => changeReplaySource(option.kind)}
                >
                  <strong>{option.label}</strong>
                  <span>{option.count}</span>
                </button>
              ))}
            </div>
            <dl>
              <div><dt>{t(language, "label.cluster")}</dt><dd>{props.serverName}</dd></div>
              <div><dt>{t(language, "label.topic")}</dt><dd>{replaySourceTopic || "-"}</dd></div>
              <div><dt>{t(language, "label.count")}</dt><dd>{replayMessages.length || "-"}</dd></div>
              <div><dt>Offset</dt><dd>{replayOffsetRange}</dd></div>
            </dl>
          </section>
          <section className="replay-route-card">
            <h3>{t(language, "label.target")}</h3>
            <div className="replay-target-server-picker" ref={replayServerPickerRef}>
              <span>{t(language, "replay.targetServer")}</span>
              <button
                type="button"
                className="replay-server-select-trigger"
                disabled={Boolean(connectingReplayServerId)}
                onClick={() => setIsReplayServerPickerOpen((current) => !current)}
              >
                <span className={selectedReplayServer?.connected ? "replay-server-status connected" : "replay-server-status disconnected"}>
                  {selectedReplayServer?.connected ? "" : <X size={9} strokeWidth={3} />}
                </span>
                <strong>{selectedReplayServer?.name ?? "-"}</strong>
                <small>
                  {connectingReplayServerId === selectedReplayServer?.id
                    ? t(language, "replay.connectingServer")
                    : selectedReplayServer?.connected
                      ? t(language, "title.connected")
                      : t(language, "replay.connectOnSelect")}
                </small>
                <ChevronDown size={14} />
              </button>
              {isReplayServerPickerOpen && (
                <div className="replay-server-list" role="listbox" aria-label={t(language, "replay.targetServer")}>
                  {props.replayTargets.map((target) => {
                    const isSelected = target.id === selectedReplayServer?.id;
                    const isConnecting = target.id === connectingReplayServerId;
                    return (
                      <button
                        key={target.id}
                        type="button"
                        className={isSelected ? "selected" : ""}
                        disabled={Boolean(connectingReplayServerId)}
                        onClick={() => void changeReplayServer(target.id)}
                      >
                        <span className={target.connected ? "replay-server-status connected" : "replay-server-status disconnected"}>
                          {target.connected ? "" : <X size={9} strokeWidth={3} />}
                        </span>
                        <strong>{target.name}</strong>
                        <small>{isConnecting ? t(language, "replay.connectingServer") : target.connected ? t(language, "title.connected") : t(language, "replay.connectOnSelect")}</small>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="replay-target-topic-picker" ref={replayTopicPickerRef}>
              <span>{t(language, "replay.targetTopic")}</span>
              <button
                type="button"
                className="replay-topic-select-trigger"
                onClick={() => setIsReplayTopicPickerOpen((current) => !current)}
                disabled={!selectedReplayServer?.connected || selectedReplayServer.topics.length === 0}
              >
                <strong>{replayTopic || t(language, "replay.noTopics")}</strong>
                {replayTopic === props.selectedMessage?.topic && selectedReplayServer?.id === props.serverId && <small>{t(language, "label.source")}</small>}
                <ChevronDown size={14} />
              </button>
              {isReplayTopicPickerOpen && (
                <div className="replay-topic-popover">
                  <label className="replay-target-search">
                    <Search size={14} />
                    <input
                      value={replayTopicQuery}
                      onChange={(event) => setReplayTopicQuery(event.target.value)}
                      placeholder={t(language, "placeholder.searchReplayTopic")}
                      autoFocus
                    />
                  </label>
                  <div className="replay-topic-list" role="listbox" aria-label={t(language, "replay.targetTopic")}>
                    {replayTopicOptions.map((topic) => (
                      <button
                        key={topic}
                        type="button"
                        className={topic === replayTopic ? "selected" : ""}
                        onClick={() => {
                          setReplayTopic(topic);
                          setIsReplayTopicPickerOpen(false);
                        }}
                      >
                        <span>{topic}</span>
                        {topic === props.selectedMessage?.topic && selectedReplayServer?.id === props.serverId && <small>{t(language, "label.source")}</small>}
                      </button>
                    ))}
                    {replayTopicOptions.length === 0 && <div className="replay-topic-empty">{t(language, "replay.noTopics")}</div>}
                  </div>
                </div>
              )}
            </div>
          </section>
          <section className="replay-route-card replay-payload-card">
            <h3>{t(language, "label.payload")}</h3>
            <label><input type="checkbox" checked={replayPayload.key} onChange={() => toggleReplayPayload("key")} /> {t(language, "label.key")}</label>
            <label><input type="checkbox" checked={replayPayload.headers} onChange={() => toggleReplayPayload("headers")} /> {t(language, "label.headers")}</label>
            <label><input type="checkbox" checked={replayPayload.value} onChange={() => toggleReplayPayload("value")} /> {t(language, "label.value")}</label>
          </section>
          <section className="replay-route-card replay-options-card">
            <h3>{t(language, "label.options")}</h3>
            <div className="replay-order-control" role="group" aria-label={t(language, "replay.order")}>
              {(["grid", "original", "timestamp"] as ReplayOrder[]).map((order) => (
                <button
                  key={order}
                  type="button"
                  className={replayOrder === order ? "active" : ""}
                  onClick={() => setReplayOrder(order)}
                  title={t(language, `replay.order.${order}.help`)}
                  aria-label={`${t(language, `replay.order.${order}`)}: ${t(language, `replay.order.${order}.help`)}`}
                >
                  {t(language, `replay.order.${order}`)}
                </button>
              ))}
            </div>
            <p className="replay-option-help">{t(language, `replay.order.${replayOrder}.help`)}</p>
            <label><input type="checkbox" checked={replayStopOnFirstError} onChange={(event) => setReplayStopOnFirstError(event.target.checked)} /> {t(language, "replay.stopOnFirstError")}</label>
            <label className="replay-delay-control">
              <input
                type="checkbox"
                checked={replayDelayEnabled}
                onChange={(event) => setReplayDelayEnabled(event.target.checked)}
              />
              <span>{t(language, "replay.delayEnabled")}</span>
              <input
                type="number"
                min={0}
                step={10}
                value={replayDelayMs}
                onChange={(event) => setReplayDelayMs(event.target.value)}
                disabled={!replayDelayEnabled}
                aria-label={t(language, "replay.delayMs")}
              />
              <span>{t(language, "replay.delayUnit")}</span>
            </label>
          </section>
          {isSingleReplay ? (
            <section className="replay-route-card replay-editor-card">
              <div className="replay-editor-card-title">
                <h3>{t(language, "replay.editPayload")}</h3>
                <details className="replay-dynamic-guide">
                  <summary>{t(language, "produce.dynamicFieldGuide")}</summary>
                  <div>
                    {replayTemplateExamples.map((example) => (
                      <p key={example.syntax}>
                        <code>{example.syntax}</code>
                        <span>{example.description}</span>
                      </p>
                    ))}
                  </div>
                </details>
              </div>
              <label>
                <span>{t(language, "label.key")}</span>
                <input
                  value={replayDraft.key}
                  onChange={(event) => setReplayDraft((current) => ({ ...current, key: event.target.value }))}
                  disabled={!replayPayload.key}
                />
              </label>
              <label>
                <span>{t(language, "label.headers")}</span>
                <textarea
                  value={replayDraft.headers}
                  onChange={(event) => setReplayDraft((current) => ({ ...current, headers: event.target.value }))}
                  disabled={!replayPayload.headers}
                  spellCheck={false}
                />
              </label>
              <label>
                <span>{t(language, "label.value")}</span>
                <textarea
                  value={replayDraft.value}
                  onChange={(event) => setReplayDraft((current) => ({ ...current, value: event.target.value }))}
                  disabled={!replayPayload.value}
                  spellCheck={false}
                />
              </label>
            </section>
          ) : (
            <section className="replay-route-card replay-batch-card">
              <h3>{t(language, "replay.batchOptions")}</h3>
              <p>{t(language, "replay.batchOriginalPayload")}</p>
              <label className="replay-dynamic-toggle">
                <input
                  type="checkbox"
                  checked={replayApplyDynamicFields}
                  onChange={(event) => setReplayApplyDynamicFields(event.target.checked)}
                />
                <span>{t(language, "replay.applyDynamicFields")}</span>
              </label>
              {replayApplyDynamicFields && (
                <div className="replay-override-panel">
                  <div className="replay-override-title">
                    <strong>{t(language, "replay.valueOverrides")}</strong>
                    <details className="replay-dynamic-guide">
                      <summary>{t(language, "produce.dynamicFieldGuide")}</summary>
                      <div>
                        {replayTemplateExamples.map((example) => (
                          <p key={example.syntax}>
                            <code>{example.syntax}</code>
                            <span>{example.description}</span>
                          </p>
                        ))}
                      </div>
                    </details>
                  </div>
                  <p>{t(language, "replay.valueOverridesHelp")}</p>
                  <div className="replay-override-body">
                    <div className="replay-override-tree-panel">
                      <input
                        className="replay-override-search"
                        value={replayOverrideSearch}
                        onChange={(event) => setReplayOverrideSearch(event.target.value)}
                        placeholder={t(language, "placeholder.searchReplayOverrideFields")}
                      />
                      <div className="replay-override-tree">
                        {Array.from(replayOverrideTree.children.values())
                          .sort((left, right) => left.name.localeCompare(right.name))
                          .map((node) => renderReplayOverrideNode(node, 0))}
                        {replayOverrideTree.children.size === 0 && (
                          <div className="replay-override-empty">{t(language, "replay.noOverrideFields")}</div>
                        )}
                      </div>
                    </div>
                    <div className="replay-override-selected-panel">
                      <div className="replay-override-list">
                        {replayFieldOverrides.map((override) => (
                          <div className="replay-override-row" key={override.id}>
                            {override.path ? (
                              <button
                                type="button"
                                className="replay-override-path"
                                title={`$.${override.path}`}
                                aria-label={`$.${override.path}`}
                              >
                                {formatMapFieldPath(override.path)}
                              </button>
                            ) : (
                              <input
                                value={override.path}
                                onChange={(event) => updateReplayFieldOverride(override.id, { path: event.target.value })}
                                placeholder={t(language, "placeholder.replayOverridePath")}
                                title={override.path ? `$.${override.path}` : t(language, "placeholder.replayOverridePath")}
                              />
                            )}
                            <input
                              value={override.value}
                              onChange={(event) => updateReplayFieldOverride(override.id, { value: event.target.value })}
                              placeholder="${timestamp}"
                              title={override.path ? `$.${override.path}` : undefined}
                            />
                            <button type="button" className="ghost icon-only" onClick={() => removeReplayFieldOverride(override.id)} title={t(language, "action.remove")}>
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button type="button" className="ghost compact replay-override-add" onClick={addReplayFieldOverride}>
                        + {t(language, "replay.addCustomOverride")}
                      </button>
                      {replayFieldOverrides.length === 0 && (
                        <div className="replay-override-empty">{t(language, "replay.noOverrideFields")}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
        <div className="modal-actions">
          <button className="ghost" onClick={() => setIsReplayOpen(false)}>{t(language, "action.cancel")}</button>
          <button className="primary" onClick={() => void submitReplay()} disabled={!selectedReplayServer?.connected || !replayTopic.trim() || (!replayPayload.key && !replayPayload.headers && !replayPayload.value)}>
            <Send size={14} /> {isSingleReplay ? t(language, "replay.send") : t(language, "replay.sendMany", { count: String(replayMessages.length) })}
          </button>
        </div>
      </section>
    </div>
  )}</>;
}
