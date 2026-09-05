import { useEffect, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ROUTE_NAME } from '../route';
import { otherRider, type Rider } from '../riders';
import { STALE_AFTER_MS, useRiderGap } from '../useRiderGap';
import { formatClosingRate, formatDistance } from '../format';
import { isSupabaseConfigured } from '../supabase';
import { RiderCard } from './RiderCard';
import { RouteTrack } from './RouteTrack';

const CONNECTION_TEXT = {
  connecting: 'Connecting…',
  live: 'Live',
  error: 'Disconnected',
} as const;

export function GapScreen({
  me: myRider,
  simulate = false,
  onChangeRider,
}: {
  me: Rider;
  simulate?: boolean;
  onChangeRider: () => void;
}) {
  const { me, them, gapM, isAhead, closingRateMps, connection, errorMessage } =
    useRiderGap(myRider.id, { simulate });
  const theirRider = otherRider(myRider.id);

  // Drives the "Xs ago" readouts, which must keep counting up between fixes.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const myStale = me !== null && now - me.updatedAt > STALE_AFTER_MS;
  const theirStale = them !== null && now - them.updatedAt > STALE_AFTER_MS;
  const gapIsTrustworthy = gapM !== null && !myStale && !theirStale;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.route}>{ROUTE_NAME}</Text>
            <Text style={styles.riding}>Riding as {myRider.label}</Text>
          </View>
          <Pressable onPress={onChangeRider} hitSlop={10}>
            <Text style={styles.switch}>Switch</Text>
          </Pressable>
        </View>

        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              connection === 'live' ? styles.statusLive : styles.statusDown,
            ]}
          />
          <Text style={styles.statusText}>{CONNECTION_TEXT[connection]}</Text>
          {simulate ? (
            <View style={styles.simBadge}>
              <Text style={styles.simBadgeText}>SIMULATED</Text>
            </View>
          ) : null}
        </View>

        {!isSupabaseConfigured ? (
          <Text style={styles.error}>
            Supabase keys are missing. Copy .env.example to .env, then restart
            with `npx expo start -c`.
          </Text>
        ) : null}
        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        <View style={styles.gapBlock}>
          <Text style={styles.gapLabel}>GAP</Text>
          <Text style={[styles.gapValue, !gapIsTrustworthy && styles.gapDimmed]}>
            {gapM === null ? '--' : formatDistance(gapM)}
          </Text>
          <Text style={styles.gapDirection}>
            {gapM === null
              ? `Waiting for ${theirRider?.label ?? 'the other rider'}`
              : isAhead
                ? `You are ahead of ${theirRider?.label ?? 'them'}`
                : `You are behind ${theirRider?.label ?? 'them'}`}
          </Text>
          {gapIsTrustworthy ? (
            <Text style={styles.closing}>
              {formatClosingRate(closingRateMps)}
            </Text>
          ) : (
            <Text style={styles.closingStale}>
              {gapM === null ? ' ' : 'Position is stale — gap may be out of date'}
            </Text>
          )}
        </View>

        <RouteTrack
          riders={[
            {
              label: myRider.label,
              color: myRider.color,
              fraction: me?.progress.fraction ?? 0,
              isStale: myStale,
            },
            ...(them && theirRider
              ? [
                  {
                    label: theirRider.label,
                    color: theirRider.color,
                    fraction: them.progress.fraction,
                    isStale: theirStale,
                  },
                ]
              : []),
          ]}
        />

        <View style={styles.cards}>
          <RiderCard
            label={`${myRider.label} (you)`}
            color={myRider.color}
            rider={me}
            now={now}
            isStale={myStale}
            waitingText="Waiting for GPS…"
          />
          <View style={styles.cardSpacer} />
          <RiderCard
            label={theirRider?.label ?? 'Other rider'}
            color={theirRider?.color ?? '#5C6B7A'}
            rider={them}
            now={now}
            isStale={theirStale}
            waitingText="Not on the route yet"
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0B0F14' },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  route: { color: '#F2F6FA', fontSize: 20, fontWeight: '700' },
  riding: { color: '#5C6B7A', fontSize: 13, marginTop: 2 },
  switch: { color: '#4CC9F0', fontSize: 14, fontWeight: '600' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusLive: { backgroundColor: '#4ADE80' },
  statusDown: { backgroundColor: '#F76C6C' },
  statusText: { color: '#9FB0C0', fontSize: 12 },
  simBadge: {
    marginLeft: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#2A6F8A',
  },
  simBadgeText: {
    color: '#DCF3FB',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  error: { color: '#F76C6C', fontSize: 12, marginTop: 12, lineHeight: 17 },
  gapBlock: { alignItems: 'center', marginVertical: 32 },
  gapLabel: { color: '#5C6B7A', fontSize: 12, letterSpacing: 2 },
  gapValue: {
    color: '#F2F6FA',
    fontSize: 68,
    fontWeight: '800',
    marginTop: 4,
  },
  gapDimmed: { color: '#5C6B7A' },
  gapDirection: { color: '#9FB0C0', fontSize: 15, marginTop: 4 },
  closing: { color: '#4CC9F0', fontSize: 13, marginTop: 10 },
  closingStale: { color: '#F7B267', fontSize: 13, marginTop: 10 },
  cards: { flexDirection: 'row', marginTop: 28 },
  cardSpacer: { width: 12 },
});
