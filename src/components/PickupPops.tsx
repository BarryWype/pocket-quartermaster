import { memo, useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { GameIcon } from '@/components/GameIcon';
import { MapMarker } from '@/components/MapMarker';
import type { ResourceKind } from '@/game/generation/types';
import { useAnimationFrame, useAnimationsEnabled } from '@/hooks/useAnimationFrame';
import { usePickupPops, type PickupPop } from '@/store/pickupPopsStore';

/**
 * A pickup pop drawn for a top-down map: a star flash over the pickup point,
 * a ring snapping out in every direction and radial twinkles, with no floor line
 * and no side-view stage. Authored in pixelfx's format; one palette per resource
 * kind (https://github.com/patch-gg/pixelfx, MIT).
 */
const sheets: Record<ResourceKind, ImageSourcePropType> = {
  wood: require('../../assets/pickups/map-pop-wood.png'),
  ore: require('../../assets/pickups/map-pop-ore.png'),
  herb: require('../../assets/pickups/map-pop-herb.png'),
  animal: require('../../assets/pickups/map-pop-animal.png'),
};

/** Each exported sheet: 21 frames of 64x64, five to a row, at 30 fps. */
const COLS = 5;
const FRAMES = 21;
const FRAME_W = 64;
const FRAME_H = 64;
const FPS = 30;
/** The pop's footprint: the frame at 1:1, so each density sheet lands on whole device pixels. */
const VIEW_W = FRAME_W;
const VIEW_H = FRAME_H;

/** One pop: steps through the sheet while it ticks, then dismisses itself. */
const PickupBurst = memo(function PickupBurst({ pop }: { pop: PickupPop }) {
  const tick = useAnimationFrame(FPS);
  const dismiss = usePickupPops((state) => state.dismiss);
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (tick >= FRAMES) dismiss(pop.id);
  }, [tick, dismiss, pop.id]);

  // The gained material's own icon lifts through the burst while it plays.
  useEffect(() => {
    Animated.timing(rise, { toValue: 1, duration: 700, delay: 90, useNativeDriver: true }).start();
  }, [rise]);

  const frame = Math.min(tick, FRAMES - 1);
  return (
    <View style={styles.pop} pointerEvents="none">
      <View style={styles.window}>
        <Image
          source={sheets[pop.kind]}
          style={{
            width: COLS * VIEW_W,
            height: Math.ceil(FRAMES / COLS) * VIEW_H,
            transform: [
              { translateX: -((frame % COLS) * VIEW_W) },
              { translateY: -(Math.floor(frame / COLS) * VIEW_H) },
            ],
          }}
        />
      </View>
      {pop.emoji && (
        <Animated.View
          style={[
            styles.emoji,
            {
              opacity: rise.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
              transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [6, -12] }) }],
            },
          ]}
        >
          <GameIcon emoji={pop.emoji} size={18} />
        </Animated.View>
      )}
    </View>
  );
});

/**
 * The map's collect bursts: one plays where each resource was gathered, in the
 * color of its kind, with the gained material rising through it. The store
 * expires entries on its own, so pops show nothing when animations are off.
 */
export function PickupPops() {
  const pops = usePickupPops((state) => state.pops);
  const animationsEnabled = useAnimationsEnabled();
  if (!animationsEnabled || pops.length === 0) return null;
  return (
    <>
      {pops.map((pop) => (
        <MapMarker key={pop.id} id={`pickup:${pop.id}`} lngLat={[pop.position.longitude, pop.position.latitude]}>
          <PickupBurst pop={pop} />
        </MapMarker>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  pop: { width: VIEW_W, height: VIEW_H, alignItems: 'center', justifyContent: 'center' },
  window: { width: VIEW_W, height: VIEW_H, overflow: 'hidden' },
  emoji: { position: 'absolute', top: (VIEW_H - 18) / 2 },
});
