import { StyleSheet, Text, View } from 'react-native';

import type { RiderState } from '../useRiderGap';
import { formatAge, formatDistance, formatSpeed } from '../format';

type Props = {
  label: string;
  color: string;
  rider: RiderState | null;
  now: number;
  isStale: boolean;
  waitingText: string;
};

export function RiderCard({
  label,
  color,
  rider,
  now,
  isStale,
  waitingText,
}: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={styles.label}>{label}</Text>
        {rider && isStale ? <Text style={styles.stale}>STALE</Text> : null}
      </View>

      {rider ? (
        <>
          <Text style={styles.distance}>
            {formatDistance(rider.progress.distanceM)}
          </Text>
          <Text style={styles.meta}>
            {formatSpeed(rider.speedMps)} · {formatAge(now - rider.updatedAt)}
          </Text>
          {rider.progress.isOffRoute ? (
            <Text style={styles.offRoute}>
              Off route by {formatDistance(rider.progress.offRouteM)}
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={styles.waiting}>{waitingText}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#131A22',
    borderRadius: 14,
    padding: 14,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  label: { color: '#9FB0C0', fontSize: 13, fontWeight: '600', flex: 1 },
  stale: { color: '#F76C6C', fontSize: 10, fontWeight: '700' },
  distance: { color: '#F2F6FA', fontSize: 22, fontWeight: '700' },
  meta: { color: '#5C6B7A', fontSize: 12, marginTop: 4 },
  offRoute: { color: '#F7B267', fontSize: 12, marginTop: 6 },
  waiting: { color: '#5C6B7A', fontSize: 13, marginTop: 4 },
});
