import { ConfigResourceTypes, type Admin } from "kafkajs";
import type {
  BrokerConfigEntry,
  BrokerConfigUpdateRequest,
  BrokerDetail
} from "../../shared/types.js";
import { updateKafkaConfigs, withAdmin } from "../kafkaClient.js";
import { configSourceLabel } from "../kafkaUtils.js";
import { loadBrokerSummaries } from "./brokerQueries.js";

export async function loadBrokerDetail(admin: Admin, brokerId: number): Promise<BrokerDetail> {
  const brokers = await loadBrokerSummaries(admin);
  const broker = brokers.find((item) => item.nodeId === brokerId);
  if (!broker) {
    throw new Error("Broker not found.");
  }
  const configsResponse = await admin.describeConfigs({
    resources: [{ type: ConfigResourceTypes.BROKER, name: String(brokerId) }],
    includeSynonyms: true
  });
  const configResource = configsResponse.resources[0];
  const configs: BrokerConfigEntry[] = (configResource?.configEntries ?? [])
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

  return {
    broker,
    configs,
    logDirectories: [],
    logDirectoriesSupported: false
  };
}

export async function updateBrokerConfig(request: BrokerConfigUpdateRequest): Promise<BrokerDetail> {
  await updateKafkaConfigs(request.serverId, {
    type: ConfigResourceTypes.BROKER,
    name: String(request.brokerId),
    configEntries: [{ name: request.name, value: request.value }]
  }, Boolean(request.validateOnly));
  return withAdmin(request.serverId, (admin) => loadBrokerDetail(admin, request.brokerId));
}
