import { chests } from '../chests';
import { dungeons } from '../dungeons';
import { elementInfo } from '../elements';
import { bosses, mobs } from '../enemies';
import { events } from '../events';
import { masteryTypeNames, qualities, TIER_NAMES } from '../forging';
import { guildBuildings, guildTracks } from '../guild';
import { heroClasses } from '../heroes';
import { items } from '../items';
import { materials } from '../materials';
import { dungeonModifiers } from '../modifiers';
import { npcs } from '../npcs';
import { resources } from '../resources';
import { tagInfo } from '../rotation';
import { sanctums } from '../sanctums';
import { traits } from '../traits';

/** Every content name and description shown to players, in English: each needs an entry in `frNames`. */
export function contentTexts(): string[] {
  const texts = [
    ...materials.map((m) => m.name),
    ...items.flatMap((i) => [i.name, ...(i.description ? [i.description] : [])]),
    ...resources.map((r) => r.name),
    ...chests.map((c) => c.name),
    ...dungeons.flatMap((d) => [
      d.name,
      d.boss.name,
      ...d.encounters.flatMap((e) => (e.type === 'trap' || e.type === 'obstacle' ? [e.name] : [])),
    ]),
    ...mobs.map((m) => m.name),
    ...bosses.map((b) => b.name),
    ...events.map((e) => e.name),
    ...npcs.flatMap((n) => [n.name, n.description, n.hostile.name]),
    ...sanctums.flatMap((s) => [s.name, s.description, s.guardian.name, s.guardian.description, ...s.minions]),
    ...Object.values(heroClasses).map((c) => c.name),
    ...traits.flatMap((t) => [t.name, t.description]),
    ...Object.values(guildBuildings).map((b) => b.name),
    ...guildTracks.map((t) => t.name),
    ...dungeonModifiers.flatMap((m) => [m.name, m.description]),
    ...Object.values(qualities).map((q) => q.name),
    ...Object.values(masteryTypeNames).flatMap((m) => [m.name, m.plural]),
    ...TIER_NAMES,
    ...Object.values(elementInfo).map((e) => e.name),
    ...Object.values(tagInfo).map((t) => t.name),
  ];
  return [...new Set(texts)];
}
