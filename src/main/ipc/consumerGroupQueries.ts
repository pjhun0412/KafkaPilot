import type {
  ConsumerGroupOffsetResetRequest,
  ConsumerGroupOffsetResetResult,
  ConsumerGroupMutationRequest,
  ConsumerGroupSummary
} from "../../shared/types.js";
import { withAdmin } from "../kafkaClient.js";
import { writeAppLog } from "../logger.js";
import { buildConsumerGroupSummaries } from "./consumerGroupSummaries.js";
export { loadConsumerGroupLag } from "./consumerGroupLag.js";

const RESET_OFFSETS_TIMEOUT_MS = 15_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function listConsumerGroups(serverId: string): Promise<ConsumerGroupSummary[]> {
  return withAdmin(serverId, async (admin) => {
    const groups = await admin.listGroups();
    return buildConsumerGroupSummaries(admin, groups.groups);
  });
}

export async function deleteConsumerGroups(request: ConsumerGroupMutationRequest): Promise<void> {
  const groupIds = request.groupIds.map((groupId) => groupId.trim()).filter(Boolean);
  if (groupIds.length === 0) {
    throw new Error("No consumer groups selected.");
  }
  await withAdmin(request.serverId, async (admin) => {
    await admin.deleteGroups(groupIds);
  });
}

export async function resetConsumerGroupOffsets(request: ConsumerGroupOffsetResetRequest): Promise<ConsumerGroupOffsetResetResult> {
  const groupId = request.groupId.trim();
  const topic = request.topic.trim();
  const partitions = [...new Set(request.partitions)].sort((left, right) => left - right);
  await writeAppLog("info", "kafka.consumerGroupReset", "Reset offsets requested.", {
    groupId,
    mode: request.mode,
    partitions,
    serverId: request.serverId,
    timestamp: request.timestamp,
    topic
  });
  if (!groupId) throw new Error("Consumer group is required.");
  if (!topic) throw new Error("Topic is required.");
  if (partitions.length === 0) throw new Error("At least one partition is required.");

  return withAdmin(request.serverId, async (admin) => {
    const describedGroups = await admin.describeGroups([groupId]);
    const group = describedGroups.groups.find((item) => item.groupId === groupId);
    if (!group || !group.state) {
      throw new Error("Unable to verify consumer group state. Offsets were not reset.");
    }
    const state = group.state.toLowerCase();
    await writeAppLog("info", "kafka.consumerGroupReset", "Consumer group state resolved.", {
      groupId,
      members: group?.members.length ?? 0,
      state: group?.state ?? "",
      topic
    });
    if (state === "stable" || (group?.members.length ?? 0) > 0) {
      throw new Error("Consumer group is active. Stop the application using this group before resetting offsets.");
    }

    const topicOffsets = await admin.fetchTopicOffsets(topic);
    const offsetsByPartition = new Map(topicOffsets.map((offset) => [offset.partition, offset]));
    let timestampOffsetsByPartition = new Map<number, string>();
    if (request.mode === "timestamp") {
      if (typeof request.timestamp !== "number" || !Number.isFinite(request.timestamp)) {
        throw new Error("Timestamp is required.");
      }
      const timestampOffsets = await admin.fetchTopicOffsetsByTimestamp(topic, request.timestamp);
      timestampOffsetsByPartition = new Map(timestampOffsets.map((offset) => [offset.partition, offset.offset]));
    }

    const targets = partitions.map((partition) => {
      const topicOffset = offsetsByPartition.get(partition);
      if (!topicOffset) {
        throw new Error(`Partition ${partition} was not found in ${topic}.`);
      }

      let offset: string;
      if (request.mode === "earliest") {
        offset = topicOffset.low;
      } else if (request.mode === "latest") {
        offset = topicOffset.high;
      } else if (request.mode === "specific") {
        offset = request.offset?.trim() ?? "";
        if (!/^\d+$/.test(offset)) {
          throw new Error("A numeric offset is required.");
        }
      } else {
        const timestampOffset = timestampOffsetsByPartition.get(partition);
        offset = timestampOffset && timestampOffset !== "-1" ? timestampOffset : topicOffset.high;
      }

      return { partition, offset };
    });

    await writeAppLog("info", "kafka.consumerGroupReset", "Applying target offsets.", {
      groupId,
      targets,
      topic
    });
    try {
      await withTimeout(
        admin.setOffsets({ groupId, topic, partitions: targets }),
        RESET_OFFSETS_TIMEOUT_MS,
        "Timed out while resetting consumer group offsets."
      );
    } catch (error) {
      await writeAppLog("error", "kafka.consumerGroupReset", "Failed to apply target offsets.", error);
      throw error;
    }
    await writeAppLog("info", "kafka.consumerGroupReset", "Reset offsets completed.", {
      groupId,
      targets,
      topic
    });
    return { groupId, topic, partitions: targets };
  });
}
