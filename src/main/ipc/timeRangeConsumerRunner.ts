import type { Consumer } from "kafkajs";
import { toConsumedMessage } from "../messageMapper.js";
import type {
  ConsumedMessage,
  ConsumeTimeRangeRequest,
  ManualAvroSchema,
  ServerProfile
} from "../../shared/types.js";
import { runTransientConsumer } from "./transientConsumerRunner.js";

const TIME_RANGE_EMPTY_IDLE_TIMEOUT_MS = 4000;
const TIME_RANGE_ACTIVE_IDLE_TIMEOUT_MS = 900;

type TimeRangeConsumerRunnerParams = {
  consumer: Consumer;
  profile: ServerProfile;
  request: ConsumeTimeRangeRequest;
  manualSchema?: ManualAvroSchema;
  seekablePartitions: number[];
  startOffsets: Map<number, string>;
  limit: number;
};

export async function runTimeRangeConsumer({
  consumer,
  profile,
  request,
  manualSchema,
  seekablePartitions,
  startOffsets,
  limit
}: TimeRangeConsumerRunnerParams) {
  const messages: ConsumedMessage[] = [];
  const completed = new Set<number>();
  return await runTransientConsumer({
    consumer,
    topic: request.topic,
    maxDurationMs: 15000,
    idleTimeoutMs: () => messages.length > 0 ? TIME_RANGE_ACTIVE_IDLE_TIMEOUT_MS : TIME_RANGE_EMPTY_IDLE_TIMEOUT_MS,
    seek: () => {
      for (const partition of seekablePartitions) {
        consumer.seek({ topic: request.topic, partition, offset: startOffsets.get(partition) ?? "0" });
      }
    },
    accepts: ({ partition }) => seekablePartitions.includes(partition),
    onMessage: async ({ topic, partition, message }) => {
      const timestamp = Number(message.timestamp);
      if (timestamp > request.endTimestamp) {
        completed.add(partition);
        return completed.size >= seekablePartitions.length;
      }
      if (timestamp >= request.startTimestamp) {
        messages.push(await toConsumedMessage(profile, topic, partition, message, manualSchema));
      }
      return messages.length >= limit;
    },
    result: () => [...messages].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
  });
}
