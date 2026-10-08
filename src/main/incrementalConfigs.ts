import { ConfigResourceTypes, type Kafka } from "kafkajs";

export interface IncrementalConfigResource {
  type: number;
  name: string;
  configEntries: { name: string; value: string }[];
}

interface Encoder {
  writeInt8(value: number): Encoder;
  writeString(value: string | null): Encoder;
  writeArray(values: Encoder[]): Encoder;
  writeBoolean(value: boolean): Encoder;
}

interface Decoder {
  readInt32(): number;
  readInt16(): number;
  readInt8(): number;
  readString(): string | null;
  readArray<T>(read: (decoder: Decoder) => T): T[];
}

interface ConfigResponse {
  clientSideThrottleTime: number;
  resources: {
    errorCode: number;
    errorMessage: string | null;
    resourceType: number;
    resourceName: string | null;
  }[];
}

interface ConfigProtocol {
  request: { apiKey: number; apiVersion: number; apiName: string; encode(): Promise<Encoder> };
  response: { decode(raw: Buffer): Promise<ConfigResponse>; parse(data: ConfigResponse): Promise<void> };
  logResponseError: false;
}

interface ConfigBroker {
  apiVersions(): Promise<Record<number, { minVersion: number; maxVersion: number }>>;
  connectionPool: { send(protocol: ConfigProtocol): Promise<void> };
}

interface ConfigCluster {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  refreshMetadata(): Promise<void>;
  findBroker(target: { nodeId: number }): Promise<ConfigBroker>;
  findControllerBroker(): Promise<ConfigBroker>;
}

const API_KEY = 44;
const API_VERSION = 0;
const SET_OPERATION = 0;
const SUPPORTED_KAFKAJS_VERSION = "2.2.4";

function createConfigProtocol(resource: IncrementalConfigResource, validateOnly: boolean): ConfigProtocol {
  const KafkaEncoder = require("kafkajs/src/protocol/encoder") as new () => Encoder;
  const KafkaDecoder = require("kafkajs/src/protocol/decoder") as new (raw: Buffer) => Decoder;
  const { createErrorFromCode } = require("kafkajs/src/protocol/error") as {
    createErrorFromCode(code: number): Error;
  };
  // Apache IncrementalAlterConfigs v0: operation byte precedes each nullable value.
  // https://github.com/apache/kafka/blob/trunk/clients/src/main/resources/common/message/IncrementalAlterConfigsRequest.json
  return {
    request: {
      apiKey: API_KEY,
      apiVersion: API_VERSION,
      apiName: "IncrementalAlterConfigs",
      encode: async () => new KafkaEncoder().writeArray([
        new KafkaEncoder().writeInt8(resource.type).writeString(resource.name).writeArray(
          resource.configEntries.map(({ name, value }) =>
            new KafkaEncoder().writeString(name).writeInt8(SET_OPERATION).writeString(value))
        )
      ]).writeBoolean(validateOnly)
    },
    response: {
      decode: async (raw) => {
        const decoder = new KafkaDecoder(raw);
        return {
          clientSideThrottleTime: decoder.readInt32(),
          resources: decoder.readArray((entry) => ({
            errorCode: entry.readInt16(),
            errorMessage: entry.readString(),
            resourceType: entry.readInt8(),
            resourceName: entry.readString()
          }))
        };
      },
      parse: async (data) => {
        const result = data.resources[0];
        if (data.resources.length !== 1 || !result || result.resourceType !== resource.type || result.resourceName !== resource.name) {
          throw new Error("Invalid IncrementalAlterConfigs response for the requested resource.");
        }
        if (result.errorCode !== 0) {
          // Broker error messages can contain sensitive configuration values.
          throw createErrorFromCode(result.errorCode);
        }
      }
    },
    logResponseError: false
  };
}

function validateResource(resource: IncrementalConfigResource): IncrementalConfigResource {
  if (![ConfigResourceTypes.TOPIC, ConfigResourceTypes.BROKER].includes(resource.type)
    || typeof resource.name !== "string" || !resource.name.trim()) {
    throw new Error("Invalid configuration resource.");
  }
  if (resource.type === ConfigResourceTypes.BROKER
    && (!/^(0|[1-9]\d*)$/.test(resource.name) || Number(resource.name) > 2_147_483_647)) {
    throw new Error("Invalid broker configuration resource.");
  }
  if (!Array.isArray(resource.configEntries) || resource.configEntries.length === 0) {
    throw new Error("No settings to change.");
  }
  const names = new Set<string>();
  const configEntries = resource.configEntries.map((entry) => {
    if (typeof entry.name !== "string" || !entry.name.trim() || typeof entry.value !== "string") {
      throw new Error("Invalid configuration entry.");
    }
    const name = entry.name.trim();
    if (names.has(name)) throw new Error("Duplicate configuration entry.");
    names.add(name);
    return { name, value: entry.value };
  });
  return { type: resource.type, name: resource.name, configEntries };
}

/**
 * KafkaJS 2.2.4 exposes only full-replacement AlterConfigs. This version-guarded
 * adapter reuses its authenticated transport for Kafka's incremental SET API.
 * Never fall back to AlterConfigs or a read/merge/write: both can lose settings.
 */
export async function alterConfigsIncrementally(kafka: Kafka, input: IncrementalConfigResource, validateOnly = false): Promise<void> {
  const resource = validateResource(input);
  const { version } = require("kafkajs/package.json") as { version: string };
  if (version !== SUPPORTED_KAFKAJS_VERSION) {
    throw new Error("Safe configuration updates require the verified KafkaJS 2.2.4 adapter.");
  }
  const factoryKey = Object.getOwnPropertySymbols(kafka).find((key) => key.description === "private:Kafka:createCluster");
  const factory: unknown = factoryKey ? Reflect.get(kafka, factoryKey) : undefined;
  if (typeof factory !== "function") {
    throw new Error("Safe configuration updates are unavailable in this KafkaJS client.");
  }
  const cluster = factory.call(kafka, { metadataMaxAge: 0, allowAutoTopicCreation: false }) as ConfigCluster;
  if (!cluster || [cluster.connect, cluster.disconnect, cluster.refreshMetadata, cluster.findBroker, cluster.findControllerBroker]
    .some((method) => typeof method !== "function")) {
    throw new Error("Safe configuration updates are unavailable in this KafkaJS transport.");
  }
  try {
    await cluster.connect();
    await cluster.refreshMetadata();
    const broker = resource.type === ConfigResourceTypes.BROKER
      ? await cluster.findBroker({ nodeId: Number(resource.name) })
      : await cluster.findControllerBroker();
    if (!broker || typeof broker.apiVersions !== "function" || typeof broker.connectionPool?.send !== "function") {
      throw new Error("Safe configuration updates are unavailable in this KafkaJS broker transport.");
    }
    // Query the actual destination rather than trusting a different seed broker's versions.
    const supported = (await broker.apiVersions())[API_KEY];
    if (!supported || supported.minVersion > API_VERSION || supported.maxVersion < API_VERSION) {
      throw new Error("This broker does not support safe incremental configuration updates (Kafka 2.3 or later is required).");
    }
    await broker.connectionPool.send(createConfigProtocol(resource, Boolean(validateOnly)));
  } finally {
    await cluster.disconnect();
  }
}
