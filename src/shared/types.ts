export type ServerProfile = {
  id: string;
  name: string;
  brokers: string[];
  schemaRegistry?: {
    url: string;
    auth?: {
      type: "basic" | "bearer";
      username?: string;
      password?: string;
      token?: string;
    };
  };
  security?: {
    ssl?: boolean;
    sasl?: {
      mechanism: "oauthbearer";
      tokenEndpoint: string;
      clientId: string;
      clientSecret: string;
      scope?: string;
      audience?: string;
    };
  };
};

export type TopicSummary = {
  name: string;
  partitions: number;
  replicationFactor: number;
  messageCount?: string;
  sizeBytes?: string;
};

export type TopicMessageCounts = Record<string, string>;

export type TopicDetail = {
  name: string;
  partitions: Array<{
    partition: number;
    leader: number;
    replicas: number[];
    isr: number[];
  }>;
  offsets: Array<{
    partition: number;
    low: string;
    high: string;
  }>;
  configs?: TopicConfigEntry[];
};

export type TopicConfigEntry = {
  name: string;
  value: string;
  source: string;
  isDefault: boolean;
  isSensitive: boolean;
  readOnly: boolean;
  synonyms: Array<{
    name: string;
    value: string;
    source: string;
  }>;
};

export type BrokerSummary = {
  nodeId: number;
  host: string;
  port: number;
  controller: boolean;
  leaderCount: number;
  replicaCount: number;
  inSyncReplicaCount: number;
  outOfSyncReplicaCount: number;
  onlinePartitionCount: number;
  underReplicatedPartitionCount: number;
  leaderSkewPercent: number;
  partitionSkewPercent: number;
};

export type BrokerConfigEntry = {
  name: string;
  value: string;
  source: string;
  isDefault: boolean;
  isSensitive: boolean;
  readOnly: boolean;
  synonyms: Array<{
    name: string;
    value: string;
    source: string;
  }>;
};

export type BrokerLogDirectory = {
  path: string;
  error?: string;
  topics: Array<{
    topic: string;
    partition: number;
    sizeBytes?: string;
    offsetLag?: string;
    isFuture?: boolean;
  }>;
};

export type BrokerDetail = {
  broker: BrokerSummary;
  configs: BrokerConfigEntry[];
  logDirectories: BrokerLogDirectory[];
  logDirectoriesSupported: boolean;
};

export type BrokerConfigUpdateRequest = {
  serverId: string;
  brokerId: number;
  name: string;
  value: string;
  validateOnly?: boolean;
};

export type TopicConfigUpdateRequest = {
  serverId: string;
  topic: string;
  entries: Array<{
    name: string;
    value: string;
  }>;
  validateOnly?: boolean;
};

export type ConsumerGroupSummary = {
  groupId: string;
  state?: string;
  protocol?: string;
  members?: number;
  coordinator?: string;
  topics?: number;
  assignedPartitions?: number;
  totalLag?: string;
};

export type ConsumerGroupLagRow = {
  topic: string;
  partition: number;
  currentOffset: string;
  startOffset: string;
  endOffset: string;
  lag: string;
  metadata?: string;
};

export type ConsumerGroupLagDetail = {
  groupId: string;
  state?: string;
  protocol?: string;
  members: number;
  totalLag: string;
  rows: ConsumerGroupLagRow[];
};

export type ManualAvroSchema = {
  encoding: "raw" | "confluent";
  schemaId?: number;
  schema: string;
  updatedAt: string;
};

export type AppKeyboardShortcutPreferences = Partial<Record<
  | "quickSearch"
  | "preferences"
  | "toggleSidebar"
  | "splitTopic"
  | "sendTopicToLeftPane"
  | "focusPrimaryPane"
  | "focusSplitPane"
  | "closeActiveTopicTab"
  | "closeSplitPane",
  string
>>;

export type ProduceTemplatePreference = {
  id: string;
  name: string;
  draft: {
    key: string;
    headers: string;
    value: string;
  };
  intervalConfig: {
    durationText: string;
    intervalMs: number;
    mode: "single" | "interval";
    stopMode: "count" | "duration";
    totalCount: number;
  };
  updatedAt: number;
};

export type AppPreferences = {
  favoriteTopicsByServer: Record<string, string[]>;
  consumeDefaults?: Partial<{
    mode: "offset" | "timeRange" | "live";
    limit: number;
    partition: string;
    offsetOrder: "asc" | "desc";
    autoScroll: boolean;
    maxMessages: number;
    filterField: "all" | "key" | "value" | "headers" | "headersEmpty" | "offset" | "partition" | "timestamp";
    inspectorMode: "raw" | "tree" | "preview";
    inspectorCollapsed: boolean;
    keyFormat: "text" | "hex" | "base64";
    valueFormat: "json" | "text" | "hex" | "base64";
    payloadEncoding: "utf-8" | "euc-kr";
  }>;
  viewerPreferences?: Partial<{
    retentionDays: number;
    fontSize: number;
    fontWeight: number;
    byServer: Record<string, Record<string, {
      inspectorMode?: "raw" | "tree" | "preview";
      keyFormat?: "text" | "hex" | "base64";
      valueFormat?: "json" | "text" | "hex" | "base64";
      payloadEncoding?: "utf-8" | "euc-kr";
      valueColumnPaths?: string[];
      mapFieldMapping?: {
        xPath: string;
        yPath: string;
        projection: "wgs84" | "wgs84_e6" | "wgs84_msec" | "korea_grs80_central" | "korea_itrf2000_central" | "utm52n";
        identityPath?: string;
        headingPath?: string;
        speedPath?: string;
        speedUnit?: "auto" | "kmh" | "mps";
      } | null;
      updatedAt: number;
    }>>;
  }>;
  consumeDefaultsByServer: Record<string, Partial<{
    mode: "offset" | "timeRange" | "live";
    limit: number;
    partition: string;
    offsetOrder: "asc" | "desc";
    autoScroll: boolean;
    maxMessages: number;
    filterField: "all" | "key" | "value" | "headers" | "headersEmpty" | "offset" | "partition" | "timestamp";
    inspectorMode: "raw" | "tree" | "preview";
    inspectorCollapsed: boolean;
    keyFormat: "text" | "hex" | "base64";
    valueFormat: "json" | "text" | "hex" | "base64";
    payloadEncoding: "utf-8" | "euc-kr";
  }>>;
  manualAvroSchemasByServer?: Record<string, Record<string, ManualAvroSchema>>;
  produceTemplatesByServer?: Record<string, Record<string, ProduceTemplatePreference[]>>;
  layout?: Partial<{
    sidebarWidth: number;
    serverPanelHeight: number;
    messagePaneHeight: number;
    sidebarCollapsed: boolean;
  }>;
  appearance?: Partial<{
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    language: "auto" | "ko" | "en";
  }>;
  keyboardShortcuts?: AppKeyboardShortcutPreferences;
  diagnostics?: Partial<{
    logRetentionDays: number;
  }>;
  releaseNotes?: Partial<{
    lastSeenVersion: string;
  }>;
  exportFormatTemplate?: string;
  windowBounds?: Partial<{
    x: number;
    y: number;
    width: number;
    height: number;
    maximized: boolean;
  }>;
  migratedFromKafkaTool?: boolean;
};

export type AppSettingsBundle = {
  version: number;
  exportedAt: string;
  servers: ServerProfile[];
  preferences: AppPreferences;
};

export type EncryptedAppSettingsBundle = {
  version: 2;
  encrypted: true;
  algorithm: "aes-256-gcm";
  kdf: "pbkdf2-sha256";
  iterations: number;
  salt: string;
  iv: string;
  authTag: string;
  data: string;
};

export type ExportSettingsOptions = {
  includeSecrets?: boolean;
  password?: string;
};

export type ImportSettingsOptions = {
  password?: string;
};

export type AppLogPayload = {
  level: "info" | "warn" | "error";
  message: string;
  stack?: string;
  source?: string;
};

export type ImportSettingsResult = {
  servers: ServerProfile[];
  preferences: AppPreferences;
};

export type ProducedMessage = {
  topic: string;
  partition?: number;
  offset?: string;
};

export type ConsumedMessage = {
  serverId?: string;
  consumerId?: string;
  topic: string;
  partition: number;
  offset: string;
  timestamp: string;
  key: string;
  value: string;
  rawKeyBase64?: string;
  rawValueBase64?: string;
  rawKeyBytes?: number;
  rawValueBytes?: number;
  rawKeyTruncated?: boolean;
  rawValueTruncated?: boolean;
  headers: Record<string, string>;
  decoded?: {
    format: "avro";
    schemaId?: number;
    source?: "registry" | "manual";
    encoding?: "raw" | "confluent";
    value?: unknown;
    error?: string;
  };
};

export const RAW_PAYLOAD_BASE64_LIMIT_BYTES = 256 * 1024;

export type LiveMapPoint = {
  id: string;
  topic: string;
  partition: number;
  offset: string;
  timestamp: string;
  lat: number;
  lng: number;
  heading?: number;
  focus?: boolean;
  label?: string;
  meta?: Record<string, string>;
};

export type MessageExportFormat = "json" | "csv" | "log";
export type MessageExportPayloadOptions = {
  keyFormat?: "text" | "hex" | "base64";
  valueFormat?: "json" | "text" | "hex" | "base64";
  payloadEncoding?: "utf-8" | "euc-kr";
  valueColumnPaths?: string[];
};

export type AppPreferenceSection = "general" | "avro";
export type AppMenuLanguage = "ko" | "en";

export type MessageExportRequest = {
  topic: string;
  format: MessageExportFormat;
  messages: ConsumedMessage[];
  template?: string;
  payloadOptions?: MessageExportPayloadOptions;
};

export type OffsetMessageExportRequest = ConsumeOffsetRequest & {
  format: MessageExportFormat;
  template?: string;
  payloadOptions?: MessageExportPayloadOptions;
};

export type TopicMutationRequest = {
  serverId: string;
  topics: string[];
};

export type TopicCreateRequest = {
  serverId: string;
  topic: string;
  partitions: number;
  replicationFactor: number;
  configs?: Array<{
    name: string;
    value: string;
  }>;
};

export type ConsumerGroupMutationRequest = {
  serverId: string;
  groupIds: string[];
};

export type ConsumerGroupOffsetResetMode = "earliest" | "latest" | "timestamp" | "specific";

export type ConsumerGroupOffsetResetRequest = {
  serverId: string;
  groupId: string;
  topic: string;
  partitions: number[];
  mode: ConsumerGroupOffsetResetMode;
  timestamp?: number;
  offset?: string;
};

export type ConsumerGroupOffsetResetResult = {
  groupId: string;
  topic: string;
  partitions: Array<{
    partition: number;
    offset: string;
  }>;
};

export type UpdateStatus = {
  status: "checking" | "available" | "not-available" | "download-progress" | "downloaded" | "error";
  message: string;
  version?: string;
  percent?: number;
};

export type StartConsumeResult = {
  liveRecordPath?: string;
};

export type StartConsumeRequest = {
  serverId: string;
  topic: string;
  consumerId?: string;
  fromBeginning: boolean;
  partition?: number;
  record?: boolean;
};

export type StopConsumeRequest = {
  serverId?: string;
  topic?: string;
  consumerId?: string;
};

export type ProduceRequest = {
  serverId: string;
  topic: string;
  key?: string;
  value: string;
  headers?: Record<string, string>;
};

export type ConsumeOffsetRequest = {
  serverId: string;
  topic: string;
  partition: number;
  offset: string;
  limit: number;
  order?: "asc" | "desc";
  endOffsetExclusive?: string;
};

export type ConsumeOffsetResult = {
  messages: ConsumedMessage[];
  endOffsetExclusive?: string;
};

export type ConsumeTimeRangeRequest = {
  serverId: string;
  topic: string;
  partition?: number;
  startTimestamp: number;
  endTimestamp: number;
  limit: number;
};

export type KafkaApi = {
  listServers: () => Promise<ServerProfile[]>;
  saveServer: (server: Omit<ServerProfile, "id"> & { id?: string }) => Promise<ServerProfile[]>;
  testServer: (server: Omit<ServerProfile, "id"> & { id?: string }) => Promise<void>;
  deleteServer: (id: string) => Promise<ServerProfile[]>;
  reorderServers: (ids: string[]) => Promise<ServerProfile[]>;
  exportSettings: (options?: ExportSettingsOptions) => Promise<string | null>;
  importSettings: (options?: ImportSettingsOptions) => Promise<ImportSettingsResult | null>;
  logError: (payload: AppLogPayload) => Promise<void>;
  openLogsFolder: () => Promise<string>;
  openExternalUrl: (url: string) => Promise<void>;
  openLiveMap: () => Promise<void>;
  sendLiveMapPoints: (points: LiveMapPoint[]) => Promise<void>;
  checkForUpdates: () => Promise<void>;
  installUpdate: () => Promise<void>;
  getAppVersion: () => Promise<string>;
  loadPreferences: () => Promise<AppPreferences>;
  savePreferences: (preferences: AppPreferences) => Promise<AppPreferences>;
  setMenuLanguage: (language: AppMenuLanguage) => Promise<void>;
  checkHealth: (serverId: string) => Promise<void>;
  listTopics: (serverId: string) => Promise<TopicSummary[]>;
  listTopicMessageCounts: (serverId: string, topics: string[]) => Promise<TopicMessageCounts>;
  listBrokers: (serverId: string) => Promise<BrokerSummary[]>;
  getBrokerDetail: (serverId: string, brokerId: number) => Promise<BrokerDetail>;
  updateBrokerConfig: (request: BrokerConfigUpdateRequest) => Promise<BrokerDetail>;
  getTopicDetail: (serverId: string, topic: string) => Promise<TopicDetail>;
  getTopicConfigs: (serverId: string, topic: string) => Promise<TopicConfigEntry[]>;
  updateTopicConfigs: (request: TopicConfigUpdateRequest) => Promise<TopicConfigEntry[]>;
  createTopic: (request: TopicCreateRequest) => Promise<void>;
  deleteTopics: (request: TopicMutationRequest) => Promise<void>;
  purgeTopics: (request: TopicMutationRequest) => Promise<void>;
  listConsumerGroups: (serverId: string) => Promise<ConsumerGroupSummary[]>;
  deleteConsumerGroups: (request: ConsumerGroupMutationRequest) => Promise<void>;
  getConsumerGroupLag: (serverId: string, groupId: string) => Promise<ConsumerGroupLagDetail>;
  resetConsumerGroupOffsets: (request: ConsumerGroupOffsetResetRequest) => Promise<ConsumerGroupOffsetResetResult>;
  exportMessages: (request: MessageExportRequest) => Promise<string | null>;
  exportOffsetMessages: (request: OffsetMessageExportRequest) => Promise<string | null>;
  produce: (message: ProduceRequest) => Promise<ProducedMessage[]>;
  consumeFromOffset: (request: ConsumeOffsetRequest) => Promise<ConsumeOffsetResult>;
  consumeTimeRange: (request: ConsumeTimeRangeRequest) => Promise<ConsumedMessage[]>;
  startConsume: (request: StartConsumeRequest) => Promise<StartConsumeResult>;
  stopConsume: (request?: StopConsumeRequest) => Promise<void>;
  onConsumeMessage: (callback: (message: ConsumedMessage) => void) => () => void;
  onConsumeError: (callback: (error: string) => void) => () => void;
  onSettingsImported: (callback: (result: ImportSettingsResult) => void) => () => void;
  onSettingsExported: (callback: (filePath: string) => void) => () => void;
  onSettingsError: (callback: (error: string) => void) => () => void;
  onSettingsImportRequested: (callback: () => void) => () => void;
  onSettingsExportRequested: (callback: () => void) => () => void;
  onPreferencesOpen: (callback: (section?: AppPreferenceSection) => void) => () => void;
  onReleaseNotesOpen: (callback: () => void) => () => void;
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void;
};
