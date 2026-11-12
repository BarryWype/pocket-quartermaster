import { gearTypeNames } from '@/content/equipment';
import { itemById, monsterPartById, relicById } from '@/content/lookup';
import { baseItems } from '@/content/loot/baseItems';
import { materials } from '@/content/materials';
import type { SecretKind } from '@/content/places';
import { t, tr } from '@/i18n';

import type { ManualRarity } from '../loot/types';
import type { BaseItemRef } from '../loot/purposes';
import { isLureActive } from '../rewards/lures';
import { equippedFirst } from '../forging/salvage';
import { liveTreasureMaps } from '../rewards/treasure';
import { isRevealed } from '../reveal/reveal';
import type { SaveData } from '../save';
import { fragmentsTowardKey, keyDots, keysHeld } from '../secrets/keys';
import { activeTip } from '../secrets/tips';
import type { GearInstance, SecretTip, TreasureMap } from '../types';

/** One page per category of the inventory; the screen swipes through them in this order. */
export type InventoryPageId = 'materials' | 'gear' | 'consumables' | 'treasures' | 'finds' | 'secrets';

/** A base item as the inventory lists it. */
export type InventoryItem = {
  key: string;
  ref: BaseItemRef;
  emoji: string;
  name: string;
  count: number;
  /** A line about the item itself: a relic's effect, a part's uses. */
  about?: string;
  /** Set for a training manual, so it can be read. */
  manual?: ManualRarity;
};

const PAGE_ORDER: InventoryPageId[] = ['materials', 'gear', 'consumables', 'treasures', 'finds', 'secrets'];
const SECRETS: SecretKind[] = ['hiddenDen', 'blackMarket', 'underwaterDungeon'];
const RARITIES: ManualRarity[] = ['common', 'rare', 'legendary'];

/** One row of the inventory, and the page it belongs to. */
export type InventoryRow =
  | { kind: 'item'; page: InventoryPageId; item: InventoryItem }
  | { kind: 'gear'; page: 'gear'; gear: GearInstance }
  | { kind: 'consumable'; page: 'consumables'; itemId: string; count: number }
  | { kind: 'sigils'; page: 'finds' }
  | { kind: 'map'; page: 'finds'; map: TreasureMap }
  | { kind: 'lure'; page: 'finds' }
  | { kind: 'ruins'; page: 'finds' }
  | { kind: 'tool'; page: 'finds'; toolId: string }
  | { kind: 'tip'; page: 'secrets'; tip: SecretTip };

/** The mysterious key and the fragments towards the next one, on the given page. */
function keyRows(save: SaveData, page: 'finds' | 'secrets'): InventoryRow[] {
  const rows: InventoryRow[] = [];
  if (keysHeld(save) > 0) {
    rows.push({
      kind: 'item',
      page,
      item: { key: 'mysteriousKey', ref: { kind: 'mysteriousKey' }, emoji: baseItems.mysteriousKey.emoji, name: tr(baseItems.mysteriousKey.name), count: keysHeld(save), about: t('secrets.opens') },
    });
  }
  if (fragmentsTowardKey(save) > 0) {
    rows.push({
      kind: 'item',
      page,
      item: {
        key: 'keyFragments',
        ref: { kind: 'keyFragment' },
        emoji: baseItems.keyFragment.emoji,
        name: tr(baseItems.keyFragment.name),
        count: fragmentsTowardKey(save),
        about: `${tr(baseItems.keyFragment.description ?? '')} ${keyDots(save)} · ${t('secrets.opens')}`,
      },
    });
  }
  return rows;
}

/** Every row the inventory shows, each on its own page: the screen only renders these. */
export function inventoryRows(save: SaveData, now: number): InventoryRow[] {
  const revealed = isRevealed(save, 'secrets');
  const rows: InventoryRow[] = [];

  for (const material of materials.filter((m) => (save.materials[m.id] ?? 0) > 0)) {
    rows.push({
      kind: 'item',
      page: 'materials',
      item: {
        key: `m:${material.id}`,
        ref: { kind: 'material', id: material.id },
        emoji: material.emoji,
        name: tr(material.name),
        count: save.materials[material.id],
        about: monsterPartById[material.id] ? tr(monsterPartById[material.id].uses) : undefined,
      },
    });
  }

  for (const gear of equippedFirst(save.gear, (g) => g.uid, save)) rows.push({ kind: 'gear', page: 'gear', gear });

  for (const [itemId, count] of Object.entries(save.consumables)) {
    const item = itemById[itemId];
    if (count <= 0) continue;
    if (item.slot === 'consumable' && item.weakness) {
      rows.push({ kind: 'item', page: 'consumables', item: { key: `w:${itemId}`, ref: { kind: 'weakness', id: itemId }, emoji: item.emoji, name: tr(item.name), count, about: item.description ? tr(item.description) : undefined } });
    } else {
      rows.push({ kind: 'consumable', page: 'consumables', itemId, count });
    }
  }

  for (const { uid, relicId } of save.relics) {
    const def = relicById[relicId];
    rows.push({
      kind: 'item',
      page: 'treasures',
      item: {
        key: `r:${uid}`,
        ref: { kind: 'relic', id: relicId },
        emoji: '🏺',
        name: tr(def.name),
        count: 1,
        about: t('inventory.relicAbout', { tier: def.tier, type: tr(gearTypeNames[def.gearType].name), effect: tr(def.effect) }),
      },
    });
  }
  for (const rarity of RARITIES) {
    const count = save.manuals[rarity] ?? 0;
    if (count > 0) {
      rows.push({ kind: 'item', page: 'treasures', item: { key: `manual:${rarity}`, ref: { kind: 'manual' }, emoji: baseItems.trainingManual.emoji, name: t('expeditions.manual', { rarity: t(`expeditions.rarity.${rarity}`) }).replace(/^📖 /, ''), count, manual: rarity } });
    }
  }

  // The finds page: only what there is something of, so an empty stock hides the page.
  if (save.sigils.length > 0) rows.push({ kind: 'sigils', page: 'finds' });
  for (const map of liveTreasureMaps(save, now)) rows.push({ kind: 'map', page: 'finds', map });
  if (save.lures > 0 || isLureActive(save, now)) rows.push({ kind: 'lure', page: 'finds' });
  if (save.ruinsProgress > 0) rows.push({ kind: 'ruins', page: 'finds' });
  for (const toolId of save.tools) rows.push({ kind: 'tool', page: 'finds', toolId });

  // The key and its fragments belong to the secrets page, which only exists once a secret has been found.
  rows.push(...keyRows(save, revealed ? 'secrets' : 'finds'));

  if (revealed) {
    for (const secret of SECRETS) {
      const tip = activeTip(save, secret, now);
      if (tip) rows.push({ kind: 'tip', page: 'secrets', tip });
    }
  }
  return rows;
}

/** The pages the inventory swipes through, in order, with each one's row count. An empty page stays hidden, except materials. */
export function inventoryPages(save: SaveData, now: number): { id: InventoryPageId; count: number }[] {
  const rows = inventoryRows(save, now);
  return PAGE_ORDER.map((id) => ({ id, count: rows.filter((row) => row.page === id).length })).filter(({ id, count }) => id === 'materials' || count > 0);
}
