import { Camera, type CameraRef, Images, Map, type MapRef, Marker } from '@maplibre/maplibre-react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AutoGatherPill, WalkCard } from '@/components/AutoGather';
import { Button } from '@/components/Button';
import { WalkEffects } from '@/components/WalkEffects';
import { IslandMenu, ISLAND_HEIGHT } from '@/components/IslandMenu';
import { MapFoliage, useFoliage } from '@/components/MapFoliage';
import { MapTrail, MapWater } from '@/components/MapAmbience';
import { MapSky, useSkyPan } from '@/components/MapSky';
import { MapRanges, type RangeCircle } from '@/components/MapRanges';
import { PatrolMarker } from '@/components/PatrolMarker';
import { PatrolPanel } from '@/components/PatrolPanel';
import { PlaceFightPanel } from '@/components/PlaceFightPanel';
import { PANEL_KINDS, PlacePanel } from '@/components/PlacePanel';
import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { SanctumMarker } from '@/components/SanctumMarker';
import { SanctumPanel } from '@/components/SanctumPanel';
import { SecretPanel } from '@/components/SecretPanel';
import { SpawnMarker } from '@/components/SpawnMarker';
import { TavernPanel } from '@/components/TavernPanel';
import { timed } from '@/components/timed';
import { TravellerPanel } from '@/components/TravellerPanel';
import { Text } from '@/components/Text';
import { TutorialHint } from '@/components/TutorialHint';
import { gatheringConfig } from '@/content/gatheringConfig';
import { items } from '@/content/items';
import { materialById, resourceById } from '@/content/lookup';
import { mapStyle } from '@/content/mapStyle';
import { patrolRules } from '@/content/patrols';
import { dockRules } from '@/content/placeActivities';
import { placeGroups, placeInfo, placeRules } from '@/content/places';
import { placeRevealKinds, type TipId } from '@/content/reveal';
import { sanctumRules } from '@/content/sanctums';
import { spawnConfig } from '@/content/spawnConfig';
import { tavernRules } from '@/content/taverns';
import { tutorialRules } from '@/content/tutorial';
import { walkableRules } from '@/content/walkable';
import { highestUnlockedTier } from '@/game/expeditions/expeditions';
import { freshGathersLeft, isFleeing, pickaxeTier, showsOnMap, type CollectFailure } from '@/game/gathering/gathering';
import { readSpawn, requiredPickaxeTier } from '@/game/gathering/lockedNodes';
import { ambienceConfig, inSpan, showsDecoration } from '@/game/generation/ambience';
import { distanceMeters } from '@/game/generation/geo';
import { generateSpawnsAround } from '@/game/generation/spawns';
import type { LatLng, Spawn, SpawnConfig } from '@/game/generation/types';
import { visibleSpawns } from '@/game/generation/visibility';
import { patrolRulesAt, trackedRange, trackWindows, walkEffectAt, walkEffectSpawns } from '@/game/gathering/walkEffects';
import { isPatrolKind, isTravellerKind, patrolPositionAt, patrolTier, patrolsAround, pruneByWindow, type PatrolSpawn } from '@/game/patrols/generate';
import { pocketModeAvailable, pocketTracking } from '@/game/patrols/pocketMode';
import { activeLairs, isFightPlace } from '@/game/places/fights';
import { isLockedMine, isPlaceVisible, placeGroupOf, placesAround, showsForPlayer, type PlaceSpawn } from '@/game/places/generate';
import { ruinReplacements } from '@/game/places/ruins';
import { mapTileAt, mapTileKey, nearWater, type WalkableTile } from '@/game/generation/walkable';
import { fleesAt, hasFled, isGone, isVisible } from '@/game/patrols/visibility';
import { isLureActive, lureEndsAt, lureSpawns } from '@/game/rewards/lures';
import { liveTreasureMaps } from '@/game/rewards/treasure';
import { isPlaceRevealed, isRevealed } from '@/game/reveal/reveal';
import { generateSanctumsAround, sanctumById, type SanctumSpawn } from '@/game/sanctums/sanctums';
import { generateTavernsAround, isTavernUnlocked, type TavernSpawn } from '@/game/taverns/taverns';
import { collectRadiusNow, fallbackReady, shownTutorialSpawns } from '@/game/tutorial/spawns';
import { useLanguage } from '@/hooks/useLanguage';
import { usePlacedPoints, usePlacedSpawns } from '@/hooks/usePlacedSpawns';
import { useAmbience } from '@/hooks/useAmbience';
import { usePlayerLocation } from '@/hooks/usePlayerLocation';
import { useQuestMarks } from '@/hooks/useQuestMarks';
import { useSecretPlaces } from '@/hooks/useSecretPlaces';
import { useWalkableTiles } from '@/hooks/useWalkableTiles';
import { hasKey } from '@/game/secrets/keys';
import { isEntered } from '@/game/secrets/places';
import { lootText } from '@/hooks/usePatrols';
import { t, tr } from '@/i18n';
import { navigate } from '@/services/navigation';
import { markTap, recordTiming } from '@/services/timings';
import { appendFixesNow } from '@/services/walkTracking';
import { debugEnabled, useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useWorldStore } from '@/store/worldStore';
import { colors } from '@/theme';

const toLngLat = (position: LatLng): [number, number] => [position.longitude, position.latitude];
/** Dragging the map further than this from the player stops the camera following them. */
const FOLLOW_SLACK_METERS = 40;
// Patterns used by content/mapStyle.ts, drawn by scripts/generate-map-textures.py.
const MAP_TEXTURES = {
  cobble: require('../../assets/sprites/cobble.png'),
  dirt: require('../../assets/sprites/dirt.png'),
  floor: require('../../assets/sprites/floor.png'),
  trampled: require('../../assets/sprites/trampled.png'),
  grass: require('../../assets/sprites/grass.png'),
  'water-0': require('../../assets/sprites/water-0.png'),
  'water-1': require('../../assets/sprites/water-1.png'),
};
/** How long a patrol just come into view pulses on the map. */
const SEEN_HIGHLIGHT_MS = 5000;
/**
 * How often the map screen refreshes the time. Each refresh re-renders every
 * marker, and patrols walk 1-2 km/h, so they only step a pixel or two between ticks.
 */
const TICK_MS = 3000;

/** Sanctums and taverns snap with coarse map tiles so they can be shown from kilometres away. */
const sanctumPlacement = { ...walkableRules, ...sanctumRules.placement };
const tavernPlacement = { ...walkableRules, ...tavernRules.placement };
const placePlacement = { ...walkableRules, ...placeRules.placement };
/** Groups whose places the map shows; taverns have their own markers. */
const shownPlaceGroups = placeGroups.filter((group) => group.id !== 'tavern');
const isShownKind = (kind: PlaceSpawn['kind']) => PANEL_KINDS.includes(kind) || isFightPlace(kind);
/** Fishing docks only stay where there is water nearby; with no map tile, there's no telling, so they're left out. */
const keepPlace = (place: PlaceSpawn, tile: WalkableTile | null, position: LatLng) =>
  place.kind !== 'fishingDock' || (tile !== null && nearWater(tile, position, dockRules.waterMeters));

const isSecretKind = (kind: PlaceSpawn['kind']) => kind === 'hiddenDen' || kind === 'blackMarket' || kind === 'underwaterDungeon';

// The debug profiler's wrappers: they cost nothing while "Record timings" is off.
const TimedSpawnMarker = timed('marker: spawn', SpawnMarker);
const TimedSanctumMarker = timed('marker: sanctum', SanctumMarker);
const TimedPatrolMarker = timed('marker: patrol', PatrolMarker);
const TimedSanctumPanel = timed('panel: sanctum', SanctumPanel);
const TimedPlaceFightPanel = timed('panel: place fight', PlaceFightPanel);
const TimedPlacePanel = timed('panel: place', PlacePanel);
const TimedSecretPanel = timed('panel: secret', SecretPanel);
const TimedTavernPanel = timed('panel: tavern', TavernPanel);
const TimedTravellerPanel = timed('panel: traveller', TravellerPanel);
const TimedPatrolPanel = timed('panel: patrol', PatrolPanel);

const minutesLeft = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}`;
const failureMessages: Record<CollectFailure, (distance: number, radius?: number) => string> = {
  tooFar: (distance, radius = gatheringConfig.collectRadiusMeters) =>
    t('map.tooFar', { distance: Math.round(distance), radius }),
  fled: () => t('map.fled'),
  collected: () => t('map.collected'),
  expired: () => t('map.expired'),
  needsTool: () => t('map.needsTool'),
};

function MapScreen() {
  useLanguage();
  const player = usePlayerLocation();
  const insets = useSafeAreaInsets();
  const setDebug = useDebugStore((state) => state.set);
  const debugOn = useDebugStore(debugEnabled);
  const timeOfDay = useDebugStore((state) => state.timeOfDay);
  const windowMinutes = useDebugStore((state) => state.windowMinutes);
  const save = useGameStore((state) => state.save);
  const collect = useGameStore((state) => state.collect);
  const collectTreasure = useGameStore((state) => state.collectTreasure);
  const collectTutorialSpawn = useGameStore((state) => state.collectTutorialSpawn);
  const collectFromHere = useGameStore((state) => state.collectFromHere);
  const debugSanctum = useDebugStore((state) => state.debugSanctum);
  const [openSanctum, setOpenSanctum] = useState<SanctumSpawn | null>(null);
  const debugTavern = useDebugStore((state) => state.debugTavern);
  const [openTavern, setOpenTavern] = useState<TavernSpawn | null>(null);
  const debugPlaces = useDebugStore((state) => state.debugPlaces);
  const [openPlace, setOpenPlace] = useState<PlaceSpawn | null>(null);
  const [openPatrol, setOpenPatrol] = useState<PatrolSpawn | null>(null);
  const cameraRef = useRef<CameraRef>(null);
  const mapRef = useRef<MapRef>(null);
  const ambience = useAmbience();
  const skyPan = useSkyPan();
  const foliage = useFoliage(mapRef, inSpan(ambience.hour, ambienceConfig.smoke));
  const [following, setFollowing] = useState(true);
  const [decor, setDecor] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [message, setMessage] = useState<string | null>(null);
  const [freshLegsOpen, setFreshLegsOpen] = useState(true);
  const autoMode = useWorldStore((state) => state.autoGather);
  const autoEnabled = useSettingsStore((state) => pocketTracking(state.pocketMode));
  const showAutoRadius = useDebugStore((state) => debugOn && state.showAutoRadius);
  const showNodeRanges = useDebugStore((state) => debugOn && state.showNodeRanges);

  useEffect(
    () =>
      useWorldStore.subscribe((state, previous) => {
        if (state.autoGatherMessage && state.autoGatherMessage !== previous.autoGatherMessage) setMessage(state.autoGatherMessage.text);
        if (state.patrolMessage && state.patrolMessage !== previous.patrolMessage) setMessage(state.patrolMessage.text);
      }),
    [],
  );

  // "App open only": the map's own GPS fixes feed auto-gather.
  const fixAt = player.status === 'ready' && !player.mocked ? player.location.timestamp : null;
  useEffect(() => {
    if (autoMode !== 'limited' || player.status !== 'ready' || player.mocked) return;
    const { position: at, accuracy, timestamp } = player.location;
    appendFixesNow([{ position: at, accuracy, timestamp, stepsCounted: true }]).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMode, fixAt]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 2500);
    return () => clearTimeout(timer);
  }, [message]);

  const position = player.status === 'ready' ? player.location.position : null;
  const speed = player.status === 'ready' ? player.location.speed : null;
  const minute = Math.floor(now / 60_000);

  // Spawn windows are whole minutes, so regenerating once a minute is enough.
  const spawns = useMemo(() => {
    if (!position) return [];
    const config: SpawnConfig = windowMinutes
      ? {
          ...spawnConfig,
          kinds: Object.fromEntries(
            Object.entries(spawnConfig.kinds).map(([kind, settings]) => [kind, { ...settings, windowMinutes }]),
          ) as SpawnConfig['kinds'],
        }
      : spawnConfig;
    return recordTiming('map: generateSpawnsAround', () => generateSpawnsAround(position, minute * 60_000, { config, timeOfDay: timeOfDay ?? undefined }));
  }, [position?.latitude, position?.longitude, minute, timeOfDay, windowMinutes]);
  // A lure adds private herbs and animals for a while.
  // Hunter's musk draws animals the same way.
  const lured = useMemo(
    () => [...lureSpawns(save.activeLure, minute * 60_000), ...walkEffectSpawns(save.walkEffects, minute * 60_000)],
    [save.activeLure, save.walkEffects, minute],
  );
  const allSpawns = useMemo(() => [...spawns, ...lured], [spawns, lured]);
  // On paths and in public areas; the tutorial's first tree stays where it was put.
  const placedSpawns = usePlacedSpawns(allSpawns, position);

  // Sanctums within sight (plus snapping room), placed on walkable places.
  const sanctumCandidates = useMemo(() => {
    if (!position) return [];
    const reach = sanctumRules.visibilityMeters + sanctumRules.placement.maxSnapMeters;
    return generateSanctumsAround(position, minute * 60_000).filter((s) => distanceMeters(position, s.position) <= reach);
  }, [position, minute]);
  const placedSanctums = usePlacedPoints(sanctumCandidates, sanctumPlacement);
  const sanctumsInSight = recordTiming('map: sanctumsInSight', () =>
    [...(isRevealed(save, 'sanctums') ? placedSanctums : []), ...(debugSanctum ? [debugSanctum] : [])].filter(
      (s) =>
        s.expiresAt > now &&
        !(s.id in save.usedSanctums) &&
        position !== null &&
        distanceMeters(position, s.position) <= sanctumRules.visibilityMeters,
    ),
  );

  // Tavern windows last 72 h, so regenerating once a minute is enough.
  const tavernCandidates = useMemo(() => {
    if (!position) return [];
    const reach = tavernRules.visibilityMeters + tavernRules.placement.maxSnapMeters;
    return generateTavernsAround(position, minute * 60_000).filter((t) => distanceMeters(position, t.position) <= reach);
  }, [position, minute]);
  const placedTaverns = usePlacedPoints(tavernCandidates, tavernPlacement);
  const tavernsInSight = recordTiming('map: tavernsInSight', () =>
    [...(isRevealed(save, 'taverns') ? placedTaverns : []), ...(debugTavern ? [debugTavern] : [])].filter(
      (t) => position !== null && distanceMeters(position, t.position) <= tavernRules.visibilityMeters,
    ),
  );
  const tavernsOpen = isTavernUnlocked(save);

  // Places and fight events within sight (plus snapping room), and this player's replacement ruins, placed on walkable places.
  const placeCandidates = useMemo(() => {
    if (!position) return [];
    return recordTiming('map: placesAround', () =>
      [...placesAround(position, minute * 60_000, shownPlaceGroups), ...ruinReplacements(save, minute * 60_000)].filter(
        (place) =>
          isShownKind(place.kind) &&
          distanceMeters(position, place.position) <= placeGroupOf(place.kind).visibilityMeters + placeRules.placement.maxSnapMeters,
      ),
    );
  }, [position, minute, save.dugRuins]); // eslint-disable-line react-hooks/exhaustive-deps
  const placedPlaces = usePlacedPoints(placeCandidates, placePlacement, keepPlace);
  const playerPickaxe = pickaxeTier(save);
  const placesInSight = recordTiming('map: placesInSight', () =>
    [...placedPlaces.filter((place) => isPlaceRevealed(save, place.kind)), ...debugPlaces].filter(
      (place) =>
        position !== null &&
        isPlaceVisible(place, position, now) &&
        !(place.id in save.usedPlaces) &&
        showsForPlayer(place, playerPickaxe),
    ),
  );
  // This player's tipped secret places: shown at any distance until they move on.
  const tippedSecrets = useSecretPlaces(save, now);
  const secretsInSight = isRevealed(save, 'secrets') ? tippedSecrets : [];
  const keyHeld = hasKey(save);
  // Quest objectives unlock from the place kinds the player has seen.
  const notePlacesSeen = useGameStore((state) => state.notePlacesSeen);
  const kindsInSight = [...new Set([...placesInSight.map((place) => place.kind), ...(tavernsInSight.length > 0 ? (['tavern'] as const) : [])])].sort().join(',');
  useEffect(() => {
    if (kindsInSight) notePlacesSeen(kindsInSight.split(',') as PlaceSpawn['kind'][]);
  }, [kindsInSight, notePlacesSeen]);
  // Active quests' targets, within 2 km by construction.
  const questTargets = save.quests.list.flatMap((quest) =>
    isRevealed(save, 'quests') &&
    quest.acceptedAt !== null && quest.doneAt === null && quest.target ? [{ id: quest.id, target: quest.target }] : [],
  );
  useQuestMarks(save, position);
  const visitPlace = useGameStore((state) => state.visitPlace);
  const openPlaceAt = (place: PlaceSpawn) => {
    markTap('place marker');
    setOpenPlace(place);
    if (position) visitPlace(place, position);
  };
  // Other screens (the launch dialog) can sell emergency supply while a tavern is in reach.
  const nearbyTavern = tavernsInSight.find((t) => position !== null && distanceMeters(position, t.position) <= tavernRules.interactionMeters) ?? null;
  const setWorld = useWorldStore((state) => state.set);
  const focusPlace = useWorldStore((state) => state.focusPlace);
  useEffect(() => {
    setWorld({ player: position, nearbyTavern });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.latitude, position?.longitude, nearbyTavern?.id, setWorld]);

  // Treasure from read maps, shown only to this player.
  const treasureSpots = useMemo(
    () =>
      liveTreasureMaps(save, minute * 60_000).flatMap((map) => (map.location ? [{ id: map.id, position: map.location }] : [])),
    [save, minute],
  );
  const placedTreasure = usePlacedPoints(isRevealed(save, 'treasure') ? treasureSpots : [], walkableRules);
  const shownSpawns = recordTiming('map: shownSpawns', () =>
    placedSpawns.filter((spawn) => isRevealed(save, spawn.kind === 'animal' ? 'animals' : 'resources')),
  );
  const visible = position
    ? recordTiming('map: visibleSpawns', () =>
        visibleSpawns(shownSpawns, position, now, undefined, trackedRange(save, now)).filter(
          ({ spawn }) => !(spawn.id in save.collected) && showsOnMap(save, spawn),
        ),
      )
    : [];

  // Patrols and travellers reroll with their window, so generating once per window is enough.
  const patrolWindow = Math.floor(now / (patrolRules.windowMinutes * 60_000));
  const debugPatrols = useWorldStore((state) => state.debugPatrols);
  const patrolSpawns = useMemo(
    () =>
      position
        ? recordTiming('map: patrolsAround', () =>
            [
              ...patrolsAround(
                position,
                patrolWindow * patrolRules.windowMinutes * 60_000,
                patrolRules,
                // More patrols swarm around a live monster lair.
                activeLairs(position, patrolWindow * patrolRules.windowMinutes * 60_000, save.usedPlaces),
              ),
              ...debugPatrols,
            ],
          )
        : [],
    [position, patrolWindow, debugPatrols, save.usedPlaces],
  );
  const patrolsSeen = useWorldStore((state) => state.patrolsSeen);
  const patrolsShown = isRevealed(save, 'patrols');
  const visiblePatrols = useMemo(
    () =>
      position
        ? recordTiming('map: visiblePatrols', () =>
            patrolSpawns.filter(
              (spawn) =>
                isVisible(spawn, position, now, patrolRulesAt(patrolRules, trackWindows(save.walkEffects), now)) &&
                !isGone(spawn, { ...save.beatenPatrols, ...save.helpedTravellers }, now) &&
                !hasFled(spawn, patrolsSeen[spawn.id], now) &&
                (patrolsShown || debugPatrols.includes(spawn)),
            ),
          )
        : [],
    [patrolSpawns, position, now, save.beatenPatrols, save.helpedTravellers, save.walkEffects, patrolsSeen, patrolsShown, debugPatrols],
  );

  // The first time the map draws a kind, its tip comes up.
  const noteTips = useGameStore((state) => state.noteTips);
  const kindsDrawn = [
    ...new Set<TipId>([
      ...(visible.some(({ spawn }) => spawn.kind !== 'animal' && spawn.tile !== 'tutorial') ? (['resources'] as const) : []),
      ...(visible.some(({ spawn }) => spawn.kind === 'animal') ? (['animals'] as const) : []),
      ...placesInSight.map((place) => placeRevealKinds[place.kind]),
      ...(tavernsInSight.length > 0 ? (['taverns'] as const) : []),
      ...(sanctumsInSight.length > 0 ? (['sanctums'] as const) : []),
      ...(secretsInSight.length > 0 ? (['secrets'] as const) : []),
      ...(visiblePatrols.length > 0 ? (['patrols'] as const) : []),
      ...(placedTreasure.length > 0 ? (['treasure'] as const) : []),
    ]),
  ].join(',');
  useEffect(() => {
    if (kindsDrawn) noteTips(kindsDrawn.split(',') as TipId[]);
  }, [kindsDrawn, noteTips]);

  // First sighting of a spawn: starts the goblins' flee timer and the "just seen" pulse.
  useEffect(() => {
    const unseen = visiblePatrols.filter((spawn) => patrolsSeen[spawn.id] === undefined);
    if (unseen.length === 0) return;
    setWorld({
      patrolsSeen: pruneByWindow({ ...patrolsSeen, ...Object.fromEntries(unseen.map((spawn) => [spawn.id, now])) }, now),
    });
  }, [visiblePatrols, patrolsSeen, now, setWorld]);

  useEffect(() => {
    if (position && following && !focusPlace) cameraRef.current?.easeTo({ center: toLngLat(position), duration: 500 });
  }, [position?.latitude, position?.longitude, following, focusPlace]);

  // The tutorial's own nodes, spawned once per gathering step on walkable ground around the player
  // (without location, they have no spot and only "Collect from here" reaches them).
  const placeTutorialSpawns = useGameStore((state) => state.placeTutorialSpawns);
  const tutorialDone = save.tutorial.step === 'done';
  const tutorialTileKey = position && !tutorialDone ? mapTileKey(mapTileAt(position, walkableRules.mapZoom)) : '';
  const tutorialTiles = useWalkableTiles(tutorialTileKey);
  const tutorialTile = tutorialTileKey in tutorialTiles ? tutorialTiles[tutorialTileKey] : undefined;
  useEffect(() => {
    if (tutorialDone) return;
    if (player.status === 'denied') placeTutorialSpawns(null, null);
    else if (position) placeTutorialSpawns(position, tutorialTile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.status, position?.latitude, position?.longitude, tutorialTile, save.tutorial.step, placeTutorialSpawns]);

  // The tutorial ends on another screen: back on the map, it zooms out a little.
  const zoomOutPending = useRef(false);
  const wasDone = useRef(tutorialDone);
  useEffect(() => {
    if (tutorialDone && !wasDone.current) zoomOutPending.current = true;
    wasDone.current = tutorialDone;
  }, [tutorialDone]);
  useFocusEffect(
    useCallback(() => {
      if (!zoomOutPending.current) return;
      zoomOutPending.current = false;
      cameraRef.current?.zoomTo(tutorialRules.doneZoom, { duration: 800 });
    }, []),
  );

  // The first quest waits for a place in sight to point at.
  const targetFirstQuest = useGameStore((state) => state.targetFirstQuest);
  const firstQuestWaiting = save.quests.list.some(
    (quest) => quest.objective === 'visit' && quest.acceptedAt !== null && quest.doneAt === null && quest.target === null,
  );
  useEffect(() => {
    if (firstQuestWaiting && position && placesInSight.length > 0) targetFirstQuest(placesInSight, position);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstQuestWaiting, placesInSight.length, position?.latitude, position?.longitude, targetFirstQuest]);

  // A notification tapped patrol: the camera goes to where it was seen, and it stays selected while still around.
  // Declared after the follow effect so the focus wins the camera while it lasts.
  const focusPatrol = useWorldStore((state) => state.focusPatrol);
  const focusedPatrol = focusPatrol ? (visiblePatrols.find((spawn) => spawn.id === focusPatrol.id) ?? null) : null;
  const selectedPatrol = openPatrol ?? focusedPatrol;
  useEffect(() => {
    if (!focusPatrol || !position) return;
    cameraRef.current?.easeTo({ center: toLngLat(focusPatrol), duration: 500 });
    // Nothing to select there any more: stop holding the camera there.
    if (!focusedPatrol) setWorld({ focusPatrol: null });
  }, [focusPatrol, position, focusedPatrol, setWorld]);
  // A tapped place stays in view until the player re-centres or drags the map.
  useEffect(() => {
    if (focusPlace) cameraRef.current?.easeTo({ center: toLngLat(focusPlace), duration: 500 });
  }, [focusPlace]);
  const closePatrol = () => {
    setOpenPatrol(null);
    setWorld({ focusPatrol: null });
  };

  // Indoors, with bad GPS or no location: the tutorial's nodes can be picked up from here after a while.
  const locationOff = player.status === 'denied';
  const fallback = fallbackReady(save, now, locationOff);
  // While the tutorial runs, the pick-up range is wider, so GPS drift can't strand its nodes.
  const collectRadius = collectRadiusNow(save);
  const gatherFromHere = () => {
    const result = collectFromHere();
    if (result.ok) setMessage(`+ ${result.gained.map((g) => `${g.amount} ${tr(materialById[g.materialId]?.name ?? g.materialId)}`).join(', ')}`);
  };
  const fallbackButton = fallback && (
    <View style={[styles.fallback, { bottom: insets.bottom + ISLAND_HEIGHT + 12 }]}>
      <Button title={t('tutorial.collectFromHere')} onPress={gatherFromHere} />
    </View>
  );

  // The menu stays reachable while there is no map to show.
  if (player.status === 'pending' || player.status === 'denied' || !position) {
    return (
      <View style={styles.container}>
        {player.status === 'pending' ? (
          <PlaceholderScreen title={t('map.findingYou')} description={t('map.waitingGps')} />
        ) : (
          <PlaceholderScreen title={t('map.locationNeeded')} description={t('map.locationHint')} />
        )}
        <TutorialHint
          screen="map"
          text={locationOff && shownTutorialSpawns(save).length > 0 ? t('tutorial.locationOff') : undefined}
          style={[styles.tutorialHint, { top: insets.top + 48 }]}
        />
        {fallbackButton}
        {message && <Text style={[styles.banner, { bottom: insets.bottom + ISLAND_HEIGHT + 64 }]}>{message}</Text>}
        <IslandMenu />
      </View>
    );
  }

  const autoOn = autoEnabled && autoMode !== 'off';
  const autoRadius =
    gatheringConfig.autoGather.radiusMeters +
    (walkEffectAt(save.walkEffects, 'forage', now) ? gatheringConfig.walkEffects.forage.radiusBonusMeters : 0);
  const ranges: RangeCircle[] = [
    // The selected patrol's engage range, so the player can see how close to get.
    ...(selectedPatrol
      ? [{ id: 'patrol', center: patrolPositionAt(selectedPatrol, now), radius: patrolRules.engageMeters, kind: 'patrol' as const }]
      : []),
    ...(autoOn || showAutoRadius ? [{ id: 'auto', center: position, radius: autoRadius, kind: 'auto' as const }] : []),
    ...(showNodeRanges
      ? [
          { id: 'tap', center: position, radius: collectRadius, kind: 'tap' as const },
          ...visible.map(({ spawn, position: at }) => ({ id: spawn.id, center: at, radius: gatheringConfig.autoGather.radiusMeters, kind: 'node' as const })),
        ]
      : []),
  ];
  const showPill = pocketModeAvailable(save);

  // The tutorial's nodes on the map, the nearest one pointed at.
  const tutorialNodes = shownTutorialSpawns(save).flatMap((node) => (node.position ? [{ ...node, position: node.position }] : []));
  const pointed = tutorialNodes.reduce<(typeof tutorialNodes)[number] | null>(
    (best, node) => (!best || distanceMeters(position, node.position) < distanceMeters(position, best.position) ? node : best),
    null,
  );
  const gatherTutorial = (id: string) => {
    const result = collectTutorialSpawn(id, position);
    if (result.ok) setMessage(`+ 1 ${tr(materialById[result.materialId]?.name ?? result.materialId)}`);
    else setMessage(failureMessages[result.reason](result.distance, collectRadius));
  };

  const digUp = (mapId: string, treasureAt: LatLng) => {
    const distance = distanceMeters(position, treasureAt);
    if (distance > gatheringConfig.collectRadiusMeters) {
      setMessage(t('map.treasureTooFar', { distance: Math.round(distance), radius: gatheringConfig.collectRadiusMeters }));
      return;
    }
    setMessage(t('map.treasureFound', { gains: lootText(collectTreasure(mapId, position, treasureAt)) }));
  };

  const gather = (spawn: Spawn) => {
    const result = collect(spawn, { position, speed }, Date.now());
    if (result.ok) {
      setMessage(`+ ${result.gained.map((g) => `${g.amount} ${tr(materialById[g.materialId]?.name ?? g.materialId)}`).join(', ')}`);
      return;
    }
    const needs = result.reason === 'needsTool' ? requiredPickaxeTier(spawn) : null;
    const pickaxe = needs
      ? items.find((item) => item.slot === 'tool' && item.toolType === 'pickaxe' && item.tier === needs)
      : undefined;
    setMessage(needs && pickaxe ? t('map.needsPickaxe', { pickaxe: tr(pickaxe.name) }) : failureMessages[result.reason](result.distance, collectRadius));
  };

  return (
    <View style={styles.container}>
      <Map
        ref={mapRef}
        onDidFinishLoadingMap={foliage.refresh}
        style={styles.map}
        mapStyle={mapStyle}
        touchRotate={false}
        touchPitch={false}
        logo={false}
        attributionPosition={{ top: insets.top + 8, left: 8 }}
        onRegionIsChanging={(event) => {
          skyPan.update(event.nativeEvent.center, event.nativeEvent.zoom);
          setDecor(showsDecoration(event.nativeEvent.zoom));
        }}
        onRegionDidChange={(event) => {
          skyPan.update(event.nativeEvent.center, event.nativeEvent.zoom);
          setDecor(showsDecoration(event.nativeEvent.zoom));
          foliage.refresh();
          const { userInteraction, center } = event.nativeEvent;
          const away = distanceMeters(position, { longitude: center[0], latitude: center[1] }) > FOLLOW_SLACK_METERS;
          if (userInteraction && away) setFollowing(false);
          if (userInteraction) setWorld({ focusPlace: null });
        }}
        onPress={(event) => {
          if (debugOn && player.mocked) {
            const [longitude, latitude] = event.nativeEvent.lngLat;
            setDebug({ mockLocation: { latitude, longitude } });
          }
        }}
      >
        <Camera ref={cameraRef} initialViewState={{ center: toLngLat(position), zoom: 17 }} />
        <Images images={MAP_TEXTURES} />
        <MapWater />
        <MapTrail position={position} />
        <MapFoliage data={foliage.data} />
        <MapRanges circles={ranges} />
        {visible.map(({ spawn, position: spawnPosition, distance }) => {
          const read = readSpawn(save, spawn);
          const shown = resourceById[read.resourceId];
          return (
            <Marker key={spawn.id} id={spawn.id} lngLat={toLngLat(spawnPosition)} onPress={() => gather(spawn)}>
              <TimedSpawnMarker
                kind={spawn.kind}
                emoji={shown?.emoji ?? '❓'}
                icon={shown?.icon}
                inRange={distance <= collectRadius}
                fleeing={spawn.kind === 'animal' && isFleeing(speed)}
                sway={read.resourceId === 'tree'}
                locked={read.state === 'locked'}
              />
            </Marker>
          );
        })}
        {tutorialNodes.map((node) => {
          const wood = node.materialId === 'wood';
          const material = materialById[node.materialId];
          return (
            <Marker key={node.id} id={node.id} lngLat={toLngLat(node.position)} onPress={() => gatherTutorial(node.id)}>
              <View style={styles.tutorialNode}>
                {node.id === pointed?.id && <Text style={styles.pointer}>👇</Text>}
                <TimedSpawnMarker
                  kind={wood ? 'wood' : 'animal'}
                  emoji={wood ? resourceById.tree.emoji : material.emoji}
                  icon={wood ? resourceById.tree.icon : material.icon}
                  inRange={distanceMeters(position, node.position) <= collectRadius}
                  fleeing={false}
                  sway={wood}
                />
              </View>
            </Marker>
          );
        })}
        {sanctumsInSight.map((sanctum) => (
          <Marker
            key={sanctum.id}
            id={sanctum.id}
            lngLat={toLngLat(sanctum.position)}
            onPress={() => {
              markTap('sanctum marker');
              setOpenSanctum(sanctum);
            }}
          >
            <TimedSanctumMarker emoji={sanctumById[sanctum.sanctumId].emoji} locked={save.sigils.length === 0} />
          </Marker>
        ))}
        {tavernsInSight.map((tavern) => (
          <Marker
            key={tavern.id}
            id={tavern.id}
            lngLat={toLngLat(tavern.position)}
            onPress={() => {
              markTap('tavern marker');
              setOpenTavern(tavern);
            }}
          >
            <TimedSanctumMarker emoji="🍺" locked={!tavernsOpen} label={tr(placeInfo.tavern.name)} />
          </Marker>
        ))}
        {placesInSight.map((place) => (
          <Marker key={place.id} id={place.id} lngLat={toLngLat(place.position)} onPress={() => openPlaceAt(place)}>
            <TimedSanctumMarker
              emoji={placeInfo[place.kind].emoji}
              locked={isLockedMine(place.kind, playerPickaxe)}
              label={tr(placeInfo[place.kind].name)}
            />
          </Marker>
        ))}
        {secretsInSight.map((place) => (
          <Marker
            key={place.id}
            id={place.id}
            lngLat={toLngLat(place.position)}
            onPress={() => {
              markTap('secret marker');
              setOpenPlace(place);
            }}
          >
            <TimedSanctumMarker
              emoji={placeInfo[place.kind].emoji}
              secret
              locked={!keyHeld && !isEntered(save, place)}
              label={tr(placeInfo[place.kind].name)}
            />
          </Marker>
        ))}
        {visiblePatrols.map((spawn) => {
          const seenAt = patrolsSeen[spawn.id];
          const fleesIn = seenAt !== undefined ? fleesAt(spawn, seenAt) : null;
          const { tier, elite } = patrolTier(spawn, highestUnlockedTier(save));
          return (
            <Marker
              key={spawn.id}
              id={spawn.id}
              lngLat={toLngLat(patrolPositionAt(spawn, now))}
              onPress={() => {
                markTap('patrol marker');
                setOpenPatrol(spawn);
                setWorld({ focusPatrol: null });
              }}
            >
              <TimedPatrolMarker
                kind={spawn.kind}
                tier={tier}
                elite={elite}
                fleesIn={fleesIn === null ? null : Math.max(0, fleesIn - now)}
                fresh={seenAt !== undefined && now - seenAt < SEEN_HIGHLIGHT_MS}
              />
            </Marker>
          );
        })}
        {questTargets.map(({ id, target }) => (
          <Marker key={`quest:${id}`} id={`quest:${id}`} lngLat={toLngLat(target.position)} onPress={() => navigate('/quests')}>
            <Text style={target.kind === 'mark' ? styles.questMark : styles.questTarget}>{target.kind === 'mark' ? '❓' : '📜'}</Text>
          </Marker>
        ))}
        {placedTreasure.map((spot) => (
          <Marker key={spot.id} id={spot.id} lngLat={toLngLat(spot.position)} onPress={() => digUp(spot.id, spot.position)}>
            <Text style={styles.treasure}>💰</Text>
          </Marker>
        ))}
        <Marker id="player" lngLat={toLngLat(position)}>
          <Text style={styles.player}>🧙</Text>
        </Marker>
      </Map>
      <MapSky pan={skyPan} hour={ambience.hour} raining={ambience.raining} decor={decor} />
      {player.mocked && (
        <Text style={[styles.banner, { top: insets.top + 48 }]}>{t('map.mockBanner')}</Text>
      )}
      {debugOn && (
        <Pressable
          accessibilityLabel={t('map.debug')}
          onPress={() => navigate('/debug')}
          style={[styles.roundButton, styles.debugButton, { top: insets.top + 8 }]}
        >
          <Text style={styles.buttonEmoji}>🐞</Text>
        </Pressable>
      )}
      <Pressable
        accessibilityLabel={t('screens.settings')}
        onPress={() => navigate('/settings')}
        style={[styles.roundButton, styles.settingsButton, { top: insets.top + 8 }]}
      >
        <Text style={styles.buttonEmoji}>⚙️</Text>
      </Pressable>
      {(!following || focusPlace) && (
        <Pressable
          accessibilityLabel={t('map.recentre')}
          onPress={() => {
            setFollowing(true);
            setWorld({ focusPlace: null });
            cameraRef.current?.easeTo({ center: toLngLat(position), duration: 500 });
          }}
          style={[styles.roundButton, styles.recentreButton, { bottom: insets.bottom + ISLAND_HEIGHT + 12 }]}
        >
          <Text style={styles.recentreEmoji}>🧙</Text>
        </Pressable>
      )}
      <TutorialHint screen="map" style={[styles.tutorialHint, { top: insets.top + (player.mocked ? 84 : 48) }]} />
      {isLureActive(save, now) && (
        <Text style={[styles.banner, styles.lure, { top: insets.top + 8 }]}>
          {t('map.lure', { time: minutesLeft(lureEndsAt(save) - now) })}
        </Text>
      )}
      <WalkEffects
        player={position}
        buttonStyle={{ bottom: insets.bottom + ISLAND_HEIGHT + 68 }}
        chipsStyle={{ top: insets.top + 48 }}
      />
      {save.tutorial.step === 'done' && freshGathersLeft(save, now) > 0 && (freshLegsOpen ? (
        <Text
          accessibilityRole="button"
          accessibilityHint={t('common.close')}
          onPress={() => setFreshLegsOpen(false)}
          style={[styles.banner, styles.freshLegs, { top: insets.top + 48 }]}
        >
          {t('map.freshLegs', { count: freshGathersLeft(save, now) })}  ✕
        </Text>
      ) : (
        <Pressable
          accessibilityLabel={t('map.freshLegsShow')}
          onPress={() => setFreshLegsOpen(true)}
          style={[styles.roundButton, styles.freshLegsButton, { top: insets.top + 48 }]}
        >
          <Text style={styles.buttonEmoji}>🦵</Text>
        </Pressable>
      ))}
      {openSanctum && <TimedSanctumPanel spawn={openSanctum} player={position} onClose={() => setOpenSanctum(null)} />}
      {openPlace && isFightPlace(openPlace.kind) && (
        <TimedPlaceFightPanel place={openPlace} player={position} now={now} onClose={() => setOpenPlace(null)} />
      )}
      {openPlace && isSecretKind(openPlace.kind) && (
        <TimedSecretPanel place={openPlace} player={position} now={now} onClose={() => setOpenPlace(null)} />
      )}
      {openPlace && !isFightPlace(openPlace.kind) && !isSecretKind(openPlace.kind) && (
        <TimedPlacePanel place={openPlace} player={position} now={now} onClose={() => setOpenPlace(null)} />
      )}
      {openTavern && <TimedTavernPanel tavern={openTavern} player={position} onClose={() => setOpenTavern(null)} />}
      {selectedPatrol && isPatrolKind(selectedPatrol.kind) && (
        <TimedPatrolPanel spawn={selectedPatrol} player={position} now={now} onClose={closePatrol} />
      )}
      {selectedPatrol && isTravellerKind(selectedPatrol.kind) && (
        <TimedTravellerPanel spawn={selectedPatrol} player={position} now={now} onClose={closePatrol} />
      )}
      {fallbackButton}
      {showPill && <AutoGatherPill style={[styles.autoGather, { bottom: insets.bottom + ISLAND_HEIGHT + 12 }]} />}
      {message && (
        <Text style={[styles.banner, { bottom: insets.bottom + ISLAND_HEIGHT + (showPill || fallback ? 52 : 12) }]}>{message}</Text>
      )}
      <WalkCard />
      <IslandMenu />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  player: { fontSize: 28 },
  treasure: { fontSize: 30 },
  // Sits above the target's own marker.
  questTarget: { fontSize: 18, transform: [{ translateY: -34 }] },
  questMark: { fontSize: 26 },
  lure: { right: 56, alignSelf: 'auto' },
  // Below the map attribution; leaves the right side to the walk effect chips.
  freshLegs: { left: 16, maxWidth: '60%', alignSelf: 'auto', fontSize: 15 },
  freshLegsButton: { left: 16 },
  banner: {
    position: 'absolute',
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: colors.ink,
    color: colors.parchment,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 18,
  },
  tutorialHint: { position: 'absolute', left: 16, right: 16 },
  tutorialNode: { alignItems: 'center' },
  fallback: { position: 'absolute', alignSelf: 'center' },
  pointer: { fontSize: 24 },
  autoGather: { position: 'absolute', left: 16 },
  debugButton: { alignSelf: 'center' },
  settingsButton: { right: 16 },
  roundButton: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.woodDark,
    backgroundColor: colors.parchment,
  },
  buttonEmoji: { fontSize: 15 },
  recentreButton: { right: 16, width: 48, height: 48, borderRadius: 24 },
  recentreEmoji: { fontSize: 24 },
});

export default timed('screen: map', MapScreen);
