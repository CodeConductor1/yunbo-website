import { haversineMeters, projectOntoSegment, type LatLng } from './geo';

/**
 * The one hardcoded route. Both devices must run the same ROUTE_ID so their
 * positions land on the same channel and are measured against the same course.
 *
 * These points approximate the Central Park loop drive (counter-clockwise,
 * the direction traffic runs). Swap in your own coordinates - nothing below
 * assumes anything about this particular course beyond it being ordered
 * start -> finish.
 */
export const ROUTE_ID = 'central-park-loop';
export const ROUTE_NAME = 'Central Park Loop';

export const ROUTE: readonly LatLng[] = [
  // East Drive, heading north from the south end of the park.
  { lat: 40.76454, lng: -73.97325 },
  { lat: 40.76812, lng: -73.97061 },
  { lat: 40.77171, lng: -73.96797 },
  { lat: 40.77529, lng: -73.96533 },
  { lat: 40.77888, lng: -73.96269 },
  { lat: 40.78246, lng: -73.96006 },
  { lat: 40.78605, lng: -73.95742 },
  { lat: 40.78963, lng: -73.95478 },
  { lat: 40.79322, lng: -73.95214 },
  // Across the north end at 110th Street.
  { lat: 40.7968, lng: -73.9495 },
  { lat: 40.79813, lng: -73.95241 },
  { lat: 40.79945, lng: -73.95532 },
  // West Drive, heading back south.
  { lat: 40.80078, lng: -73.95823 },
  { lat: 40.79714, lng: -73.96086 },
  { lat: 40.79351, lng: -73.96348 },
  { lat: 40.78987, lng: -73.96611 },
  { lat: 40.78624, lng: -73.96873 },
  { lat: 40.7826, lng: -73.97136 },
  { lat: 40.77897, lng: -73.97398 },
  { lat: 40.77533, lng: -73.97661 },
  { lat: 40.7717, lng: -73.97923 },
  // Across the south end, closing the lap at the start.
  { lat: 40.76806, lng: -73.98186 },
  { lat: 40.76689, lng: -73.97899 },
  { lat: 40.76571, lng: -73.97612 },
  { lat: 40.76454, lng: -73.97325 },
];

/**
 * Cumulative distance from the start of the route to each point.
 * Computed once at module load; the route never changes at runtime.
 */
const CUMULATIVE_M: readonly number[] = (() => {
  const out: number[] = [0];
  for (let i = 1; i < ROUTE.length; i += 1) {
    const prev = ROUTE[i - 1]!;
    const curr = ROUTE[i]!;
    out.push(out[i - 1]! + haversineMeters(prev, curr));
  }
  return out;
})();

export const ROUTE_LENGTH_M = CUMULATIVE_M[CUMULATIVE_M.length - 1]!;

/**
 * A rider is considered off-route past this perpendicular distance. Generous
 * enough to absorb city GPS error and the width of the coarse polyline above.
 */
export const OFF_ROUTE_THRESHOLD_M = 75;

export type RouteProgress = {
  /** Distance travelled along the route, in metres. */
  distanceM: number;
  /** 0..1 fraction of the route completed. */
  fraction: number;
  /** Perpendicular distance from the route at the closest point, in metres. */
  offRouteM: number;
  isOffRoute: boolean;
};

/**
 * Two candidate snaps whose perpendicular distances are within this much of
 * each other are treated as a tie, to be broken by the caller's hint.
 */
const SNAP_TIE_TOLERANCE_M = 40;

/**
 * Snap a raw GPS fix to the route and report how far along it the rider is.
 *
 * Every segment is tested rather than only the ones near the last known
 * position: the route is short, this is O(25) per fix, and a rider who opens
 * the app mid-course is placed correctly with no warm-up.
 *
 * `previousDistanceM` disambiguates places where the course passes close to
 * itself - on a loop the start and finish overlap, so a rider coming home
 * would otherwise snap back to 0 m. Among snaps that fit the fix about
 * equally well, the one nearest the rider's last known progress wins. Omit it
 * for a cold fix with no history.
 */
export function progressAlongRoute(
  point: LatLng,
  previousDistanceM?: number,
): RouteProgress {
  type Candidate = { distanceM: number; offRouteM: number };
  const candidates: Candidate[] = [];
  let bestOffRouteM = Number.POSITIVE_INFINITY;

  for (let i = 0; i < ROUTE.length - 1; i += 1) {
    const a = ROUTE[i]!;
    const b = ROUTE[i + 1]!;
    const { t, distanceM: offRouteM } = projectOntoSegment(point, a, b);

    const segmentLengthM = CUMULATIVE_M[i + 1]! - CUMULATIVE_M[i]!;
    candidates.push({
      distanceM: CUMULATIVE_M[i]! + segmentLengthM * t,
      offRouteM,
    });

    if (offRouteM < bestOffRouteM) {
      bestOffRouteM = offRouteM;
    }
  }

  // Any snap that fits nearly as well as the best one is a plausible read of
  // where the rider is; history decides between them when we have it.
  const tied = candidates.filter(
    (c) => c.offRouteM <= bestOffRouteM + SNAP_TIE_TOLERANCE_M,
  );

  let chosen = tied[0]!;
  if (previousDistanceM === undefined) {
    // No history to go on. Where the course passes close to itself the start
    // and the finish fit equally well, so read it as the earlier one: a rider
    // opening the app at the start line is beginning the lap, not ending it.
    for (const c of tied) {
      if (c.distanceM < chosen.distanceM) chosen = c;
    }
  } else {
    for (const c of tied) {
      const delta = Math.abs(c.distanceM - previousDistanceM);
      const chosenDelta = Math.abs(chosen.distanceM - previousDistanceM);
      if (delta < chosenDelta) chosen = c;
    }
  }

  return {
    distanceM: chosen.distanceM,
    fraction: ROUTE_LENGTH_M === 0 ? 0 : chosen.distanceM / ROUTE_LENGTH_M,
    offRouteM: chosen.offRouteM,
    isOffRoute: chosen.offRouteM > OFF_ROUTE_THRESHOLD_M,
  };
}
