/**
 * Virtual riders for testing without two phones.
 *
 * The same motion model backs both simulator entry points: the in-app toggle
 * that stands in for this device's GPS, and `scripts/simulate-rider.ts`, which
 * publishes a second rider straight to Supabase.
 */
import type { LatLng } from './geo';
import { pointAtDistance, ROUTE_LENGTH_M } from './route';

/** A relaxed cycling pace, ~25 km/h. */
export const DEFAULT_SPEED_MPS = 7;

/** Roughly the horizontal error of a phone GPS with a clear view of the sky. */
export const DEFAULT_JITTER_M = 4;

const METERS_PER_DEGREE_LAT = 111_320;

export type SimulatedRiderOptions = {
  /** Where on the route the rider starts, in metres. */
  startDistanceM?: number;
  speedMps?: number;
  /** Random position noise, so the app sees realistically jittery fixes. */
  jitterM?: number;
  /** Wrap to the start on finishing, instead of stopping at the finish line. */
  loop?: boolean;
};

export type SimulatedFix = {
  point: LatLng;
  distanceM: number;
  speedMps: number;
  accuracyM: number;
  /** True once a non-looping rider has reached the finish. */
  finished: boolean;
};

/** Offset a coordinate by a random vector of up to `jitterM` metres. */
function applyJitter(point: LatLng, jitterM: number): LatLng {
  if (jitterM <= 0) return point;

  const bearing = Math.random() * 2 * Math.PI;
  const magnitude = Math.random() * jitterM;
  const north = Math.cos(bearing) * magnitude;
  const east = Math.sin(bearing) * magnitude;

  return {
    lat: point.lat + north / METERS_PER_DEGREE_LAT,
    lng:
      point.lng +
      east /
        (METERS_PER_DEGREE_LAT * Math.cos((point.lat * Math.PI) / 180)),
  };
}

/**
 * A rider moving along the route at a constant speed. Stateless in itself -
 * position is a pure function of elapsed time - so callers can poll it at
 * whatever rate suits them.
 */
export function createSimulatedRider(options: SimulatedRiderOptions = {}) {
  const {
    startDistanceM = 0,
    speedMps = DEFAULT_SPEED_MPS,
    jitterM = DEFAULT_JITTER_M,
    loop = false,
  } = options;

  return {
    speedMps,
    fixAt(elapsedMs: number): SimulatedFix {
      const travelled = startDistanceM + (speedMps * elapsedMs) / 1000;

      const finished = !loop && travelled >= ROUTE_LENGTH_M;
      const distanceM = loop
        ? ((travelled % ROUTE_LENGTH_M) + ROUTE_LENGTH_M) % ROUTE_LENGTH_M
        : Math.min(travelled, ROUTE_LENGTH_M);

      return {
        point: applyJitter(pointAtDistance(distanceM), jitterM),
        distanceM,
        // A stopped rider reports zero speed, which is what a phone would say.
        speedMps: finished ? 0 : speedMps,
        accuracyM: Math.max(3, jitterM),
        finished,
      };
    },
  };
}
