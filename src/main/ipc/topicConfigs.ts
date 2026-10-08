import { ConfigResourceTypes, type Admin } from "kafkajs";
import type {
  TopicConfigEntry,
  TopicConfigUpdateRequest
} from "../../shared/types.js";
import { configSourceLabel } from "../kafkaUtils.js";
import { updateKafkaConfigs, withAdmin } from "../kafkaClient.js";

export async function loadTopicConfigs(admin: Admin, topicName: string): Promise<TopicConfigEntry[]> {
  const configsResponse = await admin.describeConfigs({
    resources: [{ type: ConfigResourceTypes.TOPIC, name: topicName }],
    includeSynonyms: true
  });
  const configResource = configsResponse.resources[0];
  if (!configResource) return [];
  if (configResource.errorMessage) {
    throw new Error(configResource.errorMessage);
  }
  return (configResource.configEntries ?? [])
    .map((entry) => ({
      name: entry.configName,
      value: entry.isSensitive ? "" : entry.configValue ?? "",
      source: configSourceLabel(entry.configSource),
      isDefault: entry.isDefault,
      isSensitive: entry.isSensitive,
      readOnly: entry.readOnly,
      synonyms: (entry.configSynonyms ?? []).map((synonym) => ({
        name: synonym.configName,
        value: entry.isSensitive ? "" : synonym.configValue ?? "",
        source: configSourceLabel(synonym.configSource)
      }))
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function updateTopicConfigs(request: TopicConfigUpdateRequest): Promise<TopicConfigEntry[]> {
  const entries = request.entries
    .map((entry) => ({ name: entry.name.trim(), value: entry.value }))
    .filter((entry) => entry.name);
  if (entries.length === 0) {
    throw new Error("No topic settings to change.");
  }
  await updateKafkaConfigs(request.serverId, {
    type: ConfigResourceTypes.TOPIC,
    name: request.topic,
    configEntries: entries
  }, Boolean(request.validateOnly));
  return withAdmin(request.serverId, (admin) => loadTopicConfigs(admin, request.topic));
}
