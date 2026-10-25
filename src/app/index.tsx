import { Camera, type CameraRef, Map, Marker } from '@maplibre/maplibre-react-native';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IslandMenu, ISLAND_HEIGHT } from '@/components/IslandMenu';
import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { SpawnMarker } from '@/components/SpawnMarker';
import { Text } from '@/components/Text';
import { TutorialHint } from '@/components/TutorialHint';
import { gatheringConfig } from '@/content/gatheringConfig';
import { materialById, resourceById } from '@/content/lookup';
import { mapStyle } from '@/content/mapStyle';
import { spawnConfig } from '@/content/spawnConfig';
import { canGather, isFleeing, type CollectFailure } from '@/game/gathering/gathering';
import { generateSpawnsAround } from '@/game/generation/spawns';
import type { LatLng, Spawn, SpawnConfig } from '@/game/generation/types';
import { visibleSpawns } from '@/game/generation/visibility';
import { tutorialSpawns } from '@/game/tutorial/tutorial';
import { usePlacedSpawns } from '@/hooks/usePlacedSpawns';
import { usePlayerLocation } from '@/hooks/usePlayerLocation';
import { useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

const toLngLat = (position: LatLng): [number, number] => [position.longitude, position.latitude];
const failureMessages: Record<CollectFailure, (distance: number) => string> = {
  tooFar: (distance) => `Too far: ${Math.round(distance)} m away (need ${gatheringConfig.collectRadiusMeters} m)`,
  fled: () => 'It ran off. Slow down to approach animals.',
  collected: () => 'Already gathered.',
  expired: () => 'It is gone.',
  needsTool: () => 'You need a better pickaxe for this.',
};

export default function MapScreen() {
  const player = usePlayerLocation();
  const insets = useSafeAreaInsets();
  const setDebug = useDebugStore((state) => state.set);
  const timeOfDay = useDebugStore((state) => state.timeOfDay);
  const windowMinutes = useDebugStore((state) => state.windowMinutes);
  const save = useGameStore((state) => state.save);
  const collect = useGameStore((state) => state.collect);
  const placeTutorialWood = useGameStore((state) => state.placeTutorialWood);
  const cameraRef = useRef<CameraRef>(null);
  const [now, setNow] = useState(Date.now());
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
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
    return generateSpawnsAround(position, minute * 60_000, { config, timeOfDay: timeOfDay ?? undefined });
  }, [position?.latitude, position?.longitude, minute, timeOfDay, windowMinutes]);
  // On paths and in public areas; the tutorial's first tree stays where it was put.
  const placedSpawns = usePlacedSpawns(spawns, position);
  const visible = position
    ? visibleSpawns([...placedSpawns, ...tutorialSpawns(save)], position, now).filter(
        ({ spawn }) => !(spawn.id in save.collected) && canGather(save, spawn),
      )
    : [];

  useEffect(() => {
    if (position) placeTutorialWood(position);
  }, [position, placeTutorialWood]);

  useEffect(() => {
    if (position) cameraRef.current?.easeTo({ center: toLngLat(position), duration: 500 });
  }, [position?.latitude, position?.longitude]);

  // The menu stays reachable while there is no map to show.
  if (player.status === 'pending' || player.status === 'denied' || !position) {
    return (
      <View style={styles.container}>
        {player.status === 'pending' ? (
          <PlaceholderScreen title="Finding you…" description="Waiting for an accurate GPS position." />
        ) : (
          <PlaceholderScreen
            title="Location needed"
            description="Allow location access in your phone settings to see nearby resources."
          />
        )}
        <IslandMenu />
      </View>
    );
  }

  const gather = (spawn: Spawn) => {
    const result = collect(spawn, { position, speed }, Date.now());
    setMessage(
      result.ok
        ? `+ ${result.gained.map((g) => `${g.amount} ${materialById[g.materialId]?.name ?? g.materialId}`).join(', ')}`
        : failureMessages[result.reason](result.distance),
    );
  };

  return (
    <View style={styles.container}>
      <Map
        style={styles.map}
        mapStyle={mapStyle}
        dragPan={false}
        touchRotate={false}
        touchPitch={false}
        logo={false}
        attributionPosition={{ top: insets.top + 8, left: 8 }}
        onPress={(event) => {
          if (__DEV__ && player.mocked) {
            const [longitude, latitude] = event.nativeEvent.lngLat;
            setDebug({ mockLocation: { latitude, longitude } });
          }
        }}
      >
        <Camera ref={cameraRef} initialViewState={{ center: toLngLat(position), zoom: 17 }} />
        {visible.map(({ spawn, position: spawnPosition, distance }) => (
          <Marker key={spawn.id} id={spawn.id} lngLat={toLngLat(spawnPosition)} onPress={() => gather(spawn)}>
            <SpawnMarker
              kind={spawn.kind}
              emoji={resourceById[spawn.resourceId]?.emoji ?? '❓'}
              icon={resourceById[spawn.resourceId]?.icon}
              inRange={distance <= gatheringConfig.collectRadiusMeters}
              fleeing={spawn.kind === 'animal' && isFleeing(speed)}
            />
          </Marker>
        ))}
        <Marker id="player" lngLat={toLngLat(position)}>
          <Text style={styles.player}>🧙</Text>
        </Marker>
      </Map>
      {player.mocked && (
        <Text style={[styles.banner, { top: insets.top + 48 }]}>Mock location · tap the map to teleport</Text>
      )}
      {__DEV__ && (
        <Pressable
          accessibilityLabel="Debug"
          onPress={() => router.push('/debug')}
          style={[styles.debugButton, { top: insets.top + 8 }]}
        >
          <Text style={styles.debugEmoji}>🐞</Text>
        </Pressable>
      )}
      <TutorialHint screen="map" style={[styles.tutorialHint, { top: insets.top + (player.mocked ? 84 : 48) }]} />
      {message && <Text style={[styles.banner, { bottom: insets.bottom + ISLAND_HEIGHT + 12 }]}>{message}</Text>}
      <IslandMenu />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  player: { fontSize: 28 },
  banner: {
    position: 'absolute',
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: colors.ink,
    color: colors.parchment,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 14,
  },
  tutorialHint: { position: 'absolute', left: 16, right: 16 },
  debugButton: {
    position: 'absolute',
    alignSelf: 'center',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.woodDark,
    backgroundColor: colors.parchment,
  },
  debugEmoji: { fontSize: 15 },
});
