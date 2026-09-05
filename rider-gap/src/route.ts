import { createCourse, type CourseProgress } from './course';
import type { LatLng } from './geo';

/**
 * The one hardcoded route. Both devices must run the same ROUTE_ID so their
 * positions land on the same channel and are measured against the same course.
 *
 * Deventer -> Zwolle, following the IJssel north through Olst, Wijhe, Herxen
 * and Windesheim - roughly the N337 dike road that riders use between the two
 * cities.
 *
 * IMPORTANT: these are *waypoints*, not a traced road. The coordinates below
 * are the real positions of each town (see README for sources), but the app
 * joins them with straight lines, so the course cuts every bend the river and
 * the road actually make. Progress is therefore approximate and the total is
 * short of the ~32 km a rider covers on the ground.
 *
 * To ride this for real, replace ROUTE with an accurate trace:
 *   npm run import-gpx -- ~/Downloads/deventer-zwolle.gpx
 * and drop OFF_ROUTE_THRESHOLD_M back to ~75 m.
 */
export const ROUTE_ID = 'deventer-zwolle';
export const ROUTE_NAME = 'Deventer → Zwolle';

export const ROUTE: readonly LatLng[] = [
  { lat: 52.25722, lng: 6.16083 }, // Deventer station
  { lat: 52.33778, lng: 6.11083 }, // Olst
  { lat: 52.38639, lng: 6.13333 }, // Wijhe
  { lat: 52.43134, lng: 6.13317 }, // Herxen
  { lat: 52.4475, lng: 6.13167 }, // Windesheim
  { lat: 52.50528, lng: 6.09056 }, // Zwolle station
];

/**
 * Wide, because the straight-line course above departs from the real road by
 * far more than a GPS error between the widely spaced waypoints. Tighten it to
 * DEFAULT_OFF_ROUTE_THRESHOLD_M (75 m) once ROUTE is a real trace, otherwise
 * genuinely lost riders will not be flagged.
 */
export const OFF_ROUTE_THRESHOLD_M = 2000;

const course = createCourse(ROUTE, {
  offRouteThresholdM: OFF_ROUTE_THRESHOLD_M,
});

export const ROUTE_LENGTH_M = course.lengthM;

export type RouteProgress = CourseProgress;

/** How far along the route a position is. See `Course.progressAt`. */
export function progressAlongRoute(
  point: LatLng,
  previousDistanceM?: number,
): RouteProgress {
  return course.progressAt(point, previousDistanceM);
}

/** The coordinate a given distance along the route. */
export function pointAtDistance(distanceM: number): LatLng {
  return course.pointAtDistance(distanceM);
}
