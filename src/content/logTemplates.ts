import type { ExpeditionOutcome, HeroClassId, NpcHelp } from '@/game/types';

/** Before the boss line, keyed by boss id: the weakness item at work. */
const weaknessLines: Record<string, string> = {
  banditCaptain: 'The bandit captain’s men read the poster and slip away. ',
  ogreChieftain: 'The ogre chieftain downed the strong ale and fights drunk. ',
  lichOfTheDeep: 'Font water burned the lich of the deep. ',
  giantKing: 'The giant king slept through the first blows. ',
  elderDragon: 'The elder dragon stayed coiled around the decoy hoard. ',
};

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
    scholar: ['{hero} found the flaw in {mobs} and struck it with {weapon}.', '{hero} read {mobs} like a page and undid them with {weapon}.'],
    exorcist: ['{hero} banished {mobs} with {weapon}.', '{hero} broke {mobs} with {weapon} and a ringing verse.'],
    duelist: ['{hero} ran {mobs} through with {weapon}.', '{hero} outpaced {mobs} and cut them down with {weapon}.'],
    smuggler: ['{hero} ambushed {mobs} with {weapon}.', '{hero} dealt with {mobs} quietly, with {weapon}.'],
    diplomat: ['{hero} talked {mobs} into ruin, then used {weapon}.', '{hero} turned {mobs} on each other while the party pressed with {weapon}.'],
    necromancer: ['{hero} raised {mobs} against their kin with {weapon}.', '{hero} drained {mobs} with {weapon}.'],
    beastmaster: ['{hero} set the wild on {mobs} and finished them with {weapon}.', '{hero} and their beasts pulled down {mobs} with {weapon}.'],
    engineer: ['{hero} dismantled {mobs} with {weapon}.', '{hero} turned the ground itself against {mobs} with {weapon}.'],
    alchemist: ['{hero} brewed {mobs} into trouble with {weapon}.', '{hero} felled {mobs} with {weapon} and a well-timed flask.'],
    porter: ['{hero} carried the day, and laid {mobs} low with {weapon}.', '{hero} bore down on {mobs} with {weapon}.'],
    scout: ['{hero} led the party around {mobs}, then struck with {weapon}.', '{hero} marked {mobs} for the party and finished them with {weapon}.'],
    curseBreaker: ['{hero} unbound {mobs} with {weapon}.', '{hero} shattered {mobs} hex by hex with {weapon}.'],
    cook: ['{hero} served {mobs} their last meal with {weapon}.', '{hero} carved {mobs} with {weapon} like a joint of meat.'],
    monk: ['{hero} needed no weapon but used {weapon} anyway against {mobs}.', '{hero} stilled {mobs} with disciplined blows from {weapon}.'],
    gambler: ['{hero} took a chance on {mobs} and won, with {weapon}.', '{hero} rolled the dice and dropped {mobs} with {weapon}.'],
  } satisfies Record<HeroClassId, string[]>,
  fightLost: ['{mobs} overwhelmed the party.', 'The party fell back before {mobs}.'],
  bossWon: ['{hero} landed the final blow on the {boss} with {weapon}.', 'The {boss} fell to {hero} and {weapon}.'],
  bossLost: ['The {boss} drove the party back.', 'The {boss} was too strong.'],
  /** Appended to a fight line for whoever took the most damage. */
  tookDamage: ' {hero} took {damage} damage.',
  /** Before the boss line. */
  stew: 'The party shared a Hunter’s stew before the fight. ',
  /** Before the boss line, keyed by boss id: the weakness item at work. */
  weakness: weaknessLines,
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
  /** Appended to the run's first fight when a firebomb opened it. */
  firebomb: ' {hero} threw a firebomb.',
  /** Appended to a fight line when a revival draught brought its carrier back. */
  revive: ' {hero} drank a revival draught and got back up.',
  /** Appended to a fight line when a smoke bomb ended the run. */
  smokeBomb: ' {hero} threw a smoke bomb and the party escaped.',
  /** Appended to a fight line: a Necromancer or Beastmaster binds the fallen {tag}, who fight for the party in the next fight. */
  raise: ' {hero} bound the fallen {tag} to the party’s cause.',
  allies: ' The raised {tag} fought alongside the party.',
  duel: ' {hero} found the gap in a lone foe’s guard.',
  fightHeal: ' {hero} shared a bite to eat.',
  secondPotion: ' {hero} drank a second potion.',
  relic: ' {hero}’s {relic} answered.',
  /** The opening lines for the party's stat, speed and oil elixirs. */
  elixirDrank: ' {hero} drank their {item} before setting out.',
  elixirOil: ' {hero} coated their weapon with {item}.',
  /** The summary after a smoke bomb escape. */
  escaped: ['The team slipped away under cover of smoke, with {gold} gold.'],
  /** Names for {tag} in `tagBonus`. */
  tagNames: { undead: 'undead', beast: 'beasts', trap: 'traps', obstacle: 'obstacles', locals: 'locals' } as Record<string, string>,
  firstWin: ['The first win of the day brought a little extra.'],
  firstTierClear: ['A new tier conquered! The spoils were richer for it.'],
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
  sigil: ['They brought back a tier {tier} Sanctum Sigil.'],
  sigilShards: ['With no room for another Sigil, it crumbled into {amount} {shards}.'],
  /** What a consumable that never triggered was broken back down into. */
  salvage: 'The {item} came back unused and was salvaged.',
  /** Used for {weapon} when a hero has none. */
  noWeapon: 'bare hands',
};
