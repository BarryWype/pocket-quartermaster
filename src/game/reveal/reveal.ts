import { componentById, itemById } from '@/content/lookup';
import { offMapRevealKinds, placeRevealKinds, revealRules, tipTexts, type ItemTipKind, type RevealKind, type TipId } from '@/content/reveal';
import type { PlaceKind } from '@/content/places';
import { frTipTexts } from '@/content/fr/reveal';
import { localized } from '@/i18n/locale';

import { highestUnlockedTier } from '../dungeons/unlock';
import { isGuildUnlocked } from '../guild/guild';
import type { SaveData } from '../save';

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
  if (Object.entries(save.materials).some(([id, count]) => count > 0 && componentById[id] !== undefined)) {
    held.push('components');
  }
  if (save.relics.length > 0) held.push('relics');
  const isTrinket = (itemId: string) => itemById[itemId]?.slot === 'trinket';
  if (save.gear.some((gear) => isTrinket(gear.itemId))) held.push('trinkets');
  if (Object.values(save.valuables).some((count) => count > 0)) held.push('valuables');
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

/** Tips due now: item kinds first held, and off-map kinds once revealed. */
export function dueTips(save: SaveData): TipId[] {
  return [...heldItemKinds(save), ...offMapRevealKinds.filter((kind) => isRevealed(save, kind))];
}

/** Closes a tip: out of the queue, into `seen` once. */
export function closeTip(save: SaveData, id: TipId): SaveData {
  const pending = save.tips.pending.filter((tip) => tip !== id);
  if (pending.length === save.tips.pending.length && save.tips.seen.includes(id)) return save;
  return { ...save, tips: { pending, seen: [...save.tips.seen, id] } };
}

/** The tip waiting to show, oldest first. */
export function nextTip(save: SaveData): TipId | null {
  return save.tips.pending[0] ?? null;
}

/** A tip's one line, in the current language. */
export function tipText(id: TipId): string {
  return localized({ en: tipTexts, fr: frTipTexts })[id];
}
