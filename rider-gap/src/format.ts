/** Metres for anything under a kilometre, then km with one decimal. */
export function formatDistance(meters: number): string {
  const abs = Math.abs(meters);
  if (abs < 1000) return `${Math.round(abs)} m`;
  return `${(abs / 1000).toFixed(2)} km`;
}

export function formatSpeed(metersPerSecond: number | null): string {
  if (metersPerSecond === null || metersPerSecond < 0) return '--';
  return `${(metersPerSecond * 3.6).toFixed(1)} km/h`;
}

/** Compact age of a fix, for spotting a rider whose signal has dropped. */
export function formatAge(ageMs: number): string {
  const seconds = Math.max(0, Math.round(ageMs / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

/** e.g. "closing at 1.4 m/s" - the useful reading of a gap in motion. */
export function formatClosingRate(closingRateMps: number | null): string {
  if (closingRateMps === null) return 'Holding steady';
  if (Math.abs(closingRateMps) < 0.15) return 'Holding steady';
  const verb = closingRateMps < 0 ? 'Closing' : 'Opening';
  return `${verb} at ${Math.abs(closingRateMps).toFixed(1)} m/s`;
}
