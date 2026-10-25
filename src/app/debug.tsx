import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { elementInfo } from '@/content/elements';
import { sanctums } from '@/content/sanctums';
import { ELEMENTS, type Element } from '@/game/elements';
import { offsetPosition } from '@/game/generation/geo';
import type { LatLng, TimeOfDay } from '@/game/generation/types';
import type { MainRewardKind } from '@/game/types';
import { deviceLocation } from '@/services/location';
import { useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';

const FALLBACK_LOCATION = { latitude: -41.2865, longitude: 174.7762 };
const STEP_METERS = [10, 50];
const TIMES_OF_DAY: (TimeOfDay | null)[] = [null, 'dawn', 'day', 'dusk', 'night'];
const WINDOWS: (number | null)[] = [null, 1, 5, 15];
const TIERS = [1, 2, 3, 4, 5];
const MAIN_REWARDS: (MainRewardKind | null)[] = [null, 'goldPouch', 'sigil', 'treasureMap', 'lure'];

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

  const [element, setElement] = useState<Element>('fire');

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

  const placeSanctum = async (sanctumId: string) => {
    const now = Date.now();
    const position = offsetPosition(await currentPosition(), 20, 0);
    debug.set({ debugSanctum: { id: `debug:${sanctumId}:${now}`, sanctumId, position, expiresAt: now + 24 * 3_600_000 } });
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

      <Text style={styles.title}>Progression</Text>
      <Text>
        Tutorial: {game.save.tutorial.step} · Pickaxes: {game.save.tools.length} · Bosses beaten:{' '}
        {game.save.clearedDungeons.length}
      </Text>
      <View style={styles.row}>
        <Button title="Skip tutorial" onPress={game.finishTutorial} />
        <Button title="Grant next pickaxe" onPress={game.grantNextPickaxe} />
        <Button title="Beat next boss" onPress={game.beatNextBoss} />
      </View>
      <Text style={styles.hint}>Pickaxes open the next ore. Beating a boss reveals the next dungeon tier.</Text>

      <Text style={styles.title}>Expeditions</Text>
      <View style={styles.row}>
        <Text>Fast expeditions (minutes → seconds)</Text>
        <Switch value={debug.fastExpeditions} onValueChange={(fastExpeditions) => debug.set({ fastExpeditions })} />
      </View>
      <Button title="Finish all expeditions now" onPress={game.fastForwardExpeditions} />

      <Text style={styles.title}>Sanctums and rewards</Text>
      <Text>
        Sigils: {game.save.sigils.length ? game.save.sigils.join(', ') : 'none'} · pity {game.save.sigilPity} · maps{' '}
        {game.save.treasureMaps.length} · lures {game.save.lures}
      </Text>
      <Text>Add a Sigil</Text>
      <View style={styles.row}>
        {TIERS.map((tier) => (
          <Button key={tier} title={`T${tier}`} onPress={() => game.addSigil(tier)} />
        ))}
      </View>
      <Text>Elemental shards and stones</Text>
      <Choice
        options={[...ELEMENTS]}
        value={element}
        label={(option) => `${elementInfo[option].emoji} ${option}`}
        onChange={setElement}
      />
      <View style={styles.row}>
        <Button title="+5 shards" onPress={() => game.addElemental(element, 'shard', 5)} />
        <Button title="+1 stone" onPress={() => game.addElemental(element, 'stone', 1)} />
        <Button title="+ Map" onPress={game.addTreasureMap} />
        <Button title="+ Lure" onPress={game.addLure} />
      </View>
      <Text>Place a Sanctum next to you</Text>
      <Choice
        options={sanctums.map((s) => s.id)}
        value={debug.debugSanctum?.sanctumId ?? ''}
        label={(id) => {
          const sanctum = sanctums.find((s) => s.id === id)!;
          return `${sanctum.emoji} ${sanctum.name}`;
        }}
        onChange={placeSanctum}
      />
      <Button title="Reset used Sanctums and Sigil pity" onPress={game.resetSanctums} />
      <Text>Force the next main reward</Text>
      <Choice
        options={MAIN_REWARDS}
        value={debug.forcedMainReward}
        label={(option) => option ?? 'off'}
        onChange={(forcedMainReward) => debug.set({ forcedMainReward })}
      />

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
