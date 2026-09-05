/**
 * Checks the route geometry that the whole app rests on: if progress along the
 * course is wrong, every gap it reports is wrong too. Pure math, no device or
 * network needed. Run with `npm run verify`.
 */
import { haversineMeters } from '../src/geo';
import {
  ROUTE,
  ROUTE_LENGTH_M,
  pointAtDistance,
  progressAlongRoute,
} from '../src/route';
import { createSimulatedRider } from '../src/simulation';

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


// `pointAtDistance` must invert `progressAlongRoute`: turning a distance into a
// coordinate and back should land where it started. This is what simulated
// riders are built on, so drift here would fake a gap that isn't real.
let worstRoundTripM = 0;
for (let fraction = 0; fraction <= 1.0001; fraction += 0.05) {
  const target = ROUTE_LENGTH_M * Math.min(1, fraction);
  const returned = progressAlongRoute(pointAtDistance(target), target).distanceM;
  worstRoundTripM = Math.max(worstRoundTripM, Math.abs(returned - target));
}
check(
  'distance -> point -> distance round-trips',
  worstRoundTripM < 1,
  `worst drift ${worstRoundTripM.toFixed(3)} m`,
);

check(
  'pointAtDistance clamps beyond the route',
  progressAlongRoute(pointAtDistance(ROUTE_LENGTH_M * 2), ROUTE_LENGTH_M)
    .distanceM > ROUTE_LENGTH_M - 1,
  'past the finish clamps to the finish',
);

// A simulated rider must cover exactly speed x time.
const moving = createSimulatedRider({
  startDistanceM: 100,
  speedMps: 8,
  jitterM: 0,
});
const after60s = moving.fixAt(60_000);
check(
  'a simulated rider covers speed x time',
  Math.abs(after60s.distanceM - (100 + 8 * 60)) < 0.5,
  `${after60s.distanceM.toFixed(1)} m after 60 s`,
);

// Jitter should perturb the fix without throwing it off the route.
const jittery = createSimulatedRider({ speedMps: 8, jitterM: 4 });
let worstJitterOffRoute = 0;
for (let tick = 0; tick < 60; tick += 1) {
  const fix = jittery.fixAt(tick * 1000);
  const snapped = progressAlongRoute(fix.point, fix.distanceM);
  worstJitterOffRoute = Math.max(worstJitterOffRoute, snapped.offRouteM);
}
check(
  'simulated jitter stays on the route',
  worstJitterOffRoute < 10,
  `worst off-route ${worstJitterOffRoute.toFixed(1)} m`,
);

// Without --loop the rider stops at the finish; with it, it wraps around.
const oneLap = createSimulatedRider({ speedMps: 1000, jitterM: 0 });
const stopped = oneLap.fixAt(60_000);
check(
  'a non-looping rider stops at the finish',
  stopped.finished &&
    Math.abs(stopped.distanceM - ROUTE_LENGTH_M) < 0.5 &&
    stopped.speedMps === 0,
  `${stopped.distanceM.toFixed(0)} m of ${ROUTE_LENGTH_M.toFixed(0)} m`,
);

const looping = createSimulatedRider({ speedMps: 1000, jitterM: 0, loop: true });
const wrapped = looping.fixAt(60_000);
check(
  'a looping rider wraps past the finish',
  !wrapped.finished && wrapped.distanceM < ROUTE_LENGTH_M,
  `${wrapped.distanceM.toFixed(0)} m into the next lap`,
);

console.log(
  failures === 0 ? '\nAll route checks passed.' : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
