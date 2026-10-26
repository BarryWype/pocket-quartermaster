import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { elementInfo } from '@/content/elements';
import { MASTERY_TYPES, masteryTypeNames, QUALITIES, qualities } from '@/content/forging';
import { dungeons } from '@/content/dungeons';
import { heroClasses } from '@/content/heroes';
import { traits } from '@/content/traits';
import { items } from '@/content/items';
import { dungeonModifiers, modifierById } from '@/content/modifiers';
import { notificationCategories, notificationTexts as texts } from '@/content/notifications';
import { sanctums } from '@/content/sanctums';
import { ELEMENTS, type Element } from '@/game/elements';
import { offsetPosition } from '@/game/generation/geo';
import type { LatLng, TimeOfDay } from '@/game/generation/types';
import { fill } from '@/game/notifications/plan';
import type { NotificationCategory } from '@/game/notifications/types';
import { masteryCap, masteryOf } from '@/game/forging/mastery';
import type { HeroClassId, MainRewardKind, Quality } from '@/game/types';
import { deviceLocation } from '@/services/location';
import { deviceNotifications } from '@/services/notifications';
import { currentRotation, useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';

const FALLBACK_LOCATION = { latitude: -41.2865, longitude: 174.7762 };
const STEP_METERS = [10, 50];
const TIMES_OF_DAY: (TimeOfDay | null)[] = [null, 'dawn', 'day', 'dusk', 'night'];
const WINDOWS: (number | null)[] = [null, 1, 5, 15];
const TIERS = [1, 2, 3, 4, 5];
const MAIN_REWARDS: (MainRewardKind | null)[] = [null, 'goldPouch', 'sigil', 'treasureMap', 'lure'];
const GEAR_ITEMS = items.filter((item) => item.slot === 'weapon' || item.slot === 'armor');
const MAX_MASTERY = masteryCap(5);
const SAMPLE_NOTIFICATIONS: Record<NotificationCategory, { title: string; body: string }> = {
  expeditionFinished: {
    ...texts.finished,
    body: fill(texts.finished.body, { dungeon: 'Rat Cellar', outcome: texts.outcome.success }),
  },
  bigResult: {
    ...texts.bigResult,
    body: fill(texts.bigResult.body, { dungeon: 'Bandit Stockade', highlights: texts.highlights.boss }),
  },
  heroesIdle: texts.heroesIdle,
  chestUnlocked: { ...texts.chestUnlocked, body: fill(texts.chestUnlocked.body, { chest: 'wooden chest' }) },
  chestClose: { ...texts.chestClose, body: fill(texts.chestClose.body, { steps: 600, chest: 'iron chest' }) },
  dailyReset: texts.dailyReset,
};

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
  const [gearItem, setGearItem] = useState(GEAR_ITEMS[0].id);
  const [gearQuality, setGearQuality] = useState<Quality>('normal');
  const [gearElement, setGearElement] = useState<Element | null>(null);
  const [rotationTier, setRotationTier] = useState(1);
  const [heroClass, setHeroClass] = useState<HeroClassId>('thief');
  const [heroLevel, setHeroLevel] = useState(1);
  const [heroTrait, setHeroTrait] = useState(traits[0].id);
  const [rotationSlot, setRotationSlot] = useState<'short' | 'long'>('short');
  const rotation = currentRotation();
  const slotKey = `${rotationTier}:${rotationSlot}`;
  const inSlot = rotation.tiers[rotationTier][rotationSlot];
  const tierModifier = rotation.tiers[rotationTier].modifier;
  const forceModifier = (modifierId: string | null | 'auto') => {
    const { [rotationTier]: _, ...others } = debug.forcedModifiers;
    if (modifierId === 'auto') debug.set({ forcedModifiers: others });
    else debug.set({ forcedModifiers: { ...others, [rotationTier]: modifierId ? { dungeonId: inSlot, modifierId } : null } });
  };

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

  const placeTavern = async () => {
    const position = offsetPosition(await currentPosition(), 20, 0);
    debug.set({ debugTavern: { id: 'tavern:debug', name: 'The Debug Tankard', position } });
  };

  const placeSanctum = async (sanctumId: string) => {
    const now = Date.now();
    const position = offsetPosition(await currentPosition(), 20, 0);
    debug.set({ debugSanctum: { id: `debug:${sanctumId}:${now}`, sanctumId, position, expiresAt: now + 24 * 3_600_000 } });
  };

  /** Ignores settings and quiet hours, so the OS side can be checked alone. */
  const sendSample = async (category: NotificationCategory) => {
    if (!(await deviceNotifications.getPermission()).granted && !(await deviceNotifications.requestPermission())) {
      Alert.alert('Notifications are not allowed', 'Allow them in Settings first.');
      return;
    }
    const { group } = notificationCategories[category];
    await deviceNotifications.send({ id: `debug:${category}`, category, group, at: null, ...SAMPLE_NOTIFICATIONS[category] });
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

      <Text style={styles.title}>Forging</Text>
      {MASTERY_TYPES.map((type) => {
        const { level, progress } = masteryOf(game.save, type);
        return (
          <View key={type} style={styles.row}>
            <Text>
              {masteryTypeNames[type].name} mastery {level} ({progress})
            </Text>
            <View style={styles.choices}>
              <Button title="−" disabled={level <= 1} onPress={() => game.setMastery(type, level - 1)} />
              <Button title="+" disabled={level >= MAX_MASTERY} onPress={() => game.setMastery(type, level + 1)} />
            </View>
          </View>
        );
      })}
      <Text>Force the quality of the next forge</Text>
      <Choice
        options={[null, ...QUALITIES]}
        value={debug.forcedQuality}
        label={(option) => (option ? qualities[option].name : 'off')}
        onChange={(forcedQuality) => debug.set({ forcedQuality })}
      />
      <Text>Add a gear piece</Text>
      <Choice options={GEAR_ITEMS.map((i) => i.id)} value={gearItem} label={(id) => items.find((i) => i.id === id)!.name} onChange={setGearItem} />
      <Choice options={QUALITIES} value={gearQuality} label={(q) => qualities[q].name} onChange={setGearQuality} />
      <Choice
        options={[null, ...ELEMENTS]}
        value={gearElement}
        label={(option) => (option ? `${elementInfo[option].emoji} ${option}` : 'plain')}
        onChange={setGearElement}
      />
      <Button title="Add gear" onPress={() => game.addGear(gearItem, gearQuality, gearElement)} />

      <Text style={styles.title}>Taverns and heroes</Text>
      <View style={styles.row}>
        <Button title="Place a tavern next to me" onPress={placeTavern} />
        <Button
          title="New offers"
          onPress={() => debug.set({ offerSeed: String(Number(debug.offerSeed || 0) + 1) })}
        />
      </View>
      <Text>Add a hero ({game.save.heroes.length} in the roster)</Text>
      <Choice
        options={Object.keys(heroClasses) as HeroClassId[]}
        value={heroClass}
        label={(id) => `${heroClasses[id].emoji} ${heroClasses[id].name}`}
        onChange={setHeroClass}
      />
      <Choice options={traits.map((t) => t.id)} value={heroTrait} label={(id) => traits.find((t) => t.id === id)!.name} onChange={setHeroTrait} />
      <View style={styles.row}>
        <Text>Level {heroLevel}</Text>
        <View style={styles.choices}>
          <Button title="−" disabled={heroLevel <= 1} onPress={() => setHeroLevel(heroLevel - 1)} />
          <Button title="+" onPress={() => setHeroLevel(heroLevel + 1)} />
          <Button title="Add hero" onPress={() => game.addHero(heroClass, heroLevel, heroTrait)} />
        </View>
      </View>
      <Text style={styles.hint}>Debug heroes skip the roster cap and teach their weapon types like recruits.</Text>

      <Text style={styles.title}>Dungeon rotation</Text>
      <View style={styles.row}>
        <Text>Day shift: {debug.rotationDayOffset}</Text>
        <View style={styles.choices}>
          <Button title="−1 day" onPress={() => debug.set({ rotationDayOffset: debug.rotationDayOffset - 1 })} />
          <Button title="+1 day" onPress={() => debug.set({ rotationDayOffset: debug.rotationDayOffset + 1 })} />
          <Button title="Today" onPress={() => debug.set({ rotationDayOffset: 0 })} />
        </View>
      </View>
      <Choice options={TIERS} value={rotationTier} label={(t) => `T${t}`} onChange={setRotationTier} />
      <Choice options={['short', 'long'] as const} value={rotationSlot} label={(s) => s} onChange={setRotationSlot} />
      <Text>Force a dungeon into this slot</Text>
      <Choice
        options={[null, ...dungeons.filter((d) => d.tier === rotationTier && d.slot === rotationSlot).map((d) => d.id)]}
        value={debug.forcedSlots[slotKey] ?? null}
        label={(id) => (id ? dungeons.find((d) => d.id === id)!.name : 'auto')}
        onChange={(id) => {
          const { [slotKey]: _, ...others } = debug.forcedSlots;
          debug.set({ forcedSlots: id ? { ...others, [slotKey]: id } : others });
        }}
      />
      <Text>
        Tier modifier: {tierModifier ? `${modifierById[tierModifier.modifierId].name} on ${tierModifier.dungeonId}` : 'none'}
      </Text>
      <Choice
        options={['auto', null, ...dungeonModifiers.map((m) => m.id)] as (string | null)[]}
        value={rotationTier in debug.forcedModifiers ? (debug.forcedModifiers[rotationTier]?.modifierId ?? null) : 'auto'}
        label={(id) => (id === 'auto' ? 'auto' : id ? `${modifierById[id].emoji} ${modifierById[id].name}` : 'none')}
        onChange={forceModifier}
      />
      <Text style={styles.hint}>A forced modifier goes on the dungeon in the selected slot, whatever its tags.</Text>
      <Button title="Reset first-clear bonuses" onPress={game.resetFirstClears} />

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

      <Text style={styles.title}>Notifications</Text>
      <Text>Send one of each now</Text>
      <View style={styles.choices}>
        {(Object.keys(notificationCategories) as NotificationCategory[]).map((category) => (
          <Button key={category} title={notificationCategories[category].title} onPress={() => sendSample(category)} />
        ))}
      </View>

      <Text style={styles.title}>Save data</Text>
      <Text>Gold: {game.save.gold}</Text>
      <View style={styles.row}>
        <Button title="+100 gold" onPress={() => game.addGold(100)} />
        <Button title="+1,000 gold" onPress={() => game.addGold(1000)} />
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
