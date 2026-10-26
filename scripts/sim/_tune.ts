import { dungeons } from '@/content/dungeons';
import { mobById } from '@/content/enemies';
import { items } from '@/content/items';
import { estimateOdds } from '@/game/expeditions/odds';
import { createInitialSave, type SaveData } from '@/game/save';
import { equip } from '@/game/team/team';
import type { DungeonDef, MobDef, Quality } from '@/game/types';

const LEVELS = (process.env.LEVELS ?? '2,3,5,7,10').split(',').map(Number);
const ALL = ['bram', 'lyra', 'mira'];
const WEAPONS = ['Sword', 'Bow', 'Wand'];
const TARGET = { short: 0.84, long: 0.73, boss: 0.525 };
const RUNS = 400;

function team(tier: number, quality: Quality): SaveData {
  const material = items.find((i) => i.slot === 'armor' && i.tier === tier)!.id.replace('Armour', '');
  let save: SaveData = {
    ...createInitialSave(),
    tutorial: { step: 'done', woodSpot: null },
    heroes: createInitialSave().heroes.map((h) => ({ ...h, level: LEVELS[tier - 1], trait: '' })),
    consumables: { healingPotion: 3 },
    gear: ALL.flatMap((_, i) => [
      { uid: `w${i}`, itemId: `${material}${WEAPONS[i]}`, quality },
      { uid: `a${i}`, itemId: `${material}Armour`, quality },
    ]),
  };
  ALL.forEach((id, i) => {
    save = equip(equip(equip(save, id, 'weapon', `w${i}`), id, 'armor', `a${i}`), id, 'consumable', 'healingPotion');
  });
  return save;
}

/** The dungeon's own mobs (not shared locals) and its boss, scaled by k. */
function scaled(d: DungeonDef, k: number): { dungeon: DungeonDef; restore: () => void } {
  const ids = [...new Set(d.encounters.flatMap((e) => (e.type === 'fight' ? e.mobs.map((m) => m.mobId) : [])))];
  const saved = ids.map((id) => ({ ...mobById[id] }));
  ids.forEach((id, i) => { mobById[id] = { ...saved[i], hp: saved[i].hp * k, damage: saved[i].damage * k } as MobDef; });
  return {
    dungeon: { ...d, boss: { ...d.boss, hp: d.boss.hp * k, damage: d.boss.damage * k } },
    restore: () => ids.forEach((id, i) => { mobById[id] = saved[i]; }),
  };
}

/** A new player: Bram with the tutorial's Crappy wooden sword, at level 1. */
function swordOnly(): SaveData {
  const save: SaveData = { ...createInitialSave(), gear: [{ uid: 'g', itemId: 'woodSword', quality: 'crappy' }] };
  return equip(save, 'bram', 'weapon', 'g');
}

const odds = (d: DungeonDef, k: number, q: Quality | 'sword' = 'normal') => {
  const { dungeon, restore } = scaled(d, k);
  const o = estimateOdds(q === 'sword' ? swordOnly() : team(d.tier, q), ALL, dungeon, RUNS).success;
  restore();
  return o;
};

const out: Record<string, number> = {};
for (const d of dungeons) {
  const kind = d.isBoss ? 'boss' : d.slot!;
  if (process.env.TIERS && !process.env.TIERS.split(',').includes(String(d.tier))) continue;
  const search = (q: Quality | 'sword', target: number) => {
    let lo = 0.3, hi = 4;
    for (let i = 0; i < 16; i++) {
      const mid = Math.sqrt(lo * hi);
      if (odds(d, mid, q) > target) lo = mid; else hi = mid;
    }
    return Math.sqrt(lo * hi);
  };
  // Bosses: Crappy gear near 31%, as long as Normal stays within 45–60%.
  // Tier 1 short dungeons are where a new player with one sword starts.
  let k = kind === 'boss' ? search('crappy', 0.34) : d.tier === 1 && kind === 'short' ? search('sword', 0.7) : search('normal', TARGET[kind]);
  if (kind === 'boss' && odds(d, k) > 0.6) k = search('normal', 0.6);
  if (kind === 'boss' && odds(d, k) < 0.45) k = search('normal', 0.45);
  out[d.id] = k;
  console.log(d.id.padEnd(16), kind.padEnd(5), 'now', odds(d, 1).toFixed(2), 'k', k.toFixed(3), '→ normal', odds(d, k).toFixed(2), 'crappy', odds(d, k, 'crappy').toFixed(2), 'sword', odds(d, k, 'sword').toFixed(2));
}
import * as fs from 'node:fs';
const file = 'src/content/enemies.ts';
let src = fs.readFileSync(file, 'utf8');
for (const [id, k] of Object.entries(out)) {
  src = src.replace(new RegExp(`(  ${id}: strength\\((\\d), )([0-9.]+)\\)`), (_m, head, _t, f) => `${head}${(Number(f) * k).toFixed(2)})`);
}
if (process.env.WRITE) fs.writeFileSync(file, src);
