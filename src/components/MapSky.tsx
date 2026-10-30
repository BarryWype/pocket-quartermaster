import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';

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
   * Zooming scales each layer around the screen centre by 2^(zoom change × its
   * `zoom` response): nearer layers grow and spread more. The zoom change is
   * measured from `baseZoom` and capped at ± `zoomRange`.
   */
  baseZoom: 17,
  zoomRange: 1.5,
  birdZoom: 0.35,
  /**
   * Cloud layers, lowest first. Nearer the eye a layer pans faster (`depth`),
   * reacts more to zoom, looks bigger and drifts across sooner; each `seconds` is one cloud.
   */
  cloudLayers: [
    { depth: 1.2, zoom: 0.2, scale: 0.7, opacity: 0.35, seconds: [120, 150, 170] },
    { depth: 1.5, zoom: 0.3, scale: 1, opacity: 0.5, seconds: [80, 95, 110, 120] },
    { depth: 1.9, zoom: 0.45, scale: 1.5, opacity: 0.4, seconds: [55, 65, 80, 90] },
  ],
  /** Each cloud's size within its layer, and its shape (index into CLOUDS), cycled through. */
  cloudSizes: [1, 0.7, 1.35, 0.85, 1.15],
  cloudShapes: [0, 1, 0, 0, 1],
  /** Morning mist: a layer just above the ground, big and pale, with no shadow. */
  mist: { depth: 1.08, zoom: 0.12, scale: 2.5, opacity: 0.22, seconds: [160, 220, 260] },
  /** A cloud's shadow lands this far away (dp) per unit of depth above the ground, so higher clouds cast it further. */
  shadowOffset: { x: 100, y: 140 },
  shadowOpacity: 0.12,
  /** Seconds between flocks, and how long one takes to cross. */
  flockEvery: [20, 60],
  flockSeconds: 9,
  flockSize: [1, 5],
  flapMs: 160,
  fireflies: 10,
  butterflies: 4,
  /** How far a firefly or butterfly wanders from its spot (dp). */
  wander: 30,
  rainFallMs: 450,
  /**
   * Everything that moves on its own is driven by one clock ticking this many
   * times a second. A 60 fps animation would keep the whole screen, map
   * included, redrawing all the time; slow drifting doesn't need it.
   */
  fps: 12,
};

/** World size in pixels at zoom 0, as MapLibre counts zoom. */
const WORLD_SIZE = 512;

type Pan = { x: Animated.Value; y: Animated.Value; zoom: Animated.Value };
/** Seconds since the sky started, as an animated value and as a number. */
type Clock = { value: Animated.Value; seconds: () => number };
type Animatable = Parameters<typeof Animated.add>[0];
type Area = { width: number; height: number };

/**
 * How far the map has panned on screen since it opened, and its zoom against
 * the base zoom, fed from the map's region events so the sky can move with it.
 */
export function useSkyPan() {
  const [pan] = useState(() => {
    const x = nativeValue();
    const y = nativeValue();
    const zoomChange = nativeValue();
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
      zoomChange.setValue(zoom - skyConfig.baseZoom);
    };
    return { x, y, zoom: zoomChange, update };
  });
  return pan;
}

/**
 * A value updated from JS with setValue but computed natively: a no-op native
 * animation moves it, and everything built from it, to the native side, so a
 * new value updates every sprite without JS working out each one.
 */
function nativeValue() {
  const value = new Animated.Value(0);
  Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: true }).start();
  return value;
}

function useSkyClock(enabled: boolean): Clock {
  const [clock] = useState(() => {
    const value = nativeValue();
    let started: number | null = null;
    return { value, seconds: () => (started === null ? 0 : (Date.now() - started) / 1000), start: (at: number) => (started ??= at) };
  });

  useEffect(() => {
    if (!enabled) return;
    clock.start(Date.now());
    const timer = setInterval(() => clock.value.setValue(clock.seconds()), 1000 / skyConfig.fps);
    return () => clearInterval(timer);
  }, [enabled, clock]);

  return clock;
}

/** A value that runs from 0 up to `period` and starts again, offset by `phase` seconds. */
const cycle = (clock: Clock, period: number, phase = 0) => Animated.modulo(Animated.add(clock.value, phase), period);

function worldPoint([lng, lat]: number[], zoom: number) {
  const size = WORLD_SIZE * 2 ** zoom;
  const sin = Math.sin((lat * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * size, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size };
}

/**
 * Life over the map: clouds and their shadows, morning mist, flocks of birds,
 * butterflies by day and fireflies at night, a colour wash for the time of day
 * and the odd shower. Layers move with the map at their own depth and wrap
 * around the screen. Everything moves on one slow shared clock (see `fps`), computed natively.
 */
export function MapSky({ pan, hour, raining, decor }: { pan: Pan; hour: number; raining: boolean; decor: boolean }) {
  const enabled = useAnimationsEnabled();
  const clock = useSkyClock(enabled);
  const { width, height } = useWindowDimensions();
  const tint = tintAt(hour);
  const area = { width, height };
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {enabled &&
        decor &&
        inSpan(hour, ambienceConfig.butterflies) &&
        Array.from({ length: skyConfig.butterflies }, (_, i) => (
          <Wanderer key={i} clock={clock} pan={pan} area={area} size={BUTTERFLY}>
            <Flapping clock={clock} frames={BUTTERFLY.frames} />
          </Wanderer>
        ))}
      {tint.opacity > 0 && <View style={[StyleSheet.absoluteFill, { backgroundColor: tint.color, opacity: tint.opacity }]} />}
      {enabled && (
        <>
          {decor &&
            inSpan(hour, ambienceConfig.fireflies) &&
            Array.from({ length: skyConfig.fireflies }, (_, i) => (
              <Wanderer key={i} clock={clock} pan={pan} area={area} size={{ width: FIREFLY.size, height: FIREFLY.size }} glow>
                <Animated.Image source={FIREFLY.source} style={StyleSheet.absoluteFill} />
              </Wanderer>
            ))}
          {inSpan(hour, ambienceConfig.mist) && (
            <ZoomLayer zoom={pan.zoom} response={skyConfig.mist.zoom} area={area}>
              {(layerArea) =>
                skyConfig.mist.seconds.map((seconds, i) => (
                  <Cloud key={seconds} clock={clock} pan={pan} area={layerArea} seconds={seconds} layer={skyConfig.mist} index={i} shadow={false} />
                ))
              }
            </ZoomLayer>
          )}
          {skyConfig.cloudLayers.map((layer, i) => (
            <Fragment key={layer.depth}>
              <ZoomLayer zoom={pan.zoom} response={layer.zoom} area={area}>
                {(layerArea) =>
                  layer.seconds.map((seconds, j) => (
                    <Cloud key={seconds} clock={clock} pan={pan} area={layerArea} seconds={seconds} layer={layer} index={i * layer.seconds.length + j} />
                  ))
                }
              </ZoomLayer>
              {/* The birds fly above the lowest clouds and under the rest. */}
              {i === 0 && (
                <ZoomLayer zoom={pan.zoom} response={skyConfig.birdZoom} area={area} fit>
                  {(layerArea) => <Flock clock={clock} pan={pan} area={layerArea} />}
                </ZoomLayer>
              )}
            </Fragment>
          ))}
          {raining && <Rain clock={clock} area={area} />}
        </>
      )}
    </View>
  );
}

/**
 * A layer scaled with the map's zoom around the screen centre. It's drawn
 * bigger than the screen by as much as it can shrink, so zooming out never
 * shows its edges; `children` get that bigger area to fill. With `fit`, the
 * layer stays screen-sized: for things that cross it and leave, like birds.
 */
function ZoomLayer({ zoom, response, area, fit = false, children }: { zoom: Animated.Value; response: number; area: Area; fit?: boolean; children: (area: Area) => ReactNode }) {
  const steps = [-1, -0.5, 0, 0.5, 1].map((step) => step * skyConfig.zoomRange);
  const scales = steps.map((step) => 2 ** (step * response));
  const grow = fit ? 1 : 1 / Math.min(...scales);
  const inner = { width: area.width * grow, height: area.height * grow };
  const scale = zoom.interpolate({ inputRange: steps, outputRange: scales, extrapolate: 'clamp' });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: (area.width - inner.width) / 2,
        top: (area.height - inner.height) / 2,
        ...inner,
        transform: [{ scale }],
      }}
    >
      {children(inner)}
    </Animated.View>
  );
}

/** `value` wrapped into [-margin, size), so a sprite leaving one edge comes back at the other. */
const wrap = (value: ReturnType<typeof Animated.add>, size: number, margin: number) =>
  Animated.subtract(Animated.modulo(value, size + margin), margin);

/** A screen position for a sprite at `start`, pushed by `drift` and by the map's pan at `depth`. */
function placed(start: { x: Animatable; y: Animatable }, drift: Animatable, pan: Pan, depth: number, area: Area, width: number, height: number) {
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

type CloudProps = { clock: Clock; pan: Pan; area: Area; seconds: number; layer: CloudLayer; index: number; shadow?: boolean };

function Cloud({ clock, pan, area, seconds, layer, index, shadow = true }: CloudProps) {
  const start = useStart(area);
  const { cloudSizes, cloudShapes } = skyConfig;
  const shape = CLOUDS[cloudShapes[index % cloudShapes.length]];
  const scale = layer.scale * cloudSizes[index % cloudSizes.length];
  const width = shape.width * scale;
  const height = shape.height * scale;
  // Across the wrapped area in `seconds`; the wrap keeps it going round.
  const drift = Animated.multiply(clock.value, (area.width + width) / seconds);

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
type WandererProps = { clock: Clock; pan: Pan; area: Area; size: { width: number; height: number }; glow?: boolean; children: ReactNode };

/**
 * Something on the ground that potters about its spot, looping on two
 * different periods across and down: a butterfly, or a firefly that glows on and off.
 */
function Wanderer({ clock, pan, area, size, glow = false, children }: WandererProps) {
  const start = useStart(area);
  const [path] = useState(() => ({ across: 5 + Math.random() * 4, down: 4 + Math.random() * 4, glow: 1.8 + Math.random() * 1.8, phase: Math.random() * 10 }));
  const swing = (period: number) => {
    const reach = skyConfig.wander;
    return cycle(clock, period, path.phase).interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1].map((t) => t * period), outputRange: [0, reach, 0, -reach, 0] });
  };
  const light = glow ? cycle(clock, path.glow, path.phase).interpolate({ inputRange: [0, path.glow / 2, path.glow], outputRange: [1, 0.15, 1] }) : 1;

  return (
    <Animated.View style={[styles.sprite, size, placed(start, 0, pan, skyConfig.depth.ground, area, size.width, size.height)]}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: light, transform: [{ translateX: swing(path.across) }, { translateY: swing(path.down) }] }]}>
        {children}
      </Animated.View>
    </Animated.View>
  );
}

/** Two frames swapped back and forth: wings up, wings down. */
function Flapping({ clock, frames }: { clock: Clock; frames: ImageSourcePropType[] }) {
  const beat = skyConfig.flapMs / 1000;
  const flap = cycle(clock, 2 * beat).interpolate({ inputRange: [0, beat - 0.001, beat, 2 * beat], outputRange: [0, 0, 1, 1] });

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

function Flock({ clock, pan, area }: { clock: Clock; pan: Pan; area: Area }) {
  const [flight, setFlight] = useState<(Flight & { at: number }) | null>(null);
  const { width, height } = area;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let landed: ReturnType<typeof setTimeout>;
    let count = 0;
    const [min, max] = skyConfig.flockEvery;
    const schedule = () => {
      timer = setTimeout(() => {
        setFlight({ ...newFlight(++count, { width, height }), at: clock.seconds() });
        landed = setTimeout(() => setFlight(null), skyConfig.flockSeconds * 1000);
        schedule();
      }, (min + Math.random() * (max - min)) * 1000);
    };
    schedule();
    return () => {
      clearTimeout(timer);
      clearTimeout(landed);
    };
  }, [width, height, clock]);

  if (!flight) return null;
  const { from, to, at } = flight;
  const along = (a: number, b: number, panned: Animated.Value) =>
    Animated.add(
      clock.value.interpolate({ inputRange: [at, at + skyConfig.flockSeconds], outputRange: [a, b], extrapolate: 'clamp' }),
      Animated.multiply(panned, skyConfig.depth.bird),
    );
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
      <Flapping clock={clock} frames={BIRD.frames} />
    </Animated.View>
  ));
}

/** Streaks tiled over the screen, scrolled down one tile and looped. Stays with the screen, not the map. */
function Rain({ clock, area }: { clock: Clock; area: Area }) {
  const fallSeconds = skyConfig.rainFallMs / 1000;
  const fall = cycle(clock, fallSeconds).interpolate({ inputRange: [0, fallSeconds], outputRange: [0, 1] });

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
