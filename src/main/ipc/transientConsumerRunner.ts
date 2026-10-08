import type { Consumer, EachMessagePayload } from "kafkajs";
import { shutdownConsumer } from "./consumeUtils.js";

type TransientConsumerParams<T> = {
  consumer: Consumer;
  topic: string;
  maxDurationMs: number;
  idleTimeoutMs: () => number;
  seek: () => void;
  accepts: (payload: EachMessagePayload) => boolean;
  onMessage: (payload: EachMessagePayload) => Promise<boolean>;
  result: () => T;
};

// A completion request stops accepting records, then lets accepted decodes finish.
// Never await consumer.stop() from eachMessage: KafkaJS waits for it to return.
export async function runTransientConsumer<T>({
  consumer, topic, maxDurationMs, idleTimeoutMs, seek, accepts, onMessage, result
}: TransientConsumerParams<T>): Promise<T> {
  let idleTimer: NodeJS.Timeout | undefined;
  let deadlineTimer: NodeJS.Timeout | undefined;
  let seekTimer: NodeJS.Timeout | undefined;
  let removeCrashListener: (() => void) | undefined;
  let runTask: Promise<void> | undefined;
  const clearTimers = () => {
    clearTimeout(idleTimer);
    clearTimeout(deadlineTimer);
    clearTimeout(seekTimer);
  };

  try {
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: true });

    return await new Promise<T>((resolve, reject) => {
      let finishing = false;
      let started = false;
      let activeMessages = 0;
      let failure: { error: unknown } | undefined;

      const settleWhenIdle = () => {
        if (!finishing || activeMessages > 0) return;
        if (failure) reject(failure.error);
        else resolve(result());
      };
      const finish = () => {
        finishing = true;
        clearTimers();
        settleWhenIdle();
      };
      const fail = (error: unknown) => {
        failure ??= { error };
        finish();
      };
      const resetIdleTimer = () => {
        clearTimeout(idleTimer);
        if (started && !finishing && activeMessages === 0) {
          idleTimer = setTimeout(finish, idleTimeoutMs());
        }
      };

      removeCrashListener = consumer.on(consumer.events.CRASH, ({ payload }) => fail(payload.error));
      deadlineTimer = setTimeout(finish, maxDurationMs);
      runTask = consumer.run({
        eachMessage: async (payload) => {
          if (finishing || !accepts(payload)) return;
          activeMessages += 1;
          clearTimeout(idleTimer);
          try {
            if (await onMessage(payload)) finish();
          } catch (error) {
            fail(error);
          } finally {
            activeMessages -= 1;
            if (finishing) settleWhenIdle();
            else resetIdleTimer();
          }
        }
      });
      void runTask.then(() => {
        started = true;
        resetIdleTimer();
      }, fail);

      seekTimer = setTimeout(() => {
        if (finishing) return;
        try {
          seek();
          resetIdleTimer();
        } catch (error) {
          fail(error);
        }
      }, 0);
    });
  } finally {
    clearTimers();
    removeCrashListener?.();
    // A late startup must not revive a consumer after it has been disconnected.
    await runTask?.catch(() => {});
    await shutdownConsumer(consumer);
  }
}
