/**
 * How the game moves: short and weighty, like wood and brass. Every duration,
 * easing and spring an animation uses comes from here (rules in
 * `doc/design/ui/motion.md`).
 */

/** Full: everything. Reduced: fades only, no movement, scale or spring. Off: nothing moves. */
export type MotionLevel = 'full' | 'reduced' | 'off';

export const MOTION_LEVELS: MotionLevel[] = ['full', 'reduced', 'off'];

export const motion = {
  /** Milliseconds. */
  duration: { press: 90, small: 150, medium: 220, large: 320 },
  /** Cubic bezier control points (x1, y1, x2, y2). */
  easing: {
    /** Things arriving: fast start, soft landing. */
    out: [0.2, 0, 0, 1],
    /** Things moving from one place to another. */
    inOut: [0.4, 0, 0.2, 1],
  },
  spring: {
    /** Comes to rest without a bounce: a sheet sliding up, a dragged sheet settling back. */
    settle: { damping: 26, stiffness: 320, mass: 1 },
    /** One small overshoot: a slot an item lands in, a reward. */
    pop: { damping: 12, stiffness: 420, mass: 0.8 },
  },
  /** A pressed control shrinks to this (Full only). */
  pressScale: 0.96,
  /** A centred dialog grows from this scale as it opens. */
  dialogScale: 0.95,
  /** A popup grows from this scale, out of the slot it points at. */
  popupScale: 0.9,
  /** A sheet dragged down by its header closes past this many pixels, or this fast (px/ms). */
  sheetDrag: { closeDistance: 80, closeVelocity: 0.8 },
  /** A "+N" over a number that grew: it rises this many pixels while it shows, holds for the medium duration, then fades over the large one. */
  gainRise: 14,
  /** A slot an item lands in, a node coming into reach: one pulse up to this scale and back. */
  pulseScale: 1.08,
  /** Pixels a piece rises by as it appears. */
  appearRise: 8,
  /** The loot grid's reveal: the plain tiles in one beat, then each best find after a pause; under two seconds in all. */
  reveal: { beat: 280, pause: 150, best: 380 },
} as const;

export type MotionDuration = keyof typeof motion.duration;
export type MotionEasing = keyof typeof motion.easing;
export type MotionSpring = keyof typeof motion.spring;
