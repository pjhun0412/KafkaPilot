import { useEffect, useMemo, useState } from "react";
import type { ConsumedMessage } from "../../../../shared/types";
import type { ConsumePanelProps } from "./consumePanelTypes";
import { getMessageRowKey } from "./MessageGrid";

export type ConsumeMessageSelectionProps = Pick<ConsumePanelProps, "messages">;
export function useConsumeMessageSelection(props: ConsumeMessageSelectionProps) {
  const [checkedMessageKeys, setCheckedMessageKeys] = useState<Set<string>>(() => new Set());
  const checkedMessages = useMemo(
    () => props.messages.filter((message) => checkedMessageKeys.has(getMessageRowKey(message))),
    [checkedMessageKeys, props.messages]
  );

  useEffect(() => {
    setCheckedMessageKeys((current) => {
      if (current.size === 0) return current;
      const availableKeys = new Set(props.messages.map(getMessageRowKey));
      const next = new Set([...current].filter((key) => availableKeys.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [props.messages]);

  function toggleMessageChecked(message: ConsumedMessage) {
    const key = getMessageRowKey(message);
    setCheckedMessageKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function toggleVisibleChecked(messages: ConsumedMessage[], checked: boolean) {
    setCheckedMessageKeys((current) => {
      const next = new Set(current);
      messages.forEach((message) => {
        const key = getMessageRowKey(message);
        if (checked) {
          next.add(key);
        } else {
          next.delete(key);
        }
      });
      return next;
    });
  }
  return { checkedMessageKeys, checkedMessages, toggleMessageChecked, toggleVisibleChecked };
}
