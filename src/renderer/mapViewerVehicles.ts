import L from "leaflet";
import type { LiveMapPoint } from "../shared/types";
import type { MapOutlierAlert } from "./mapOutliers";

export type TrackingMode = "selected" | "fit" | "free";

export type VehicleState = {
  point: LiveMapPoint;
  marker: L.Marker;
  trail: L.LatLngTuple[];
  polyline: L.Polyline;
  alertSegments: L.Polyline[];
  alerts: MapOutlierAlert[];
  alertCount: number;
  animation?: number;
  lastHeading?: number;
  lastPointAt?: number;
};

export function escapeHtml(value: unknown) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char] ?? char));
}

export function markerColor(id: string) {
  const palette = ["#38bdf8", "#22c55e", "#f59e0b", "#f472b6", "#a78bfa", "#fb7185", "#2dd4bf", "#60a5fa"];
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

export function createVehicleIcon(point: LiveMapPoint, selected: boolean, alerted = false) {
  const color = markerColor(point.id);
  const heading = Number.isFinite(point.heading) ? Number(point.heading) : 0;
  const headingClass = Number.isFinite(point.heading) ? "has-heading" : "";
  const selectedClass = selected ? "selected" : "";
  const alertClass = alerted ? "alerted" : "";
  return L.divIcon({
    className: "vehicle-marker-icon",
    iconSize: [1, 1],
    iconAnchor: [0, 0],
    html: `
      <div class="vehicle-marker ${headingClass} ${selectedClass} ${alertClass}" style="--marker-color:${color}; --heading:${heading}deg">
        <div class="vehicle-marker-body">
          <svg class="vehicle-marker-svg" viewBox="0 0 40 72" aria-hidden="true">
            <path class="vehicle-direction" d="m15 7 5-4 5 4" />
            <g class="vehicle-wheels">
              <rect x="6" y="24" width="5" height="10" rx="2" />
              <rect x="29" y="24" width="5" height="10" rx="2" />
              <rect x="6" y="49" width="5" height="10" rx="2" />
              <rect x="29" y="49" width="5" height="10" rx="2" />
            </g>
            <path class="vehicle-body-shape" d="M15 14h10c4 0 6 4 6 9v36c0 4-2 6-6 6H15c-4 0-6-2-6-6V23c0-5 2-9 6-9Z" />
            <path class="vehicle-glass" d="m13 29 2-7h10l2 7-2 6H15Zm2 21h10l2 7H13Z" />
            <rect class="vehicle-roof" x="14" y="36" width="12" height="12" rx="2" />
            <path class="vehicle-lights" d="M12 19h4m8 0h4" />
            <path class="vehicle-tail-lights" d="M12 61h4m8 0h4" />
          </svg>
        </div>
        <div class="vehicle-marker-label">${escapeHtml(point.label || point.id)}</div>
      </div>
    `
  });
}

export function getLatLng(point: LiveMapPoint): L.LatLngTuple {
  return [point.lat, point.lng];
}

export function getPointHeading(point: LiveMapPoint) {
  return Number.isFinite(point.heading) ? Number(point.heading) : undefined;
}

export function interpolateHeading(from: number | undefined, to: number | undefined, progress: number) {
  if (to === undefined) return undefined;
  if (from === undefined) return to;
  const delta = ((((to - from) % 360) + 540) % 360) - 180;
  return from + delta * progress;
}

export function formatSpeed(speed: unknown) {
  const speedNumber = Number(speed);
  if (!Number.isFinite(speedNumber)) return "";
  return speedNumber.toFixed(1);
}
