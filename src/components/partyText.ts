import { gearTypeNames } from '@/content/equipment';
import { familyById, type FamilyId } from '@/content/families';
import { threatById } from '@/content/lookup';
import type { SocketGroup } from '@/game/expeditions/party';
import { t, tr } from '@/i18n';

// The party dialog's and pickers' sentences, from the pure model (game/expeditions/party.ts).

/** "Still needed: 1 Watch, 2 Wild", "Every need is covered", or null where nothing is needed (a Sanctum). */
export function stillNeeded(groups: SocketGroup[]): string | null {
  if (groups.length === 0) return null;
  const list = groups
    .filter((g) => g.state === 'short')
    .map((g) => `${g.short} ${tr(familyById[g.family].name)}`)
    .join(', ');
  return list ? t('partyDialog.stillNeeded', { list }) : t('partyDialog.allCovered');
}

/** "A sentry’s sallet, tome or runestone adds it". */
export function hintText(group: SocketGroup): string {
  const names = group.hint.map((type) => tr(gearTypeNames[type].name).toLowerCase());
  const list = names.length > 1 ? t('partyDialog.or', { head: names.slice(0, -1).join(', '), last: names[names.length - 1] }) : names[0];
  return t('partyDialog.hint', { list });
}

/**
 * "+1 Watch · lights the Darkness gem" for each short family a change adds to;
 * otherwise its family count changes, "Bulwark 3 → 2".
 */
export function lightsLine(change: { lights: FamilyId[]; changes: { family: FamilyId; before: number; after: number }[] }, groups: SocketGroup[]): string {
  const lit = change.lights.map((family) => {
    const counts = change.changes.find((c) => c.family === family)!;
    const threats = groups.filter((g) => g.family === family && g.state === 'short').map((g) => tr(threatById[g.threat.id].name));
    return t('partyDialog.lights', { count: counts.after - counts.before, family: tr(familyById[family].name), threat: threats.join(', ') });
  });
  if (lit.length > 0) return lit.join(' · ');
  return change.changes.map((c) => `${tr(familyById[c.family].name)} ${c.before} → ${c.after}`).join(' · ');
}
