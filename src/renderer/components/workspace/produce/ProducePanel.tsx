import { Braces, Eye, Play, Save, Send, Square, Trash2 } from "lucide-react";
import { t } from "../../../i18n";
import {
  formatProduceElapsed,
  getProduceTemplateExamples
} from "../../../produceTemplate";
import type { ProducePanelProps } from "./producePanelTypes";
import { formatTemplateIssue, tryPrettyJson } from "./producePanelValidation";
import { useProducePanelController } from "./useProducePanelController";
import { useProduceTemplates } from "./useProduceTemplates";
export function ProducePanel(props: ProducePanelProps) {
  const controller = useProducePanelController(props);
  const {
    language,
    intervalError,
    isConfirmingInterval,
    setIsConfirmingInterval,
    isRenderedPreviewOpen,
    setIsRenderedPreviewOpen,
    durationText,
    intervalMs,
    mode,
    stopMode,
    totalCount,
    intervalPlan,
    valueIssue,
    renderedPreview,
    templateIssues,
    updateIntervalConfig,
    startIntervalProduce,
    sendSingleProduce,
    requestIntervalStart
  } = controller;
  const {
    selectedTemplateId,
    templateName,
    setTemplateName,
    templateMessage,
    pendingDeleteTemplateId,
    sortedTemplates,
    applyTemplate,
    saveCurrentTemplate,
    deleteSelectedTemplate
  } = useProduceTemplates(props, controller.draft);
  return (
    <section className="panel produce-panel">
      <div className="section-title">
        <h2>{t(language, "label.produce")}</h2>
        <span>{props.topic || t(language, "label.topicRequired")}</span>
      </div>
      <div className="produce-mode-row">
        <div className="segmented-control">
          <button className={mode === "single" ? "active" : ""} type="button" onClick={() => updateIntervalConfig({ mode: "single" })}>{t(language, "label.single")}</button>
          <button className={mode === "interval" ? "active" : ""} type="button" onClick={() => updateIntervalConfig({ mode: "interval" })}>{t(language, "label.interval")}</button>
        </div>
        {mode === "interval" && (
          <div className="produce-interval-controls">
            <label>
              {t(language, "label.every")}
              <input
                type="number"
                min={100}
                step={100}
                value={intervalMs}
                onChange={(event) => updateIntervalConfig({ intervalMs: Number(event.target.value) })}
              />
              ms
            </label>
            <label>
              {t(language, "label.stopBy")}
              <select
                className="produce-interval-stop-select"
                value={stopMode}
                onChange={(event) => updateIntervalConfig({ stopMode: event.target.value as "count" | "duration" })}
              >
                <option value="count">{t(language, "label.count")}</option>
                <option value="duration">{t(language, "label.duration")}</option>
              </select>
            </label>
            {stopMode === "count" ? (
              <label>
                {t(language, "label.count")}
                <input
                  type="number"
                  min={1}
                  max={100000}
                  value={totalCount}
                  onChange={(event) => updateIntervalConfig({ totalCount: Number(event.target.value) })}
                />
              </label>
            ) : (
              <label>
                {t(language, "label.duration")}
                <input
                  className="produce-interval-duration-input"
                  type="text"
                  value={durationText}
                  onChange={(event) => updateIntervalConfig({ durationText: event.target.value })}
                  placeholder="5m"
                  title={t(language, "produce.hintDuration")}
                />
              </label>
            )}
            {props.intervalState.isRunning && (
              <span className="produce-interval-status">
                {props.intervalState.sentCount}{stopMode === "count" ? `/${totalCount}` : ""}
              </span>
            )}
          </div>
        )}
        {mode === "single" ? (
          <button className="primary compact produce-primary-action" onClick={() => void sendSingleProduce()} disabled={!props.topic}>
            <Send size={15} /> {t(language, "action.sendMessage")}
          </button>
        ) : (
          <button
            className={props.intervalState.isRunning ? "danger compact produce-primary-action" : "primary compact produce-primary-action"}
            type="button"
            onClick={props.intervalState.isRunning ? props.onStopInterval : requestIntervalStart}
            disabled={!props.topic}
          >
            {props.intervalState.isRunning ? <Square size={15} /> : <Play size={15} />}
            {props.intervalState.isRunning ? t(language, "action.stopInterval") : t(language, "action.startInterval")}
          </button>
        )}
        <div className="produce-template-toolbar">
          <span className="produce-template-toolbar-label">{t(language, "produceTemplate.template")}</span>
          <select value={selectedTemplateId} onChange={(event) => applyTemplate(event.target.value)} aria-label={t(language, "produceTemplate.select")}>
            <option value="">{t(language, "produceTemplate.select")}</option>
            {sortedTemplates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
          <input
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            placeholder={t(language, "produceTemplate.namePlaceholder")}
          />
          <button type="button" className="ghost compact icon-only" onClick={saveCurrentTemplate} title={t(language, "produceTemplate.save")}>
            <Save size={13} />
          </button>
          <button
            type="button"
            className="ghost compact icon-only danger-text"
            onClick={deleteSelectedTemplate}
            disabled={!selectedTemplateId}
            title={pendingDeleteTemplateId === selectedTemplateId ? t(language, "produceTemplate.deleteConfirmShort") : t(language, "produceTemplate.delete")}
          >
            <Trash2 size={13} />
          </button>
          {templateMessage && <span className="produce-template-message">{templateMessage}</span>}
        </div>
      </div>
      {mode === "interval" && (
        <div className="produce-interval-top-panel">
          <div className="produce-interval-warning">
            {t(language, "produce.intervalWarning")}
          </div>
          {isConfirmingInterval && (
            <div className="produce-interval-confirm">
              <strong>{t(language, "produce.confirmTitle")}</strong>
              <span>{t(language, "produce.confirmTopic", { topic: props.topic })}</span>
              <span>{t(language, "produce.confirmEvery", { every: String(intervalPlan.delay) })}</span>
              <span>
                {stopMode === "count"
                  ? t(language, "produce.confirmCount", { count: String(intervalPlan.count) })
                  : t(language, "produce.confirmDuration", { duration: durationText })}
              </span>
              <span>{t(language, "produce.confirmEstimated", { count: String(intervalPlan.estimatedMax) })}</span>
              <div className="produce-interval-confirm-actions">
                <button type="button" className="ghost compact" onClick={() => setIsConfirmingInterval(false)}>{t(language, "action.cancel")}</button>
                <button type="button" className="primary compact" onClick={() => void startIntervalProduce()}>{t(language, "produce.confirmStart")}</button>
              </div>
            </div>
          )}
          {props.intervalState.isRunning && (
            <div className="produce-interval-running">
              <span>Running</span>
              <span>{props.topic}</span>
              <span>{props.intervalState.sentCount} sent</span>
              <span>{formatProduceElapsed(Date.now() - props.intervalState.startedAt)}</span>
            </div>
          )}
          {(intervalError || props.intervalState.error) && <div className="produce-interval-error">{intervalError || props.intervalState.error}</div>}
        </div>
      )}
      {mode === "single" && intervalError && <div className="produce-interval-error">{intervalError}</div>}
      {props.hasAvroSchema && (
        <div className="produce-schema-notice">
          <Braces size={15} />
          {t(language, "label.avroSerializationEnabled")} ({props.avroEncoding === "confluent" ? "Confluent" : "Raw"})
        </div>
      )}
      <label>{t(language, "label.key")}<input value={props.keyText} onChange={(event) => props.onKey(event.target.value)} placeholder={t(language, "placeholder.optionalKey")} /></label>
      <label>{t(language, "label.headers")}<textarea className="headers-editor" value={props.headers} onChange={(event) => props.onHeaders(event.target.value)} placeholder="{ }" /></label>
      <div className="produce-value-field">
        <div className="produce-value-label-row">
          <span>{t(language, "label.value")}</span>
          <span className="produce-value-actions">
            <details className="produce-template-guide produce-template-guide-popover">
              <summary>{t(language, "produce.dynamicFieldGuide")}</summary>
              <div className="produce-template-examples">
                {getProduceTemplateExamples().map((example) => (
                  <div key={example.syntax} className="produce-template-example">
                    <code>{example.syntax}</code>
                    <span>{example.description}</span>
                  </div>
                ))}
              </div>
            </details>
            <button
              type="button"
              className={isRenderedPreviewOpen ? "ghost compact active" : "ghost compact"}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsRenderedPreviewOpen((current) => !current);
              }}
              title={t(language, "produce.renderPreview")}
            >
              <Eye size={13} /> {t(language, "label.preview")}
            </button>
          </span>
        </div>
        <div className={isRenderedPreviewOpen ? "produce-value-editor-row preview-open" : "produce-value-editor-row"}>
          <textarea
            className={valueIssue ? "invalid" : undefined}
            value={props.value}
            onChange={(event) => props.onValue(event.target.value)}
          />
          {isRenderedPreviewOpen && (
            <div className="produce-render-preview">
              <div className="produce-render-preview-title">
                <span>{t(language, "produce.renderedPreview")}</span>
                <button
                  type="button"
                  className="ghost compact"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setIsRenderedPreviewOpen(false);
                  }}
                >
                  {t(language, "title.close")}
                </button>
              </div>
              {templateIssues.length > 0 && (
                <div className="produce-template-issues">
                  <strong>{t(language, "produce.dynamicFieldIssues")}</strong>
                  {templateIssues.map((issue, index) => (
                    <span key={`${issue.field}-${issue.token}-${index}`}>
                      {formatTemplateIssue(issue, language)}
                    </span>
                  ))}
                </div>
              )}
              <div className="produce-render-preview-grid">
                <div className="produce-render-preview-field">
                  <span>{t(language, "label.key")}</span>
                  <pre><code>{renderedPreview.key || t(language, "label.noKey")}</code></pre>
                </div>
                <div className="produce-render-preview-field">
                  <span>{t(language, "label.headers")}</span>
                  <pre><code>{renderedPreview.headers.trim() ? tryPrettyJson(renderedPreview.headers) : "{ }"}</code></pre>
                </div>
                <div className="produce-render-preview-field">
                  <span>{t(language, "label.value")}</span>
                  <pre><code>{renderedPreview.value ? tryPrettyJson(renderedPreview.value) : t(language, "label.emptyValue")}</code></pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {valueIssue && (
        <div className="produce-value-error">
          <span>{valueIssue.message}</span>
          {valueIssue.line > 0 && <span>Line {valueIssue.line}, column {valueIssue.column}</span>}
          {valueIssue.snippet && (
            <pre className="produce-error-snippet">
              <code>{valueIssue.snippet}</code>
              <code>{`${" ".repeat(valueIssue.caretColumn)}^`}</code>
            </pre>
          )}
        </div>
      )}
    </section>
  );
}
