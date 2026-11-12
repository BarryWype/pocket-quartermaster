import { affixById } from '@/content/affixes';
import { dungeons } from '@/content/dungeons';
import { elementRules } from '@/content/elements';
import { itemById } from '@/content/lookup';
import { rosterRules } from '@/content/roster';
import { dungeonThreats } from '@/content/threats';

import { stoneAffixId } from '../crafting/infusion';
import type { Element } from '../elements';
import { launchPlan, runProvisions } from '../expeditions/expeditions';
import { estimatePartyOdds } from '../expeditions/odds';
import { EMPTY_BRIEFING, prepareParty } from '../expeditions/simulate';
import type { SaveData } from '../save';
import type { DungeonDef, GearDef } from '../types';
import { withLoadout } from './bot';
import { FIT_NOW, rosterParty } from './difficultyOdds';
import { rosterSave } from './reference';
import { targets } from './targets';
import { withFamilyCount } from './threatCosts';

// Tier 3, the elemental tier: how much protection is worth on its elemental
// dungeons, for the fitted party at the tier's end with no briefing.

const elementOf = (d: DungeonDef) => dungeonThreats[d.id]?.element;
/** The element that beats this one on the wheel. */
const beater = (element: Element) => (Object.entries(elementRules.beats) as [Element, Element][]).find(([, beaten]) => beaten === element)![0];
const isStoneAffix = (id: string) => /^(infused|warding)[A-Z]/.test(id);

/**
 * The party's gear with every stone affix taken off; with `element`, a stone
 * of it on each worn armour (Warding) and one of the element beating it on
 * each worn weapon (Infused), at the middle of their range.
 */
function withStones(save: SaveData, heroIds: string[], element?: Element): SaveData {
  const worn = new Map<string, 'weapon' | 'armor'>();
  for (const hero of save.heroes.filter((h) => heroIds.includes(h.id))) {
    if (hero.equipment.weapon) worn.set(hero.equipment.weapon, 'weapon');
    if (hero.equipment.armor) worn.set(hero.equipment.armor, 'armor');
  }
  return {
    ...save,
    gear: save.gear.map((g) => {
      const affixes = g.affixes.filter((a) => !isStoneAffix(a.id));
      const slot = worn.get(g.uid);
      if (!element || !slot) return { ...g, affixes };
      const id = stoneAffixId((itemById[g.itemId] as GearDef).gearType, slot === 'weapon' ? beater(element) : element);
      const range = affixById[id].range;
      return { ...g, affixes: [...affixes, { id, value: range ? Math.round((range.min + range.max) / 2) : 0 }] };
    }),
  };
}

export type ProtectionRow = {
  dungeonId: string;
  difficulty: DungeonDef['difficulty'];
  element: Element;
  /** No stones, no Warding or Spellweave tags; stones on gear; stones with Warding 2 and Spellweave 2. */
  unprotected: number;
  stones: number;
  families: number;
  /** The unprotected party's target. */
  target: [number, number];
};

/** Tier 3's elemental dungeons, unprotected, with stones on gear, and with stones plus Warding and Spellweave at level 2. */
export function elementalProtection(runs: number): ProtectionRow[] {
  return dungeons
    .filter((d) => d.tier === 3 && !d.isBoss && !d.overnight && elementOf(d))
    .map((dungeon) => {
      const element = elementOf(dungeon)!;
      const party = rosterParty(rosterSave(3, 'end'), dungeon, EMPTY_BRIEFING, rosterRules.partySize, FIT_NOW);
      const odds = (save: SaveData, families: boolean) => {
        const loaded = withLoadout(save, party.heroIds, dungeon, EMPTY_BRIEFING);
        const { hunger } = launchPlan(loaded, dungeon, party.heroIds, {}, EMPTY_BRIEFING);
        const tags = families ? 4 : 0;
        const members = withFamilyCount(withFamilyCount(prepareParty(loaded, party.heroIds, FIT_NOW, true), 'warding', tags), 'spellweave', tags);
        return estimatePartyOdds(members, dungeon, runs, runProvisions(hunger, {}, EMPTY_BRIEFING)).success;
      };
      const unprotected = targets.odds.unprotected;
      return {
        dungeonId: dungeon.id,
        difficulty: dungeon.difficulty,
        element,
        unprotected: odds(withStones(party.save, party.heroIds), false),
        stones: odds(withStones(party.save, party.heroIds, element), false),
        families: odds(withStones(party.save, party.heroIds, element), true),
        target: dungeon.id === 'witchMarsh' ? unprotected.witchMarsh : unprotected[dungeon.difficulty as 'easy' | 'medium' | 'hard'],
      };
    });
}
