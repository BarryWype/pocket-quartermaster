import type { ExpeditionOutcome, HeroClassId, MainReward, NpcHelp } from '@/game/types';

// Placeholders: {hero} {weapon} {mobs} {boss} {trap} {event} {damage} {gold}
// {cleared} {total} {gear} {item} {obstacle} {npc} {tag} {threat} {answerer}
// {opportunity}. One line per encounter, then a summary. Abilities add a
// sentence to their encounter's line; threats add a line each at the start.
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
  bossWon: ['{hero} landed the final blow on the {boss} with {weapon}.', 'The {boss} fell to {hero} and {weapon}.'],
  bossLost: ['The {boss} drove the party back.', 'The {boss} was too strong.'],
  /** Appended to a fight line for whoever took the most damage. */
  tookDamage: ' {hero} took {damage} damage.',
  /** Before the boss line. */
  stew: 'The party shared a Hunter’s stew before the fight. ',
  /** The first lines when the party sets out short of food. */
  hunger: {
    underfed: 'Short on food, the party set out hungry.',
    starving: 'With nothing to eat, the party set out starving.',
  },
  /** One line per drawn threat: who or what answered it, and how it went. */
  threatMet: ['{answerer} kept the {threat} at bay.'],
  threatHalf: ['Facing the {threat}, {answerer} only did half the work; the party paid for it.'],
  threatMissed: ['Nobody could answer the {threat}.'],
  potion: ' {hero} drank a healing potion.',
  knockedOut: ' {hero} was knocked out.',
  knockedOutMany: ' {heroes} were knocked out.',
  trapHit: ['A {trap} caught {hero} ({damage} damage).', '{hero} stumbled into a {trap} ({damage} damage).'],
  trapAll: ['A {trap} hit the whole party.'],
  trapMissed: ['The party slipped past a {trap}.'],
  trapTip: ['Thanks to a local’s tip, the party stepped around a {trap}.'],
  /** Appended to a trap line. */
  trapReduced: ' {hero} shouted a warning, softening the blow.',
  /** Appended to a fight line; {tag} is e.g. "beasts". */
  tagBonus: ' {hero} knew just where to strike the {tag}.',
  localsHelp: {
    heal: '{hero} won over the {npc}, who patched everyone up.',
    gold: '{hero} won over the {npc}, who paid {gold} gold for the company.',
    tip: '{hero} won over the {npc}, who pointed out a trap ahead.',
  } satisfies Record<NpcHelp['kind'], string>,
  localsHostile: ['The {npc} turned on the party.'],
  localsStolen: '{hero} lifted {gold} gold from the {npc}.',
  localsNoticed: ' They noticed, and attacked!',
  localsNeutral: ['The party passed a {npc}, who paid them no mind.', 'A {npc} watched the party go by.'],
  /** Appended to a fight line. {ally} is who was shielded. */
  rage: ' {hero} flew into a rage.',
  buff: ' {hero}’s playing spurred the party on.',
  protect: ' {hero} shielded {ally}.',
  crit: ' {hero} struck a lucky blow.',
  advantage: ' {hero}’s magic found the weak element.',
  /** Appended to an exposed fight's line. */
  exposed: ' The enemies struck first.',
  /** Appended to a fight's line when poison wounded the party. */
  poison: ' Poison wore at everyone.',
  /** Appended to a fight's line when an enemy caster struck first. */
  casters: ' An enemy caster struck {hero} before the fight.',
  /** Appended to the encounter after which the party was healed. */
  partyHeal: ' {hero} tended the party’s wounds.',
  /** Names for {tag} in `tagBonus`. */
  tagNames: { undead: 'undead', beast: 'beasts', trap: 'traps', obstacle: 'obstacles', locals: 'locals' } as Record<string, string>,
  firstClear: ['First time through! A bonus of {gold} gold and {xp} XP.'],
  charter: ['The guild sent a charter to mark the victory.'],
  mishap: ['A {event} forced the party to turn back.', 'Bad luck: a {event} cut the expedition short.'],
  /** The midpoint opportunity, right after the encounter it followed. */
  opportunityTaken: ['Halfway, the party made the most of the {opportunity}.'],
  opportunityMissed: ['Halfway, the party passed the {opportunity} by.'],
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
    shards: ['With no room for another Sigil, it crumbled into {amount} {shards}.'],
    mapGold: ['With no room for another map, they sold it for {gold} gold.'],
  } satisfies Record<MainReward['kind'], string[]>,
  /** What a consumable that never triggered was broken back down into. */
  salvage: 'The {item} came back unused and was salvaged.',
  /** Used for {weapon} when a hero has none. */
  noWeapon: 'bare hands',
};
