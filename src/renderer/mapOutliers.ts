import type { LiveMapPoint } from "../shared/types";

export type MapOutlierSeverity = "warning" | "danger";

export type MapOutlierAlert = {
  kind: "invalid-coordinate" | "jump" | "speed" | "heading" | "timestamp";
  severity: MapOutlierSeverity;
  message: string;
  detail?: string;
};

export type MapOutlierSettings = {
  jumpDistanceMeters: number;
  largeJumpDistanceMeters: number;
  jumpWindowSeconds: number;
  speedLimitKmh: number;
  headingJumpDegrees: number;
  headingWindowSeconds: number;
  detectInvalidCoordinate: boolean;
  detectTimestampBackwards: boolean;
  detectJump: boolean;
  detectSpeed: boolean;
  detectHeading: boolean;
};

export const defaultMapOutlierSettings: MapOutlierSettings = {
  jumpDistanceMeters: 300,
  largeJumpDistanceMeters: 1000,
  jumpWindowSeconds: 10,
  speedLimitKmh: 80,
  headingJumpDegrees: 120,
  headingWindowSeconds: 5,
  detectInvalidCoordinate: true,
  detectTimestampBackwards: true,
  detectJump: true,
  detectSpeed: true,
  detectHeading: true
};

const EARTH_RADIUS_METERS = 6371000;
const COORDINATE_ZERO_EPSILON = 0.000001;

function toRadians(value: number) {
  return value * Math.PI / 180;
}

function formatDistance(meters: number) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function parseTimestamp(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatSeconds(seconds: number | undefined) {
  if (seconds === undefined) return "unknown time delta";
  return `${seconds.toFixed(1)}s`;
}

function speedKmh(point: LiveMapPoint) {
  const value = Number(point.meta?.speed);
  return Number.isFinite(value) ? value : undefined;
}

function headingDelta(left: number, right: number) {
  return Math.abs(((((right - left) % 360) + 540) % 360) - 180);
}

export function distanceMeters(left: LiveMapPoint, right: LiveMapPoint) {
  const lat1 = toRadians(left.lat);
  const lat2 = toRadians(right.lat);
  const deltaLat = toRadians(right.lat - left.lat);
  const deltaLng = toRadians(right.lng - left.lng);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function detectMapOutliers(
  point: LiveMapPoint,
  previous?: LiveMapPoint,
  settings: MapOutlierSettings = defaultMapOutlierSettings
): MapOutlierAlert[] {
  const alerts: MapOutlierAlert[] = [];
  const invalidRange = Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180;
  const zeroCoordinate = Math.abs(point.lat) < COORDINATE_ZERO_EPSILON && Math.abs(point.lng) < COORDINATE_ZERO_EPSILON;

  if (settings.detectInvalidCoordinate && (invalidRange || zeroCoordinate)) {
    alerts.push({
      kind: "invalid-coordinate",
      severity: "danger",
      message: zeroCoordinate ? "Coordinate is 0,0" : "Coordinate is out of WGS84 range",
      detail: `lat ${point.lat.toFixed(6)}, lng ${point.lng.toFixed(6)}`
    });
  }

  const currentSpeed = speedKmh(point);
  if (settings.detectSpeed && currentSpeed !== undefined && currentSpeed > settings.speedLimitKmh) {
    alerts.push({
      kind: "speed",
      severity: "warning",
      message: `Speed ${currentSpeed.toFixed(1)} km/h`,
      detail: `threshold ${settings.speedLimitKmh.toFixed(1)} km/h`
    });
  }

  if (!previous) return alerts;

  const previousTime = parseTimestamp(previous.timestamp);
  const currentTime = parseTimestamp(point.timestamp);
  const timeDeltaSeconds = previousTime !== undefined && currentTime !== undefined
    ? (currentTime - previousTime) / 1000
    : undefined;

  if (settings.detectTimestampBackwards && timeDeltaSeconds !== undefined && timeDeltaSeconds < 0) {
    alerts.push({
      kind: "timestamp",
      severity: "warning",
      message: "Timestamp moved backward",
      detail: `delta ${formatSeconds(timeDeltaSeconds)}, previous ${previous.partition}:${previous.offset}`
    });
  }

  const distance = distanceMeters(previous, point);
  const jumpedInShortWindow = timeDeltaSeconds === undefined || Math.abs(timeDeltaSeconds) <= settings.jumpWindowSeconds;
  if (
    settings.detectJump
    && (distance > settings.largeJumpDistanceMeters || (distance > settings.jumpDistanceMeters && jumpedInShortWindow))
  ) {
    alerts.push({
      kind: "jump",
      severity: distance > settings.largeJumpDistanceMeters ? "danger" : "warning",
      message: `Position jump ${formatDistance(distance)}`,
      detail: `within ${formatSeconds(timeDeltaSeconds)}, previous ${previous.partition}:${previous.offset}`
    });
  }

  if (settings.detectHeading && Number.isFinite(previous.heading) && Number.isFinite(point.heading)) {
    const delta = headingDelta(Number(previous.heading), Number(point.heading));
    const headingWindow = timeDeltaSeconds === undefined || Math.abs(timeDeltaSeconds) <= settings.headingWindowSeconds;
    if (delta > settings.headingJumpDegrees && headingWindow) {
      alerts.push({
        kind: "heading",
        severity: "warning",
        message: `Heading jump ${delta.toFixed(0)}${String.fromCharCode(176)}`,
        detail: `threshold ${settings.headingJumpDegrees.toFixed(0)}${String.fromCharCode(176)}, within ${formatSeconds(timeDeltaSeconds)}`
      });
    }
  }

  return alerts;
}
