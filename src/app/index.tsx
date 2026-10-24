import { Camera, type CameraRef, Map, Marker } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { SpawnMarker } from '@/components/SpawnMarker';
import { gatheringConfig } from '@/content/gatheringConfig';
import { materialById, resourceById } from '@/content/lookup';
import { mapStyle } from '@/content/mapStyle';
import { spawnConfig } from '@/content/spawnConfig';
import { isFleeing, type CollectFailure } from '@/game/gathering/gathering';
import { generateSpawnsAround } from '@/game/generation/spawns';
import type { LatLng, Spawn, SpawnConfig } from '@/game/generation/types';
import { visibleSpawns } from '@/game/generation/visibility';
import { usePlayerLocation } from '@/hooks/usePlayerLocation';
import { useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';

const toLngLat = (position: LatLng): [number, number] => [position.longitude, position.latitude];
const failureMessages: Record<CollectFailure, (distance: number) => string> = {
  tooFar: (distance) => `Too far: ${Math.round(distance)} m away (need ${gatheringConfig.collectRadiusMeters} m)`,
  fled: () => 'It ran off. Slow down to approach animals.',
  collected: () => 'Already gathered.',
  expired: () => 'It is gone.',
};

export default function MapScreen() {
  const player = usePlayerLocation();
  const setDebug = useDebugStore((state) => state.set);
  const timeOfDay = useDebugStore((state) => state.timeOfDay);
  const windowMinutes = useDebugStore((state) => state.windowMinutes);
  const collected = useGameStore((state) => state.save.collected);
  const collect = useGameStore((state) => state.collect);
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
  const visible = position
    ? visibleSpawns(spawns, position, now).filter(({ spawn }) => !(spawn.id in collected))
    : [];

  useEffect(() => {
    if (position) cameraRef.current?.easeTo({ center: toLngLat(position), duration: 500 });
  }, [position?.latitude, position?.longitude]);

  if (player.status === 'pending') {
    return <PlaceholderScreen title="Finding you…" description="Waiting for an accurate GPS position." />;
  }
  if (player.status === 'denied' || !position) {
    return (
      <PlaceholderScreen
        title="Location needed"
        description="Allow location access in your phone settings to see nearby resources."
      />
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
              inRange={distance <= gatheringConfig.collectRadiusMeters}
              fleeing={spawn.kind === 'animal' && isFleeing(speed)}
            />
          </Marker>
        ))}
        <Marker id="player" lngLat={toLngLat(position)}>
          <Text style={styles.player}>🧙</Text>
        </Marker>
      </Map>
      {player.mocked && <Text style={[styles.banner, styles.top]}>Mock location · tap the map to teleport</Text>}
      {message && <Text style={[styles.banner, styles.bottom]}>{message}</Text>}
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
    backgroundColor: '#3b2a1a',
    color: '#f4ead2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
  },
  top: { top: 8 },
  bottom: { bottom: 16 },
});
