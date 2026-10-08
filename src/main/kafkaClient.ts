import { Kafka, logLevel, type Admin } from "kafkajs";
import type { ServerProfile } from "../shared/types.js";
import { getProfile } from "./storage.js";
import { alterConfigsIncrementally, type IncrementalConfigResource } from "./incrementalConfigs.js";

export function createKafka(profile: ServerProfile) {
  const sasl = profile.security?.sasl;
  return new Kafka({
    clientId: "kafkapilot",
    brokers: profile.brokers,
    ssl: profile.security?.ssl,
    sasl: sasl?.mechanism === "oauthbearer"
      ? {
        mechanism: "oauthbearer",
        oauthBearerProvider: async () => ({
          value: await requestOAuthBearerToken(sasl)
        })
      }
      : undefined,
    logLevel: logLevel.NOTHING
  });
}

async function requestOAuthBearerToken(config: NonNullable<NonNullable<ServerProfile["security"]>["sasl"]>) {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret
  });
  if (config.scope?.trim()) {
    body.set("scope", config.scope.trim());
  }
  if (config.audience?.trim()) {
    body.set("audience", config.audience.trim());
  }

  const response = await fetch(config.tokenEndpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });
  const payload = await response.json().catch(() => ({})) as { access_token?: unknown; error?: unknown; error_description?: unknown };
  if (!response.ok || typeof payload.access_token !== "string") {
    const detail = [payload.error, payload.error_description].filter(Boolean).join(": ");
    throw new Error(`OAuth token request failed (${response.status}). ${detail || response.statusText}`);
  }
  return payload.access_token;
}

export async function withAdmin<T>(serverId: string, action: (admin: Admin) => Promise<T>) {
  const profile = await getProfile(serverId);
  const admin = createKafka(profile).admin();
  await admin.connect();
  try {
    return await action(admin);
  } finally {
    await admin.disconnect();
  }
}

export async function updateKafkaConfigs(serverId: string, resource: IncrementalConfigResource, validateOnly = false): Promise<void> {
  const profile = await getProfile(serverId);
  await alterConfigsIncrementally(createKafka(profile), resource, validateOnly);
}
