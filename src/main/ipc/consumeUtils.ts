import { createHash } from "node:crypto";
import type { Consumer } from "kafkajs";

export function consumeKey(serverId: string, topic: string, consumerId = "default") {
  return `${serverId}:${topic}:${consumerId}`;
}

function shortHash(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

export function kafkaToolConsumerGroupId(kind: "offset" | "time" | "live", parts: Array<string | number | undefined>) {
  return `kafkapilot-${kind}-${shortHash(parts.map((part) => String(part ?? "")).join(":"))}`;
}

export async function shutdownConsumer(consumer: Consumer) {
  try {
    await consumer.stop();
  } catch {
    // Consumer may not be running yet.
  }
  try {
    await consumer.disconnect();
  } catch {
    // Nothing else to do during shutdown.
  }
}

export function isBeforeOffset(offset: string, startOffset: string | undefined) {
  if (!startOffset || !/^\d+$/.test(offset) || !/^\d+$/.test(startOffset)) {
    return false;
  }
  return BigInt(offset) < BigInt(startOffset);
}

export function nextOffset(offset: string) {
  return (/^\d+$/.test(offset) ? BigInt(offset) + 1n : 0n).toString();
}
