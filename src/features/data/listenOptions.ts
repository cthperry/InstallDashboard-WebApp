export type RealtimeListenOptions = {
  maxRows?: number;
};

export function resolveRealtimeListenLimit(options: RealtimeListenOptions = {}): number | null {
  const maxRows = Number(options.maxRows);
  if (!Number.isFinite(maxRows) || maxRows <= 0) return null;
  return Math.floor(maxRows);
}
