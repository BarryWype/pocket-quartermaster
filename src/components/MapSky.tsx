import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';

import { ambienceConfig, inSpan, tintAt } from '@/game/generation/ambience';
import { useAnimationsEnabled } from '@/hooks/useAnimationFrame';

// Drawn by scripts/generate-map-textures.py. Sizes are the 1x images, in dp.
const CLOUDS = [
  { source: require('../../assets/sprites/cloud-0.png'), width: 96, height: 48 },
  { source: require('../../assets/sprites/cloud-1.png'), width: 144, height: 40 },
];
const BIRD = { frames: [require('../../assets/sprites/bird-0.png'), require('../../assets/sprites/bird-1.png')], width: 21, height: 12 };
const BUTTERFLY = { frames: [require('../../assets/sprites/butterfly-0.png'), require('../../assets/sprites/butterfly-1.png')], width: 10, height: 8 };
const FIREFLY = { source: require('../../assets/sprites/firefly.png'), size: 6 };
const RAIN = { source: require('../../assets/sprites/rain.png'), tile: 64 };

export const skyConfig = {
  /** How far each layer moves when the map pans, relative to the ground (1). Higher is nearer the eye. */
  depth: { bird: 1.3, ground: 1 },
  /**
   * Cloud layers, lowest first. Nearer the eye a layer pans faster (`depth`),
   * looks bigger and drifts across sooner; each `seconds` is one cloud.
   */
  cloudLayers: [
    { depth: 1.2, scale: 0.7, opacity: 0.35, seconds: [120, 170] },
    { depth: 1.5, scale: 1, opacity: 0.5, seconds: [80, 120] },
    { depth: 1.9, scale: 1.5, opacity: 0.4, seconds: [55, 90] },
  ],
  /** Each cloud's size within its layer, and its shape (index into CLOUDS), cycled through. */
  cloudSizes: [1, 0.7, 1.35, 0.85, 1.15],
  cloudShapes: [0, 1, 0, 0, 1],
  /** Morning mist: a layer just above the ground, big and pale, with no shadow. */
  mist: { depth: 1.08, scale: 2.5, opacity: 0.22, seconds: [160, 220, 260] },
  /** A cloud's shadow lands this far away (dp) per unit of depth above the ground, so higher clouds cast it further. */
  shadowOffset: { x: 100, y: 140 },
  shadowOpacity: 0.12,
  /** Seconds between flocks, and how long one takes to cross. */
  flockEvery: [20, 60],
  flockSeconds: 7,
  flockSize: [1, 5],
  flapMs: 160,
  fireflies: 10,
  butterflies: 4,
  /** How far a firefly or butterfly wanders from its spot (dp). */
  wander: 30,
  rainFallMs: 450,
};

/** World size in pixels at zoom 0, as MapLibre counts zoom. */
const WORLD_SIZE = 512;

type Pan = { x: Animated.Value; y: Animated.Value };
type Animatable = Parameters<typeof Animated.add>[0];
type Area = { width: number; height: number };

/**
 * How far the map has panned on screen since it opened, fed from the map's
 * region events, so the sky can move with it. Zooming doesn't move it.
 */
export function useSkyPan() {
  const [pan] = useState(() => {
    const x = new Animated.Value(0);
    const y = new Animated.Value(0);
    const total = { x: 0, y: 0 };
    let last: number[] | null = null;
    const update = (center: number[], zoom: number) => {
      if (last) {
        const before = worldPoint(last, zoom);
        const now = worldPoint(center, zoom);
        total.x -= now.x - before.x;
        total.y -= now.y - before.y;
        x.setValue(total.x);
        y.setValue(total.y);
      }
      last = center;
    };
    return { x, y, update };
  });
  return pan;
}

function worldPoint([lng, lat]: number[], zoom: number) {
  const size = WORLD_SIZE * 2 ** zoom;
  const sin = Math.sin((lat * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * size, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size };
}

/**
 * Life over the map: clouds and their shadows, morning mist, flocks of birds,
 * butterflies by day and fireflies at night, a colour wash for the time of day
 * and the odd shower. Layers move with the map at their own depth and wrap
 * around the screen. Movement runs on the native driver, so no JS runs per frame.
 */
export function MapSky({ pan, hour, raining }: { pan: Pan; hour: number; raining: boolean }) {
  const enabled = useAnimationsEnabled();
  const { width, height } = useWindowDimensions();
  const tint = tintAt(hour);
  const area = { width, height };
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {enabled &&
        inSpan(hour, ambienceConfig.butterflies) &&
        Array.from({ length: skyConfig.butterflies }, (_, i) => (
          <Wanderer key={i} pan={pan} area={area} size={BUTTERFLY}>
            <Flapping frames={BUTTERFLY.frames} />
          </Wanderer>
        ))}
      {tint.opacity > 0 && <View style={[StyleSheet.absoluteFill, { backgroundColor: tint.color, opacity: tint.opacity }]} />}
      {enabled && (
        <>
          {inSpan(hour, ambienceConfig.fireflies) &&
            Array.from({ length: skyConfig.fireflies }, (_, i) => (
              <Wanderer key={i} pan={pan} area={area} size={{ width: FIREFLY.size, height: FIREFLY.size }} glow>
                <Animated.Image source={FIREFLY.source} style={StyleSheet.absoluteFill} />
              </Wanderer>
            ))}
          {inSpan(hour, ambienceConfig.mist) &&
            skyConfig.mist.seconds.map((seconds, i) => (
              <Cloud key={seconds} pan={pan} area={area} seconds={seconds} layer={skyConfig.mist} index={i} shadow={false} />
            ))}
          {skyConfig.cloudLayers.map((layer, i) => (
            <Fragment key={layer.depth}>
              {layer.seconds.map((seconds, j) => (
                <Cloud key={seconds} pan={pan} area={area} seconds={seconds} layer={layer} index={i * layer.seconds.length + j} />
              ))}
              {/* The birds fly above the lowest clouds and under the rest. */}
              {i === 0 && <Flock pan={pan} area={area} />}
            </Fragment>
          ))}
          {raining && <Rain area={area} />}
        </>
      )}
    </View>
  );
}

/** `value` wrapped into [-margin, size), so a sprite leaving one edge comes back at the other. */
const wrap = (value: ReturnType<typeof Animated.add>, size: number, margin: number) =>
  Animated.subtract(Animated.modulo(value, size + margin), margin);

/** A screen position for a sprite at `start`, pushed by `drift` and by the map's pan at `depth`. */
function placed(start: { x: Animatable; y: Animatable }, drift: Animated.Value, pan: Pan, depth: number, area: Area, width: number, height: number) {
  const x = Animated.add(Animated.add(start.x, drift), Animated.multiply(pan.x, depth));
  const y = Animated.add(start.y, Animated.multiply(pan.y, depth));
  return { transform: [{ translateX: wrap(x, area.width, width) }, { translateY: wrap(y, area.height, height) }] };
}

/** A random start inside the area, set once. */
function useStart(area: Area) {
  const [start] = useState(() => ({ x: new Animated.Value(0), y: new Animated.Value(0) }));
  useEffect(() => {
    start.x.setValue(Math.random() * area.width);
    start.y.setValue(Math.random() * area.height);
  }, [start, area.width, area.height]);
  return start;
}

type CloudLayer = { depth: number; scale: number; opacity: number };

type CloudProps = { pan: Pan; area: Area; seconds: number; layer: CloudLayer; index: number; shadow?: boolean };

function Cloud({ pan, area, seconds, layer, index, shadow = true }: CloudProps) {
  const start = useStart(area);
  const [drift] = useState(() => new Animated.Value(0));
  const { cloudSizes, cloudShapes } = skyConfig;
  const shape = CLOUDS[cloudShapes[index % cloudShapes.length]];
  const scale = layer.scale * cloudSizes[index % cloudSizes.length];
  const width = shape.width * scale;
  const height = shape.height * scale;

  useEffect(() => {
    // One loop is one width of the wrapped area, so the restart is seamless.
    const loop = Animated.loop(
      Animated.timing(drift, { toValue: area.width + width, duration: seconds * 1000, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [drift, seconds, area.width, width]);

  const size = { width, height };
  const cloud = (
    <Animated.Image source={shape.source} style={[styles.sprite, size, { opacity: layer.opacity }, placed(start, drift, pan, layer.depth, area, width, height)]} />
  );
  if (!shadow) return cloud;
  const altitude = layer.depth - skyConfig.depth.ground;
  const shadowStart = { x: Animated.add(start.x, skyConfig.shadowOffset.x * altitude), y: Animated.add(start.y, skyConfig.shadowOffset.y * altitude) };
  return (
    <>
      <Animated.Image
        source={shape.source}
        style={[styles.sprite, styles.shadow, size, placed(shadowStart, drift, pan, skyConfig.depth.ground, area, width, height)]}
      />
      {cloud}
    </>
  );
}

/** Something on the ground that potters about its spot: a butterfly, or a firefly that glows on and off. */
function Wanderer({ pan, area, size, glow = false, children }: { pan: Pan; area: Area; size: { width: number; height: number }; glow?: boolean; children: ReactNode }) {
  const start = useStart(area);
  const [still] = useState(() => new Animated.Value(0));
  const [offset] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const [light] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const hop = () => {
      const angle = Math.random() * 2 * Math.PI;
      const reach = Math.random() * skyConfig.wander;
      return Animated.timing(offset, {
        toValue: { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach },
        duration: 1200 + Math.random() * 1800,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      });
    };
    const wander = Animated.loop(Animated.sequence([hop(), hop(), hop(), hop()]));
    const pulse = (toValue: number) => Animated.timing(light, { toValue, duration: 900 + Math.random() * 900, useNativeDriver: true });
    const glowing = Animated.loop(Animated.sequence([pulse(0.15), pulse(1)]));
    wander.start();
    if (glow) glowing.start();
    return () => {
      wander.stop();
      glowing.stop();
    };
  }, [offset, light, glow]);

  return (
    <Animated.View style={[styles.sprite, size, placed(start, still, pan, skyConfig.depth.ground, area, size.width, size.height)]}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: light, transform: offset.getTranslateTransform() }]}>{children}</Animated.View>
    </Animated.View>
  );
}

/** Two frames swapped back and forth: wings up, wings down. */
function Flapping({ frames }: { frames: ImageSourcePropType[] }) {
  const [flap] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const step = (toValue: number) =>
      Animated.sequence([Animated.timing(flap, { toValue, duration: 0, useNativeDriver: true }), Animated.delay(skyConfig.flapMs)]);
    const loop = Animated.loop(Animated.sequence([step(1), step(0)]));
    loop.start();
    return () => loop.stop();
  }, [flap]);

  return frames.map((source, frame) => (
    <Animated.Image key={frame} source={source} style={[StyleSheet.absoluteFill, { opacity: frame === 0 ? flap : Animated.subtract(1, flap) }]} />
  ));
}

type Point = { x: number; y: number };
type Flight = { id: number; from: Point; to: Point; angle: number; birds: Point[] };

/** A flock in a V, crossing the screen in a random direction. */
function newFlight(id: number, area: Area): Flight {
  const heading = Math.random() * 2 * Math.PI;
  const direction = { x: Math.cos(heading), y: Math.sin(heading) };
  const reach = Math.hypot(area.width, area.height) / 2 + 60;
  const middle = { x: area.width * (0.25 + Math.random() * 0.5), y: area.height * (0.25 + Math.random() * 0.5) };
  const [min, max] = skyConfig.flockSize;
  const count = min + Math.floor(Math.random() * (max - min + 1));
  const birds = Array.from({ length: count }, (_, i) => {
    const row = Math.ceil(i / 2);
    const side = i % 2 === 0 ? 1 : -1;
    // Behind the leader along the heading, and out to one side.
    return { x: -direction.x * row * 16 - direction.y * side * row * 14, y: -direction.y * row * 16 + direction.x * side * row * 14 };
  });
  return {
    id,
    from: { x: middle.x - direction.x * reach, y: middle.y - direction.y * reach },
    to: { x: middle.x + direction.x * reach, y: middle.y + direction.y * reach },
    // The sprite heads down the image, so turn it from "down" to the heading.
    angle: heading - Math.PI / 2,
    birds,
  };
}

function Flock({ pan, area }: { pan: Pan; area: Area }) {
  const [flight, setFlight] = useState<Flight | null>(null);
  const [progress] = useState(() => new Animated.Value(0));
  const { width, height } = area;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let count = 0;
    const [min, max] = skyConfig.flockEvery;
    const schedule = () => {
      timer = setTimeout(() => {
        setFlight(newFlight(++count, { width, height }));
        progress.setValue(0);
        Animated.timing(progress, { toValue: 1, duration: skyConfig.flockSeconds * 1000, easing: Easing.linear, useNativeDriver: true }).start(() =>
          setFlight(null),
        );
        schedule();
      }, (min + Math.random() * (max - min)) * 1000);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [width, height, progress]);

  if (!flight) return null;
  const { from, to } = flight;
  const along = (a: number, b: number, panned: Animated.Value) =>
    Animated.add(progress.interpolate({ inputRange: [0, 1], outputRange: [a, b] }), Animated.multiply(panned, skyConfig.depth.bird));
  return flight.birds.map((offset, i) => (
    <Animated.View
      key={`${flight.id}:${i}`}
      style={[
        styles.sprite,
        {
          width: BIRD.width,
          height: BIRD.height,
          transform: [
            { translateX: along(from.x + offset.x, to.x + offset.x, pan.x) },
            { translateY: along(from.y + offset.y, to.y + offset.y, pan.y) },
            { rotate: `${flight.angle}rad` },
          ],
        },
      ]}
    >
      <Flapping frames={BIRD.frames} />
    </Animated.View>
  ));
}

/** Streaks tiled over the screen, scrolled down one tile and looped. Stays with the screen, not the map. */
function Rain({ area }: { area: Area }) {
  const [fall] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(Animated.timing(fall, { toValue: 1, duration: skyConfig.rainFallMs, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [fall]);

  return (
    <>
      <View style={[StyleSheet.absoluteFill, styles.rainDim]} />
      <Animated.Image
        source={RAIN.source}
        resizeMode="repeat"
        style={[
          styles.sprite,
          {
            width: area.width,
            height: area.height + RAIN.tile,
            transform: [{ translateY: fall.interpolate({ inputRange: [0, 1], outputRange: [-RAIN.tile, 0] }) }],
          },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  sprite: { position: 'absolute', left: 0, top: 0 },
  shadow: { opacity: skyConfig.shadowOpacity, tintColor: '#1f2a1a' },
  rainDim: { backgroundColor: '#28405a', opacity: 0.12 },
});
