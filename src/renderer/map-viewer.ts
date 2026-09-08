import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LiveMapPoint } from "../shared/types";
import {
  defaultMapOutlierSettings,
  detectMapOutliers,
  type MapOutlierAlert,
  type MapOutlierSettings
} from "./mapOutliers";
import {
  createVehicleIcon,
  escapeHtml,
  formatSpeed,
  getLatLng,
  getPointHeading,
  interpolateHeading,
  markerColor,
  type TrackingMode,
  type VehicleState
} from "./mapViewerVehicles";
import "./styles/map-viewer.css";

const MAX_TRAIL = 80;
const MAX_ALERT_SEGMENTS = 30;
const MAX_ALERT_EVENTS = 120;
const DEFAULT_MOVE_DURATION_MS = 850;
const MIN_MOVE_DURATION_MS = 300;
const MAX_MOVE_DURATION_MS = 1200;
const TRAIL_GAP_METERS = 250;
const FOLLOW_CENTER_INTERVAL_MS = 48;
const OUTLIER_SETTINGS_STORAGE_KEY = "kafkapilot.map-viewer.outlier-settings";
const vehicles = new Map<string, VehicleState>();
type AlertEvent = {
  id: string;
  vehicleId: string;
  point: LiveMapPoint;
  alerts: MapOutlierAlert[];
  createdAt: number;
};

const alertEvents: AlertEvent[] = [];

let selectedId = "";
let trackingMode: TrackingMode = "selected";
let trailsVisible = true;
let popupVisible = false;
let outlierPanelCollapsed = false;
let outlierSettingsOpen = false;
let outlierFilterMode: "all" | "selected" = "all";
let outlierSettings = loadOutlierSettings();
let lastUpdateAt = 0;
let lastFollowCenterAt = 0;

const root = document.getElementById("map-viewer");
if (!root) throw new Error("Map Viewer root element was not found.");

root.innerHTML = `
  <div class="map-viewer-shell">
    <header class="map-viewer-topbar">
      <div class="map-viewer-meta">
        <div class="map-status-group">
          <span class="map-viewer-dot"></span>
          <span id="count">0 points</span>
          <span id="status" class="status-pill empty-status"><span class="status-dot"></span><span>No coordinates</span></span>
          <span id="latest" class="last-update">Waiting for coordinates</span>
        </div>
        <div class="map-actions">
          <div class="tracking-group">
            <button id="followSelected" type="button" class="toggle-action active">Selected</button>
            <button id="autoFit" type="button" class="toggle-action">Auto Fit</button>
            <button id="freeMove" type="button" class="toggle-action">Free</button>
          </div>
          <button id="trail" type="button" class="toggle-action active">Trail</button>
          <button id="clear" type="button" class="clear-action">Clear</button>
        </div>
      </div>
    </header>
    <div class="map-viewer-body">
      <main class="map-panel">
        <div id="leafletMap"></div>
        <div id="empty" class="empty">No latitude/longitude coordinates have been detected yet.</div>
        <div id="popup" class="map-popup"></div>
      </main>
      <aside class="vehicle-sidebar">
        <div class="vehicle-sidebar-header">
          <div class="vehicle-sidebar-title">Vehicles</div>
          <div class="vehicle-sidebar-subtitle">Click an item to focus on it.</div>
        </div>
        <div id="vehicleList" class="vehicle-list"></div>
        <div class="outlier-panel">
          <div class="outlier-header">
            <button id="toggleOutliers" type="button" class="outlier-toggle" aria-expanded="true">
              <div class="outlier-title">Outliers</div>
              <div id="outlierSummary" class="outlier-summary">No warning events</div>
            </button>
            <div class="outlier-actions">
              <div class="outlier-filter-group" aria-label="Outlier filter">
                <button id="showAllOutliers" type="button" class="outlier-filter active">All</button>
                <button id="showSelectedOutliers" type="button" class="outlier-filter">Selected</button>
              </div>
              <button id="toggleOutlierSettings" type="button" class="outlier-clear">Settings</button>
              <button id="clearOutliers" type="button" class="outlier-clear">Clear</button>
            </div>
          </div>
          <div id="outlierSettings" class="outlier-settings">
            <div class="outlier-settings-note">
              <span>Changes are saved automatically.</span>
              <button id="resetOutlierSettings" type="button">Reset defaults</button>
            </div>
            <div class="outlier-settings-grid">
              <section class="outlier-setting-row" data-setting-row="jump">
                <label class="outlier-check"><input id="detectJump" type="checkbox" /> Position jump</label>
                <div class="outlier-setting-fields">
                  <label>Distance m<input id="jumpDistance" type="number" min="1" step="10" /></label>
                  <label>Danger m<input id="largeJumpDistance" type="number" min="1" step="10" /></label>
                  <label>Window s<input id="jumpWindow" type="number" min="0" step="1" /></label>
                </div>
              </section>
              <section class="outlier-setting-row" data-setting-row="speed">
                <label class="outlier-check"><input id="detectSpeed" type="checkbox" /> Speed limit</label>
                <div class="outlier-setting-fields">
                  <label>Limit km/h<input id="speedLimit" type="number" min="1" step="1" /></label>
                </div>
              </section>
              <section class="outlier-setting-row" data-setting-row="heading">
                <label class="outlier-check"><input id="detectHeading" type="checkbox" /> Heading jump</label>
                <div class="outlier-setting-fields">
                  <label>Change deg<input id="headingJump" type="number" min="1" max="180" step="1" /></label>
                  <label>Window s<input id="headingWindow" type="number" min="0" step="1" /></label>
                </div>
              </section>
              <section class="outlier-setting-row compact" data-setting-row="coordinate">
                <label class="outlier-check"><input id="detectInvalidCoordinate" type="checkbox" /> Invalid coordinates</label>
              </section>
              <section class="outlier-setting-row compact" data-setting-row="timestamp">
                <label class="outlier-check"><input id="detectTimestampBackwards" type="checkbox" /> Timestamp backward</label>
              </section>
            </div>
          </div>
          <div id="outlierList" class="outlier-list"></div>
        </div>
      </aside>
    </div>
  </div>
`;

const mapElement = document.getElementById("leafletMap") as HTMLDivElement;
const emptyEl = document.getElementById("empty") as HTMLDivElement;
const popupEl = document.getElementById("popup") as HTMLDivElement;
const countEl = document.getElementById("count") as HTMLSpanElement;
const statusEl = document.getElementById("status") as HTMLSpanElement;
const latestEl = document.getElementById("latest") as HTMLSpanElement;
const followSelectedButton = document.getElementById("followSelected") as HTMLButtonElement;
const autoFitButton = document.getElementById("autoFit") as HTMLButtonElement;
const freeMoveButton = document.getElementById("freeMove") as HTMLButtonElement;
const trailButton = document.getElementById("trail") as HTMLButtonElement;
const clearButton = document.getElementById("clear") as HTMLButtonElement;
const vehicleListEl = document.getElementById("vehicleList") as HTMLDivElement;
const outlierSummaryEl = document.getElementById("outlierSummary") as HTMLDivElement;
const outlierListEl = document.getElementById("outlierList") as HTMLDivElement;
const toggleOutliersButton = document.getElementById("toggleOutliers") as HTMLButtonElement;
const showAllOutliersButton = document.getElementById("showAllOutliers") as HTMLButtonElement;
const showSelectedOutliersButton = document.getElementById("showSelectedOutliers") as HTMLButtonElement;
const toggleOutlierSettingsButton = document.getElementById("toggleOutlierSettings") as HTMLButtonElement;
const clearOutliersButton = document.getElementById("clearOutliers") as HTMLButtonElement;
const outlierSettingsEl = document.getElementById("outlierSettings") as HTMLDivElement;
const resetOutlierSettingsButton = document.getElementById("resetOutlierSettings") as HTMLButtonElement;
const detectJumpInput = document.getElementById("detectJump") as HTMLInputElement;
const jumpDistanceInput = document.getElementById("jumpDistance") as HTMLInputElement;
const largeJumpDistanceInput = document.getElementById("largeJumpDistance") as HTMLInputElement;
const jumpWindowInput = document.getElementById("jumpWindow") as HTMLInputElement;
const detectSpeedInput = document.getElementById("detectSpeed") as HTMLInputElement;
const speedLimitInput = document.getElementById("speedLimit") as HTMLInputElement;
const detectHeadingInput = document.getElementById("detectHeading") as HTMLInputElement;
const headingJumpInput = document.getElementById("headingJump") as HTMLInputElement;
const headingWindowInput = document.getElementById("headingWindow") as HTMLInputElement;
const detectInvalidCoordinateInput = document.getElementById("detectInvalidCoordinate") as HTMLInputElement;
const detectTimestampBackwardsInput = document.getElementById("detectTimestampBackwards") as HTMLInputElement;
const jumpSettingRow = document.querySelector<HTMLElement>('[data-setting-row="jump"]')!;
const speedSettingRow = document.querySelector<HTMLElement>('[data-setting-row="speed"]')!;
const headingSettingRow = document.querySelector<HTMLElement>('[data-setting-row="heading"]')!;

const map = L.map(mapElement, {
  center: [37.5665, 126.978],
  fadeAnimation: false,
  markerZoomAnimation: true,
  zoom: 16,
  zoomControl: true,
  preferCanvas: true
});

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  className: "map-viewer-tile",
  crossOrigin: true,
  maxZoom: 19,
  updateWhenIdle: false,
  updateWhenZooming: true,
  attribution: "&copy; OpenStreetMap"
}).addTo(map);

setTimeout(() => map.invalidateSize(), 0);


function finiteNumber(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function loadOutlierSettings(): MapOutlierSettings {
  try {
    const raw = localStorage.getItem(OUTLIER_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...defaultMapOutlierSettings };
    const parsed = JSON.parse(raw) as Partial<MapOutlierSettings>;
    return {
      ...defaultMapOutlierSettings,
      ...parsed,
      jumpDistanceMeters: finiteNumber(parsed.jumpDistanceMeters, defaultMapOutlierSettings.jumpDistanceMeters, 1),
      largeJumpDistanceMeters: finiteNumber(parsed.largeJumpDistanceMeters, defaultMapOutlierSettings.largeJumpDistanceMeters, 1),
      jumpWindowSeconds: finiteNumber(parsed.jumpWindowSeconds, defaultMapOutlierSettings.jumpWindowSeconds, 0),
      speedLimitKmh: finiteNumber(parsed.speedLimitKmh, defaultMapOutlierSettings.speedLimitKmh, 1),
      headingJumpDegrees: finiteNumber(parsed.headingJumpDegrees, defaultMapOutlierSettings.headingJumpDegrees, 1, 180),
      headingWindowSeconds: finiteNumber(parsed.headingWindowSeconds, defaultMapOutlierSettings.headingWindowSeconds, 0)
    };
  } catch {
    return { ...defaultMapOutlierSettings };
  }
}

function saveOutlierSettings(settings: MapOutlierSettings) {
  outlierSettings = settings;
  localStorage.setItem(OUTLIER_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function syncOutlierSettingsInputs() {
  detectJumpInput.checked = outlierSettings.detectJump;
  jumpDistanceInput.value = String(outlierSettings.jumpDistanceMeters);
  largeJumpDistanceInput.value = String(outlierSettings.largeJumpDistanceMeters);
  jumpWindowInput.value = String(outlierSettings.jumpWindowSeconds);
  detectSpeedInput.checked = outlierSettings.detectSpeed;
  speedLimitInput.value = String(outlierSettings.speedLimitKmh);
  detectHeadingInput.checked = outlierSettings.detectHeading;
  headingJumpInput.value = String(outlierSettings.headingJumpDegrees);
  headingWindowInput.value = String(outlierSettings.headingWindowSeconds);
  detectInvalidCoordinateInput.checked = outlierSettings.detectInvalidCoordinate;
  detectTimestampBackwardsInput.checked = outlierSettings.detectTimestampBackwards;
  updateOutlierSettingDisabledState();
}

function readOutlierSettingsInputs(): MapOutlierSettings {
  const jumpDistanceMeters = finiteNumber(jumpDistanceInput.value, defaultMapOutlierSettings.jumpDistanceMeters, 1);
  const largeJumpDistanceMeters = finiteNumber(largeJumpDistanceInput.value, defaultMapOutlierSettings.largeJumpDistanceMeters, jumpDistanceMeters);
  return {
    detectJump: detectJumpInput.checked,
    jumpDistanceMeters,
    largeJumpDistanceMeters,
    jumpWindowSeconds: finiteNumber(jumpWindowInput.value, defaultMapOutlierSettings.jumpWindowSeconds, 0),
    detectSpeed: detectSpeedInput.checked,
    speedLimitKmh: finiteNumber(speedLimitInput.value, defaultMapOutlierSettings.speedLimitKmh, 1),
    detectHeading: detectHeadingInput.checked,
    headingJumpDegrees: finiteNumber(headingJumpInput.value, defaultMapOutlierSettings.headingJumpDegrees, 1, 180),
    headingWindowSeconds: finiteNumber(headingWindowInput.value, defaultMapOutlierSettings.headingWindowSeconds, 0),
    detectInvalidCoordinate: detectInvalidCoordinateInput.checked,
    detectTimestampBackwards: detectTimestampBackwardsInput.checked
  };
}

function updateOutlierSettings() {
  saveOutlierSettings(readOutlierSettingsInputs());
  updateOutlierSettingDisabledState();
}

function resetOutlierSettings() {
  saveOutlierSettings({ ...defaultMapOutlierSettings });
  syncOutlierSettingsInputs();
  refreshView();
}

function setSettingInputsDisabled(row: HTMLElement, disabled: boolean) {
  row.classList.toggle("disabled", disabled);
  row.querySelectorAll<HTMLInputElement>('input[type="number"]').forEach((input) => {
    input.disabled = disabled;
  });
}

function updateOutlierSettingDisabledState() {
  setSettingInputsDisabled(jumpSettingRow, !detectJumpInput.checked);
  setSettingInputsDisabled(speedSettingRow, !detectSpeedInput.checked);
  setSettingInputsDisabled(headingSettingRow, !detectHeadingInput.checked);
}

function hasDangerAlert(alerts: MapOutlierAlert[]) {
  return alerts.some((alert) => alert.severity === "danger");
}

function alertSummary(alerts: MapOutlierAlert[]) {
  return alerts[0]?.message ?? "";
}

function relativeEventTime(createdAt: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - createdAt) / 1000));
  if (seconds < 60) return `${seconds || 1}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function pushAlertEvent(point: LiveMapPoint, alerts: MapOutlierAlert[]) {
  if (alerts.length === 0) return;
  alertEvents.unshift({
    id: `${point.id}:${point.partition}:${point.offset}:${Date.now()}:${alertEvents.length}`,
    vehicleId: point.id,
    point,
    alerts,
    createdAt: Date.now()
  });
  if (alertEvents.length > MAX_ALERT_EVENTS) {
    alertEvents.splice(MAX_ALERT_EVENTS);
  }
}

function updateVehicleIcon(vehicle: VehicleState, point: LiveMapPoint, heading: number | undefined = getPointHeading(point)) {
  const markerElement = vehicle.marker.getElement();
  const vehicleElement = markerElement?.querySelector<HTMLElement>(".vehicle-marker");
  if (!vehicleElement) {
    vehicle.marker.setIcon(createVehicleIcon(
      heading === undefined ? { ...point, heading: undefined } : { ...point, heading },
      point.id === selectedId,
      vehicle.alerts.length > 0
    ));
    return;
  }

  vehicleElement.classList.toggle("selected", point.id === selectedId);
  vehicleElement.classList.toggle("alerted", vehicle.alerts.length > 0);
  vehicleElement.classList.toggle("danger", hasDangerAlert(vehicle.alerts));
  vehicleElement.classList.toggle("has-heading", heading !== undefined);
  vehicleElement.style.setProperty("--heading", `${heading ?? 0}deg`);
  const labelElement = vehicleElement.querySelector<HTMLElement>(".vehicle-marker-label");
  if (labelElement) {
    labelElement.textContent = point.label || point.id;
  }
}

function appendTrailPoint(vehicle: VehicleState, latLng: L.LatLngTuple) {
  const last = vehicle.trail.at(-1);
  if (!last || last[0] !== latLng[0] || last[1] !== latLng[1]) {
    vehicle.trail.push(latLng);
  }
  if (vehicle.trail.length > MAX_TRAIL) {
    vehicle.trail.splice(0, vehicle.trail.length - MAX_TRAIL);
  }
  vehicle.polyline.setLatLngs(vehicle.trail);
}

function isTrailGap(vehicle: VehicleState, latLng: L.LatLngTuple) {
  const last = vehicle.trail.at(-1);
  if (!last) return false;
  return L.latLng(last).distanceTo(L.latLng(latLng)) > TRAIL_GAP_METERS;
}

function appendAlertSegment(vehicle: VehicleState, from: L.LatLngTuple, to: L.LatLngTuple, alerts: MapOutlierAlert[]) {
  if (alerts.length === 0) return;
  const color = hasDangerAlert(alerts) ? "#ef4444" : "#f59e0b";
  const segment = L.polyline([from, to], {
    color,
    dashArray: "6 6",
    opacity: trailsVisible ? 0.95 : 0,
    weight: 4
  }).addTo(map);
  vehicle.alertSegments.push(segment);
  while (vehicle.alertSegments.length > MAX_ALERT_SEGMENTS) {
    vehicle.alertSegments.shift()?.remove();
  }
}

function selectedVehicle() {
  return selectedId ? vehicles.get(selectedId) ?? null : null;
}

function selectedVehicleMatchesEvent(event: AlertEvent) {
  if (!selectedId) return false;
  const vehicle = vehicles.get(selectedId);
  if (event.vehicleId === selectedId) return true;
  if (!vehicle) return false;
  const selectedLabel = vehicle.point.label || vehicle.point.id;
  const eventLabel = event.point.label || event.vehicleId;
  return selectedLabel === eventLabel;
}

function setTrackingMode(mode: TrackingMode) {
  trackingMode = mode;
  followSelectedButton.classList.toggle("active", mode === "selected");
  autoFitButton.classList.toggle("active", mode === "fit");
  freeMoveButton.classList.toggle("active", mode === "free");
  updateStatus();
}

function updateStatus() {
  let label = "No coordinates";
  let className = "status-pill empty-status";
  if (vehicles.size > 0) {
    if (trackingMode === "free") {
      label = "Paused";
      className = "status-pill free";
    } else if (trackingMode === "fit") {
      label = "Auto Fit";
      className = "status-pill live";
    } else {
      label = selectedId ? "Follow Selected" : "Live";
      className = "status-pill live";
    }
  }
  statusEl.className = className;
  statusEl.innerHTML = `<span class="status-dot"></span><span>${label}</span>`;

  if (!lastUpdateAt) {
    latestEl.textContent = vehicles.size === 0 ? "Waiting for coordinates" : "Loaded buffered coordinates";
    return;
  }
  const seconds = Math.max(0, Math.floor((Date.now() - lastUpdateAt) / 1000));
  latestEl.textContent = seconds <= 1 ? "Last update just now" : `Last update ${seconds}s ago`;
}

function renderMarkers() {
  for (const vehicle of vehicles.values()) {
    updateVehicleIcon(vehicle, vehicle.point, vehicle.lastHeading);
    const alertOpacity = trailsVisible ? (selectedId && selectedId !== vehicle.point.id ? 0.28 : 0.95) : 0;
    vehicle.polyline.setStyle({
      opacity: trailsVisible ? (selectedId && selectedId !== vehicle.point.id ? 0.18 : 0.72) : 0,
      weight: selectedId === vehicle.point.id ? 4 : 2,
      color: markerColor(vehicle.point.id)
    });
    for (const segment of vehicle.alertSegments) {
      segment.setStyle({ opacity: alertOpacity });
    }
  }
}

function closePopup() {
  popupVisible = false;
  popupEl.style.display = "none";
}

function showPopup(point: LiveMapPoint, options: { open?: boolean; alerts?: MapOutlierAlert[] } = {}) {
  selectedId = point.id;
  if (options.open) popupVisible = true;
  if (!popupVisible) {
    popupEl.style.display = "none";
    renderMarkers();
    renderVehicleList();
    renderOutlierList();
    return;
  }

  const meta = point.meta || {};
  const rows = [
    ["Topic", point.topic],
    ["Offset", `${point.partition}:${point.offset}`],
    ["Time", point.timestamp || "-"],
    ["Lat/Lng", `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`],
    ...(Number.isFinite(point.heading) ? [["Heading", `${Number(point.heading).toFixed(1)}${String.fromCharCode(176)}`]] : []),
    ...(formatSpeed(meta.speed) ? [["Speed", `${formatSpeed(meta.speed)} km/h`]] : []),
    ...(meta.drivingMode || meta.driving_mode ? [["Mode", meta.drivingMode || meta.driving_mode]] : []),
    ...(meta.linkId || meta.link_id ? [["Link ID", meta.linkId || meta.link_id]] : [])
  ];
  const vehicle = vehicles.get(point.id);
  const alerts = options.alerts ?? vehicle?.alerts ?? [];
  if (alerts.length > 0) {
    rows.push(["Warning", alerts.map((alert) => alert.detail ? `${alert.message} (${alert.detail})` : alert.message).join(", ")]);
  }

  popupEl.style.display = "block";
  popupEl.innerHTML = `
    <div class="popup-header">
      <div class="popup-title">${escapeHtml(point.label || point.id)}</div>
      <button class="popup-close" type="button" aria-label="Close">x</button>
    </div>
    <div class="popup-grid">
      ${rows.map(([key, value]) => `
        <div class="popup-key">${escapeHtml(key)}</div>
        <div class="popup-value"><code>${escapeHtml(value)}</code></div>
      `).join("")}
    </div>
  `;
  popupEl.querySelector(".popup-close")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closePopup();
  });
  renderMarkers();
  renderVehicleList();
  renderOutlierList();
}

function focusVehicle(point: LiveMapPoint, options: { openPopup?: boolean } = {}) {
  setTrackingMode("selected");
  selectedId = point.id;
  map.panTo(getLatLng(point), { animate: true, duration: 0.45 });
  showPopup(point, { open: options.openPopup });
}

function focusVehicleWithoutPopup(point: LiveMapPoint) {
  setTrackingMode("selected");
  selectedId = point.id;
  map.panTo(getLatLng(point), { animate: true, duration: 0.45 });
  closePopup();
  refreshView();
}

function focusVehicleById(vehicleId: string, options: { openPopup?: boolean } = {}) {
  const vehicle = vehicles.get(vehicleId);
  if (!vehicle) return;
  if (options.openPopup) {
    focusVehicle(vehicle.point, { openPopup: true });
    return;
  }
  focusVehicleWithoutPopup(vehicle.point);
}

function focusOutlierEvent(event: AlertEvent) {
  setTrackingMode("selected");
  selectedId = event.vehicleId;
  map.panTo(getLatLng(event.point), { animate: true, duration: 0.45 });
  showPopup(event.point, { open: true, alerts: event.alerts });
}

function fitAllVehicles() {
  const items = Array.from(vehicles.values());
  if (items.length === 0) return;
  if (items.length === 1) {
    map.panTo(getLatLng(items[0].point), { animate: true, duration: 0.45 });
    return;
  }
  map.fitBounds(items.map((item) => getLatLng(item.point)), {
    animate: true,
    duration: 0.45,
    padding: [72, 72],
    maxZoom: 18
  });
}

function applyTracking() {
  if (trackingMode === "selected") {
    const vehicle = selectedVehicle();
    if (vehicle) {
      const current = vehicle.marker.getLatLng();
      map.panTo([current.lat, current.lng], { animate: true, duration: 0.25 });
    }
    return;
  }
  if (trackingMode === "fit") fitAllVehicles();
}

function animateMarker(vehicle: VehicleState, nextPoint: LiveMapPoint) {
  const previousPoint = vehicle.point;
  const receivedAt = Date.now();
  if (vehicle.animation) {
    cancelAnimationFrame(vehicle.animation);
    vehicle.animation = undefined;
    const current = vehicle.marker.getLatLng();
    appendTrailPoint(vehicle, [current.lat, current.lng]);
  }
  const from = vehicle.marker.getLatLng();
  const to = L.latLng(nextPoint.lat, nextPoint.lng);
  const finalLatLng: L.LatLngTuple = [to.lat, to.lng];
  const shouldResetTrail = isTrailGap(vehicle, finalLatLng);
  const alerts = detectMapOutliers(nextPoint, previousPoint, outlierSettings);
  vehicle.alerts = alerts;
  vehicle.alertCount += alerts.length;
  pushAlertEvent(nextPoint, alerts);
  if (alerts.length > 0) {
    appendAlertSegment(vehicle, [from.lat, from.lng], finalLatLng, alerts);
  }
  const fromHeading = vehicle.lastHeading ?? getPointHeading(previousPoint);
  const toHeading = getPointHeading(nextPoint);
  const duration = vehicle.lastPointAt
    ? Math.min(MAX_MOVE_DURATION_MS, Math.max(MIN_MOVE_DURATION_MS, receivedAt - vehicle.lastPointAt))
    : DEFAULT_MOVE_DURATION_MS;
  vehicle.point = nextPoint;
  vehicle.lastPointAt = receivedAt;
  const start = performance.now();

  function step(now: number) {
    const progress = Math.min(1, (now - start) / duration);
    const lat = from.lat + (to.lat - from.lat) * progress;
    const lng = from.lng + (to.lng - from.lng) * progress;
    const heading = interpolateHeading(fromHeading, toHeading, progress);
    const currentLatLng: L.LatLngTuple = [lat, lng];
    vehicle.marker.setLatLng(currentLatLng);
    vehicle.lastHeading = heading;
    updateVehicleIcon(vehicle, nextPoint, heading);
    vehicle.polyline.setLatLngs(shouldResetTrail ? [currentLatLng] : [...vehicle.trail, currentLatLng]);
    if (
      trackingMode === "selected"
      && selectedId === nextPoint.id
      && (progress === 1 || now - lastFollowCenterAt >= FOLLOW_CENTER_INTERVAL_MS)
    ) {
      lastFollowCenterAt = now;
      map.setView(currentLatLng, map.getZoom(), { animate: false });
    }
    if (progress < 1) {
      vehicle.animation = requestAnimationFrame(step);
      return;
    }
    vehicle.marker.setLatLng(finalLatLng);
    if (shouldResetTrail) {
      vehicle.trail = [finalLatLng];
      vehicle.polyline.setLatLngs(vehicle.trail);
    } else {
      appendTrailPoint(vehicle, finalLatLng);
    }
    vehicle.lastHeading = toHeading;
    updateVehicleIcon(vehicle, nextPoint, toHeading);
    vehicle.animation = undefined;
  }

  vehicle.animation = requestAnimationFrame(step);
}

function upsertVehicle(point: LiveMapPoint) {
  const existing = vehicles.get(point.id);
  if (existing) {
    animateMarker(existing, point);
    return existing;
  }

  const alerts = detectMapOutliers(point, undefined, outlierSettings);
  const marker = L.marker(getLatLng(point), {
    icon: createVehicleIcon(point, point.id === selectedId, alerts.length > 0),
    keyboard: false,
    riseOnHover: true
  }).addTo(map);
  marker.on("click", () => focusVehicleById(point.id, { openPopup: true }));

  const trail = [getLatLng(point)];
  const polyline = L.polyline(trail, {
    color: markerColor(point.id),
    weight: 2,
    opacity: trailsVisible ? 0.72 : 0
  }).addTo(map);

  const vehicle: VehicleState = { point, marker, trail, polyline, alertSegments: [], alerts, alertCount: alerts.length };
  pushAlertEvent(point, alerts);
  vehicle.lastHeading = getPointHeading(point);
  vehicle.lastPointAt = Date.now();
  vehicles.set(point.id, vehicle);
  return vehicle;
}

function renderVehicleList() {
  const items = Array.from(vehicles.values()).sort((left, right) => String(left.point.id).localeCompare(String(right.point.id)));

  // 기존 DOM 버튼을 ID로 맵핑 (재활용하여 깜빡임 방지)
  const existing = new Map<string, HTMLButtonElement>();
  for (const el of vehicleListEl.querySelectorAll<HTMLButtonElement>("[data-vehicle-id]")) {
    existing.set(el.dataset.vehicleId!, el);
  }

  // 사라진 차량 제거
  const currentIds = new Set(items.map((v) => v.point.id));
  for (const [id, el] of existing) {
    if (!currentIds.has(id)) el.remove();
  }

  // 순서대로 업데이트 또는 삽입 (DOM 재사용)
  for (let i = 0; i < items.length; i++) {
    const vehicle = items[i];
    const point = vehicle.point;
    const alertText = alertSummary(vehicle.alerts);
    const speed = formatSpeed(point.meta?.speed);
    const speedValue = speed ? `${speed} km/h` : "";
    const headingValue = Number.isFinite(point.heading) ? `${Number(point.heading).toFixed(0)}${String.fromCharCode(176)}` : "";
    const status = [speedValue, headingValue].filter(Boolean).join(" / ");

    let button = existing.get(point.id);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.dataset.vehicleId = point.id;
      button.style.setProperty("--marker-color", markerColor(point.id));
      button.addEventListener("click", () => focusVehicleById(point.id));
    }

    button.className = [
      "vehicle-item",
      selectedId === point.id ? "selected" : "",
      vehicle.alerts.length > 0 ? "has-alert" : "",
      hasDangerAlert(vehicle.alerts) ? "danger" : ""
    ].filter(Boolean).join(" ");

    button.innerHTML = `
      <span class="vehicle-color"></span>
      <span class="vehicle-card-body">
        <span class="vehicle-main">
          <span class="vehicle-name">${escapeHtml(point.label || point.id)}</span>
          <span class="vehicle-status">${escapeHtml(status)}</span>
        </span>
        <span class="vehicle-meta">${escapeHtml(point.topic)} [${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}]</span>
        ${alertText ? `<span class="vehicle-alert">${escapeHtml(alertText)}</span>` : ""}
      </span>
    `;

    // 올바른 위치에 없으면 이동 (순서 유지)
    if (vehicleListEl.children[i] !== button) {
      vehicleListEl.insertBefore(button, vehicleListEl.children[i] ?? null);
    }
  }
}

function renderOutlierList() {
  const filteredEvents = outlierFilterMode === "selected" && selectedId
    ? alertEvents.filter(selectedVehicleMatchesEvent)
    : alertEvents;
  const selectedFilterUnavailable = outlierFilterMode === "selected" && !selectedId;
  outlierSummaryEl.textContent = selectedFilterUnavailable
    ? "Select a vehicle to filter"
    : filteredEvents.length === 0
      ? "No warning events"
      : `${filteredEvents.length}/${alertEvents.length} warning event${filteredEvents.length === 1 ? "" : "s"}`;
  toggleOutliersButton.setAttribute("aria-expanded", String(!outlierPanelCollapsed));
  toggleOutliersButton.closest(".outlier-panel")?.classList.toggle("collapsed", outlierPanelCollapsed);
  outlierSettingsEl.classList.toggle("open", outlierSettingsOpen && !outlierPanelCollapsed);
  toggleOutlierSettingsButton.classList.toggle("active", outlierSettingsOpen);
  showAllOutliersButton.classList.toggle("active", outlierFilterMode === "all");
  showSelectedOutliersButton.classList.toggle("active", outlierFilterMode === "selected");
  showSelectedOutliersButton.disabled = !selectedId;
  clearOutliersButton.disabled = alertEvents.length === 0;
  outlierListEl.replaceChildren();
  if (outlierPanelCollapsed) return;
  if (filteredEvents.length === 0) {
    const empty = document.createElement("div");
    empty.className = "outlier-empty";
    empty.textContent = selectedFilterUnavailable
      ? "Select a vehicle from the list or map to see only its warning events."
      : outlierFilterMode === "selected"
        ? "The selected vehicle has no warning events."
        : "Detected jumps and invalid coordinates will appear here.";
    outlierListEl.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const event of filteredEvents.slice(0, 50)) {
    const button = document.createElement("button");
    const primaryAlert = event.alerts[0];
    button.type = "button";
    button.className = `outlier-item ${hasDangerAlert(event.alerts) ? "danger" : ""}`;
    button.innerHTML = `
      <span class="outlier-item-main">
        <span class="outlier-vehicle">${escapeHtml(event.point.label || event.vehicleId)}</span>
        <span class="outlier-time">${escapeHtml(relativeEventTime(event.createdAt))}</span>
      </span>
      <span class="outlier-message">${escapeHtml(primaryAlert.message)}</span>
      ${primaryAlert.detail ? `<span class="outlier-detail">${escapeHtml(primaryAlert.detail)}</span>` : ""}
      <span class="outlier-meta">${escapeHtml(event.point.topic)} ${event.point.partition}:${escapeHtml(event.point.offset)}</span>
    `;
    button.addEventListener("click", () => focusOutlierEvent(event));
    fragment.appendChild(button);
  }
  outlierListEl.appendChild(fragment);
}

function refreshView() {
  const alertVehicles = Array.from(vehicles.values()).filter((vehicle) => vehicle.alerts.length > 0).length;
  emptyEl.style.display = vehicles.size === 0 ? "grid" : "none";
  countEl.textContent = vehicles.size + (vehicles.size === 1 ? " point" : " points");
  countEl.dataset.alerts = alertVehicles > 0 ? `${alertVehicles} warning${alertVehicles === 1 ? "" : "s"}` : "";
  followSelectedButton.classList.toggle("active", trackingMode === "selected");
  autoFitButton.classList.toggle("active", trackingMode === "fit");
  freeMoveButton.classList.toggle("active", trackingMode === "free");
  trailButton.classList.toggle("active", trailsVisible);
  renderMarkers();
  renderVehicleList();
  renderOutlierList();
  updateStatus();
}

function addPoints(nextPoints: LiveMapPoint[]) {
  let focusedPoint: LiveMapPoint | null = null;
  for (const point of nextPoints) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue;
    const id = point.id || `${point.topic}:${point.partition}:${point.offset}`;
    const nextPoint = { ...point, id };
    upsertVehicle(nextPoint);
    lastUpdateAt = Date.now();
    if (nextPoint.focus) focusedPoint = nextPoint;
    if (!selectedId) selectedId = nextPoint.id;
  }

  if (focusedPoint) {
    selectedId = focusedPoint.id;
    setTrackingMode("selected");
    showPopup(focusedPoint);
  } else {
    applyTracking();
  }
  refreshView();
}

followSelectedButton.addEventListener("click", () => {
  setTrackingMode("selected");
  const vehicle = selectedVehicle();
  if (vehicle) focusVehicleWithoutPopup(vehicle.point);
});

autoFitButton.addEventListener("click", () => {
  setTrackingMode("fit");
  fitAllVehicles();
  refreshView();
});

freeMoveButton.addEventListener("click", () => {
  setTrackingMode("free");
  refreshView();
});

trailButton.addEventListener("click", () => {
  trailsVisible = !trailsVisible;
  refreshView();
});

clearButton.addEventListener("click", () => {
  for (const vehicle of vehicles.values()) {
    if (vehicle.animation) cancelAnimationFrame(vehicle.animation);
    vehicle.marker.remove();
    vehicle.polyline.remove();
    for (const segment of vehicle.alertSegments) segment.remove();
  }
  vehicles.clear();
  alertEvents.length = 0;
  selectedId = "";
  lastUpdateAt = 0;
  closePopup();
  void window.liveMapApi?.clearPoints?.();
  refreshView();
});

clearOutliersButton.addEventListener("click", () => {
  alertEvents.length = 0;
  for (const vehicle of vehicles.values()) {
    vehicle.alerts = [];
    vehicle.alertCount = 0;
    for (const segment of vehicle.alertSegments) segment.remove();
    vehicle.alertSegments = [];
  }
  refreshView();
});

toggleOutliersButton.addEventListener("click", () => {
  outlierPanelCollapsed = !outlierPanelCollapsed;
  refreshView();
});

showAllOutliersButton.addEventListener("click", () => {
  outlierFilterMode = "all";
  refreshView();
});

showSelectedOutliersButton.addEventListener("click", () => {
  if (!selectedId) return;
  outlierFilterMode = "selected";
  refreshView();
});

toggleOutlierSettingsButton.addEventListener("click", () => {
  outlierSettingsOpen = !outlierSettingsOpen;
  refreshView();
});

resetOutlierSettingsButton.addEventListener("click", resetOutlierSettings);

[
  detectJumpInput,
  jumpDistanceInput,
  largeJumpDistanceInput,
  jumpWindowInput,
  detectSpeedInput,
  speedLimitInput,
  detectHeadingInput,
  headingJumpInput,
  headingWindowInput,
  detectInvalidCoordinateInput,
  detectTimestampBackwardsInput
].forEach((input) => {
  input.addEventListener("change", updateOutlierSettings);
  input.addEventListener("input", updateOutlierSettings);
});

map.on("dragstart zoomstart", () => {
  setTrackingMode("free");
  refreshView();
});

popupEl.addEventListener("pointerdown", (event) => event.stopPropagation());
popupEl.addEventListener("click", (event) => event.stopPropagation());
window.setInterval(updateStatus, 1000);

if (window.liveMapApi?.onPoints) {
  window.liveMapApi.onPoints(addPoints);
  if (typeof window.liveMapApi.getPoints === "function") {
    window.liveMapApi.getPoints().then((bufferedPoints) => {
      if (bufferedPoints.length === 0) {
        refreshView();
        return;
      }
      addPoints(bufferedPoints);
    }).catch(() => {
      latestEl.textContent = "Could not load buffered coordinates";
    });
  }
} else {
  latestEl.textContent = "Map bridge is not ready";
  emptyEl.textContent = "Map Viewer could not connect to KafkaPilot. Close this window and open Map again.";
}

syncOutlierSettingsInputs();
refreshView();
