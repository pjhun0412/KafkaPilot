import proj4 from "proj4";
import type { ConsumedMessage, LiveMapPoint } from "../shared/types";
import { getStructuredPayloadText } from "./messagePreview";

export type MapCoordinate = {
  lat: number;
  lng: number;
};

export type MapProjection =
  | "wgs84"
  | "wgs84_e6"
  | "wgs84_msec"
  | "korea_grs80_central"
  | "korea_itrf2000_central"
  | "utm52n";

export type MapCoordinateCandidate = {
  id: string;
  label: string;
  latPath: string;
  lngPath: string;
  projection: MapProjection;
  coordinate: MapCoordinate;
};

export type MapCoordinateSelection = {
  xPath: string;
  yPath: string;
  projection: MapProjection;
  identityPath?: string;
  headingPath?: string;
  speedPath?: string;
  speedUnit?: "auto" | "kmh" | "mps";
};

export type MapFieldMapping = MapCoordinateSelection;

export function normalizeMapFieldMapping(value: unknown): MapFieldMapping | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const xPath = typeof source.xPath === "string" ? source.xPath.trim() : "";
  const yPath = typeof source.yPath === "string" ? source.yPath.trim() : "";
  if (!xPath || !yPath) return null;
  const projection = normalizeMapProjection(source.projection);
  const identityPath = typeof source.identityPath === "string" ? source.identityPath.trim() : "";
  const headingPath = typeof source.headingPath === "string" ? source.headingPath.trim() : "";
  const speedPath = typeof source.speedPath === "string" ? source.speedPath.trim() : "";
  const speedUnit = source.speedUnit === "kmh" || source.speedUnit === "mps" ? source.speedUnit : "auto";
  return {
    xPath,
    yPath,
    projection,
    ...(identityPath ? { identityPath } : {}),
    ...(headingPath ? { headingPath } : {}),
    ...(speedPath ? { speedPath } : {}),
    ...(speedUnit !== "auto" ? { speedUnit } : {})
  };
}

const latitudeKeys = new Set([
  "lat",
  "latitude",
  "gpslat",
  "gps_lat",
  "ylat",
  "y",
  "egolatitude",
  "egolatitudedeg",
  "vehiclelatitude",
  "vehiclelatitudedeg"
]);

function normalizeMapProjection(value: unknown): MapProjection {
  return value === "wgs84_e6"
    || value === "wgs84_msec"
    || value === "korea_grs80_central"
    || value === "korea_itrf2000_central"
    || value === "utm52n"
    ? value
    : "wgs84";
}
const longitudeKeys = new Set([
  "lng",
  "lon",
  "long",
  "longitude",
  "gpslng",
  "gps_lng",
  "gpslon",
  "gps_lon",
  "xlng",
  "x",
  "egolongitude",
  "egolongitudedeg",
  "vehiclelongitude",
  "vehiclelongitudedeg"
]);
const headingKeys = new Set(["heading", "bearing", "direction", "azimuth", "course", "angle", "yaw"]);
const mapMetaKeys = new Set([
  "speed",
  "speedmps",
  "egovehiclespeedmps",
  "vehiclespeedmps",
  "drivingmode",
  "driving_mode",
  "operationmode",
  "operation_mode",
  "routenm",
  "route_nm",
  "engroutnm",
  "engroutename",
  "linkid",
  "link_id",
  "crossid",
  "cross_id",
  "messagelog",
  "message_log",
  "gpstime",
  "gps_time",
  "messagetime",
  "message_time",
  "movetime",
  "move_time",
  "movedistance",
  "move_distance"
]);
const identityKeys = new Set([
  "vehicleid",
  "vehicle_id",
  "terminalid",
  "terminal_id"
]);

function normalizeKey(key: string) {
  return key.replace(/[-\s]/g, "_").toLowerCase();
}

function toCoordinateNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return NaN;
  const trimmed = value.trim();
  if (!trimmed) return NaN;
  return Number(trimmed);
}

function isValidCoordinate(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function isUtmLikeCoordinate(x: number, y: number) {
  return Number.isFinite(x) && Number.isFinite(y) && x > 100000 && x < 900000 && y > 0 && y < 10000000;
}

const projectedMapDefinitions: Record<Exclude<MapProjection, "wgs84" | "wgs84_e6" | "wgs84_msec">, string> = {
  korea_grs80_central: "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs",
  korea_itrf2000_central: "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 +ellps=GRS80 +units=m +no_defs",
  utm52n: "+proj=utm +zone=52 +datum=WGS84 +units=m +no_defs"
};

function projectedToWgs84(x: number, y: number, projection: MapProjection): MapCoordinate | null {
  if (projection === "wgs84_e6") {
    const lat = y / 1000000;
    const lng = x / 1000000;
    return isValidCoordinate(lat, lng) ? { lat, lng } : null;
  }
  if (projection === "wgs84_msec") {
    const lat = y / 3600000;
    const lng = x / 3600000;
    return isValidCoordinate(lat, lng) ? { lat, lng } : null;
  }
  if (projection === "wgs84") return isValidCoordinate(y, x) ? { lat: y, lng: x } : null;
  const definition = projectedMapDefinitions[projection];
  if (!definition) return null;
  try {
    const [lng, lat] = proj4(definition, proj4.WGS84, [x, y]) as [number, number];
    return isValidCoordinate(lat, lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
}

function utm52nToWgs84(easting: number, northing: number): MapCoordinate | null {
  return projectedToWgs84(easting, northing, "utm52n");
}

function normalizeHeading(value: number) {
  if (!Number.isFinite(value)) return undefined;
  return ((value % 360) + 360) % 360;
}

function findCoordinateInObject(value: Record<string, unknown>): MapCoordinate | null {
  let lat: number | null = null;
  let lng: number | null = null;

  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = normalizeKey(key);
    if (latitudeKeys.has(normalizedKey)) {
      lat = toCoordinateNumber(item);
    }
    if (longitudeKeys.has(normalizedKey)) {
      lng = toCoordinateNumber(item);
    }
  }

  if (lat === null || lng === null || !isValidCoordinate(lat, lng)) return null;
  return { lat, lng };
}

function readPath(source: unknown, path: string) {
  let current = source;
  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function collectNumericMapPaths(source: unknown, prefix = "", result = new Set<string>()) {
  if (!source || typeof source !== "object") return result;
  if (Array.isArray(source)) return result;
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "number" || (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)))) {
      result.add(path);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      collectNumericMapPaths(value, path, result);
    }
  }
  return result;
}

function collectMapCoordinateCandidatesInObject(source: Record<string, unknown>, prefix: string, result: MapCoordinateCandidate[]) {
  const entries = Object.entries(source);
  const latEntries = entries.filter(([key]) => latitudeKeys.has(normalizeKey(key)));
  const lngEntries = entries.filter(([key]) => longitudeKeys.has(normalizeKey(key)));
  for (const [latKey, latValue] of latEntries) {
    for (const [lngKey, lngValue] of lngEntries) {
      const lat = toCoordinateNumber(latValue);
      const lng = toCoordinateNumber(lngValue);
      if (!isValidCoordinate(lat, lng)) continue;
      const latPath = prefix ? `${prefix}.${latKey}` : latKey;
      const lngPath = prefix ? `${prefix}.${lngKey}` : lngKey;
      result.push({
        id: `wgs84:${latPath}|${lngPath}`,
        label: `${latKey} / ${lngKey} (WGS84)`,
        latPath,
        lngPath,
        projection: "wgs84",
        coordinate: { lat, lng }
      });
    }
  }

  const xEntry = entries.find(([key]) => normalizeKey(key) === "xm");
  const yEntry = entries.find(([key]) => normalizeKey(key) === "ym");
  const xValue = xEntry?.[1];
  const yValue = yEntry?.[1];
  const x = toCoordinateNumber(xValue);
  const y = toCoordinateNumber(yValue);
  const coordinate = isUtmLikeCoordinate(x, y) ? utm52nToWgs84(x, y) : null;
  if (coordinate) {
    const xKey = xEntry?.[0] ?? "xM";
    const yKey = yEntry?.[0] ?? "yM";
    const xPath = prefix ? `${prefix}.${xKey}` : xKey;
    const yPath = prefix ? `${prefix}.${yKey}` : yKey;
    result.push({
      id: `utm52n:${yPath}|${xPath}`,
      label: `${xKey} / ${yKey} (UTM 52N)`,
      latPath: yPath,
      lngPath: xPath,
      projection: "utm52n",
      coordinate
    });
  }
}

export function collectMapCoordinateCandidates(source: unknown, prefix = "", result: MapCoordinateCandidate[] = []) {
  if (!source || typeof source !== "object") return result;
  if (Array.isArray(source)) {
    source.forEach((item, index) => collectMapCoordinateCandidates(item, `${prefix}[${index}]`, result));
    return result;
  }

  const objectValue = source as Record<string, unknown>;
  collectMapCoordinateCandidatesInObject(objectValue, prefix, result);
  for (const [key, item] of Object.entries(objectValue)) {
    if (!item || typeof item !== "object") continue;
    collectMapCoordinateCandidates(item, prefix ? `${prefix}.${key}` : key, result);
  }
  return Array.from(new Map(result.map((item) => [item.id, item])).values());
}

export function findMapCoordinate(value: unknown): MapCoordinate | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const coordinate = findMapCoordinate(item);
      if (coordinate) return coordinate;
    }
    return null;
  }

  const objectValue = value as Record<string, unknown>;
  const directCoordinate = findCoordinateInObject(objectValue);
  if (directCoordinate) return directCoordinate;

  const preferredValues = ["value", "payload", "data", "decoded"];
  for (const key of preferredValues) {
    const coordinate = findMapCoordinate(objectValue[key]);
    if (coordinate) return coordinate;
  }

  for (const item of Object.values(objectValue)) {
    const coordinate = findMapCoordinate(item);
    if (coordinate) return coordinate;
  }
  return null;
}

export function getMapCoordinateFromSelection(payload: unknown, selection?: MapCoordinateSelection | null): MapCoordinate | null {
  if (!selection?.xPath || !selection.yPath) return null;
  const xValue = toCoordinateNumber(readPath(payload, selection.xPath));
  const yValue = toCoordinateNumber(readPath(payload, selection.yPath));
  const projection = normalizeMapProjection(selection.projection);
  if (projection !== "wgs84") return projectedToWgs84(xValue, yValue, projection);
  return isValidCoordinate(yValue, xValue) ? { lat: yValue, lng: xValue } : null;
}

function getCoordinateByCandidateId(payload: unknown, candidateId?: string): MapCoordinate | null {
  if (!candidateId) return null;
  const candidate = collectMapCoordinateCandidates(payload).find((item) => item.id === candidateId);
  if (candidate) return candidate.coordinate;
  const [projection, paths] = candidateId.split(":");
  const [latPath, lngPath] = (paths ?? "").split("|");
  if (!latPath || !lngPath) return null;
  const latValue = toCoordinateNumber(readPath(payload, latPath));
  const lngValue = toCoordinateNumber(readPath(payload, lngPath));
  const normalizedProjection = normalizeMapProjection(projection);
  if (normalizedProjection !== "wgs84") return projectedToWgs84(lngValue, latValue, normalizedProjection);
  return isValidCoordinate(latValue, lngValue) ? { lat: latValue, lng: lngValue } : null;
}

export function getOpenStreetMapUrl(coordinate: MapCoordinate) {
  return `https://www.openstreetmap.org/?mlat=${coordinate.lat}&mlon=${coordinate.lng}#map=18/${coordinate.lat}/${coordinate.lng}`;
}

function parseJsonPayload(value: string) {
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function findIdentity(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const identity = findIdentity(item);
      if (identity) return identity;
    }
    return null;
  }

  const objectValue = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(objectValue)) {
    if (!identityKeys.has(normalizeKey(key))) continue;
    if (typeof item === "string" && item.trim()) return item.trim();
    if (typeof item === "number" && Number.isFinite(item)) return String(item);
  }

  const preferredValues = ["value", "payload", "data", "decoded"];
  for (const key of preferredValues) {
    const identity = findIdentity(objectValue[key]);
    if (identity) return identity;
  }

  for (const item of Object.values(objectValue)) {
    const identity = findIdentity(item);
    if (identity) return identity;
  }
  return null;
}

function findHeading(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const heading = findHeading(item);
      if (heading !== undefined) return heading;
    }
    return undefined;
  }

  const objectValue = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(objectValue)) {
    if (!headingKeys.has(normalizeKey(key))) continue;
    const heading = normalizeHeading(toCoordinateNumber(item));
    if (heading !== undefined) return heading;
  }

  const preferredValues = ["value", "payload", "data", "decoded"];
  for (const key of preferredValues) {
    const heading = findHeading(objectValue[key]);
    if (heading !== undefined) return heading;
  }

  for (const item of Object.values(objectValue)) {
    const heading = findHeading(item);
    if (heading !== undefined) return heading;
  }
  return undefined;
}

function stringifyMapMetaValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return "";
}

function readSelectedText(payload: unknown, path?: string) {
  if (!path) return "";
  return stringifyMapMetaValue(readPath(payload, path));
}

function readSelectedNumber(payload: unknown, path?: string) {
  if (!path) return NaN;
  return toCoordinateNumber(readPath(payload, path));
}

function isSpeedMetersPerSecondKey(key: string) {
  const normalized = normalizeKey(key);
  return normalized === "speedmps" || normalized === "egovehiclespeedmps" || normalized === "vehiclespeedmps";
}

function formatMapSpeedValue(value: unknown, key = "", unit: MapCoordinateSelection["speedUnit"] = "auto") {
  const speedNumber = toCoordinateNumber(value);
  if (!Number.isFinite(speedNumber)) return stringifyMapMetaValue(value);
  const speedKmh = unit === "mps" || (unit !== "kmh" && isSpeedMetersPerSecondKey(key)) ? speedNumber * 3.6 : speedNumber;
  return String(speedKmh);
}

function readSelectedSpeed(payload: unknown, path?: string, unit: MapCoordinateSelection["speedUnit"] = "auto") {
  if (!path) return "";
  const value = readPath(payload, path);
  const key = path.split(".").filter(Boolean).at(-1) ?? "";
  return formatMapSpeedValue(value, key, unit);
}

function isSpeedKey(key: string) {
  const normalized = normalizeKey(key);
  return normalized === "speed"
    || normalized === "vehiclespeed"
    || normalized === "egovehiclespeed"
    || normalized === "velocity"
    || isSpeedMetersPerSecondKey(key);
}

function findSpeed(value: unknown, unit: MapCoordinateSelection["speedUnit"] = "auto"): string {
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const speed = findSpeed(item, unit);
      if (speed) return speed;
    }
    return "";
  }

  const objectValue = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(objectValue)) {
    if (!isSpeedKey(key)) continue;
    const speed = formatMapSpeedValue(item, key, unit);
    if (speed) return speed;
  }

  const preferredValues = ["value", "payload", "data", "decoded"];
  for (const key of preferredValues) {
    const speed = findSpeed(objectValue[key], unit);
    if (speed) return speed;
  }

  for (const item of Object.values(objectValue)) {
    const speed = findSpeed(item, unit);
    if (speed) return speed;
  }
  return "";
}

function findMapMeta(value: unknown): Record<string, string> {
  const meta: Record<string, string> = {};
  if (!value || typeof value !== "object") return meta;
  if (Array.isArray(value)) {
    for (const item of value) {
      Object.assign(meta, findMapMeta(item));
    }
    return meta;
  }

  const objectValue = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(objectValue)) {
    const normalizedKey = normalizeKey(key);
    if (!mapMetaKeys.has(normalizedKey)) continue;
    const text = stringifyMapMetaValue(item);
    if (!text) continue;
    if (normalizedKey === "speed" || isSpeedMetersPerSecondKey(key)) {
      meta.speed = formatMapSpeedValue(item, key);
    } else {
      meta[key] = text;
    }
  }

  const preferredValues = ["value", "payload", "data", "decoded"];
  for (const key of preferredValues) {
    Object.assign(meta, findMapMeta(objectValue[key]));
  }
  return meta;
}

export function getMessageMapPayload(message: ConsumedMessage) {
  if (message.decoded?.value !== undefined) return message.decoded.value;
  return parseJsonPayload(getStructuredPayloadText(message, "value", false));
}

export function createLiveMapPoint(
  message: ConsumedMessage,
  payload: unknown = getMessageMapPayload(message),
  coordinateCandidateId?: string,
  coordinateSelection?: MapFieldMapping | null
): LiveMapPoint | null {
  const coordinate = getMapCoordinateFromSelection(payload, coordinateSelection) ?? getCoordinateByCandidateId(payload, coordinateCandidateId) ?? findMapCoordinate(payload);
  if (!coordinate) return null;
  const normalizedMapping = normalizeMapFieldMapping(coordinateSelection);
  const identity = readSelectedText(payload, normalizedMapping?.identityPath) || findIdentity(payload) || message.key?.trim() || "";
  const fallbackId = `${message.topic}:${message.partition}:${message.offset}`;
  const id = identity || fallbackId;
  const selectedHeading = normalizeHeading(readSelectedNumber(payload, normalizedMapping?.headingPath));
  const selectedSpeed = readSelectedSpeed(payload, normalizedMapping?.speedPath, normalizedMapping?.speedUnit);
  const meta = findMapMeta(payload);
  const autoSpeed = findSpeed(payload, normalizedMapping?.speedUnit);
  if (selectedSpeed || autoSpeed) meta.speed = selectedSpeed || autoSpeed;
  return {
    id,
    topic: message.topic,
    partition: message.partition,
    offset: message.offset,
    timestamp: message.timestamp,
    lat: coordinate.lat,
    lng: coordinate.lng,
    heading: selectedHeading ?? findHeading(payload),
    label: identity || message.key?.trim() || fallbackId,
    meta
  };
}
