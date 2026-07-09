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
          <svg class="vehicle-marker-svg" viewBox="0 0 48 88" aria-hidden="true">
            <path class="vehicle-body-shape" d="M24 2c-9.3 0-15.8 5.7-17.1 15L3.3 43.6c-.4 3-.4 6.1 0 9.1L6.9 71C8.2 80.3 14.7 86 24 86s15.8-5.7 17.1-15l3.6-18.3c.6-3 .6-6.1 0-9.1L41.1 17C39.8 7.7 33.3 2 24 2Z" />
            <path class="vehicle-glass" d="M11.2 19.4c1.2-5.3 4.6-8.1 10.2-8.5l-1.8 8.4c-.4 1.8-1.8 3.1-3.6 3.5l-5.6 1.2.8-4.6Zm25.6 0-.8 4.6-5.6-1.2c-1.8-.4-3.2-1.7-3.6-3.5L25 10.9c5.6.4 9 3.2 10.2 8.5Z" />
            <path class="vehicle-glass" d="M12.3 37.1c6.6-2.1 17.1-2.1 23.4 0l-2.3 12.8c-5.3-2.2-13.7-2.2-18.8 0l-2.3-12.8Zm2.1 29.7c5.1 2.3 14.1 2.3 19.2 0l-1.6 8c-.8 4.1-3.6 6.3-8 6.3s-7.2-2.2-8-6.3l-1.6-8Z" />
            <path class="vehicle-shadow-shape" d="M8.9 29.3c3.7-1.7 8.9-2.6 15.1-2.6s11.4.9 15.1 2.6l.9 6.6c-4.5-2.3-10-3.4-16-3.4S12.5 33.6 8 35.9l.9-6.6Zm-.4 29.3c4.8 2.2 10 3.3 15.5 3.3s10.7-1.1 15.5-3.3l-1.1 5.4c-4.2 2.4-9 3.6-14.4 3.6S13.8 66.4 9.6 64l-1.1-5.4Z" />
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
