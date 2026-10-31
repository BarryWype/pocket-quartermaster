import { Marker } from '@maplibre/maplibre-react-native';
import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { PatrolMarker } from '@/components/PatrolMarker';
import { SanctumMarker } from '@/components/SanctumMarker';
import { SpawnMarker } from '@/components/SpawnMarker';
import { Text } from '@/components/Text';
import { timed } from '@/components/timed';
import { materialById, resourceById } from '@/content/lookup';
import { placeInfo } from '@/content/places';
import { highestUnlockedTier } from '@/game/expeditions/expeditions';
import { isFleeing, pickaxeTier } from '@/game/gathering/gathering';
import { readSpawn } from '@/game/gathering/lockedNodes';
import { distanceMeters } from '@/game/generation/geo';
import type { Bounds } from '@/game/generation/foliage';
import type { LatLng, Spawn } from '@/game/generation/types';
import type { VisibleSpawn } from '@/game/generation/visibility';
import { isLockedMine } from '@/game/places/generate';
import { patrolPositionAt, patrolTier, type PatrolSpawn } from '@/game/patrols/generate';
import { fleesAt } from '@/game/patrols/visibility';
import { isEntered } from '@/game/secrets/places';
import { hasKey } from '@/game/secrets/keys';
import type { PlaceSpawn } from '@/game/places/generate';
import type { SanctumSpawn } from '@/game/sanctums/sanctums';
import { sanctumById } from '@/game/sanctums/sanctums';
import type { TavernSpawn } from '@/game/taverns/taverns';
import { isTavernUnlocked } from '@/game/taverns/taverns';
import { tr } from '@/i18n';
import { useCulled } from '@/hooks/useCulled';
import type { SaveData } from '@/game/save';

/** How long a patrol just come into view pulses on the map. */
const SEEN_HIGHLIGHT_MS = 5000;

const TimedSpawnMarker = memo(timed('marker: spawn', SpawnMarker));
const TimedSanctumMarker = memo(timed('marker: sanctum', SanctumMarker));
const TimedPatrolMarker = memo(timed('marker: patrol', PatrolMarker));

/** The tutorial's nodes, with the position they are drawn at. */
export type TutorialNode = { id: string; materialId: string; position: LatLng };
/** An active quest's map target. */
export type QuestMark = { id: string; target: { position: LatLng; kind: string } };
/** A treasure spot from a read map. */
export type TreasureSpot = { id: string; position: LatLng };

type Props = {
  save: SaveData;
  position: LatLng;
  now: number;
  speed: number | null;
  collectRadius: number;
  /** Where the map last said it looks; markers outside it (plus the culling margin) are not drawn. */
  bounds: Bounds | null;
  /** Never culled: the selected patrol, the open panel's place. */
  always: string[];
  visible: VisibleSpawn[];
  tutorialNodes: TutorialNode[];
  pointedId: string | null;
  sanctumsInSight: SanctumSpawn[];
  tavernsInSight: TavernSpawn[];
  placesInSight: PlaceSpawn[];
  secretsInSight: PlaceSpawn[];
  visiblePatrols: PatrolSpawn[];
  patrolsSeen: Record<string, number>;
  questTargets: QuestMark[];
  placedTreasure: TreasureSpot[];
  onGather: (spawn: Spawn) => void;
  onGatherTutorial: (id: string) => void;
  onDigUp: (mapId: string, at: LatLng) => void;
  onOpenSanctum: (spawn: SanctumSpawn) => void;
  onOpenTavern: (tavern: TavernSpawn) => void;
  onOpenPlace: (place: PlaceSpawn) => void;
  onOpenPatrol: (spawn: PatrolSpawn) => void;
  onQuest: () => void;
};

const toLngLat = (position: LatLng): [number, number] => [position.longitude, position.latitude];

/**
 * Every marker on the map, culled to the visible bounds plus a margin. Memo'd:
 * the map screen re-renders on its own ticks and state, but the markers only
 * re-render when one of these props actually changes — opening or closing a
 * panel, or a store write that touches none of them, costs nothing here.
 */
function MapMarkersBase({
  save,
  position,
  now,
  speed,
  collectRadius,
  bounds,
  always,
  visible,
  tutorialNodes,
  pointedId,
  sanctumsInSight,
  tavernsInSight,
  placesInSight,
  secretsInSight,
  visiblePatrols,
  patrolsSeen,
  questTargets,
  placedTreasure,
  onGather,
  onGatherTutorial,
  onDigUp,
  onOpenSanctum,
  onOpenTavern,
  onOpenPlace,
  onOpenPatrol,
  onQuest,
}: Props) {
  const spawns = useMemo(() => visible.map((entry) => ({ ...entry, id: entry.spawn.id })), [visible]);
  const patrols = useMemo(() => visiblePatrols.map((spawn) => ({ spawn, id: spawn.id, position: patrolPositionAt(spawn, now) })), [visiblePatrols, now]);
  const culledSpawns = useCulled(spawns, bounds, always);
  const culledTutorial = useCulled(tutorialNodes, bounds, always);
  const culledSanctums = useCulled(sanctumsInSight, bounds, always);
  const culledTaverns = useCulled(tavernsInSight, bounds, always);
  const culledPlaces = useCulled(placesInSight, bounds, always);
  const culledSecrets = useCulled(secretsInSight, bounds, always);
  const culledPatrols = useCulled(patrols, bounds, always);
  const culledQuests = useCulled(
    useMemo(() => questTargets.map(({ id, target }) => ({ id, position: target.position, target })), [questTargets]),
    bounds,
    always,
  );
  const culledTreasure = useCulled(placedTreasure, bounds, always);

  const playerPickaxe = pickaxeTier(save);
  const keyHeld = hasKey(save);
  const tavernsOpen = isTavernUnlocked(save);
  const highestTier = highestUnlockedTier(save);

  return (
    <>
      {culledSpawns.map(({ spawn, position: spawnPosition, distance }) => {
        const read = readSpawn(save, spawn);
        const shown = resourceById[read.resourceId];
        return (
          <Marker key={spawn.id} id={spawn.id} lngLat={toLngLat(spawnPosition)} onPress={() => onGather(spawn)}>
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
      {culledTutorial.map((node) => {
        const wood = node.materialId === 'wood';
        const material = materialById[node.materialId];
        return (
          <Marker key={node.id} id={node.id} lngLat={toLngLat(node.position)} onPress={() => onGatherTutorial(node.id)}>
            <View style={styles.tutorialNode}>
              {node.id === pointedId && <Text style={styles.pointer}>👇</Text>}
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
      {culledSanctums.map((sanctum) => (
        <Marker key={sanctum.id} id={sanctum.id} lngLat={toLngLat(sanctum.position)} onPress={() => onOpenSanctum(sanctum)}>
          <TimedSanctumMarker emoji={sanctumById[sanctum.sanctumId].emoji} locked={save.sigils.length === 0} />
        </Marker>
      ))}
      {culledTaverns.map((tavern) => (
        <Marker key={tavern.id} id={tavern.id} lngLat={toLngLat(tavern.position)} onPress={() => onOpenTavern(tavern)}>
          <TimedSanctumMarker emoji="🍺" locked={!tavernsOpen} label={tr(placeInfo.tavern.name)} />
        </Marker>
      ))}
      {culledPlaces.map((place) => (
        <Marker key={place.id} id={place.id} lngLat={toLngLat(place.position)} onPress={() => onOpenPlace(place)}>
          <TimedSanctumMarker
            emoji={placeInfo[place.kind].emoji}
            locked={isLockedMine(place.kind, playerPickaxe)}
            label={tr(placeInfo[place.kind].name)}
          />
        </Marker>
      ))}
      {culledSecrets.map((place) => (
        <Marker key={place.id} id={place.id} lngLat={toLngLat(place.position)} onPress={() => onOpenPlace(place)}>
          <TimedSanctumMarker
            emoji={placeInfo[place.kind].emoji}
            secret
            locked={!keyHeld && !isEntered(save, place)}
            label={tr(placeInfo[place.kind].name)}
          />
        </Marker>
      ))}
      {culledPatrols.map(({ spawn }) => {
        const seenAt = patrolsSeen[spawn.id];
        const fleesIn = seenAt !== undefined ? fleesAt(spawn, seenAt) : null;
        const { tier, elite } = patrolTier(spawn, highestTier);
        return (
          <Marker key={spawn.id} id={spawn.id} lngLat={toLngLat(patrolPositionAt(spawn, now))} onPress={() => onOpenPatrol(spawn)}>
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
      {culledQuests.map(({ id, target }) => (
        <Marker key={`quest:${id}`} id={`quest:${id}`} lngLat={toLngLat(target.position)} onPress={onQuest}>
          <Text style={target.kind === 'mark' ? styles.questMark : styles.questTarget}>{target.kind === 'mark' ? '❓' : '📜'}</Text>
        </Marker>
      ))}
      {culledTreasure.map((spot) => (
        <Marker key={spot.id} id={spot.id} lngLat={toLngLat(spot.position)} onPress={() => onDigUp(spot.id, spot.position)}>
          <Text style={styles.treasure}>💰</Text>
        </Marker>
      ))}
      <Marker id="player" lngLat={toLngLat(position)}>
        <Text style={styles.player}>🧙</Text>
      </Marker>
    </>
  );
}

export const MapMarkers = memo(MapMarkersBase);

const styles = StyleSheet.create({
  player: { fontSize: 28 },
  treasure: { fontSize: 30 },
  // Sits above the target's own marker.
  questTarget: { fontSize: 18, transform: [{ translateY: -34 }] },
  questMark: { fontSize: 26 },
  tutorialNode: { alignItems: 'center' },
  pointer: { fontSize: 24 },
});
