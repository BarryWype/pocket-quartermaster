import seedrandom from 'seedrandom';

export type Rng = {
  next: () => number;
  /** Integer in [min, max], both inclusive. */
  int: (min: number, max: number) => number;
  chance: (probability: number) => boolean;
  weighted: <T>(items: readonly T[], weightOf: (item: T) => number) => T;
};

export function createRng(seed: string): Rng {
  const random = seedrandom(seed);

  const rng: Rng = {
    next: () => random(),
    int: (min, max) => min + Math.floor(random() * (max - min + 1)),
    chance: (probability) => random() < probability,
    weighted: (items, weightOf) => {
      const total = items.reduce((sum, item) => sum + weightOf(item), 0);
      if (items.length === 0 || total <= 0) {
        throw new Error('weighted() needs at least one item with a positive weight');
      }
      let roll = random() * total;
      for (const item of items) {
        roll -= weightOf(item);
        if (roll < 0) return item;
      }
      return items[items.length - 1];
    },
  };
  return rng;
}
