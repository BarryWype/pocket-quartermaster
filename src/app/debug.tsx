import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/Button';
import { patrolIcons } from '@/components/PatrolMarker';
import { Text } from '@/components/Text';
import { elementInfo } from '@/content/elements';
import { MASTERY_TYPES, masteryTypeNames, QUALITIES, qualities } from '@/content/forging';
import { gearId, gearProfiles } from '@/content/equipment';
import { trinketId, trinketKinds } from '@/content/trinkets';
import { dungeons } from '@/content/dungeons';
import { guildTrackById, guildTracks, type GuildTrackId } from '@/content/guild';
import { gamblerRules, heroClasses, xpRules } from '@/content/heroes';
import { traits } from '@/content/traits';
import { items } from '@/content/items';
import { itemById, threatById, restrictionById, opportunityById, recipeById, recipeOutput, relicById, valuableById } from '@/content/lookup';
import { recipes } from '@/content/recipes';
import { dungeonThreats, opportunityDefs, restrictionDefs, surges, threatDefs } from '@/content/threats';
import { notificationCategories, notificationTexts as texts } from '@/content/notifications';
import { patrolRules, patrolTexts } from '@/content/patrols';
import { placeGroupOf, placesAround } from '@/game/places/generate';
import { nearestByKind } from '@/game/places/density';
import { placeInfo, type PlaceKind } from '@/content/places';
import { PANEL_KINDS } from '@/components/PlacePanel';
import { placeFightRules } from '@/content/placeFights';
import { sanctums } from '@/content/sanctums';
import { bossWeaknesses } from '@/content/weaknesses';
import { ELEMENTS, type Element } from '@/game/elements';
import { highestUnlockedTier } from '@/game/expeditions/expeditions';
import { briefingFor, openDungeonIds } from '@/game/dungeons/rotation';
import { maxThreatLevel } from '@/game/threats/compose';
import { playbackRoute, type WalkSummary } from '@/game/gathering/autoGather';
import { offsetPosition } from '@/game/generation/geo';
import { windowIndex, windowRange } from '@/game/generation/time';
import { tileAt } from '@/game/generation/tiles';
import type { LatLng, TimeOfDay } from '@/game/generation/types';
import { patrolNotifications } from '@/game/notifications/patrols';
import { fill } from '@/game/notifications/plan';
import type { NotificationCategory } from '@/game/notifications/types';
import type { BackgroundAlert } from '@/game/patrols/escort';
import {
  PATROL_KINDS,
  TRAVELLER_KINDS,
  isPatrolKind,
  isTravellerKind,
  patrolsAround,
  patrolTier,
  type PatrolSpawn,
  type PatrolSubject,
  type TierRoll,
} from '@/game/patrols/generate';
import { distanceTo } from '@/game/patrols/visibility';
import { masteryCap, masteryOf } from '@/game/forging/mastery';
import { guildRank } from '@/game/guild/guild';
import { currentHp, isExhausted, maxHp } from '@/game/team/health';
import { gradeRoll, type Grade } from '@/game/taverns/roll';
import { LOOT_CATEGORIES, LOOT_SOURCES, emptyLoot, type Loot, type LootCategory, type LootSourceId, type MapRarity } from '@/game/loot/types';
import { lootChances } from '@/game/loot/chances';
import { createRng } from '@/game/generation/rng';
import { rollForSave, sourceAmounts } from '@/game/loot/context';
import { tutorialStepOrder } from '@/game/tutorial/tutorial';
import { lootConfig } from '@/content/loot/config';
import { secretRules, type PlaceTipSource } from '@/content/secrets';
import { objectives, type QuestBand, type QuestObjective } from '@/content/quests';
import { lootMatrix } from '@/content/loot/matrix';
import { components } from '@/content/loot/components';
import { charms } from '@/content/loot/charms';
import { monsterParts } from '@/content/loot/monsterParts';
import { relics } from '@/content/loot/relics';
import { valuables } from '@/content/loot/valuables';
import { lootText } from '@/hooks/usePatrols';
import type { ActiveThreat, Briefing, HeroClassId, MasteryType, Quality, StatKey, ThreatId, ThreatLevel } from '@/game/types';
import { forgedItem, isKnown } from '@/game/crafting/crafting';
import { playBack, syncBackground } from '@/hooks/useAutoGather';
import { deviceLocation } from '@/services/location';
import { readBackground, readBuffer, stepPatrols, updateBackground, updateBuffer, type StoredBuffer } from '@/services/walkTracking';
import { deviceNotifications } from '@/services/notifications';
import { useNow } from '@/hooks/useNow';
import { useLanguage } from '@/hooks/useLanguage';
import { formatPercent, t } from '@/i18n';
import { currentRotation, useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useWorldStore } from '@/store/worldStore';

const FIGHT_KINDS = Object.keys(placeFightRules.kinds) as PlaceKind[];

const FALLBACK_LOCATION = { latitude: -41.2865, longitude: 174.7762 };
const STEP_METERS = [10, 50];
const TIMES_OF_DAY: (TimeOfDay | null)[] = [null, 'dawn', 'day', 'dusk', 'night'];
const WINDOWS: (number | null)[] = [null, 1, 5, 15];
const TIERS = [1, 2, 3, 4, 5];
const WALK_ITEMS = items.filter((item) => item.slot === 'utility' && item.walk);
const HP_SHARES = [0, 0.25, 0.5, 0.75];
const LOOT_FORCES: (LootCategory | null)[] = [null, ...LOOT_CATEGORIES];
const RUN_MINUTES: (number | null)[] = [null, 5, 45, 120, 480];
const LUCK_POINTS = [0, 10, 30, 100];
const MAP_RARITIES: MapRarity[] = ['common', 'rare', 'legendary'];
/** One tip source per secret place, for the debug buttons. */
const SECRET_SOURCES: PlaceTipSource[] = ['library', 'heist', 'fishingDock'];

const QUEST_OBJECTIVES = Object.keys(objectives) as QuestObjective[];
const QUEST_BANDS: QuestBand[] = ['short', 'medium', 'long'];

/** Daily quests: grant any objective and band, finish one, pop the secret quest, free the reroll. */
function QuestDebug() {
  const game = useGameStore();
  const [objective, setObjective] = useState<QuestObjective>('chapel');
  const [band, setBand] = useState<QuestBand>('short');
  const open = game.save.quests.list.filter((quest) => quest.doneAt === null);
  return (
    <>
      <Text style={styles.title}>Quests</Text>
      <Choice options={QUEST_OBJECTIVES} value={objective} label={(o) => `${objectives[o].emoji} ${o}`} onChange={setObjective} />
      <Choice options={QUEST_BANDS} value={band} label={(b) => b} onChange={setBand} />
      <View style={styles.row}>
        <Button title="Grant quest" onPress={() => game.grantQuest(objective, band)} />
        <Button title="Trigger secret quest" onPress={game.triggerSecretQuest} />
        <Button title="Reset reroll" onPress={game.resetQuestReroll} />
      </View>
      {open.length > 0 && (
        <Choice
          options={open.map((quest) => quest.id)}
          value=""
          label={(id) => `Complete ${open.find((quest) => quest.id === id)!.objective} (${id})`}
          onChange={game.completeQuest}
        />
      )}
    </>
  );
}

/**
 * A source's roll table with its final chances (after Luck, a ×1.5 charm on
 * one category, run length and map rarity), a roll paid into the save, an
 * optional forced category, and grants of every new item.
 */
function LootDebug() {
  const game = useGameStore();
  const [source, setSource] = useState<LootSourceId>('dungeonRun');
  const [tier, setTier] = useState(1);
  const [luck, setLuck] = useState(0);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [charm, setCharm] = useState<LootCategory | null>(null);
  const [force, setForce] = useState<LootCategory | null>(null);
  const [mapRarity, setMapRarity] = useState<MapRarity>('common');
  const [last, setLast] = useState('');
  const [rolls, setRolls] = useState(0);
  const input = {
    source,
    luck,
    modifiers: charm ? [{ id: 'debugCharm', kind: 'chance' as const, category: charm, multiplier: 1.5 }] : [],
    ...(minutes ? { minutes } : {}),
    ...(source === 'treasureSpot' ? { mapRarity } : {}),
  };
  const chances = lootChances(input);
  const short = dungeons.find((d) => d.tier === tier && d.slot === 'short')!;
  const base = lootConfig.amounts[source] ? sourceAmounts(source, tier) : { gold: Math.round((short.gold[0] + short.gold[1]) / 2), xp: short.xp };
  const roll = () => {
    const loot = rollForSave(game.save, source, createRng(`debug|${game.save.nextUid}|${rolls}`), { ...input, tier, base, ...(force ? { force } : {}) });
    setRolls(rolls + 1);
    game.debugGrantLoot(loot);
    setLast(lootText(loot) || 'nothing');
  };
  const grant = (extra: Partial<Loot>) => game.debugGrantLoot({ ...emptyLoot(), ...extra });
  return (
    <>
      <Text style={styles.title}>Loot</Text>
      <Choice options={[...LOOT_SOURCES]} value={source} label={(s) => s} onChange={setSource} />
      <Choice options={TIERS} value={tier} label={(t) => `T${t}`} onChange={setTier} />
      <Choice options={LUCK_POINTS} value={luck} label={(l) => `${l} Luck`} onChange={setLuck} />
      <Choice options={RUN_MINUTES} value={minutes} label={(m) => (m ? `${m} min` : 'no run length')} onChange={setMinutes} />
      <Text>×1.5 charm on</Text>
      <Choice options={LOOT_FORCES} value={charm} label={(c) => c ?? 'none'} onChange={setCharm} />
      {source === 'treasureSpot' && <Choice options={MAP_RARITIES} value={mapRarity} label={(r) => r} onChange={setMapRarity} />}
      {LOOT_CATEGORIES.filter((c) => chances[c] > 0).map((c) => (
        <Text key={c}>
          {c} · {lootMatrix[source].marks[c]} · {formatPercent(chances[c])}
        </Text>
      ))}
      <Text>Force a category on this roll</Text>
      <Choice options={LOOT_FORCES} value={force} label={(c) => c ?? 'off'} onChange={setForce} />
      <Button title="Roll and grant" onPress={roll} />
      {last ? <Text>{last}</Text> : null}
      <Text>Grant new items</Text>
      <View style={styles.row}>
        {MAP_RARITIES.map((rarity) => (
          <Button key={`map${rarity}`} title={`+ ${rarity} map`} onPress={() => grant({ treasureMaps: [{ rarity, tier }] })} />
        ))}
        {MAP_RARITIES.map((rarity) => (
          <Button key={`manual${rarity}`} title={`+ ${rarity} manual`} onPress={() => grant({ manuals: [rarity] })} />
        ))}
        <Button title="+ key fragment" onPress={() => grant({ keyFragments: 1 })} />
        <Button title="+ mysterious key" onPress={() => grant({ keyFragments: lootConfig.keyFragmentsPerKey })} />
      </View>
      <View style={styles.row}>
        {monsterParts.map((part) => (
          <Button key={part.id} title={part.emoji} onPress={() => grant({ materials: [{ materialId: part.id, amount: 3 }] })} />
        ))}
        {charms.map((charm) => (
          <Button key={charm.id} title={`${charm.emoji}+`} onPress={() => grant({ consumables: [{ itemId: charm.id, amount: 1 }] })} />
        ))}
        {components.map((component) => (
          <Button key={component.id} title={component.emoji} onPress={() => grant({ materials: [{ materialId: component.id, amount: 1 }] })} />
        ))}
      </View>
      <View style={styles.row}>
        {valuables.map((valuable) => (
          <Button key={valuable.id} title={valuable.emoji} onPress={() => grant({ valuables: [{ valuableId: valuable.id, tier, amount: 1 }] })} />
        ))}
      </View>
      <Text>Collector today at every market</Text>
      <Choice
        options={valuables.map((valuable) => valuable.id)}
        value={game.save.collectorOverride?.valuableId ?? ''}
        label={(id) => `${valuableById[id].emoji} ${valuableById[id].name}`}
        onChange={game.setCollector}
      />
      <Choice
        options={relics.filter((relic) => relic.tier === tier).map((relic) => relic.id)}
        value=""
        label={(id) => `+ ${relics.find((r) => r.id === id)!.name}`}
        onChange={(id) => grant({ relics: [id] })}
      />
      {game.save.relics.length > 0 && (
        <Choice
          options={game.save.relics.map((held) => held.uid)}
          value=""
          label={(uid) => `Restore free: ${relicById[game.save.relics.find((held) => held.uid === uid)!.relicId].name}`}
          onChange={(uid) => game.restoreRelic(uid, true)}
        />
      )}
    </>
  );
}
const THREAT_LEVELS: ThreatLevel[] = [1, 2, 3];
/** Every recipe that is not a gear recipe (pickaxes, smelting, provisions). */
const NON_GEAR_RECIPES = recipes.filter((recipe) => !forgedItem(recipe));
const MAX_MASTERY = masteryCap(5);
const SAMPLE_NOTIFICATIONS: Record<NotificationCategory, { title: string; body: string; data?: Record<string, string> }> = {
  expeditionFinished: {
    ...texts.finished,
    body: fill(texts.finished.body, { dungeon: 'Rat Cellar', outcome: texts.outcome.success }),
  },
  bigResult: {
    ...texts.bigResult,
    body: fill(texts.bigResult.body, { dungeon: 'Bandit Stockade', highlights: texts.highlights.boss }),
  },
  heistFinished: {
    ...texts.heistFinished,
    body: fill(texts.heistFinished.body, { name: 'Bram', outcome: texts.heistOutcome.loot }),
  },
  heroesIdle: texts.heroesIdle,
  heroesRested: texts.heroesRested,
  chestUnlocked: { ...texts.chestUnlocked, body: fill(texts.chestUnlocked.body, { chest: 'wooden chest' }), data: { route: 'chests' } },
  chestClose: { ...texts.chestClose, body: fill(texts.chestClose.body, { steps: 600, chest: 'iron chest' }) },
  dailyReset: texts.dailyReset,
  walkSummary: { ...texts.walkSummary, body: fill(texts.walkSummary.body, { distance: '2.4 km' }) },
  questReady: { ...texts.questReady, body: fill(texts.questReady.body, { objective: texts.questObjective.walk }), data: { route: 'quests' } },
  questTarget: { ...texts.questTarget, title: fill(texts.questTarget.title, { place: 'Chapel' }), data: { route: 'quests' } },
  nearbyPlaces: { title: fill(texts.nearbyPlace.title, { place: 'Ruins' }), body: fill(texts.nearbyPlace.body, { distance: '120 m' }) },
  secretPlace: { ...texts.secretPlace, body: fill(texts.secretPlace.body, { place: 'Hidden den', distance: '90 m' }) },
  patrolSpotted: { ...texts.patrolSpotted, body: fill(texts.patrolSpotted.body, { patrol: 'Goblin patrol', distance: '180 m', tier: 2 }) },
  escort: { ...texts.escortPaused, body: fill(texts.escortPaused.body, { hero: 'Bram', percent: 45 }) },
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
  useLanguage();
  const debug = useDebugStore();
  const [placeKind, setPlaceKind] = useState<PlaceKind>('sawmill');
  const [nearest, setNearest] = useState('');
  const game = useGameStore();
  const grantItem = (itemId: string) =>
    useGameStore.setState(({ save }) => ({
      save: { ...save, consumables: { ...save.consumables, [itemId]: (save.consumables[itemId] ?? 0) + 1 } },
    }));
  const startWalkItem = (itemId: string) => {
    grantItem(itemId);
    game.startWalkEffect(itemId, debug.mockLocation ?? useWorldStore.getState().player ?? FALLBACK_LOCATION);
  };
  const autoMode = useWorldStore((state) => state.autoGather);
  const [buffer, setBuffer] = useState<StoredBuffer | null>(null);
  const [playback, setPlayback] = useState<WalkSummary | null>(null);
  const [tierRoll, setTierRoll] = useState<TierRoll>('current');
  const [around, setAround] = useState<{ position: LatLng; spawns: PatrolSpawn[] } | null>(null);
  const [escortMerged, setEscortMerged] = useState<number | null>(null);
  const [pocketReport, setPocketReport] = useState<string | null>(null);
  const refreshBuffer = () => readBuffer().then(setBuffer, () => setBuffer(null));
  // A loop around the mock location (or the map's last position) that ends now.
  const playRoute = async (stepsCounted: boolean) => {
    setEscortMerged(null);
    const center = debug.mockLocation ?? useWorldStore.getState().player ?? FALLBACK_LOCATION;
    setPlayback(await playBack(playbackRoute(center, Date.now(), { stepsCounted })));
    refreshBuffer();
  };
  /** Feeds the same loop through the background task first (patrols, escort, counting and notifications), then processes it as on opening. */
  const playRouteWithPatrols = async () => {
    const center = debug.mockLocation ?? useWorldStore.getState().player ?? FALLBACK_LOCATION;
    const fixes = playbackRoute(center, Date.now());
    const before = useGameStore.getState().save.quests.list.filter((quest) => quest.doneAt !== null).length;
    // In batches like the task gets them, as if the app were closed: counting and notifications included.
    const sent: Awaited<ReturnType<typeof stepPatrols>> = [];
    for (let i = 0; i < fixes.length; i += 20) sent.push(...(await stepPatrols(fixes.slice(i, i + 20), false)));
    const merged = (await readBackground())?.pending.length ?? 0;
    setPlayback(await playBack(fixes));
    await syncBackground();
    const after = useGameStore.getState().save.quests.list.filter((quest) => quest.doneAt !== null).length;
    setEscortMerged(merged);
    setPocketReport(
      `Notified: ${sent.map((n) => `${n.category} "${n.title}"`).join(' · ') || 'nothing'}\nQuests done on opening: ${after - before}`,
    );
    refreshBuffer();
  };
  const lastWalk = game.save.autoGather.history[0] ?? null;
  const describeWalk = (walk: WalkSummary) =>
    `${Math.round((walk.endedAt - walk.startedAt) / 60_000)} min · ${walk.distanceMeters} m · ${walk.nodes} nodes · ` +
    `${walk.gained.map((g) => `${g.amount} ${g.materialId}`).join(', ') || 'nothing'} · ${walk.steps} steps${walk.stepsEstimated ? ' (estimated)' : ''}` +
    `${walk.autoStopped ? ' · auto-stopped' : ''}\n` +
    `${walk.distanceMeters > 0 ? ((walk.gained.reduce((sum, g) => sum + g.amount, 0) * 1000) / walk.distanceMeters).toFixed(1) : '0'} resources/km · ` +
    `${Object.values(walk.ignored).reduce((sum, count) => sum + count, 0)} fixes dropped (${Object.entries(walk.ignored).map(([reason, count]) => `${reason} ${count}`).join(', ') || 'none'})`;

  const [element, setElement] = useState<Element>('fire');
  const [gearType, setGearType] = useState<MasteryType>('sword');
  const [gearTier, setGearTier] = useState(1);
  const [gearQuality, setGearQuality] = useState<Quality>('normal');
  const [trinketKind, setTrinketKind] = useState(trinketKinds[0].kind);
  const [gearElement, setGearElement] = useState<Element | null>(null);
  const [recipeType, setRecipeType] = useState<MasteryType>('sword');
  const [recipeTier, setRecipeTier] = useState(1);
  const [recipeId, setRecipeId] = useState('sword1');
  const chooseRecipeType = (type: MasteryType) => {
    setRecipeType(type);
    setRecipeId(gearId(type, recipeTier));
  };
  const chooseRecipeTier = (tier: number) => {
    setRecipeTier(tier);
    setRecipeId(gearId(recipeType, tier));
  };
  const [rotationTier, setRotationTier] = useState(1);
  const [heroClass, setHeroClass] = useState<HeroClassId>('thief');
  const [heroLevel, setHeroLevel] = useState(1);
  const [heroTrait, setHeroTrait] = useState(traits[0].id);
  const [heroGrade, setHeroGrade] = useState<Grade | 'average'>('average');
  const [heroPrimary, setHeroPrimary] = useState<StatKey>(gamblerRules.primaryChoices[0]);
  const [hpHero, setHpHero] = useState(game.save.heroes[0]?.id ?? '');
  const [levelHero, setLevelHero] = useState(game.save.heroes[0]?.id ?? '');
  const now = useNow();
  const hpHeroState = game.save.heroes.find((h) => h.id === hpHero);
  const levelHeroState = game.save.heroes.find((h) => h.id === levelHero);
  const levelHeroLevel = levelHeroState?.level ?? 1;
  const hpShareNow = hpHeroState ? currentHp(game.save, hpHeroState, now) / maxHp(game.save, hpHeroState) : 1;
  const [guildTrack, setGuildTrack] = useState<GuildTrackId>('gold');
  const [rotationSlot, setRotationSlot] = useState<'short' | 'long'>('short');
  const slotKey = `${rotationTier}:${rotationSlot}`;
  const [threatPick, setThreatPick] = useState<ThreatId>('traps');
  const [threatLevel, setThreatLevel] = useState<ThreatLevel>(1);
  const [threatElement, setThreatElement] = useState<Element>('fire');

  /** Today's rotation with the debug overrides applied, as the expeditions screen sees it. */
  const rotation = currentRotation(now);
  const openDungeons = openDungeonIds(rotation).map((id) => dungeons.find((d) => d.id === id)!);
  const setBriefing = (dungeonId: string, briefing: Briefing) =>
    debug.set({ forcedBriefings: { ...debug.forcedBriefings, [dungeonId]: briefing } });
  const clearBriefing = (dungeonId: string) => {
    const { [dungeonId]: _, ...others } = debug.forcedBriefings;
    debug.set({ forcedBriefings: others });
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
    debug.set({
      debugTavern: {
        id: 'tavern:debug',
        kind: 'tavern',
        group: 'tavern',
        tile: 'debug',
        name: 'The Debug Tankard',
        position,
        startsAt: 0,
        expiresAt: Number.MAX_SAFE_INTEGER,
        roll: 0,
      },
    });
  };

  /** A hand-placed place next to the player, live for its kind's whole window. */
  const placePlace = async () => {
    const now = Date.now();
    const group = placeGroupOf(placeKind);
    const position = offsetPosition(await currentPosition(), 20, 0);
    debug.set({
      debugPlaces: [
        ...debug.debugPlaces,
        { id: `place:${placeKind}:debug:${now}`, kind: placeKind, group: group.id, tile: 'debug', position, startsAt: now, expiresAt: now + group.windowHours * 3_600_000, roll: 0 },
      ],
    });
  };

  const measureNearest = async () => {
    const position = await currentPosition();
    const nearest = nearestByKind(placesAround(position, Date.now()), position);
    setNearest(
      (Object.keys(placeInfo) as PlaceKind[])
        .map((kind) => `${placeInfo[kind].emoji} ${placeInfo[kind].name}: ${nearest[kind] === undefined ? '—' : `${Math.round(nearest[kind])} m`}`)
        .join('\n'),
    );
  };

  const placeSanctum = async (sanctumId: string) => {
    const now = Date.now();
    const position = offsetPosition(await currentPosition(), 20, 0);
    debug.set({ debugSanctum: { id: `debug:${sanctumId}:${now}`, sanctumId, position, expiresAt: now + 24 * 3_600_000 } });
  };

  /** A hand-placed patrol next to the player, in the window that is running now. */
  const spawnDebugPatrol = async (kind: PatrolSubject) => {
    const position = await currentPosition();
    // eslint-disable-next-line react-hooks/purity -- called from the buttons' onPress, never during render
    const now = Date.now();
    const window = windowIndex(now, patrolRules.windowMinutes);
    const { start, end } = windowRange(window, patrolRules.windowMinutes);
    const tile = tileAt(position, patrolRules.precision);
    useWorldStore.getState().addDebugPatrols([
      {
        id: `debug:${tile}:${window}:${kind}-${now}`,
        tile,
        window,
        kind,
        tierRoll: isTravellerKind(kind) ? 'current' : tierRoll,
        path: { waypoints: [offsetPosition(position, 30, 0)], loopMs: 60_000, phaseMs: 0 },
        startsAt: start,
        endsAt: end,
      },
    ]);
  };

  const showAround = async () => {
    const position = await currentPosition();
    setAround({ position, spawns: patrolsAround(position, Date.now()) });
  };

  /** Ignores settings and quiet hours, so the OS side can be checked alone. */
  const sendSample = async (category: NotificationCategory) => {
    if (!(await deviceNotifications.getPermission()).granted && !(await deviceNotifications.requestPermission())) {
      Alert.alert('Notifications are not allowed', 'Allow them in Settings first.');
      return;
    }
    const { group } = notificationCategories[category];
    // Place samples open the map on the player.
    const player = debug.mockLocation ?? useWorldStore.getState().player ?? FALLBACK_LOCATION;
    const sample = SAMPLE_NOTIFICATIONS[category];
    const data = category === 'nearbyPlaces' || category === 'secretPlace' ? { route: 'place', latitude: player.latitude, longitude: player.longitude } : sample.data;
    await deviceNotifications.send({ id: `debug:${category}`, category, group, at: null, ...sample, data });
  };

  /** Sends one of the background task's patrol alerts through the real builder, shown now whatever quiet hours say. */
  const sendPatrolAlert = async (alert: BackgroundAlert) => {
    if (!(await deviceNotifications.getPermission()).granted && !(await deviceNotifications.requestPermission())) {
      Alert.alert('Notifications are not allowed', 'Allow them in Settings first.');
      return;
    }
    const save = useGameStore.getState().save;
    const settings = useSettingsStore.getState().notifications;
    const escortName = save.heroes.find((hero) => hero.id === save.escort?.heroId)?.name ?? save.heroes[0]?.name ?? null;
    const planned = patrolNotifications([alert], escortName, settings, Date.now());
    if (planned.length === 0) {
      Alert.alert('Nothing to send', 'The notification settings filter this alert out.');
      return;
    }
    for (const notification of planned) await deviceNotifications.send({ ...notification, at: null });
  };

  const testPatrolAlert = async () => {
    const position = await currentPosition();
    const now = Date.now();
    const spawn = patrolsAround(position, now)
      .filter((candidate) => isPatrolKind(candidate.kind))
      .sort((a, b) => distanceTo(a, position, now) - distanceTo(b, position, now))[0];
    if (!spawn) {
      Alert.alert('No patrols around', 'Spawn one with the buttons above.');
      return;
    }
    await sendPatrolAlert({
      kind: 'patrolSpotted',
      spawn,
      distance: distanceTo(spawn, position, now),
      tier: patrolTier(spawn, highestUnlockedTier(useGameStore.getState().save)).tier,
    });
  };

  /** Drops the background task's patrol state; syncBackground rebuilds it if Pocket mode needs one. */
  const clearBackground = async () => {
    await updateBackground(() => null);
    await syncBackground();
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

      <Text style={styles.title}>Tutorial and reveal</Text>
      <Text>Step: {game.save.tutorial.step} · Tips seen: {game.save.tips.seen.length}, waiting: {game.save.tips.pending.length}</Text>
      <Choice options={tutorialStepOrder} value={game.save.tutorial.step} label={(step) => step} onChange={game.jumpToStep} />
      <View style={styles.row}>
        <Button title="Restart tutorial" onPress={game.restartTutorial} />
        <Button title="Skip tutorial" onPress={game.skipTutorial} />
      </View>
      <View style={styles.row}>
        <Button title={game.save.revealAll ? 'Hide unrevealed kinds' : 'Reveal everything'} onPress={() => game.setRevealAll(!game.save.revealAll)} />
        <Button title="Reset tips" onPress={game.resetTips} />
      </View>
      <Text style={styles.hint}>Jumping ahead plays the steps in between (items included); jumping back restarts first. Restarting keeps items.</Text>

      <Text style={styles.title}>Progression</Text>
      <Text>
        Pickaxes: {game.save.tools.length} · Bosses beaten:{' '}
        {game.save.clearedDungeons.length}
      </Text>
      <View style={styles.row}>
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
      <Text>{t('debug.grantGear')}</Text>
      <Choice
        options={MASTERY_TYPES}
        value={gearType}
        label={(type) => `${gearProfiles[type].emoji} ${masteryTypeNames[type].plural}`}
        onChange={setGearType}
      />
      <Choice options={TIERS} value={gearTier} label={(tier) => `T${tier}`} onChange={setGearTier} />
      <Choice options={QUALITIES} value={gearQuality} label={(q) => qualities[q].name} onChange={setGearQuality} />
      <Choice
        options={[null, ...ELEMENTS]}
        value={gearElement}
        label={(option) => (option ? `${elementInfo[option].emoji} ${option}` : 'plain')}
        onChange={setGearElement}
      />
      <View style={styles.row}>
        <Button title="Add gear" onPress={() => game.addGear(gearId(gearType, gearTier), gearQuality, gearElement)} />
        <Button title={t('debug.grantCharm')} onPress={() => game.addGear('testCharm', 'normal', null)} />
      </View>
      <Text>Trinket (tier and quality above)</Text>
      <Choice
        options={trinketKinds.map((kind) => kind.kind)}
        value={trinketKind}
        label={(kind) => `${trinketKinds.find((k) => k.kind === kind)!.emoji} ${trinketKinds.find((k) => k.kind === kind)!.name}`}
        onChange={setTrinketKind}
      />
      <Button title="Add trinket" onPress={() => game.addGear(trinketId(trinketKind, gearTier), gearQuality, null)} />

      <Text>{t('debug.recipes')}</Text>
      <Choice
        options={MASTERY_TYPES}
        value={recipeType}
        label={(type) => `${gearProfiles[type].emoji} ${masteryTypeNames[type].plural}`}
        onChange={chooseRecipeType}
      />
      <Choice options={TIERS} value={recipeTier} label={(tier) => `T${tier}`} onChange={chooseRecipeTier} />
      <Choice
        options={NON_GEAR_RECIPES.map((recipe) => recipe.id)}
        value={recipeId}
        label={(id) => recipeOutput(recipeById[id]).name}
        onChange={setRecipeId}
      />
      <Text style={styles.mono}>
        {recipeId} · {isKnown(game.save, recipeById[recipeId]) ? t('debug.known') : t('debug.unknown')}
      </Text>
      <View style={styles.row}>
        <Button title={t('debug.learn')} onPress={() => game.learnRecipe(recipeId)} />
        <Button title={t('debug.forget')} onPress={() => game.forgetRecipe(recipeId)} />
        <Button title={t('debug.learnAll')} onPress={game.learnAllRecipes} />
        <Button title="Unlock all part recipes" onPress={game.unlockAllPartRecipes} />
        <Button title={t('debug.completeTier', { tier: recipeTier })} onPress={() => game.learnTier(recipeTier)} />
      </View>

      <Text style={styles.title}>Places</Text>
      <Choice options={[...PANEL_KINDS, ...FIGHT_KINDS]} value={placeKind} label={(kind) => `${placeInfo[kind].emoji} ${placeInfo[kind].name}`} onChange={setPlaceKind} />
      <View style={styles.row}>
        <Button title="Place it next to me" onPress={placePlace} />
        <Button title="Clear placed" onPress={() => debug.set({ debugPlaces: [] })} />
        <Button title="Refill shops" onPress={game.refillPlaces} />
      </View>
      <Text>Secret places (force a Sealed vault: pick it as a dungeon’s opportunity below)</Text>
      <View style={styles.row}>
        {SECRET_SOURCES.map((source) => (
          <Button
            key={`tip${source}`}
            title={`Tip: ${placeInfo[secretRules.tips[source].secret].emoji}`}
            onPress={async () => game.giveTip(source, await currentPosition())}
          />
        ))}
        {SECRET_SOURCES.map((source) => (
          <Button
            key={`here${source}`}
            title={`${placeInfo[secretRules.tips[source].secret].emoji} next to me`}
            onPress={async () => {
              const position = await currentPosition();
              game.giveTip(source, position, offsetPosition(position, 20, 0));
            }}
          />
        ))}
      </View>
      <Text>Ruins dug: {game.save.ruinsProgress} / 5</Text>
      <View style={styles.row}>
        {[0, 1, 2, 3, 4].map((progress) => (
          <Button key={progress} title={String(progress)} onPress={() => game.setRuinsProgress(progress)} />
        ))}
      </View>
      <Button title="Nearest by kind (before snapping)" onPress={measureNearest} />
      {nearest !== '' && <Text>{nearest}</Text>}

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
      <Choice
        options={['average', 'C', 'B', 'A', 'S'] as (Grade | 'average')[]}
        value={heroGrade}
        label={(grade) => (grade === 'average' ? 'Average roll' : `Grade ${grade}`)}
        onChange={setHeroGrade}
      />
      {heroClass === 'gambler' && (
        <Choice options={gamblerRules.primaryChoices} value={heroPrimary} label={(stat) => `3rd primary: ${stat}`} onChange={setHeroPrimary} />
      )}
      <View style={styles.row}>
        <Text>Level {heroLevel}</Text>
        <View style={styles.choices}>
          <Button title="−" disabled={heroLevel <= 1} onPress={() => setHeroLevel(heroLevel - 1)} />
          <Button title="+" onPress={() => setHeroLevel(heroLevel + 1)} />
          <Button
            title="Add hero"
            onPress={() =>
              game.addHero(
                heroClass,
                heroLevel,
                heroTrait,
                heroGrade === 'average' && heroClass !== 'gambler'
                  ? undefined
                  : gradeRoll(heroGrade === 'average' ? 'B' : heroGrade, heroClass === 'gambler' ? heroPrimary : undefined),
              )
            }
          />
        </View>
      </View>
      <Text style={styles.hint}>Debug heroes skip the roster cap and teach their weapon types like recruits.</Text>

      <Text>{t('debug.setLevel')}</Text>
      <Text>{t('autoGather.pickHero')}</Text>
      <Choice
        options={game.save.heroes.map((h) => h.id)}
        value={levelHero}
        label={(id) => game.save.heroes.find((h) => h.id === id)!.name}
        onChange={setLevelHero}
      />
      <View style={styles.row}>
        <Text>{t('common.level', { level: levelHeroLevel })}</Text>
        <View style={styles.choices}>
          <Button
            title={t('debug.minus')}
            disabled={levelHeroLevel <= 1}
            onPress={() => game.debugSetHeroLevel(levelHero, levelHeroLevel - 1)}
          />
          <Button
            title={t('debug.plus')}
            disabled={levelHeroLevel >= xpRules.maxLevel}
            onPress={() => game.debugSetHeroLevel(levelHero, levelHeroLevel + 1)}
          />
        </View>
      </View>

      <Text style={styles.title}>Guild Hall</Text>
      <View style={styles.row}>
        <Button
          title={debug.guildGatesOpen ? 'Gates: open' : 'Gates: from tier bosses'}
          onPress={() => debug.set({ guildGatesOpen: !debug.guildGatesOpen })}
        />
        <Button title="Reset the Guild Hall" color="#c0392b" onPress={game.resetGuild} />
      </View>
      <Choice
        options={guildTracks.map((t) => t.id)}
        value={guildTrack}
        label={(id) => `${guildTrackById[id].name} ${guildRank(game.save, id)}/${guildTrackById[id].ranks}`}
        onChange={setGuildTrack}
      />
      <View style={styles.row}>
        <Text>
          {guildTrackById[guildTrack].name}: rank {guildRank(game.save, guildTrack)}
        </Text>
        <View style={styles.choices}>
          <Button
            title="−"
            disabled={guildRank(game.save, guildTrack) <= 0}
            onPress={() => game.setGuildRank(guildTrack, guildRank(game.save, guildTrack) - 1)}
          />
          <Button
            title="+"
            disabled={guildRank(game.save, guildTrack) >= guildTrackById[guildTrack].ranks}
            onPress={() => game.setGuildRank(guildTrack, guildRank(game.save, guildTrack) + 1)}
          />
        </View>
      </View>
      <Text style={styles.hint}>Setting a rank here is free. Use +1,000 gold below to test buying.</Text>

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
      <Button title="Reset the first win of the day" onPress={game.resetFirstWin} />

      <Text style={styles.title}>Threats</Text>
      {openDungeons.map((dungeon) => {
        const forced = debug.forcedBriefings[dungeon.id] ?? null;
        const editing = forced ?? briefingFor(rotation, dungeon);
        const surge = rotation.tiers[dungeon.tier].surge;
        const weights = (Object.entries(dungeonThreats[dungeon.id]?.weights ?? {}) as [ThreatId, number][]).filter(
          ([id]) => threatById[id].firstTier <= dungeon.tier,
        );
        const setThreats = (threats: ActiveThreat[]) => setBriefing(dungeon.id, { ...editing, threats });
        return (
          <View key={dungeon.id} style={styles.group}>
            <Text>
              {dungeon.name} (T{dungeon.tier}){forced ? ' · forced' : ''}
            </Text>
            <Text style={styles.mono}>
              Weights:{' '}
              {weights
                .map(
                  ([id, weight]) =>
                    `${threatById[id].emoji} ${threatById[id].name} ×${weight} (max L${maxThreatLevel(dungeon.tier, threatById[id].firstTier)})`,
                )
                .join(' · ') || 'none'}
            </Text>
            <Text style={styles.mono}>
              Roll:{' '}
              {editing.threats
                .map((t) => `${threatById[t.id].emoji} ${threatById[t.id].name} L${t.level}${t.surge ? ` (${t.surge})` : ''}`)
                .join(', ') || 'no threats'}
              {` · ${editing.restriction ? restrictionById[editing.restriction].name : 'no restriction'}`}
              {` · ${editing.opportunity ? opportunityById[editing.opportunity].name : 'no opportunity'}`}
            </Text>
            <Text style={styles.mono}>
              Surge:{' '}
              {surge
                ? `${surges[surge.threatId]} on ${dungeons.find((d) => d.id === surge.dungeonId)?.name ?? surge.dungeonId}`
                : 'none'}
            </Text>
            {editing.threats.map((threat) => (
              <View key={threat.id} style={styles.row}>
                <Text>
                  {threatById[threat.id].emoji} {threatById[threat.id].name} L{threat.level}
                  {threat.element ? ` ${elementInfo[threat.element].emoji}` : ''}
                </Text>
                <Button title="Remove" onPress={() => setThreats(editing.threats.filter((t) => t.id !== threat.id))} />
              </View>
            ))}
            <Text>Add a threat</Text>
            <Choice
              options={threatDefs.map((t) => t.id)}
              value={threatPick}
              label={(id) => `${threatById[id].emoji} ${threatById[id].name}`}
              onChange={setThreatPick}
            />
            <Choice options={THREAT_LEVELS} value={threatLevel} label={(level) => `L${level}`} onChange={setThreatLevel} />
            {threatPick === 'element' && (
              <Choice
                options={[...ELEMENTS]}
                value={threatElement}
                label={(element) => `${elementInfo[element].emoji} ${element}`}
                onChange={setThreatElement}
              />
            )}
            <Button
              title="Add threat"
              onPress={() =>
                setThreats([
                  ...editing.threats.filter((t) => t.id !== threatPick),
                  { id: threatPick, level: threatLevel, ...(threatPick === 'element' ? { element: threatElement } : {}) },
                ])
              }
            />
            <Text>Restriction</Text>
            <Choice
              options={[null, ...restrictionDefs.map((r) => r.id)]}
              value={editing.restriction}
              label={(id) => (id ? restrictionById[id].name : 'none')}
              onChange={(restriction) => setBriefing(dungeon.id, { ...editing, restriction })}
            />
            <Text>Opportunity</Text>
            <Choice
              options={[null, ...opportunityDefs.map((o) => o.id)]}
              value={editing.opportunity}
              label={(id) => (id ? opportunityById[id].name : 'none')}
              onChange={(opportunity) => setBriefing(dungeon.id, { ...editing, opportunity })}
            />
            {forced && <Button title="Clear override" color="#c0392b" onPress={() => clearBriefing(dungeon.id)} />}
          </View>
        );
      })}

      <Text style={styles.title}>Hero HP and provisions</Text>
      <Choice
        options={game.save.heroes.map((h) => h.id)}
        value={hpHero}
        label={(id) => {
          const hero = game.save.heroes.find((h) => h.id === id)!;
          return `${hero.name} ${Math.floor(currentHp(game.save, hero, now))}/${maxHp(game.save, hero)}${isExhausted(hero, now) ? ' 💤' : ''}`;
        }}
        onChange={setHpHero}
      />
      <View style={styles.row}>
        {HP_SHARES.map((share) => (
          <Button key={share} title={`${share * 100}%`} onPress={() => game.setHeroHp(hpHero, share, false)} />
        ))}
        <Button title="Knock out" onPress={() => game.setHeroHp(hpHero, 0, true)} />
        <Button title="Clear exhaustion" onPress={() => game.setHeroHp(hpHero, hpShareNow, false)} />
      </View>
      <View style={styles.row}>
        <Button title="Heal everyone" onPress={game.healAll} />
        <Button title="+10 min healing" onPress={() => game.fastForwardHealing(10)} />
        <Button title="+1 h healing" onPress={() => game.fastForwardHealing(60)} />
      </View>
      <Button title="+5 of every food, kit and charm" onPress={() => game.addProvisions(5)} />
      <Button title="Grant one of each kit" onPress={game.addKits} />
      <Button title="Grant one of each elixir, meal, walking and home care item" onPress={game.addConsumables} />
      <Text>Healing potions and fish dishes</Text>
      <View style={styles.row}>
        {['healingPotion', 'standardHealingPotion', 'greaterHealingPotion', 'grilledTrout', 'saltedFish', 'fishermansChowder'].map((itemId) => (
          <Button key={itemId} title={itemById[itemId].name} onPress={() => grantItem(itemId)} />
        ))}
      </View>
      <Text>Boss weakness items</Text>
      <View style={styles.row}>
        {bossWeaknesses.map((weakness) => (
          <Button key={weakness.itemId} title={itemById[weakness.itemId].emoji} onPress={() => grantItem(weakness.itemId)} />
        ))}
      </View>
      <Text>Walking effects (start grants one and uses it here)</Text>
      {WALK_ITEMS.map((item) => (
        <View key={item.id} style={styles.row}>
          <Text>
            {item.emoji} {item.name}
          </Text>
          <Button title="Start" onPress={() => startWalkItem(item.id)} />
          <Button title="End" onPress={() => game.endWalkEffect(item.id)} />
        </View>
      ))}

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
      <Text>Force a loot category on the next successful expedition</Text>
      <Choice
        options={LOOT_FORCES}
        value={debug.forcedLootCategory}
        label={(option) => option ?? 'off'}
        onChange={(forcedLootCategory) => debug.set({ forcedLootCategory })}
      />
      <LootDebug />
      <QuestDebug />

      <Text style={styles.title}>Auto-gather</Text>
      <Text>Mode: {autoMode} · processed until {game.save.autoGather.processedUntil ? new Date(game.save.autoGather.processedUntil).toLocaleTimeString() : 'never'}</Text>
      <View style={styles.row}>
        <Text>Show auto radius</Text>
        <Switch value={debug.showAutoRadius} onValueChange={(showAutoRadius) => debug.set({ showAutoRadius })} />
      </View>
      <View style={styles.row}>
        <Text>Show tap and node ranges</Text>
        <Switch value={debug.showNodeRanges} onValueChange={(showNodeRanges) => debug.set({ showNodeRanges })} />
      </View>
      <View style={styles.row}>
        <Button title="Play 30 min loop (steps estimated)" onPress={() => playRoute(false)} />
        <Button title="Play (pedometer counted)" onPress={() => playRoute(true)} />
        <Button title="Background walk (Pocket mode on)" onPress={playRouteWithPatrols} />
      </View>
      <Text style={styles.hint}>
        Feeds a loop at walking pace, ending now, around the mock location (or where the map last saw you), then processes it as if the app came back. Fixes older than the last processed one are ignored as stale.
      </Text>
      {playback && <Text style={styles.mono}>Playback: {describeWalk(playback)}</Text>}
      {escortMerged !== null && <Text style={styles.mono}>Escort fights merged: {escortMerged}</Text>}
      {pocketReport && <Text style={styles.mono}>{pocketReport}</Text>}
      <View style={styles.row}>
        <Button title="Read buffer" onPress={refreshBuffer} />
        <Button title="Clear buffer" onPress={() => updateBuffer((b) => ({ ...b, fixes: [], autoStopped: false })).then(setBuffer)} />
      </View>
      {buffer && (
        <Text style={styles.mono}>
          Buffer: {buffer.fixes.length} fixes{buffer.fixes.length > 0 ? ` from ${new Date(buffer.fixes[0].timestamp).toLocaleTimeString()}` : ''} · last moved{' '}
          {new Date(buffer.lastMovedAt).toLocaleTimeString()} · auto-stop {buffer.autoStopMinutes} min{buffer.autoStopped ? ' · auto-stopped' : ''}
        </Text>
      )}
      {lastWalk && <Text style={styles.mono}>Last walk: {describeWalk(lastWalk)}</Text>}

      <Text style={styles.title}>Patrols</Text>
      <Text>Spawn next to me</Text>
      <Choice
        options={['current', 'below', 'elite'] as TierRoll[]}
        value={tierRoll}
        label={(roll) => roll}
        onChange={setTierRoll}
      />
      <View style={styles.choices}>
        {([...PATROL_KINDS, ...TRAVELLER_KINDS] as PatrolSubject[]).map((kind) => (
          <Button
            key={kind}
            title={`${patrolIcons[kind]} ${isPatrolKind(kind) ? patrolTexts.kinds[kind] : patrolTexts.travellers[kind].name}`}
            onPress={() => spawnDebugPatrol(kind)}
          />
        ))}
      </View>
      <Text style={styles.hint}>Hand-placed patrols last until their window ends and can be fought or helped like real ones.</Text>
      <View style={styles.row}>
        <Button title="Show patrols around" onPress={showAround} />
        <Button title="Clear debug patrols" onPress={() => useWorldStore.getState().addDebugPatrols([])} />
      </View>
      {around && (
        <Text style={styles.mono}>
          {around.spawns.length} around {around.position.latitude.toFixed(4)}, {around.position.longitude.toFixed(4)}:
        </Text>
      )}
      {around &&
        around.spawns.map((spawn) => (
          <Text key={spawn.id} style={styles.mono}>
            {patrolIcons[spawn.kind]} {spawn.id} · {spawn.kind} {spawn.tierRoll} ·{' '}
            {new Date(spawn.startsAt).toLocaleTimeString()}–{new Date(spawn.endsAt).toLocaleTimeString()} ·{' '}
            {Math.round(distanceTo(spawn, around.position, now))} m · {spawn.path.waypoints.length} waypoints
          </Text>
        ))}
      <Text>Trigger notifications</Text>
      <View style={styles.choices}>
        <Button title="Test patrol alert" onPress={testPatrolAlert} />
        <Button title="Test escort paused" onPress={() => sendPatrolAlert({ kind: 'escortPaused', hpShare: 0.45 })} />
        <Button title="Test escort knocked out" onPress={() => sendPatrolAlert({ kind: 'escortKnockedOut' })} />
      </View>
      <View style={styles.row}>
        <Button title="Clear beaten patrols & helped travellers" onPress={game.resetPatrols} />
        <Button title="Clear background state" onPress={clearBackground} />
      </View>

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
  title: { fontSize: 24, fontWeight: '600', marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  mono: { fontFamily: 'monospace' },
  hint: { color: '#666' },
  group: { gap: 4 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 2, borderColor: '#3b2a1a', paddingHorizontal: 10, paddingVertical: 6 },
  choiceActive: { backgroundColor: '#fff6a8' },
});
