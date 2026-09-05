/**
 * Generic polyline course logic: given an ordered list of points, work out how
 * far along them a position is, and the inverse.
 *
 * Kept separate from the specific route in `route.ts` so the maths can be
 * exercised against synthetic courses - including awkward ones that double
 * back on themselves - without touching the route the app actually ships.
 */
import { haversineMeters, projectOntoSegment, type LatLng } from './geo';

/** Default distance past which a rider counts as off-route. */
export const DEFAULT_OFF_ROUTE_THRESHOLD_M = 75;

/**
 * Two candidate snaps whose perpendicular distances are within this much of
 * each other are treated as a tie, to be broken by the caller's hint.
 */
const SNAP_TIE_TOLERANCE_M = 40;

export type CourseProgress = {
  /** Distance travelled along the course, in metres. */
  distanceM: number;
  /** 0..1 fraction of the course completed. */
  fraction: number;
  /** Perpendicular distance from the course at the closest point, in metres. */
  offRouteM: number;
  isOffRoute: boolean;
};

export type Course = {
  points: readonly LatLng[];
  lengthM: number;
  offRouteThresholdM: number;
  progressAt(point: LatLng, previousDistanceM?: number): CourseProgress;
  pointAtDistance(distanceM: number): LatLng;
};

export function createCourse(
  points: readonly LatLng[],
  options: { offRouteThresholdM?: number } = {},
): Course {
  if (points.length < 2) {
    throw new Error('A course needs at least two points.');
  }

  const offRouteThresholdM =
    options.offRouteThresholdM ?? DEFAULT_OFF_ROUTE_THRESHOLD_M;

  // Cumulative distance from the start to each point, computed once.
  const cumulativeM: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    cumulativeM.push(cumulativeM[i - 1]! + haversineMeters(points[i - 1]!, points[i]!));
  }
  const lengthM = cumulativeM[cumulativeM.length - 1]!;

  return {
    points,
    lengthM,
    offRouteThresholdM,

    /**
     * Snap a position to the course and report how far along it the rider is.
     *
     * Every segment is tested rather than only those near the last known
     * position, so a rider who opens the app mid-course is placed correctly
     * with no warm-up.
     *
     * `previousDistanceM` disambiguates places where a course passes close to
     * itself - on a loop the start and finish overlap, so a rider coming home
     * would otherwise snap back to 0 m. Among snaps that fit about equally
     * well, the one nearest the rider's last known progress wins.
     */
    progressAt(point: LatLng, previousDistanceM?: number): CourseProgress {
      type Candidate = { distanceM: number; offRouteM: number };
      const candidates: Candidate[] = [];
      let bestOffRouteM = Number.POSITIVE_INFINITY;

      for (let i = 0; i < points.length - 1; i += 1) {
        const { t, distanceM: offRouteM } = projectOntoSegment(
          point,
          points[i]!,
          points[i + 1]!,
        );

        const segmentLengthM = cumulativeM[i + 1]! - cumulativeM[i]!;
        candidates.push({
          distanceM: cumulativeM[i]! + segmentLengthM * t,
          offRouteM,
        });

        if (offRouteM < bestOffRouteM) bestOffRouteM = offRouteM;
      }

      // Any snap fitting nearly as well as the best one is a plausible read of
      // where the rider is; history decides between them when we have it.
      const tied = candidates.filter(
        (c) => c.offRouteM <= bestOffRouteM + SNAP_TIE_TOLERANCE_M,
      );

      let chosen = tied[0]!;
      if (previousDistanceM === undefined) {
        // No history. Where a course passes close to itself the start and the
        // finish fit equally well, so read it as the earlier one: a rider
        // opening the app at the start line is beginning, not finishing.
        for (const c of tied) {
          if (c.distanceM < chosen.distanceM) chosen = c;
        }
      } else {
        for (const c of tied) {
          if (
            Math.abs(c.distanceM - previousDistanceM) <
            Math.abs(chosen.distanceM - previousDistanceM)
          ) {
            chosen = c;
          }
        }
      }

      return {
        distanceM: chosen.distanceM,
        fraction: lengthM === 0 ? 0 : chosen.distanceM / lengthM,
        offRouteM: chosen.offRouteM,
        isOffRoute: chosen.offRouteM > offRouteThresholdM,
      };
    },

    /**
     * The inverse of `progressAt`: the coordinate a given distance along the
     * course. Interpolates linearly in lat/lng, which at segment scale is
     * indistinguishable from interpolating along the great circle.
     */
    pointAtDistance(distanceM: number): LatLng {
      const clamped = Math.max(0, Math.min(lengthM, distanceM));

      let i = 0;
      while (i < points.length - 2 && cumulativeM[i + 1]! < clamped) i += 1;

      const a = points[i]!;
      const b = points[i + 1]!;
      const segmentLengthM = cumulativeM[i + 1]! - cumulativeM[i]!;
      const t = segmentLengthM === 0 ? 0 : (clamped - cumulativeM[i]!) / segmentLengthM;

      return {
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
      };
    },
  };
}
