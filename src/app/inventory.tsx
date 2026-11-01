import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import PagerView from 'react-native-pager-view';

import { Text } from '@/components/Text';
import { TutorialHint } from '@/components/TutorialHint';
import { StepChests } from '@/components/StepChests';
import { PartsLine } from '@/components/IconLabel';
import { gearStatsParts, gearEffectParts } from '@/components/GearRow';
import { SalvageDialog } from '@/components/SalvageDialog';
import { elementInfo } from '@/content/elements';
import { qualities } from '@/content/forging';
import { bossById } from '@/content/enemies';
import { lootConfig } from '@/content/loot/config';
import { purposeInfo } from '@/content/loot/purposes';
import { gearName, itemById, materialById, recipeById, recipeOutput, valuableById } from '@/content/lookup';
import { placeInfo } from '@/content/places';
import { distanceMeters } from '@/game/generation/geo';
import { highestUnlockedTier } from '@/game/dungeons/unlock';
import { inventoryPages, inventoryRows, type InventoryItem, type InventoryPageId, type InventoryRow } from '@/game/inventory/inventoryPages';
import { canSalvage, wornBy } from '@/game/forging/salvage';
import { nextSteps, purposesOf, type BaseItemRef, type NextStep } from '@/game/loot/purposes';
import { ruinsDots } from '@/game/places/ruins';
import { isLureActive, lureEndsAt } from '@/game/rewards/lures';
import { isRevealed } from '@/game/reveal/reveal';
import type { SaveData } from '@/game/save';
import { hasKey, keyDots } from '@/game/secrets/keys';
import { tipPosition } from '@/game/secrets/tips';
import { isAway } from '@/game/team/team';
import type { GearInstance } from '@/game/types';
import { useLanguage } from '@/hooks/useLanguage';
import { useNow } from '@/hooks/useNow';
import { usePlayerLocation } from '@/hooks/usePlayerLocation';
import { formatDistance, formatDuration, t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { fonts, ui } from '@/theme';
import { AnchoredPopup, Chip, Deferred, DiamondRail, GhostScreen, ItemPopup, ItemSlot, WoodButton, type PopupAnchor, type RailItem } from '@/components/ui';
import { timed } from '@/components/timed';

const HOUR = 3_600_000;

/** One diamond per page: its emoji and short label. */
const PAGE_EMOJI: Record<InventoryPageId, string> = {
  materials: '🪵',
  gear: '⚔️',
  consumables: '🧪',
  treasures: '💎',
  finds: '🗺️',
  secrets: '🗝️',
};

/** The page the player last swiped to, kept for this session only. */
let lastPage: InventoryPageId | null = null;

/** The inventory pages as rail items, and the page the screen opens on: the one last swiped to this session. */
export function useInventoryRail(now: number) {
  const save = useGameStore((state) => state.save);
  const pages = inventoryPages(save, now);
  const items: RailItem[] = pages.map(({ id, count }) => ({
    key: id,
    label: t(`inventory.pages.${id}`),
    emoji: PAGE_EMOJI[id],
    badge: count > 0 ? count : undefined,
  }));
  const wanted = pages.findIndex(({ id }) => id === lastPage);
  const index = wanted === -1 ? 0 : wanted;
  return { items, pages, index, selected: pages[Math.min(index, pages.length - 1)]?.id };
}

/** The inventory: one swipable page per category of what is held, each a grid of sockets. */
function InventoryScreen() {
  const rail = useInventoryRail(useNow());
  return (
    <Deferred
      name="inventory"
      ghost={<GhostScreen variant="grid" rail={<DiamondRail items={rail.items} selected={rail.selected} onSelect={() => {}} />} />}
    >
      <InventoryContent />
    </Deferred>
  );
}

function InventoryContent() {
  useLanguage();
  const save = useGameStore((state) => state.save);
  const readMap = useGameStore((state) => state.readTreasureMap);
  const activateLure = useGameStore((state) => state.activateLure);
  const salvage = useGameStore((state) => state.salvage);
  const player = usePlayerLocation();
  const position = player.status === 'ready' ? player.location.position : null;
  const [now, setNow] = useState(() => Date.now());
  // Materials open first; later visits reopen the page last used this session.
  const rail = useInventoryRail(now);
  const pages = rail.pages;
  const [index, setIndex] = useState(() => rail.index);
  const pager = useRef<PagerView>(null);
  const activeIndex = Math.min(index, pages.length - 1);
  const active = pages[activeIndex]?.id;
  // Only the finds page shows something that ticks: map expiry and the lure's time left.
  useEffect(() => {
    if (active !== 'finds') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  /** The row whose pop-up is open, and the socket it opened from. */
  const [opened, setOpened] = useState<{ row: InventoryRow; anchor: PopupAnchor } | null>(null);
  const [salvaging, setSalvaging] = useState<GearInstance | null>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const rows = inventoryRows(save, now);
  // Each slot is wrapped in a 2 px ring, so its face is 4 px narrower than its cell.
  const cell = contentWidth > 0 ? Math.floor((contentWidth - 3 * 6) / 4) - 4 : 0;

  const closePopup = () => setOpened(null);

  return (
    <View style={styles.screen}>
      <View style={styles.body}>
        <DiamondRail
          items={rail.items}
          selected={active}
          onSelect={(key) => {
            const wanted = pages.findIndex(({ id }) => id === key);
            if (wanted !== -1) pager.current?.setPage(wanted);
            lastPage = key as InventoryPageId;
          }}
        />
        <PagerView
          ref={pager}
          style={styles.pager}
          initialPage={Math.min(index, pages.length - 1)}
          onPageSelected={({ nativeEvent }) => {
            setIndex(nativeEvent.position);
            lastPage = pages[nativeEvent.position].id;
          }}
        >
          {pages.map(({ id }) => (
            <View key={id} collapsable={false}>
              <ScrollView
                style={styles.content}
                contentContainerStyle={styles.page}
                onLayout={({ nativeEvent }) => setContentWidth(nativeEvent.layout.width - 24)}
              >
                <TutorialHint screen="inventory" />
                {id === 'materials' && rows.every((row) => row.page !== 'materials') && (
                  <Text style={styles.empty}>{t('inventory.noMaterials')}</Text>
                )}
                {/* While the quests screen is still hidden, the chests stay here. */}
                {id === 'finds' && !isRevealed(save, 'quests') && <StepChests />}
                {cell > 0 && (
                  <View style={styles.grid}>
                    {rows
                      .filter((row) => row.page === id)
                      .map((row) => (
                        <RowSlot
                          key={rowKey(row)}
                          row={row}
                          save={save}
                          size={cell}
                          selected={opened !== null && rowKey(opened.row) === rowKey(row)}
                          onOpen={(anchor) => setOpened({ row, anchor })}
                        />
                      ))}
                  </View>
                )}
                {id === 'secrets' && rows.some((row) => row.page === 'secrets' && row.kind === 'tip') && !hasKey(save) && (
                  <Text style={styles.empty}>{t('secrets.needKey', { dots: keyDots(save) })}</Text>
                )}
              </ScrollView>
            </View>
          ))}
        </PagerView>
      </View>
      {opened && (
        <AnchoredPopup
          anchor={opened.anchor}
          onClose={closePopup}
          render={(pointer) => (
            <InventoryPopup
              row={opened.row}
              save={save}
              now={now}
              position={position}
              pointer={pointer}
              onSalvage={(gear) => {
                setOpened(null);
                setSalvaging(gear);
              }}
              onReadMap={(mapId, at) => {
                setOpened(null);
                readMap(mapId, at);
              }}
              onActivateLure={(at) => {
                setOpened(null);
                activateLure(at);
              }}
            />
          )}
        />
      )}
      {salvaging && (
        <SalvageDialog
          gear={salvaging}
          save={save}
          onConfirm={() => {
            salvage(salvaging.uid);
            setSalvaging(null);
          }}
          onClose={() => setSalvaging(null)}
        />
      )}
    </View>
  );
}

/** What one row shows on its socket: its face, its count and its spoken name. */
function rowFace(row: InventoryRow, save: SaveData): { emoji: string; icon?: ImageSourcePropType; count?: number | string; label: string } {
  switch (row.kind) {
    case 'item':
      return {
        emoji: row.item.emoji,
        icon: row.item.ref.kind === 'material' ? materialById[row.item.ref.id]?.icon : undefined,
        count: row.item.count,
        label: row.item.count > 1 ? `${row.item.name}, ${row.item.count}` : row.item.name,
      };
    case 'gear': {
      const item = itemById[row.gear.itemId];
      return { emoji: item.emoji, icon: item.icon, label: gearName(row.gear) };
    }
    case 'consumable': {
      const item = itemById[row.itemId];
      return { emoji: item.emoji, icon: item.icon, count: row.count, label: `${tr(item.name)}, ${row.count}` };
    }
    case 'sigils':
      return { emoji: '🎟️', count: save.sigils.length, label: t('inventory.sigils') };
    case 'map':
      return {
        emoji: '🗺️',
        label: t('inventory.treasureMap', { rarity: t(`expeditions.rarity.${row.map.rarity}`), tier: row.map.tier }),
      };
    case 'lure':
      return { emoji: '🪤', count: save.lures, label: t('inventory.lures', { count: save.lures }) };
    case 'ruins':
      return { emoji: '⛏️', label: t('inventory.ruins') };
    case 'tool': {
      const item = itemById[row.toolId];
      return { emoji: item.emoji, icon: item.icon, label: tr(item.name) };
    }
    case 'tip':
      return { emoji: placeInfo[row.tip.secret].emoji, label: tr(placeInfo[row.tip.secret].name) };
  }
}

/** One row as a socket: its face is measured so the pop-up can open beside it. */
function RowSlot({
  row,
  save,
  size,
  selected,
  onOpen,
}: {
  row: InventoryRow;
  save: SaveData;
  size: number;
  selected: boolean;
  onOpen: (anchor: PopupAnchor) => void;
}) {
  const wrapper = useRef<ComponentRef<typeof View>>(null);
  const face = rowFace(row, save);
  return (
    <View ref={wrapper} collapsable={false}>
      <ItemSlot
        state={selected ? 'selected' : 'ready'}
        size={size}
        emoji={face.emoji}
        icon={face.icon}
        count={face.count}
        accessibilityLabel={face.label}
        onPress={() => wrapper.current?.measureInWindow((x, y, width, height) => onOpen({ x, y, width, height }))}
      />
    </View>
  );
}

function stepText(step: NextStep): string {
  switch (step.kind) {
    case 'recipes': {
      const known = step.known.map((id) => tr(recipeOutput(recipeById[id]).name));
      return known.length > 0 ? t('inventory.next.recipes', { recipes: known.join(', ') }) : t('inventory.next.unknownRecipe');
    }
    case 'sell':
      return t('inventory.next.sell', { price: step.price });
    case 'boss':
      return t('inventory.next.boss', { boss: tr(bossById[step.bossId]?.name ?? step.bossId) });
    case 'set':
      return t('inventory.next.set', { dots: ruinsDots(step.have, step.need) });
    case 'restore':
      return t('inventory.next.restore', {
        // The gem in a restore cost is a valuable, not a material.
        cost: step.cost.map((s) => `${s.amount} ${tr((materialById[s.materialId] ?? valuableById[s.materialId]).name).toLowerCase()}`).join(', '),
      });
    case 'action':
      return t(`inventory.next.${step.action}`);
  }
}

/** What a base item is used in: its purposes, then one chip per known recipe and any other next step. */
function usedInChips(save: SaveData, ref: BaseItemRef) {
  const chips: { key: string; tone: 'keyword' | 'neutral'; label: string }[] = purposesOf(ref).map((purpose, i) => ({
    key: `p${i}`,
    tone: 'keyword',
    label: tr(purposeInfo[purpose].name),
  }));
  for (const step of nextSteps(save, ref)) {
    if (step.kind === 'recipes') {
      for (const id of step.known) chips.push({ key: id, tone: 'neutral', label: tr(recipeOutput(recipeById[id]).name) });
      if (step.known.length === 0) chips.push({ key: 'unknown', tone: 'neutral', label: t('inventory.next.unknownRecipe') });
    } else {
      chips.push({ key: step.kind, tone: 'neutral', label: stepText(step) });
    }
  }
  return chips;
}

/** One row's open pop-up: what that row's page already showed for it, plus its action. */
function InventoryPopup({
  row,
  save,
  now,
  position,
  pointer,
  onSalvage,
  onReadMap,
  onActivateLure,
}: {
  row: InventoryRow;
  save: SaveData;
  now: number;
  position: { latitude: number; longitude: number } | null;
  pointer: { side: 'top' | 'bottom'; x: number } | undefined;
  onSalvage: (gear: GearInstance) => void;
  onReadMap: (mapId: string, at: { latitude: number; longitude: number }) => void;
  onActivateLure: (at: { latitude: number; longitude: number }) => void;
}) {
  const readManual = useGameStore((state) => state.readManual);
  const top = lootConfig.manuals.topLevelByTier;
  let title: string;
  let emoji: string;
  let icon: ImageSourcePropType | undefined;
  let subtitle: string | undefined;
  let value: string | number | undefined;
  let note: string | undefined;
  let children: ReactNode;
  let action: { title: string; onPress: () => void; disabled?: boolean } | undefined;

  switch (row.kind) {
    case 'item': {
      const item: InventoryItem = row.item;
      title = item.name;
      emoji = item.emoji;
      icon = item.ref.kind === 'material' ? materialById[item.ref.id]?.icon : undefined;
      value = item.count;
      note = item.about;
      children = (
        <>
          <View style={styles.chips}>
            {usedInChips(save, item.ref).map((chip) => (
              <Chip key={chip.key} tone={chip.tone} label={chip.label} />
            ))}
          </View>
          {item.manual && item.count > 0 && (
            <>
              <Text style={styles.note}>{t('inventory.manualHint', { level: top[highestUnlockedTier(save) - 1] })}</Text>
              {save.heroes
                .filter((hero) => !isAway(save, hero.id))
                .map((hero) => (
                  <WoodButton
                    key={hero.id}
                    title={t('inventory.readTo', { name: hero.name, level: hero.level })}
                    onPress={() => {
                      readManual(hero.id, item.manual!);
                    }}
                  />
                ))}
            </>
          )}
        </>
      );
      break;
    }
    case 'gear': {
      const gear = row.gear;
      const item = itemById[gear.itemId];
      const holder = wornBy(save, gear.uid);
      title = gearName(gear);
      emoji = item.emoji;
      icon = item.icon;
      subtitle = `${tr(qualities[gear.quality].name)} · ${tr(item.name)}`;
      note = holder ? t('common.wornBy', { name: holder.name }) : undefined;
      const parts = [
        ...gearStatsParts(gear),
        gear.element ? { emoji: elementInfo[gear.element].emoji, text: tr(elementInfo[gear.element].name) } : null,
        ...gearEffectParts(gear),
      ].filter((part) => part !== null);
      children = parts.length > 0 ? <PartsLine parts={parts} sep="   " labelStyle={styles.line} /> : undefined;
      action = { title: t('inventory.salvage'), disabled: !canSalvage(save, gear.uid), onPress: () => onSalvage(gear) };
      break;
    }
    case 'consumable': {
      const item = itemById[row.itemId];
      title = tr(item.name);
      emoji = item.emoji;
      icon = item.icon;
      value = row.count;
      subtitle = item.description ? tr(item.description) : undefined;
      break;
    }
    case 'sigils': {
      const tiers = [...new Set(save.sigils)].sort((a, b) => a - b);
      title = t('inventory.sigils');
      emoji = '🎟️';
      value = save.sigils.length;
      subtitle = save.sigils.length ? t('inventory.sigilsHint') : t('inventory.sigilsEmpty');
      note = tiers.map((tier) => `T${tier}×${save.sigils.filter((s) => s === tier).length}`).join(' ') || '0';
      break;
    }
    case 'map':
      title = t('inventory.treasureMap', { rarity: t(`expeditions.rarity.${row.map.rarity}`), tier: row.map.tier });
      emoji = '🗺️';
      subtitle = t('inventory.expiresIn', {
        state: row.map.location ? t('inventory.marked') : t('inventory.notRead'),
        hours: Math.ceil((row.map.expiresAt - now) / HOUR),
      });
      action = { title: t('inventory.read'), disabled: !position, onPress: () => position && onReadMap(row.map.id, position) };
      break;
    case 'lure':
      title = t('inventory.lures', { count: save.lures });
      emoji = '🪤';
      value = save.lures;
      subtitle = isLureActive(save, now)
        ? t('inventory.lureActive', { minutes: Math.ceil((lureEndsAt(save) - now) / 60_000) })
        : t('inventory.lureHint');
      action = {
        title: t('inventory.activate'),
        disabled: !position || save.lures === 0 || isLureActive(save, now),
        onPress: () => position && onActivateLure(position),
      };
      break;
    case 'ruins':
      title = t('inventory.ruins');
      emoji = '⛏️';
      subtitle = t('places.digProgress', { dots: ruinsDots(save.ruinsProgress) });
      break;
    case 'tool': {
      const item = itemById[row.toolId];
      title = tr(item.name);
      emoji = item.emoji;
      icon = item.icon;
      break;
    }
    case 'tip': {
      const spot = tipPosition(row.tip, () => false);
      title = tr(placeInfo[row.tip.secret].name);
      emoji = placeInfo[row.tip.secret].emoji;
      subtitle = t('secrets.where', {
        distance: position && spot ? formatDistance(distanceMeters(position, spot)) : '?',
        time: formatDuration(row.tip.expiresAt - now),
      });
      children = <Text style={styles.lock}>{row.tip.entered || hasKey(save) ? '🔓' : '🔒'}</Text>;
      break;
    }
  }

  return (
    <ItemPopup
      pointer={pointer}
      title={title}
      emoji={emoji}
      icon={icon}
      subtitle={subtitle}
      value={value}
      note={note}
      action={action}
    >
      {children}
    </ItemPopup>
  );
}

function rowKey(row: InventoryRow): string {
  switch (row.kind) {
    case 'item':
      return row.item.key;
    case 'gear':
      return row.gear.uid;
    case 'consumable':
      return row.itemId;
    case 'map':
      return row.map.id;
    case 'tool':
      return row.toolId;
    case 'tip':
      return row.tip.id;
    default:
      return row.kind;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.woodDark },
  body: { flex: 1, flexDirection: 'row' },
  pager: { flex: 1 },
  content: { flex: 1, backgroundColor: ui.woodDark },
  page: { paddingVertical: 12, paddingHorizontal: 12, gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  empty: { color: ui.onWoodMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'center' },
  note: { fontFamily: fonts.serif, fontSize: 13, color: ui.inkMuted, textAlign: 'center' },
  line: { fontFamily: fonts.serif, fontSize: 15, color: ui.inkMuted },
  lock: { fontSize: 20 },
});

export default timed('screen: inventory', InventoryScreen);
