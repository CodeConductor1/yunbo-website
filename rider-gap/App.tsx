import { useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { GapScreen } from './src/components/GapScreen';
import { ROUTE_LENGTH_M, ROUTE_NAME } from './src/route';
import { formatDistance } from './src/format';
import { RIDERS, type Rider } from './src/riders';

/**
 * Two devices, one route. Each device picks a different rider here; from then
 * on the screen shows the live gap between them.
 */
export default function App() {
  const [me, setMe] = useState<Rider | null>(null);

  if (me) {
    return (
      <>
        <StatusBar style="light" />
        <GapScreen me={me} onChangeRider={() => setMe(null)} />
      </>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <Text style={styles.title}>Rider Gap</Text>
        <Text style={styles.subtitle}>
          {ROUTE_NAME} · {formatDistance(ROUTE_LENGTH_M)}
        </Text>
        <Text style={styles.prompt}>
          Pick this device's rider. Use a different one on the other device.
        </Text>

        {RIDERS.map((rider) => (
          <Pressable
            key={rider.id}
            style={({ pressed }) => [styles.option, pressed && styles.pressed]}
            onPress={() => setMe(rider)}
          >
            <View style={[styles.dot, { backgroundColor: rider.color }]} />
            <Text style={styles.optionText}>{rider.label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0B0F14' },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  title: { color: '#F2F6FA', fontSize: 34, fontWeight: '800' },
  subtitle: { color: '#9FB0C0', fontSize: 15, marginTop: 6 },
  prompt: { color: '#5C6B7A', fontSize: 14, marginTop: 28, lineHeight: 20 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131A22',
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 18,
    marginTop: 14,
  },
  pressed: { opacity: 0.6 },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  optionText: { color: '#F2F6FA', fontSize: 17, fontWeight: '600' },
});
