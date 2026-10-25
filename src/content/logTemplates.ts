import type { ExpeditionOutcome, HeroClassId, MainRewardKind } from '@/game/types';

// Placeholders: {hero} {weapon} {mobs} {boss} {trap} {event} {damage} {gold}
// {cleared} {total} {gear} {item}. One line per encounter, then a summary.
export const logTemplates = {
  /** {hero} is whoever dealt the most damage. */
  fightWon: {
    warrior: ['{hero} cut through {mobs} with {weapon}.', '{hero} held the line against {mobs} with {weapon}.'],
    archer: ['{hero} picked off {mobs} with {weapon}.', 'From the shadows, {hero} brought down {mobs} with {weapon}.'],
    fireMage: ['{hero} burned {mobs} to cinders with {weapon}.', '{hero} scattered {mobs} with {weapon}.'],
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
  trapAvoided: ['{hero} spotted a {trap} in time.'],
  trapMissed: ['The party slipped past a {trap}.'],
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
  found: ['They also found a {item}. Nobody knows what it opens.'],
  mainReward: {
    goldPouch: ['A heavy pouch held {gold} extra gold.'],
    sigil: ['They brought back a tier {tier} Sanctum Sigil.'],
    treasureMap: ['They found an old treasure map.'],
    lure: ['They found a lure.'],
  } satisfies Record<MainRewardKind, string[]>,
  cracked: "{hero}'s {gear} is badly worn.",
  broken: "{hero}'s {gear} broke and was lost.",
  /** Used for {weapon} when a hero has none. */
  noWeapon: 'bare hands',
};
