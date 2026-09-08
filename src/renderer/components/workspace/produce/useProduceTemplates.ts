import { useEffect, useMemo, useState } from "react";
import type { ProduceTemplatePreference } from "../../../../shared/types";
import { useAppLanguage } from "../../../hooks/state/useAppLanguage";
import { t } from "../../../i18n";
import {
  type ProduceTemplateDraft
} from "../../../produceTemplate";
import type { ProducePanelProps } from "./producePanelTypes";
import { createTemplateId } from "./producePanelValidation";
export type ProduceTemplatesProps = Pick<ProducePanelProps, "templates" | "onKey" | "onHeaders" | "onValue" | "onIntervalConfig" | "topic" | "intervalConfig" | "onTemplates">;
export function useProduceTemplates(props: ProduceTemplatesProps, draft: ProduceTemplateDraft) {
  const language = useAppLanguage();
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateMessage, setTemplateMessage] = useState("");
  const [pendingDeleteTemplateId, setPendingDeleteTemplateId] = useState("");
  const sortedTemplates = useMemo(
    () => [...props.templates].sort((left, right) => right.updatedAt - left.updatedAt),
    [props.templates]
  );

  useEffect(() => {
    if (!selectedTemplateId) return;
    if (sortedTemplates.some((template) => template.id === selectedTemplateId)) return;
    setSelectedTemplateId("");
    setTemplateName("");
  }, [selectedTemplateId, sortedTemplates]);

  useEffect(() => {
    if (!templateMessage) return;
    const timer = window.setTimeout(() => setTemplateMessage(""), 1800);
    return () => window.clearTimeout(timer);
  }, [templateMessage]);

  useEffect(() => {
    if (!pendingDeleteTemplateId) return;
    const timer = window.setTimeout(() => setPendingDeleteTemplateId(""), 3200);
    return () => window.clearTimeout(timer);
  }, [pendingDeleteTemplateId]);

  function applyTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    const template = sortedTemplates.find((item) => item.id === templateId);
    if (!template) {
      setTemplateName("");
      return;
    }
    props.onKey(template.draft.key);
    props.onHeaders(template.draft.headers);
    props.onValue(template.draft.value);
    props.onIntervalConfig(template.intervalConfig);
    setTemplateName(template.name);
    setTemplateMessage(t(language, "produceTemplate.loaded", { name: template.name }));
  }

  function saveCurrentTemplate() {
    const name = templateName.trim();
    if (!props.topic) {
      setTemplateMessage(t(language, "label.topicRequired"));
      return;
    }
    if (!name) {
      setTemplateMessage(t(language, "produceTemplate.nameRequired"));
      return;
    }
    const now = Date.now();
    const selectedTemplate = selectedTemplateId
      ? sortedTemplates.find((item) => item.id === selectedTemplateId)
      : undefined;
    const duplicateTemplate = sortedTemplates.find((item) => item.name.trim().toLowerCase() === name.toLowerCase());
    const existingId = selectedTemplate?.id ?? duplicateTemplate?.id ?? "";
    const nextTemplate: ProduceTemplatePreference = {
      id: existingId || createTemplateId(),
      name,
      draft,
      intervalConfig: props.intervalConfig,
      updatedAt: now
    };
    const withoutCurrent = props.templates.filter((item) => item.id !== nextTemplate.id);
    props.onTemplates([...withoutCurrent, nextTemplate].sort((left, right) => right.updatedAt - left.updatedAt));
    setSelectedTemplateId(nextTemplate.id);
    setPendingDeleteTemplateId("");
    setTemplateMessage(t(language, existingId ? "produceTemplate.updated" : "produceTemplate.saved", { name }));
  }

  function deleteSelectedTemplate() {
    if (!selectedTemplateId) return;
    const selected = sortedTemplates.find((item) => item.id === selectedTemplateId);
    if (!selected) return;
    if (pendingDeleteTemplateId !== selectedTemplateId) {
      setPendingDeleteTemplateId(selectedTemplateId);
      setTemplateMessage(t(language, "produceTemplate.deleteConfirm", { name: selected.name }));
      return;
    }
    props.onTemplates(props.templates.filter((item) => item.id !== selectedTemplateId));
    setSelectedTemplateId("");
    setTemplateName("");
    setPendingDeleteTemplateId("");
    setTemplateMessage(t(language, "produceTemplate.deleted", { name: selected.name }));
  }
  return {
    selectedTemplateId,
    templateName,
    setTemplateName,
    templateMessage,
    pendingDeleteTemplateId,
    sortedTemplates,
    applyTemplate,
    saveCurrentTemplate,
    deleteSelectedTemplate
  };
}
