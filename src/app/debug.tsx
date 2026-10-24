import { Alert, Button, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import type { TimeOfDay } from '@/game/generation/types';
import { deviceLocation } from '@/services/location';
import { useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';

const FALLBACK_LOCATION = { latitude: -41.2865, longitude: 174.7762 };
const STEP_METERS = [10, 50];
const TIMES_OF_DAY: (TimeOfDay | null)[] = [null, 'dawn', 'day', 'dusk', 'night'];
const WINDOWS: (number | null)[] = [null, 1, 5, 15];

function Choice<T>({
  options,
  value,
  label,
  onChange,
}: {
  options: T[];
  value: T;
  label: (option: T) => string;
  onChange: (option: T) => void;
}) {
  return (
    <View style={styles.choices}>
      {options.map((option) => (
        <Pressable
          key={label(option)}
          onPress={() => onChange(option)}
          style={[styles.choice, option === value && styles.choiceActive]}
        >
          <Text>{label(option)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function DebugScreen() {
  const debug = useDebugStore();
  const game = useGameStore();

  const toggleMock = async (enabled: boolean) => {
    if (!enabled) {
      debug.set({ mockLocation: null });
      return;
    }
    try {
      const granted = await deviceLocation.requestPermission();
      debug.set({ mockLocation: granted ? (await deviceLocation.getCurrent()).position : FALLBACK_LOCATION });
    } catch {
      debug.set({ mockLocation: FALLBACK_LOCATION });
    }
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

      <Text style={styles.title}>World</Text>
      <Text>Time of day</Text>
      <Choice
        options={TIMES_OF_DAY}
        value={debug.timeOfDay}
        label={(option) => option ?? 'auto'}
        onChange={(timeOfDay) => debug.set({ timeOfDay })}
      />
      <Text>Spawn refresh window</Text>
      <Choice
        options={WINDOWS}
        value={debug.windowMinutes}
        label={(option) => (option ? `${option} min` : 'auto')}
        onChange={(windowMinutes) => debug.set({ windowMinutes })}
      />

      <Text style={styles.title}>Expeditions</Text>
      <View style={styles.row}>
        <Text>Fast expeditions (minutes → seconds)</Text>
        <Switch value={debug.fastExpeditions} onValueChange={(fastExpeditions) => debug.set({ fastExpeditions })} />
      </View>
      <Button title="Finish all expeditions now" onPress={game.fastForwardExpeditions} />

      <Text style={styles.title}>Steps</Text>
      <Text>Extra steps today: {debug.extraSteps}</Text>
      <View style={styles.row}>
        <Button title="+1,000" onPress={() => debug.set({ extraSteps: debug.extraSteps + 1000 })} />
        <Button title="+5,000" onPress={() => debug.set({ extraSteps: debug.extraSteps + 5000 })} />
        <Button title="Clear" onPress={() => debug.set({ extraSteps: 0 })} />
      </View>

      <Text style={styles.title}>Save data</Text>
      <Text>Gold: {game.save.gold}</Text>
      <View style={styles.row}>
        <Button title="+100 gold" onPress={() => game.addGold(100)} />
        <Button title="+10 of every material" onPress={() => game.addAllMaterials(10)} />
      </View>
      <Button title="Reset save data" color="#c0392b" onPress={confirmReset} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12, padding: 24 },
  title: { fontSize: 20, fontWeight: '600', marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  mono: { fontFamily: 'monospace' },
  hint: { color: '#666' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 2, borderColor: '#3b2a1a', paddingHorizontal: 10, paddingVertical: 6 },
  choiceActive: { backgroundColor: '#fff6a8' },
});
