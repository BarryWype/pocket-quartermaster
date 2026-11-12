import { itemById, monsterPartById } from '@/content/lookup';
import { offMapRevealKinds, placeRevealKinds, revealRules, tipTexts, type ItemTipKind, type RevealKind, type TipId } from '@/content/reveal';
import type { PlaceKind } from '@/content/places';
import { frTipTexts } from '@/content/fr/reveal';
import { familyById, type FamilyId } from '@/content/families';
import { fill, t, tr } from '@/i18n';
import { localized } from '@/i18n/locale';

import { ELEMENTS, stoneId } from '../elements';
import { highestUnlockedTier } from '../dungeons/unlock';
import { isGuildUnlocked } from '../guild/guild';
import { isJobOpen } from '../jobs/jobs';
import { levelMarks } from '../families/strip';
import type { SaveData } from '../save';
import type { ExpeditionReport } from '../types';

type Rules = typeof revealRules;

/** Whether a kind shows yet: debug `revealAll`, the tutorial gate, then the kind's own condition. */
export function isRevealed(save: SaveData, kind: RevealKind, rules: Rules = revealRules): boolean {
  if (save.revealAll) return true;
  if (save.tutorial.step !== 'done') return false;
  const condition = rules[kind];
  switch (condition.kind) {
    case 'tutorialDone':
      return true;
    case 'patrolsWon':
      return save.stats.patrolsWon >= condition.count;
    case 'questsDone':
      return save.stats.questsDone >= condition.count;
    case 'guildOpen':
      return isGuildUnlocked(save);
    case 'tier':
      return highestUnlockedTier(save) >= condition.tier;
    case 'secretTip':
      return save.secretTips.length > 0;
  }
}

/** Whether a place kind shows on the map yet. */
export function isPlaceRevealed(save: SaveData, kind: PlaceKind): boolean {
  return isRevealed(save, placeRevealKinds[kind]);
}

/** The item kinds the player holds something of, in tip order. */
export function heldItemKinds(save: SaveData): ItemTipKind[] {
  const held: ItemTipKind[] = [];
  const hasCharm = (id: string | null | undefined) => {
    const item = id === null || id === undefined ? undefined : itemById[id];
    return item !== undefined && 'charm' in item && item.charm !== undefined;
  };
  if (
    Object.entries(save.consumables).some(([id, count]) => count > 0 && hasCharm(id)) ||
    save.heroes.some((hero) => hasCharm(hero.equipment.consumable))
  ) {
    held.push('charms');
  }
  if (save.relics.length > 0) held.push('relics');
  const isTrinket = (itemId: string) => itemById[itemId]?.slot === 'trinket';
  if (save.gear.some((gear) => isTrinket(gear.itemId))) held.push('trinkets');
  if (save.keyFragments > 0) held.push('keyFragments');
  return held;
}

/** Queues tips not yet seen or queued; the same save when nothing is added. */
export function noteTips(save: SaveData, ids: TipId[]): SaveData {
  const fresh: TipId[] = [];
  for (const id of ids) {
    if (!save.tips.seen.includes(id) && !save.tips.pending.includes(id) && !fresh.includes(id)) fresh.push(id);
  }
  if (fresh.length === 0) return save;
  return { ...save, tips: { ...save.tips, pending: [...save.tips.pending, ...fresh] } };
}

/** The gear-based tips the piece first held or the stock first held of it triggers, in tip order. */
function heldGearKinds(save: SaveData): TipId[] {
  const held: TipId[] = [];
  if (save.gear.some((gear) => gear.affixes.length > 0)) held.push('affixes');
  if (
    Object.entries(save.materials).some(([id, count]) => count > 0 && monsterPartById[id] !== undefined)
  ) {
    held.push('ingredients');
  }
  if (ELEMENTS.some((element) => (save.materials[stoneId(element)] ?? 0) > 0)) held.push('stones');
  if (save.gear.some((gear) => gear.rarity !== 'common')) held.push('reroll');
  return held;
}

/** Tips due now: specials once a hero is fielded, family levels once a run reached one, item kinds first held, off-map kinds once revealed, job stations once open. */
export function dueTips(save: SaveData): TipId[] {
  return [
    ...(save.tutorial.step === 'done' && save.heroes.length > 0 ? (['specials'] as TipId[]) : []),
    ...(save.reports.some((report) => Object.keys(report.families ?? {}).length > 0) ? (['familyLevel'] as TipId[]) : []),
    ...heldItemKinds(save),
    ...heldGearKinds(save),
    ...offMapRevealKinds.filter((kind) => isRevealed(save, kind)),
    ...(isJobOpen(save, 'miner') ? (['jobMiner'] as TipId[]) : []),
    ...(isJobOpen(save, 'charcoalBurner') ? (['jobCharcoalBurner'] as TipId[]) : []),
  ];
}

/** Closes a tip: out of the queue, into `seen` once. */
export function closeTip(save: SaveData, id: TipId): SaveData {
  const pending = save.tips.pending.filter((tip) => tip !== id);
  if (pending.length === save.tips.pending.length && save.tips.seen.includes(id)) return save;
  return { ...save, tips: { pending, seen: [...save.tips.seen, id] } };
}

/** The tip to show: the oldest waiting, only while the map is on screen; elsewhere it keeps waiting. */
export function nextTip(save: SaveData, onMap: boolean): TipId | null {
  if (!onMap) return null;
  return save.tips.pending[0] ?? null;
}

/** A tip's one line, in the current language; the family level tip names the strongest family of the latest run that reached one. */
export function tipText(id: TipId, reports: Pick<ExpeditionReport, 'families'>[] = []): string {
  const text = localized({ en: tipTexts, fr: frTipTexts })[id];
  if (id !== 'familyLevel') return text;
  const levels = reports.find((report) => Object.keys(report.families ?? {}).length > 0)?.families ?? {};
  const [family, level] = (Object.entries(levels) as [FamilyId, number][]).sort(([, a], [, b]) => b - a)[0] ?? [];
  return fill(text, { family: family ? `${levelMarks(level)} ${tr(familyById[family].name)}` : t('families.aLevel') });
}
