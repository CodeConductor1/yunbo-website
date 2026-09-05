/**
 * Geo helpers for measuring progress along a fixed route.
 *
 * Distances are small (a few km), so we project to a local tangent plane
 * (equirectangular) around a reference point before doing any line math.
 * Over a single route that keeps the error well under GPS noise, and it
 * lets us use plain 2D vector projection instead of spherical geometry.
 */

export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6371008.8;
const DEG_TO_RAD = Math.PI / 180;

/** Great-circle distance in metres. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLng = (b.lng - a.lng) * DEG_TO_RAD;
  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

type PlanarPoint = { x: number; y: number };

/** Project a lat/lng onto a local metre-based plane centred on `origin`. */
function toPlanar(origin: LatLng, p: LatLng): PlanarPoint {
  const latRad = origin.lat * DEG_TO_RAD;
  return {
    x: (p.lng - origin.lng) * DEG_TO_RAD * EARTH_RADIUS_M * Math.cos(latRad),
    y: (p.lat - origin.lat) * DEG_TO_RAD * EARTH_RADIUS_M,
  };
}

export type SegmentProjection = {
  /** How far along the segment the closest point sits, clamped to [0, 1]. */
  t: number;
  /** Perpendicular distance from the point to the segment, in metres. */
  distanceM: number;
};

/**
 * Closest point on segment `a`->`b` to `p`, expressed as a fraction of the
 * segment plus the off-segment distance.
 */
export function projectOntoSegment(
  p: LatLng,
  a: LatLng,
  b: LatLng,
): SegmentProjection {
  // Use `a` as the plane origin so the segment starts at (0, 0).
  const pv = toPlanar(a, p);
  const bv = toPlanar(a, b);

  const segLenSq = bv.x * bv.x + bv.y * bv.y;
  if (segLenSq === 0) {
    // Degenerate segment (duplicated route point): fall back to point distance.
    return { t: 0, distanceM: Math.hypot(pv.x, pv.y) };
  }

  const rawT = (pv.x * bv.x + pv.y * bv.y) / segLenSq;
  const t = Math.max(0, Math.min(1, rawT));

  const closestX = bv.x * t;
  const closestY = bv.y * t;

  return { t, distanceM: Math.hypot(pv.x - closestX, pv.y - closestY) };
}
