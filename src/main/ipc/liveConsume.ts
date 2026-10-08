import type { BrowserWindow } from "electron";
import type { Admin, Consumer } from "kafkajs";
import { createKafka } from "../kafkaClient.js";
import { toConsumedMessage } from "../messageMapper.js";
import { getProfile, readPreferences } from "../storage.js";
import type { StartConsumeRequest } from "../../shared/types.js";
import {
  consumeKey,
  isBeforeOffset,
  kafkaToolConsumerGroupId,
  shutdownConsumer
} from "./consumeUtils.js";
import type { LiveRecorderRegistry } from "./liveRecorder.js";

type StartLiveConsumeParams = {
  request: StartConsumeRequest;
  activeConsumers: Map<string, Consumer>;
  liveRecorders: LiveRecorderRegistry;
  getWindow: () => BrowserWindow | null;
  sendConsumeError: (error: unknown) => void;
  signal?: AbortSignal;
};

export async function startLiveConsume({
  request,
  activeConsumers,
  liveRecorders,
  getWindow,
  sendConsumeError,
  signal
}: StartLiveConsumeParams) {
  const consumerId = request.consumerId ?? "default";
  const key = consumeKey(request.serverId, request.topic, consumerId);
  let recorder: Awaited<ReturnType<LiveRecorderRegistry["start"]>>;
  let consumer: Consumer | undefined;
  let admin: Admin | undefined;
  const checkCanceled = () => {
    if (signal?.aborted) throw new Error("Live consume start canceled.");
  };

  try {
    checkCanceled();
    recorder = await liveRecorders.start(key, request, signal);
    checkCanceled();
    const profile = await getProfile(request.serverId);
    checkCanceled();
    const preferences = await readPreferences();
    checkCanceled();
    const manualSchema = preferences.manualAvroSchemasByServer?.[request.serverId]?.[request.topic];
    const kafka = createKafka(profile);
    const groupId = kafkaToolConsumerGroupId("live", [request.serverId, request.topic, consumerId]);
    consumer = kafka.consumer({ groupId });
    admin = kafka.admin();
    activeConsumers.set(key, consumer);
    await admin.connect();
    checkCanceled();
    const liveStartOffsets = new Map(
      (await admin.fetchTopicOffsets(request.topic))
        .filter((item) => request.partition === undefined || item.partition === request.partition)
        .map((item) => [item.partition, item.offset])
    );
    checkCanceled();
    await admin.disconnect();
    checkCanceled();
    await consumer.connect();
    checkCanceled();
    await consumer.subscribe({ topic: request.topic, fromBeginning: request.fromBeginning });
    checkCanceled();

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        if (signal?.aborted || activeConsumers.get(key) !== consumer) return;
        if (request.partition !== undefined && partition !== request.partition) {
          return;
        }
        if (isBeforeOffset(message.offset, liveStartOffsets.get(partition))) {
          return;
        }
        const payload = {
          ...await toConsumedMessage(profile, topic, partition, message, manualSchema),
          serverId: request.serverId,
          consumerId
        };
        if (signal?.aborted || activeConsumers.get(key) !== consumer) return;
        await liveRecorders.write(key, payload);
        if (signal?.aborted || activeConsumers.get(key) !== consumer) return;
        getWindow()?.webContents.send("kafka:consume-message", payload);
      }
    });
    checkCanceled();
    setTimeout(() => {
      if (signal?.aborted || activeConsumers.get(key) !== consumer) return;
      for (const [partition, offset] of liveStartOffsets) {
        try {
          consumer?.seek({ topic: request.topic, partition, offset });
        } catch {
          // The offset filter above still prevents old messages from reaching the renderer.
        }
      }
    }, 0);
  } catch (error) {
    if (activeConsumers.get(key) === consumer) activeConsumers.delete(key);
    if (recorder) liveRecorders.close(key, recorder);
    await admin?.disconnect().catch(() => undefined);
    if (consumer) await shutdownConsumer(consumer);
    if (signal?.aborted) return {};
    sendConsumeError(error);
    throw error;
  }

  return { liveRecordPath: recorder?.path };
}
