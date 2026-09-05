import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import type { RealtimeChannel } from '@supabase/supabase-js';

import type { LatLng } from './geo';
import { progressAlongRoute, ROUTE_ID, type RouteProgress } from './route';
import { supabase, type RiderPositionRow } from './supabase';

/** A rider is treated as stale - and the gap untrustworthy - past this age. */
export const STALE_AFTER_MS = 15_000;

/** Floor on how often we write our own position, whatever the GPS does. */
const MIN_PUBLISH_INTERVAL_MS = 1_500;

/** Smoothing on the closing-rate estimate; raw GPS-to-GPS deltas are jumpy. */
const CLOSING_RATE_SMOOTHING = 0.3;

export type RiderState = {
  riderId: string;
  point: LatLng;
  progress: RouteProgress;
  speedMps: number | null;
  accuracyM: number | null;
  /** Epoch ms of the fix, from our clock for self and the DB clock for others. */
  updatedAt: number;
};

export type ConnectionStatus = 'connecting' | 'live' | 'error';

export type RiderGap = {
  me: RiderState | null;
  them: RiderState | null;
  /** Metres of route between the riders, or null until both have reported. */
  gapM: number | null;
  /** True when I am further along the route than they are. */
  isAhead: boolean | null;
  /**
   * Rate of change of the gap in m/s: negative means the gap is closing.
   * Null until there are two gap samples to compare.
   */
  closingRateMps: number | null;
  connection: ConnectionStatus;
  errorMessage: string | null;
};

function rowToRiderState(
  row: RiderPositionRow,
  previousDistanceM: number | undefined,
): RiderState {
  const point = { lat: row.lat, lng: row.lng };
  return {
    riderId: row.rider_id,
    point,
    progress: progressAlongRoute(point, previousDistanceM),
    speedMps: row.speed_mps,
    accuracyM: row.accuracy_m,
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

/**
 * Tracks this device's position, publishes it, and follows the other rider
 * over Supabase realtime. Both devices run this with their ids swapped.
 */
export function useRiderGap(myRiderId: string): RiderGap {
  const [me, setMe] = useState<RiderState | null>(null);
  const [them, setThem] = useState<RiderState | null>(null);
  const [closingRateMps, setClosingRateMps] = useState<number | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Refs hold the values the callbacks below need without re-subscribing.
  const myProgressRef = useRef<number | undefined>(undefined);
  const theirProgressRef = useRef<number | undefined>(undefined);
  const lastPublishAtRef = useRef(0);
  const lastGapSampleRef = useRef<{ gapM: number; at: number } | null>(null);
  const closingRateRef = useRef<number | null>(null);

  const applyRemoteRow = useCallback(
    (row: RiderPositionRow) => {
      if (row.rider_id === myRiderId || row.route_id !== ROUTE_ID) return;
      const next = rowToRiderState(row, theirProgressRef.current);
      theirProgressRef.current = next.progress.distanceM;
      setThem(next);
    },
    [myRiderId],
  );

  // --- Publish our own position -------------------------------------------
  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;

      if (status !== 'granted') {
        setErrorMessage(
          'Location permission denied. Rider Gap needs it to place you on the route.',
        );
        setConnection('error');
        return;
      }

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 2_000,
          distanceInterval: 5,
        },
        (fix) => {
          const point = { lat: fix.coords.latitude, lng: fix.coords.longitude };
          const progress = progressAlongRoute(point, myProgressRef.current);
          myProgressRef.current = progress.distanceM;

          setMe({
            riderId: myRiderId,
            point,
            progress,
            speedMps: fix.coords.speed,
            accuracyM: fix.coords.accuracy,
            updatedAt: Date.now(),
          });

          const now = Date.now();
          if (now - lastPublishAtRef.current < MIN_PUBLISH_INTERVAL_MS) return;
          lastPublishAtRef.current = now;

          void supabase
            .from('rider_positions')
            .upsert(
              {
                rider_id: myRiderId,
                route_id: ROUTE_ID,
                lat: point.lat,
                lng: point.lng,
                accuracy_m: fix.coords.accuracy,
                speed_mps: fix.coords.speed,
                updated_at: new Date(now).toISOString(),
              },
              { onConflict: 'rider_id' },
            )
            .then(({ error }) => {
              // A failed write is not fatal - the next fix retries in ~2s -
              // but surface it so a misconfigured project is obvious.
              if (error) setErrorMessage(`Could not publish position: ${error.message}`);
              else setErrorMessage(null);
            });
        },
      );
    })().catch((err: unknown) => {
      if (cancelled) return;
      setErrorMessage(err instanceof Error ? err.message : 'Location failed to start.');
      setConnection('error');
    });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [myRiderId]);

  // --- Follow the other rider ---------------------------------------------
  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    // Seed from the table first so a rider joining late sees the other
    // immediately instead of waiting for their next movement.
    void supabase
      .from('rider_positions')
      .select('*')
      .eq('route_id', ROUTE_ID)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        for (const row of data as RiderPositionRow[]) applyRemoteRow(row);
      });

    channel = supabase
      .channel(`rider-positions:${ROUTE_ID}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rider_positions',
          filter: `route_id=eq.${ROUTE_ID}`,
        },
        (payload) => {
          const row = payload.new as RiderPositionRow | null;
          if (row?.rider_id) applyRemoteRow(row);
        },
      )
      .subscribe((status) => {
        if (cancelled) return;
        if (status === 'SUBSCRIBED') setConnection('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnection('error');
        }
      });

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [applyRemoteRow]);

  // --- Derive the gap ------------------------------------------------------
  const gapM =
    me && them ? me.progress.distanceM - them.progress.distanceM : null;

  useEffect(() => {
    if (gapM === null) {
      lastGapSampleRef.current = null;
      closingRateRef.current = null;
      setClosingRateMps(null);
      return;
    }

    const now = Date.now();
    const previous = lastGapSampleRef.current;
    lastGapSampleRef.current = { gapM, at: now };

    if (!previous) return;

    const elapsedS = (now - previous.at) / 1000;
    if (elapsedS <= 0) return;

    // Compare magnitudes so "closing" means the riders are converging,
    // regardless of who is currently ahead.
    const instantaneous =
      (Math.abs(gapM) - Math.abs(previous.gapM)) / elapsedS;
    const smoothed =
      closingRateRef.current === null
        ? instantaneous
        : closingRateRef.current +
          CLOSING_RATE_SMOOTHING * (instantaneous - closingRateRef.current);

    closingRateRef.current = smoothed;
    setClosingRateMps(smoothed);
  }, [gapM]);

  return {
    me,
    them,
    gapM,
    isAhead: gapM === null ? null : gapM >= 0,
    closingRateMps,
    connection,
    errorMessage,
  };
}
