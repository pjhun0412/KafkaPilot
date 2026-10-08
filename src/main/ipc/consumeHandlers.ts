import { BrowserWindow } from "electron";
import type { Consumer } from "kafkajs";
import {
  consumeOffsetBatch,
  consumeTimeRange
} from "./consumeQueries.js";
import { startLiveConsume } from "./liveConsume.js";
import type { createLiveRecorderRegistry } from "./liveRecorder.js";
import { produceMessages } from "./produceMessages.js";
import type {
  ConsumeOffsetRequest,
  ConsumeOffsetResult,
  ConsumeTimeRangeRequest,
  ProduceRequest,
  ProducedMessage,
  StartConsumeRequest,
  StopConsumeRequest
} from "../../shared/types.js";
import { handleLogged } from "./ipcErrorBoundary.js";
import { consumeKey } from "./consumeUtils.js";

type LiveRecorderRegistry = ReturnType<typeof createLiveRecorderRegistry>;

type ConsumeHandlerParams = {
  activeConsumers: Map<string, Consumer>;
  pendingLiveStarts: Map<string, AbortController>;
  getWindow: () => BrowserWindow | null;
  liveRecorders: LiveRecorderRegistry;
  sendConsumeError: (error: unknown) => void;
  stopActiveConsumer: (request?: StopConsumeRequest) => Promise<void>;
};

export function registerConsumeHandlers({
  activeConsumers,
  pendingLiveStarts,
  getWindow,
  liveRecorders,
  sendConsumeError,
  stopActiveConsumer
}: ConsumeHandlerParams) {
  handleLogged("kafka:produce", async (_event, request: ProduceRequest): Promise<ProducedMessage[]> => {
    return produceMessages(request);
  });

  handleLogged("kafka:consume-offset", async (_event, request: ConsumeOffsetRequest): Promise<ConsumeOffsetResult> => {
    return consumeOffsetBatch(request);
  });

  handleLogged("kafka:consume-time-range", async (_event, request: ConsumeTimeRangeRequest) => {
    return consumeTimeRange(request);
  });

  handleLogged("kafka:consume-stop", async (_event, request?: StopConsumeRequest) => {
    await stopActiveConsumer(request);
  });

  handleLogged("kafka:consume-start", async (_event, request: StartConsumeRequest) => {
    const consumerId = request.consumerId ?? "default";
    const stopped = stopActiveConsumer({ serverId: request.serverId, topic: request.topic, consumerId });
    const key = consumeKey(request.serverId, request.topic, consumerId);
    const controller = new AbortController();
    pendingLiveStarts.set(key, controller);
    try {
      await stopped;
      if (controller.signal.aborted) return {};
      return await startLiveConsume({
        request,
        activeConsumers,
        liveRecorders,
        getWindow,
        sendConsumeError,
        signal: controller.signal
      });
    } finally {
      if (pendingLiveStarts.get(key) === controller) pendingLiveStarts.delete(key);
    }
  });
}
