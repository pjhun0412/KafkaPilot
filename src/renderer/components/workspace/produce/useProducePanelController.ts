import { useEffect, useMemo, useState } from "react";
import { useAppLanguage } from "../../../hooks/state/useAppLanguage";
import {
  renderProduceTemplateDraft,
  validateProduceTemplateDraft,
  type ProduceTemplateDraft
} from "../../../produceTemplate";
import { parseProduceHeaders } from "../../../utils";
import type { ProduceIntervalConfig, ProducePanelProps } from "./producePanelTypes";
import { createProduceIntervalPlan, formatTemplateIssue, getIntervalConfigurationIssue, getJsonValueIssue } from "./producePanelValidation";
export function useProducePanelController(props: ProducePanelProps) {
  const language = useAppLanguage();
  const [intervalError, setIntervalError] = useState("");
  const [isConfirmingInterval, setIsConfirmingInterval] = useState(false);
  const [isRenderedPreviewOpen, setIsRenderedPreviewOpen] = useState(false);
  const { durationText, intervalMs, mode, stopMode, totalCount } = props.intervalConfig;
  const draft = useMemo<ProduceTemplateDraft>(() => ({
    key: props.keyText,
    headers: props.headers,
    value: props.value
  }), [props.headers, props.keyText, props.value]);

  const intervalPlan = useMemo(() => createProduceIntervalPlan(props.intervalConfig), [durationText, intervalMs, stopMode, totalCount]);
  const valueIssue = useMemo(() => {
    return getJsonValueIssue(renderProduceTemplateDraft(draft, 1).value);
  }, [draft]);

  const renderedPreview = useMemo(
    () => renderProduceTemplateDraft(draft, 1),
    [draft]
  );

  const templateIssues = useMemo(() => validateProduceTemplateDraft(draft), [draft]);

  useEffect(() => {
    setIsConfirmingInterval(false);
  }, [mode, props.topic]);

  useEffect(() => {
    setIsRenderedPreviewOpen(false);
  }, [props.topic]);

  function updateIntervalConfig(patch: Partial<ProduceIntervalConfig>) {
    props.onIntervalConfig((current) => ({ ...current, ...patch }));
  }

  async function startIntervalProduce() {
    const issue = getIntervalConfigurationIssue(props.intervalConfig, templateIssues, language);
    if (issue) {
      setIntervalError(issue);
      return;
    }
    setIsConfirmingInterval(false);
    setIntervalError("");
    await props.onStartInterval({
      count: intervalPlan.count,
      draft,
      durationText,
      intervalMs: intervalPlan.delay,
      stopMode
    });
  }

  async function sendSingleProduce() {
    if (templateIssues.length > 0) {
      setIntervalError(formatTemplateIssue(templateIssues[0], language));
      return;
    }
    const renderedDraft = renderProduceTemplateDraft(draft, 1);
    const renderedValueIssue = getJsonValueIssue(renderedDraft.value);
    if (renderedValueIssue) {
      setIntervalError(`${renderedValueIssue.message} Check the rendered message. String tokens like \${date:yyyy-MM-dd HH:mm:ss} must be wrapped in quotes inside JSON.`);
      return;
    }
    const headers = parseProduceHeaders(renderedDraft.headers);
    if (typeof headers === "string") {
      setIntervalError(headers);
      return;
    }
    setIntervalError("");
    await props.onProduceDraft(renderedDraft);
  }

  function requestIntervalStart() {
    const issue = getIntervalConfigurationIssue(props.intervalConfig, templateIssues, language);
    if (issue) {
      setIntervalError(issue);
      return;
    }
    if (valueIssue) {
      setIntervalError(`${valueIssue.message} Check the first rendered message. String tokens like \${date:yyyy-MM-dd HH:mm:ss} must be wrapped in quotes inside JSON.`);
      return;
    }
    const renderedDraft = renderProduceTemplateDraft(draft, 1);
    const headers = parseProduceHeaders(renderedDraft.headers);
    if (typeof headers === "string") {
      setIntervalError(headers);
      return;
    }
    setIntervalError("");
    setIsConfirmingInterval(true);
  }
  return {
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
    requestIntervalStart,
    draft
  };
}
