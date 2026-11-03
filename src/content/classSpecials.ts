import type { HeroClassId, SpecialId } from '@/game/types';

// Each class's special pool: three common rolls and one rare (see
// content/specials.ts and doc/design/abilities/class-specials.csv).

export const classSpecials: Record<HeroClassId, { common: [SpecialId, SpecialId, SpecialId]; rare: SpecialId }> = {
  warrior: { common: ['cleave', 'stagger', 'secondWind'], rare: 'taunt' },
  barbarian: { common: ['cleave', 'secondWind', 'stagger'], rare: 'execute' },
  paladin: { common: ['taunt', 'ward', 'mend'], rare: 'smite' },
  duelist: { common: ['aimedStrike', 'flurry', 'execute'], rare: 'riposte' },
  monk: { common: ['flurry', 'ward', 'vanish'], rare: 'stagger' },
  ranger: { common: ['aimedStrike', 'poison', 'entangle'], rare: 'cleave' },
  thief: { common: ['distraction', 'poison', 'vanish'], rare: 'steal' },
  scout: { common: ['aimedStrike', 'entangle', 'distraction'], rare: 'dirtyTrick' },
  smuggler: { common: ['dirtyTrick', 'vanish', 'poison'], rare: 'steal' },
  gambler: { common: ['aimedStrike', 'dirtyTrick', 'flurry'], rare: 'doubleOrNothing' },
  troubadour: { common: ['distraction', 'regrowth', 'patchUp'], rare: 'rally' },
  diplomat: { common: ['distraction', 'ward', 'rally'], rare: 'parley' },
  porter: { common: ['taunt', 'patchUp', 'secondWind'], rare: 'ward' },
  fireMage: { common: ['elementalBlast', 'focus', 'manaShield'], rare: 'meteor' },
  frostMage: { common: ['elementalBlast', 'manaShield', 'entangle'], rare: 'deepFreeze' },
  sorcerer: { common: ['elementalBlast', 'focus', 'dirtyTrick'], rare: 'meteor' },
  scholar: { common: ['focus', 'manaShield', 'distraction'], rare: 'execute' },
  alchemist: { common: ['poison', 'patchUp', 'mend'], rare: 'elementalBlast' },
  cleric: { common: ['mend', 'manaShield', 'smite'], rare: 'resurrection' },
  exorcist: { common: ['smite', 'ward', 'stagger'], rare: 'banish' },
  curseBreaker: { common: ['manaShield', 'distraction', 'mend'], rare: 'ward' },
  druid: { common: ['regrowth', 'entangle', 'mend'], rare: 'summon' },
  beastmaster: { common: ['stagger', 'entangle', 'secondWind'], rare: 'summon' },
  necromancer: { common: ['poison', 'entangle', 'manaShield'], rare: 'summon' },
  cook: { common: ['patchUp', 'secondWind', 'rally'], rare: 'feast' },
  engineer: { common: ['stagger', 'aimedStrike', 'ward'], rare: 'turret' },
};
