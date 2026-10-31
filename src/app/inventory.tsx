import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import PagerView from 'react-native-pager-view';

import { Button } from '@/components/Button';
import { GearRow } from '@/components/GearRow';
import { IconLabel } from '@/components/IconLabel';
import { ItemSheet, purposeBadge, type InventoryItem } from '@/components/ItemSheet';
import { Row } from '@/components/Row';
import { SalvageDialog } from '@/components/SalvageDialog';
import { StepChests } from '@/components/StepChests';
import { Text } from '@/components/Text';
import { TutorialHint } from '@/components/TutorialHint';
import { itemById, materialById } from '@/content/lookup';
import { placeInfo } from '@/content/places';
import { distanceMeters } from '@/game/generation/geo';
import { inventoryPages, inventoryRows, type InventoryPageId, type InventoryRow } from '@/game/inventory/inventoryPages';
import { canSalvage, wornBy } from '@/game/forging/salvage';
import { ruinsDots } from '@/game/places/ruins';
import { isLureActive, lureEndsAt } from '@/game/rewards/lures';
import type { SaveData } from '@/game/save';
import { hasKey, keyDots } from '@/game/secrets/keys';
import { tipPosition } from '@/game/secrets/tips';
import type { GearInstance } from '@/game/types';
import { useLanguage } from '@/hooks/useLanguage';
import { usePlayerLocation } from '@/hooks/usePlayerLocation';
import { formatDistance, formatDuration, t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors, pixel } from '@/theme';

const HOUR = 3_600_000;

/** One tab per page: its emoji and short label. */
const PAGE_META: Record<InventoryPageId, { emoji: string; label: () => string }> = {
  materials: { emoji: '🪵', label: () => t('inventory.pages.materials') },
  gear: { emoji: '⚔️', label: () => t('inventory.pages.gear') },
  consumables: { emoji: '🧪', label: () => t('inventory.pages.consumables') },
  treasures: { emoji: '💎', label: () => t('inventory.pages.treasures') },
  finds: { emoji: '🗺️', label: () => t('inventory.pages.finds') },
  secrets: { emoji: '🗝️', label: () => t('inventory.pages.secrets') },
};

/** The page the player last swiped to, kept for this session only. */
let lastPage: InventoryPageId | null = null;

/** The inventory: gold, then one swipable page per category of what is held. */
export default function InventoryScreen() {
  useLanguage();
  const save = useGameStore((state) => state.save);
  const readMap = useGameStore((state) => state.readTreasureMap);
  const activateLure = useGameStore((state) => state.activateLure);
  const salvage = useGameStore((state) => state.salvage);
  const player = usePlayerLocation();
  const position = player.status === 'ready' ? player.location.position : null;
  const [now, setNow] = useState(() => Date.now());
  const pages = inventoryPages(save, now);
  // Materials open first; later visits reopen the page last used this session.
  const [index, setIndex] = useState(() => {
    const wanted = pages.findIndex(({ id }) => id === lastPage);
    return wanted === -1 ? 0 : wanted;
  });
  const pager = useRef<PagerView>(null);
  const activeIndex = Math.min(index, pages.length - 1);
  const active = pages[activeIndex]?.id;
  // Only the finds page shows something that ticks: map expiry and the lure's time left.
  useEffect(() => {
    if (active !== 'finds') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  const [opened, setOpened] = useState<InventoryItem | null>(null);
  const [salvaging, setSalvaging] = useState<GearInstance | null>(null);
  const rows = inventoryRows(save, now);

  return (
    <View style={styles.screen}>
      <View style={styles.hint}>
        <TutorialHint screen="inventory" />
        <Row emoji="🪙" title={t('common.gold')} right={save.gold} />
      </View>
      <View style={styles.tabs}>
        {pages.map(({ id, count }, i) => (
          <Pressable
            key={id}
            onPress={() => {
              pager.current?.setPage(i);
              lastPage = id;
            }}
            style={[styles.tab, i === activeIndex && styles.tabActive]}
          >
            <IconLabel
              emoji={PAGE_META[id].emoji}
              label={PAGE_META[id].label()}
              labelStyle={[styles.tabLabel, i === activeIndex && styles.tabLabelActive]}
            />
            {count > 0 && <Text style={styles.badge}>{count}</Text>}
          </Pressable>
        ))}
      </View>
      <PagerView
        style={styles.pager}
        initialPage={Math.min(index, pages.length - 1)}
        onPageSelected={({ nativeEvent }) => {
          setIndex(nativeEvent.position);
          lastPage = pages[nativeEvent.position].id;
        }}
      >
        {pages.map(({ id }) => (
          <View key={id}>
            <ScrollView contentContainerStyle={styles.container}>
              {id === 'materials' && rows.filter((row) => row.page === 'materials').length === 0 && (
                <Text style={styles.empty}>{t('inventory.noMaterials')}</Text>
              )}
              {id === 'finds' && <StepChests />}
              {rows
                .filter((row) => row.page === id)
                .map((row) => (
                  <InventoryRowView
                    key={rowKey(row)}
                    row={row}
                    save={save}
                    now={now}
                    position={position}
                    onOpen={setOpened}
                    onSalvage={setSalvaging}
                    onReadMap={(mapId, at) => readMap(mapId, at)}
                    onActivateLure={(at) => activateLure(at)}
                  />
                ))}
              {id === 'secrets' && rows.some((row) => row.page === 'secrets' && row.kind === 'tip') && !hasKey(save) && (
                <Text style={styles.empty}>{t('secrets.needKey', { dots: keyDots(save) })}</Text>
              )}
            </ScrollView>
          </View>
        ))}
      </PagerView>
      {opened && <ItemSheet item={opened} save={save} onClose={() => setOpened(null)} />}
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

/** One row of the inventory, whatever its page. */
function InventoryRowView({
  row,
  save,
  now,
  position,
  onOpen,
  onSalvage,
  onReadMap,
  onActivateLure,
}: {
  row: InventoryRow;
  save: SaveData;
  now: number;
  position: { latitude: number; longitude: number } | null;
  onOpen: (item: InventoryItem) => void;
  onSalvage: (gear: GearInstance) => void;
  onReadMap: (mapId: string, at: { latitude: number; longitude: number }) => void;
  onActivateLure: (at: { latitude: number; longitude: number }) => void;
}) {
  switch (row.kind) {
    case 'item': {
      const { item } = row;
      return (
        <Row
          emoji={item.emoji}
          icon={item.ref.kind === 'material' ? materialById[item.ref.id]?.icon : undefined}
          title={item.name}
          right={item.count}
          badge={purposeBadge(item.ref)}
          onPress={() => onOpen(item)}
        />
      );
    }
    case 'gear': {
      const holder = wornBy(save, row.gear.uid);
      return (
        <GearRow
          gear={row.gear}
          note={holder ? t('common.wornBy', { name: holder.name }) : null}
          right={<Button title={t('inventory.salvage')} disabled={!canSalvage(save, row.gear.uid)} onPress={() => onSalvage(row.gear)} />}
        />
      );
    }
    case 'consumable':
      return <Row emoji={itemById[row.itemId].emoji} icon={itemById[row.itemId].icon} title={tr(itemById[row.itemId].name)} right={row.count} />;
    case 'sigils': {
      const tiers = [...new Set(save.sigils)].sort((a, b) => a - b);
      return (
        <Row
          emoji="🎟️"
          title={t('inventory.sigils')}
          subtitle={save.sigils.length ? t('inventory.sigilsHint') : t('inventory.sigilsEmpty')}
          right={tiers.map((tier) => `T${tier}×${save.sigils.filter((s) => s === tier).length}`).join(' ') || '0'}
        />
      );
    }
    case 'map':
      return (
        <Row
          emoji="🗺️"
          title={t('inventory.treasureMap', { rarity: t(`expeditions.rarity.${row.map.rarity}`), tier: row.map.tier })}
          badge={purposeBadge({ kind: 'treasureMap' })}
          subtitle={t('inventory.expiresIn', {
            state: row.map.location ? t('inventory.marked') : t('inventory.notRead'),
            hours: Math.ceil((row.map.expiresAt - now) / HOUR),
          })}
          right={
            row.map.location ? undefined : (
              <Button title={t('inventory.read')} disabled={!position} onPress={() => position && onReadMap(row.map.id, position)} />
            )
          }
        />
      );
    case 'lure':
      return (
        <Row
          emoji="🪤"
          title={t('inventory.lures', { count: save.lures })}
          subtitle={
            isLureActive(save, now)
              ? t('inventory.lureActive', { minutes: Math.ceil((lureEndsAt(save) - now) / 60_000) })
              : t('inventory.lureHint')
          }
          right={
            <Button
              title={t('inventory.activate')}
              disabled={!position || save.lures === 0 || isLureActive(save, now)}
              onPress={() => position && onActivateLure(position)}
            />
          }
        />
      );
    case 'ruins':
      return <Row emoji="⛏️" title={t('inventory.ruins')} subtitle={t('places.digProgress', { dots: ruinsDots(save.ruinsProgress) })} />;
    case 'tool':
      return <Row emoji={itemById[row.toolId].emoji} icon={itemById[row.toolId].icon} title={tr(itemById[row.toolId].name)} />;
    case 'tip': {
      const spot = tipPosition(row.tip, () => false);
      return (
        <Row
          emoji={placeInfo[row.tip.secret].emoji}
          title={tr(placeInfo[row.tip.secret].name)}
          subtitle={t('secrets.where', {
            distance: position && spot ? formatDistance(distanceMeters(position, spot)) : '?',
            time: formatDuration(row.tip.expiresAt - now),
          })}
          right={row.tip.entered || hasKey(save) ? '🔓' : '🔒'}
        />
      );
    }
  }
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
  screen: { flex: 1 },
  hint: { paddingHorizontal: 16, paddingTop: 12 },
  container: { padding: 16 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    borderWidth: pixel.outline,
    borderColor: colors.ink,
    backgroundColor: colors.parchmentDark,
  },
  tabActive: { backgroundColor: colors.wood, borderBottomColor: colors.highlight },
  tabLabel: { fontSize: 20, color: colors.ink },
  tabLabelActive: { color: colors.parchment },
  badge: {
    minWidth: 20,
    textAlign: 'center',
    fontSize: 14,
    color: colors.parchment,
    backgroundColor: colors.danger,
    paddingHorizontal: 4,
  },
  pager: { flex: 1 },
  empty: { color: colors.muted, paddingVertical: 8 },
});
