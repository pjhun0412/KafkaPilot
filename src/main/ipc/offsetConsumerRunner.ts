import type { Consumer } from "kafkajs";
import { toConsumedMessage } from "../messageMapper.js";
import type {
  ConsumedMessage,
  ConsumeOffsetRequest,
  ManualAvroSchema,
  ServerProfile
} from "../../shared/types.js";
import { runTransientConsumer } from "./transientConsumerRunner.js";
import type { OffsetWindow } from "./offsetWindow.js";

const OFFSET_CONSUME_EMPTY_IDLE_TIMEOUT_MS = 3500;
const OFFSET_CONSUME_ACTIVE_IDLE_TIMEOUT_MS = 700;

type OffsetConsumerRunnerParams = {
  consumer: Consumer;
  profile: ServerProfile;
  request: ConsumeOffsetRequest;
  manualSchema?: ManualAvroSchema;
  offsetWindow: OffsetWindow;
  limit: number;
};

export async function runOffsetConsumer({
  consumer,
  profile,
  request,
  manualSchema,
  offsetWindow,
  limit
}: OffsetConsumerRunnerParams) {
  const messages: ConsumedMessage[] = [];
  return await runTransientConsumer({
    consumer,
    topic: request.topic,
    maxDurationMs: Math.max(8000, Math.min(120000, limit * 10)),
    idleTimeoutMs: () => messages.length > 0 ? OFFSET_CONSUME_ACTIVE_IDLE_TIMEOUT_MS : OFFSET_CONSUME_EMPTY_IDLE_TIMEOUT_MS,
    seek: () => consumer.seek({ topic: request.topic, partition: request.partition, offset: offsetWindow.seekOffset }),
    accepts: ({ partition }) => partition === request.partition,
    onMessage: async ({ topic, partition, message }) => {
      if (offsetWindow.endExclusive !== null && /^\d+$/.test(message.offset) && BigInt(message.offset) >= offsetWindow.endExclusive) {
        return true;
      }
      messages.push(await toConsumedMessage(profile, topic, partition, message, manualSchema));
      return messages.length >= offsetWindow.expectedMessageCount;
    },
    result: () => ({
      messages: [...messages],
      endOffsetExclusive: offsetWindow.endExclusive?.toString()
    })
  });
}
