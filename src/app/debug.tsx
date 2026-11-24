import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { isRevealed } from '@/game/reveal/reveal';
import { networkUnlocked } from '@/game/supply/unlock';
import type { LatLng } from '@/game/generation/types';
import { deviceLocation } from '@/services/location';
import { clearTimings, timingEntries, timingsAsText } from '@/services/timings';
import { useLanguage } from '@/hooks/useLanguage';
import { useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { useWorldStore } from '@/store/worldStore';

const FALLBACK_LOCATION = { latitude: -41.2865, longitude: 174.7762 };
const STEP_METERS = [10, 50];

/** The profiler: turn it on, watch the slowest spans, copy them out of the app. */
function TimingsDebug() {
  const recordTimings = useDebugStore((state) => state.recordTimings);
  const set = useDebugStore((state) => state.set);
  const [, setTick] = useState(0);
  const [copied, setCopied] = useState(false);
  const refresh = () => setTick((tick) => tick + 1);
  return (
    <>
      <Text style={styles.title}>Timings</Text>
      <View style={styles.row}>
        <Text>Record timings</Text>
        <Switch value={recordTimings} onValueChange={(on) => set({ recordTimings: on })} />
      </View>
      <View style={styles.row}>
        <Button title="Refresh" onPress={refresh} />
        <Button
          title="Clear"
          onPress={() => {
            clearTimings();
            refresh();
          }}
        />
        <Button
          title="Copy"
          onPress={() => {
            Clipboard.setStringAsync(timingsAsText()).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
        />
      </View>
      <Text style={styles.hint}>
        Times the map computations, the marker and panel renders, the panel odds and the wait from a tap to what it
        opens; anything over one frame is also logged with the tag [perf] (adb logcat). Keeps the slowest 50.
      </Text>
      {copied && <Text style={styles.mono}>Copied.</Text>}
      {timingEntries().length === 0 && <Text style={styles.mono}>Nothing recorded yet.</Text>}
      {timingEntries().map((entry, index) => (
        <Text key={index} style={styles.mono}>
          {new Date(entry.at).toLocaleTimeString()} {entry.durationMs.toFixed(1)}ms {entry.name}
        </Text>
      ))}
    </>
  );
}

function SupplyDebug() {
  const save = useGameStore((state) => state.save);
  const position = useDebugStore((state) => state.mockLocation) ?? useWorldStore.getState().player ?? FALLBACK_LOCATION;
  // Why the network is unlocked on this save: the tier 2 reveal, the debug flag, or not yet.
  const unlockState = isRevealed(save, 'network') ? 'tier 2 reached' : save.supply.debugUnlocked ? 'debug' : 'locked until tier 2';

  return (
    <>
      <Text style={styles.title}>Supply lines</Text>
      <View style={styles.row}>
        <Text>{`Network: ${networkUnlocked(save) ? 'unlocked' : 'locked'} (${unlockState})`}</Text>
        <Button title="Unlock the network on this save" onPress={() => useGameStore.getState().debugUnlockNetwork()} />
      </View>
      <View style={styles.row}>
        <Button title="Discover everything in view" onPress={() => useGameStore.getState().debugDiscoverAround(position)} />
      </View>
      <View style={styles.row}>
        <Button title="Age the network by two days" onPress={() => useGameStore.getState().debugAgeNetwork(2 * 24 * 3_600_000)} />
      </View>
      <Text style={styles.hint}>Ages buildings, the cart and raids; map places follow the real clock.</Text>
    </>
  );
}

export default function DebugScreen() {
  useLanguage();
  const debug = useDebugStore();
  const game = useGameStore();

  /** The mock location if set, else the device's, else a fallback. */
  const currentPosition = async (): Promise<LatLng> => {
    if (debug.mockLocation) return debug.mockLocation;
    try {
      return (await deviceLocation.requestPermission()) ? (await deviceLocation.getCurrent()).position : FALLBACK_LOCATION;
    } catch {
      return FALLBACK_LOCATION;
    }
  };

  const toggleMock = async (enabled: boolean) => {
    debug.set({ mockLocation: enabled ? await currentPosition() : null });
  };

  const confirmReset = () =>
    Alert.alert('Reset save data?', 'Inventory, heroes, expeditions and chests go back to the start.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: game.resetSave },
    ]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Location</Text>
      <View style={styles.row}>
        <Text>Mock location</Text>
        <Switch value={debug.mockLocation !== null} onValueChange={toggleMock} />
      </View>
      {debug.mockLocation && (
        <>
          <Text style={styles.mono}>
            {debug.mockLocation.latitude.toFixed(5)}, {debug.mockLocation.longitude.toFixed(5)}
          </Text>
          {STEP_METERS.map((step) => (
            <View key={step} style={styles.row}>
              <Button title={`N ${step}m`} onPress={() => debug.moveMockLocation(step, 0)} />
              <Button title={`S ${step}m`} onPress={() => debug.moveMockLocation(-step, 0)} />
              <Button title={`E ${step}m`} onPress={() => debug.moveMockLocation(0, step)} />
              <Button title={`W ${step}m`} onPress={() => debug.moveMockLocation(0, -step)} />
            </View>
          ))}
          <Text style={styles.hint}>You can also tap the map to teleport.</Text>
        </>
      )}

      <Text style={styles.title}>Shortcuts</Text>
      <View style={styles.row}>
        <Button title="+1,000 gold" onPress={() => game.addGold(1000)} />
        <Button title="+10 of every material" onPress={() => game.addAllMaterials(10)} />
        <Button title="Heal everyone" onPress={game.healAll} />
        <Button title="Finish all expeditions now" onPress={game.fastForwardExpeditions} />
      </View>

      <Text style={styles.title}>Progression</Text>
      <View style={styles.row}>
        <Button title="Beat next boss" onPress={game.beatNextBoss} />
        <Button title="Grant next pickaxe" onPress={game.grantNextPickaxe} />
        <Button title="Skip tutorial" onPress={game.skipTutorial} />
        <Button title={game.save.revealAll ? 'Hide unrevealed kinds' : 'Reveal everything'} onPress={() => game.setRevealAll(!game.save.revealAll)} />
        <Button title="Reset tips" onPress={game.resetTips} />
      </View>
      <Text style={styles.hint}>Pickaxes open the next ore. Beating a boss reveals the next dungeon tier.</Text>

      <SupplyDebug />
      <TimingsDebug />

      <Text style={styles.title}>Save data</Text>
      <Button title="Reset save data" color="#c0392b" onPress={confirmReset} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12, padding: 24 },
  title: { fontSize: 24, fontWeight: '600', marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  mono: { fontFamily: 'monospace' },
  hint: { color: '#666' },
});
