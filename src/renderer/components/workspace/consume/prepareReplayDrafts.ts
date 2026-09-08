import type { ConsumedMessage } from "../../../../shared/types";
import { t } from "../../../i18n";
import { renderProduceTemplateDraft, validateProduceTemplateDraft } from "../../../produceTemplate";
import type { ReplayDraft, ReplayPayloadOptions } from "../../../replayTypes";
import { parseProduceHeaders, validateJsonLikeValue } from "../../../utils";
import { createReplayDraft, getReplayOrderedMessages, parseReplayOverrideValue, setValueAtPath, type ReplayFieldOverride, type ReplayOrder } from "./replayDrafts";

type ReplayPreparation = {
  messages: ConsumedMessage[];
  order: ReplayOrder;
  payload: ReplayPayloadOptions;
  editedDraft: ReplayDraft;
  applyDynamicFields: boolean;
  fieldOverrides: ReplayFieldOverride[];
  language: Parameters<typeof t>[0];
};

type PreparedReplay =
  | { ok: true; orderedMessages: ConsumedMessage[]; drafts: ReplayDraft[]; }
  | { ok: false; error: string; };

// Validate the entire batch before the caller starts any Kafka writes.
export function prepareReplayDrafts({ messages, order, payload, editedDraft, applyDynamicFields, fieldOverrides, language }: ReplayPreparation): PreparedReplay {
  const isSingleReplay = messages.length <= 1;
  const orderedMessages = getReplayOrderedMessages(messages, order);
  const drafts: ReplayDraft[] = [];
  const activeOverrides = fieldOverrides
    .map((override) => ({ ...override, path: override.path.trim() }))
    .filter((override) => override.path);
  for (let index = 0; index < orderedMessages.length; index += 1) {
    const message = orderedMessages[index];
    if (!message) continue;
    if (isSingleReplay) {
      const draft = {
        key: payload.key ? editedDraft.key : "",
        headers: payload.headers ? editedDraft.headers : "{}",
        value: payload.value ? editedDraft.value : ""
      };
      const templateIssue = validateProduceTemplateDraft(draft)[0];
      if (templateIssue) {
        return { ok: false, error: `${templateIssue.token}: ${templateIssue.message}` };
      }
      drafts.push(renderProduceTemplateDraft(draft, 1));
    } else {
      let draft = createReplayDraft(message, payload);
      if (applyDynamicFields) {
        for (const override of activeOverrides) {
          const templateIssue = validateProduceTemplateDraft({ key: "", headers: "{}", value: override.value })[0];
          if (templateIssue) {
            return { ok: false, error: `${templateIssue.token}: ${templateIssue.message}` };
          }
        }
        if (payload.value && activeOverrides.length > 0) {
          try {
            const valueObject = JSON.parse(draft.value) as unknown;
            for (const override of activeOverrides) {
              const renderedOverride = renderProduceTemplateDraft({ key: "", headers: "{}", value: override.value }, index + 1).value;
              const applied = setValueAtPath(valueObject, override.path.replace(/^value\./, ""), parseReplayOverrideValue(renderedOverride));
              if (!applied) {
                return { ok: false, error: t(language, "replay.invalidOverridePath", { path: override.path }) };
              }
            }
            draft = { ...draft, value: JSON.stringify(valueObject, null, 2) };
          } catch {
            return { ok: false, error: t(language, "replay.overrideRequiresJson") };
          }
        }
        draft = renderProduceTemplateDraft(draft, index + 1);
      }
      drafts.push(draft);
    }
  }
  for (const draft of drafts) {
    const valueError = validateJsonLikeValue(draft.value);
    if (valueError) {
      return { ok: false, error: valueError };
    }
    const headers = parseProduceHeaders(draft.headers);
    if (typeof headers === "string") {
      return { ok: false, error: headers };
    }
  }
  return { ok: true, orderedMessages, drafts };
}
