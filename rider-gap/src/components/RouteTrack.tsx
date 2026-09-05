import { StyleSheet, Text, View } from 'react-native';

import { ROUTE_LENGTH_M } from '../route';
import { formatDistance } from '../format';

type TrackRider = {
  label: string;
  color: string;
  fraction: number;
  isStale: boolean;
};

/**
 * The route drawn flat as a single bar, with each rider as a marker on it.
 * Straightening the course is the point: what matters here is who is further
 * along, not the shape of the roads.
 */
export function RouteTrack({ riders }: { riders: TrackRider[] }) {
  return (
    <View style={styles.container}>
      <View style={styles.track}>
        {riders.map((rider) => (
          <View
            key={rider.label}
            style={[
              styles.marker,
              {
                left: `${Math.min(100, Math.max(0, rider.fraction * 100))}%`,
                backgroundColor: rider.color,
                opacity: rider.isStale ? 0.35 : 1,
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.labels}>
        <Text style={styles.endpoint}>Start</Text>
        <Text style={styles.endpoint}>{formatDistance(ROUTE_LENGTH_M)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1E2A38',
    justifyContent: 'center',
  },
  marker: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#0B0F14',
    // Centre the marker on its position rather than hanging it to the right.
    marginLeft: -8,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  endpoint: { color: '#5C6B7A', fontSize: 12 },
});
