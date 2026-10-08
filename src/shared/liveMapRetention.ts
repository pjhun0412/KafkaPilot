// Bound both the background buffer and the open viewer, including offset-based IDs.
export const MAX_LIVE_MAP_POINTS = 5000;

export function retainRecentMapValue<T>(items: Map<string, T>, id: string, value: T) {
  items.delete(id);
  items.set(id, value);
  if (items.size <= MAX_LIVE_MAP_POINTS) return undefined;
  const oldest = items.entries().next().value as [string, T];
  items.delete(oldest[0]);
  return oldest;
}
