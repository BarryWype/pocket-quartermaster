import type { ExpeditionOutcome, HeroClassId, MainRewardKind, NpcHelp, ObstacleKind } from '@/game/types';

// Placeholders: {hero} {weapon} {mobs} {boss} {trap} {event} {damage} {gold}
// {cleared} {total} {gear} {item} {obstacle} {npc} {tag}. One line per
// encounter, then a summary. Abilities add a sentence to their encounter's line.
export const logTemplates = {
  /** {hero} is whoever dealt the most damage. */
  fightWon: {
    warrior: ['{hero} cut through {mobs} with {weapon}.', '{hero} held the line against {mobs} with {weapon}.'],
    ranger: ['{hero} picked off {mobs} with {weapon}.', 'From the shadows, {hero} brought down {mobs} with {weapon}.'],
    fireMage: ['{hero} burned {mobs} to cinders with {weapon}.', '{hero} scattered {mobs} with {weapon}.'],
    frostMage: ['{hero} froze {mobs} solid with {weapon}.', '{hero} buried {mobs} in frost with {weapon}.'],
    thief: ['{hero} slipped behind {mobs} with {weapon}.', '{hero} cut down {mobs} before they saw {weapon}.'],
    barbarian: ['{hero} hacked through {mobs} with {weapon}.', '{hero} roared and flattened {mobs} with {weapon}.'],
    cleric: ['{hero} smote {mobs} with {weapon}.', '{hero} drove off {mobs} with {weapon} and a prayer.'],
    paladin: ['{hero} stood firm and struck down {mobs} with {weapon}.', '{hero} shielded the party and felled {mobs} with {weapon}.'],
    druid: ['{hero} tangled {mobs} in roots with {weapon}.', '{hero} called the wild against {mobs} with {weapon}.'],
    troubadour: ['{hero} played on while the party beat {mobs}, with {weapon}.', '{hero} dazzled {mobs} with {weapon}.'],
    sorcerer: ['{hero} unmade {mobs} with {weapon}.', '{hero} hurled raw power at {mobs} with {weapon}.'],
  } satisfies Record<HeroClassId, string[]>,
  fightLost: ['{mobs} overwhelmed the party.', 'The party fell back before {mobs}.'],
  ambush: 'Ambush! ',
  bossWon: ['{hero} landed the final blow on the {boss} with {weapon}.', 'The {boss} fell to {hero} and {weapon}.'],
  bossLost: ['The {boss} drove the party back.', 'The {boss} was too strong.'],
  /** Appended to a fight line for whoever took the most damage. */
  tookDamage: ' {hero} took {damage} damage.',
  /** Before the boss line. */
  ration: '{hero} ate a ration. ',
  potion: ' {hero} drank a healing potion.',
  knockedOut: ' {hero} was knocked out.',
  knockedOutMany: ' {heroes} were knocked out.',
  trapHit: ['A {trap} caught {hero} ({damage} damage).', '{hero} stumbled into a {trap} ({damage} damage).'],
  trapAll: ['A {trap} hit the whole party.'],
  trapMissed: ['The party slipped past a {trap}.'],
  trapDisarmed: ['{hero} disarmed a {trap}.', '{hero} spotted a {trap} and jammed it.'],
  trapTip: ['Thanks to a local’s tip, the party stepped around a {trap}.'],
  /** Appended to a trap line. */
  trapReduced: ' {hero} shouted a warning, softening the blow.',
  /** Appended to a fight line; {tag} is e.g. "beasts". */
  tagBonus: ' {hero} knew just where to strike the {tag}.',
  calmed: ['{hero} calmed {mobs}, and they slunk away.'],
  obstacleSolved: {
    rubble: '{hero} shouldered the {obstacle} aside.',
    barricade: '{hero} burned through the {obstacle}.',
    locked: '{hero} picked the lock of the {obstacle}.',
  } satisfies Record<ObstacleKind, string>,
  obstacleCost: ['Getting past the {obstacle} wore everyone out.', 'The {obstacle} cost the party a lot of sweat.'],
  /** Appended when an unsolved obstacle forces a detour fight. */
  detour: ' The way round led into {mobs}.',
  localsHelp: {
    heal: '{hero} charmed the {npc}, who patched everyone up.',
    gold: '{hero} charmed the {npc}, who paid {gold} gold for the company.',
    tip: '{hero} charmed the {npc}, who pointed out a trap ahead.',
  } satisfies Record<NpcHelp['kind'], string>,
  localsProvoked: '{hero} provoked the {npc} into a fight.',
  localsStolen: '{hero} lifted {gold} gold from the {npc}.',
  localsNoticed: ' They noticed, and attacked!',
  localsNeutral: ['The party passed a {npc}, who paid them no mind.', 'A {npc} watched the party go by.'],
  /** Appended to a fight line. {ally} is who was shielded. */
  rage: ' {hero} flew into a rage.',
  buff: ' {hero}’s playing spurred the party on.',
  protect: ' {hero} shielded {ally}.',
  crit: ' {hero} struck a lucky blow.',
  advantage: ' {hero}’s magic found the weak element.',
  /** Appended to the encounter after which the party was healed. */
  partyHeal: ' {hero} tended the party’s wounds.',
  ambushAlert: '{hero} heard them coming. ',
  cacheBonus: ' {hero} found the false bottom too.',
  loudLocals: '{hero} was too loud: the {npc} took offence.',
  /** Names for {tag} in `tagBonus`. */
  tagNames: { undead: 'undead', beast: 'beasts', trap: 'traps', obstacle: 'obstacles', locals: 'locals' } as Record<string, string>,
  firstClear: ['First time through! A bonus of {gold} gold and {xp} XP.'],
  charter: ['The guild sent a charter to mark the victory.'],
  spring: ['A {event} restored the party.', 'The party rested by a {event}.'],
  cache: ['A {event} held {gold} gold.'],
  mishap: ['A {event} forced the party to turn back.', 'Bad luck: a {event} cut the expedition short.'],
  outcome: {
    flawless: ['Flawless! Everyone came home standing, with {gold} gold.'],
    success: ['The {boss} fell. The team came home with {gold} gold.'],
    retreat: ['The team retreated after {cleared} of {total} encounters, with {gold} gold.'],
    defeat: ['The team retreated at the first obstacle, empty-handed.'],
  } satisfies Record<ExpeditionOutcome, string[]>,
  recipe: ['Among the spoils: the recipe for {item}!'],
  sanctumWon: ['The {guardian} yields. The Sanctum grants its power.'],
  sanctumLost: ['The {guardian} drives the party out, but a little power lingers on them.'],
  mainReward: {
    goldPouch: ['A heavy pouch held {gold} extra gold.'],
    sigil: ['They brought back a tier {tier} Sanctum Sigil.'],
    treasureMap: ['They found an old treasure map.'],
    lure: ['They found a lure.'],
  } satisfies Record<MainRewardKind, string[]>,
  /** Used for {weapon} when a hero has none. */
  noWeapon: 'bare hands',
};
