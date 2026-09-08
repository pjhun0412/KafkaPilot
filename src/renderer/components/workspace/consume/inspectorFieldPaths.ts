export type MapFieldPickerId = "x" | "y" | "identity" | "heading" | "speed";

export function getPathSegments(path: string) {
  return path.split(".").filter(Boolean);
}

export function formatMapFieldPath(path: string) {
  if (!path) return "";
  const segments = getPathSegments(path);
  const leaf = segments.at(-1) ?? path;
  const parent = segments.at(-2) ?? "";
  return parent ? `${leaf} (...${parent})` : leaf;
}

export function getAutoMapFieldPath(paths: string[], kind: MapFieldPickerId) {
  const patterns: Record<MapFieldPickerId, RegExp[]> = {
    x: [/longitude$/i, /lng$/i, /lon$/i, /xM$/],
    y: [/latitude$/i, /lat$/i, /yM$/],
    identity: [/vehicleID$/i, /vehicleId$/i, /terminalID$/i, /terminalId$/i],
    heading: [/heading$/i, /bearing$/i, /direction$/i],
    speed: [/egoVehicleSpeedMps$/i, /speedMps$/i, /speed$/i]
  };
  return paths.find((path) => patterns[kind].some((pattern) => pattern.test(path))) ?? "";
}

export function getValueColumnPathFromTreePath(path: string) {
  const valuePrefix = "message.value.";
  if (!path.startsWith(valuePrefix)) return null;
  const valuePath = path.slice(valuePrefix.length);
  return valuePath ? valuePath : null;
}
