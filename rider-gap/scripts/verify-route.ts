/**
 * Checks the route geometry that the whole app rests on: if progress along the
 * course is wrong, every gap it reports is wrong too. Pure math, no device or
 * network needed. Run with `npm run verify`.
 */
import { haversineMeters } from '../src/geo';
import { ROUTE, ROUTE_LENGTH_M, progressAlongRoute } from '../src/route';

let failures = 0;

function check(name: string, passed: boolean, detail: string): void {
  console.log(`${passed ? 'ok  ' : 'FAIL'}  ${name} :: ${detail}`);
  if (!passed) failures += 1;
}

// A degree of latitude is ~111.2 km anywhere on Earth.
const oneDegree = haversineMeters({ lat: 40, lng: -73 }, { lat: 41, lng: -73 });
check(
  'haversine matches one degree of latitude',
  Math.abs(oneDegree - 111195) < 500,
  `${oneDegree.toFixed(0)} m`,
);

// The Central Park loop is ~9.8 km on the ground.
check(
  'route length is plausible',
  ROUTE_LENGTH_M > 9000 && ROUTE_LENGTH_M < 10600,
  `${(ROUTE_LENGTH_M / 1000).toFixed(2)} km`,
);

const start = progressAlongRoute(ROUTE[0]!);
check(
  'the start line reads as zero',
  start.distanceM < 5 && !start.isOffRoute,
  `${start.distanceM.toFixed(1)} m`,
);

// Walking the vertices in order must produce increasing, on-route progress.
let previous = -1;
let monotonic = true;
let worstOffRoute = 0;
for (const vertex of ROUTE.slice(0, -1)) {
  const result = progressAlongRoute(vertex, previous < 0 ? undefined : previous);
  if (result.distanceM < previous - 1) monotonic = false;
  worstOffRoute = Math.max(worstOffRoute, result.offRouteM);
  previous = result.distanceM;
}
check(
  'progress increases along the route and every vertex snaps to it',
  monotonic && worstOffRoute < 1,
  `worst off-route ${worstOffRoute.toFixed(3)} m`,
);

// A point halfway along a segment should read half that segment's length.
const [first, second] = [ROUTE[0]!, ROUTE[1]!];
const midpoint = {
  lat: (first.lat + second.lat) / 2,
  lng: (first.lng + second.lng) / 2,
};
const midpointProgress = progressAlongRoute(midpoint, 0);
const expectedMidpoint = haversineMeters(first, second) / 2;
check(
  'a segment midpoint reads as half the segment',
  Math.abs(midpointProgress.distanceM - expectedMidpoint) < 2,
  `${midpointProgress.distanceM.toFixed(1)} m vs ${expectedMidpoint.toFixed(1)} m`,
);

// Times Square is nowhere near the park loop.
const offRoute = progressAlongRoute({ lat: 40.758, lng: -73.9855 });
check(
  'a point far from the course is flagged off-route',
  offRoute.isOffRoute,
  `off by ${offRoute.offRouteM.toFixed(0)} m`,
);

// The loop's start and finish overlap, so history has to break the tie.
const atStartLine = { lat: 40.76456, lng: -73.97327 };
check(
  'a cold fix at the start line reads as the start',
  progressAlongRoute(atStartLine).distanceM < 100,
  `${progressAlongRoute(atStartLine).distanceM.toFixed(0)} m`,
);
check(
  'a rider returning to the start line reads as the finish',
  progressAlongRoute(atStartLine, ROUTE_LENGTH_M - 200).distanceM >
    ROUTE_LENGTH_M - 400,
  `${progressAlongRoute(atStartLine, ROUTE_LENGTH_M - 200).distanceM.toFixed(0)} m`,
);

// The gap between two riders is the route distance between them.
const ahead = progressAlongRoute(ROUTE[8]!);
const behind = progressAlongRoute(ROUTE[4]!);
const summed =
  haversineMeters(ROUTE[4]!, ROUTE[5]!) +
  haversineMeters(ROUTE[5]!, ROUTE[6]!) +
  haversineMeters(ROUTE[6]!, ROUTE[7]!) +
  haversineMeters(ROUTE[7]!, ROUTE[8]!);
check(
  'the gap equals the summed segments between two riders',
  Math.abs(ahead.distanceM - behind.distanceM - summed) < 2,
  `${(ahead.distanceM - behind.distanceM).toFixed(0)} m vs ${summed.toFixed(0)} m`,
);

console.log(
  failures === 0 ? '\nAll route checks passed.' : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
