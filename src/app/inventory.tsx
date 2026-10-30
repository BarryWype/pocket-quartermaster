import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ItemSheet, purposeBadge, type InventoryItem } from '@/components/ItemSheet';
import { GearRow } from '@/components/GearRow';
import { Row, SectionTitle } from '@/components/Row';
import { StepChests } from '@/components/StepChests';
import { Text } from '@/components/Text';
import { TutorialHint } from '@/components/TutorialHint';
import { componentById, gearName, itemById, materialById, monsterPartById, relicById, valuableById } from '@/content/lookup';
import { baseItems } from '@/content/loot/baseItems';
import { PURPOSES, purposeInfo, type Purpose } from '@/content/loot/purposes';
import { materials } from '@/content/materials';
import { canSalvage, salvageNeedsConfirmation, salvageReturns, wornBy } from '@/game/forging/salvage';
import { ruinsDots } from '@/game/places/ruins';
import { isLureActive, lureEndsAt } from '@/game/rewards/lures';
import { purposesOf } from '@/game/loot/purposes';
import type { ManualRarity } from '@/game/loot/types';
import { liveTreasureMaps } from '@/game/rewards/treasure';
import type { SaveData } from '@/game/save';
import { useLanguage } from '@/hooks/useLanguage';
import { usePlayerLocation } from '@/hooks/usePlayerLocation';
import { t, tr } from '@/i18n';
import type { GearInstance } from '@/game/types';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

const HOUR = 3_600_000;
const RARITIES: ManualRarity[] = ['common', 'rare', 'legendary'];

/** Every base item the player holds (not gear or consumables), with what it is for. */
function inventoryItems(save: SaveData): InventoryItem[] {
  const held: InventoryItem[] = materials
    .filter((m) => (save.materials[m.id] ?? 0) > 0)
    .map((m) => ({
      key: `m:${m.id}`,
      ref: { kind: 'material', id: m.id },
      emoji: m.emoji,
      name: tr(m.name),
      count: save.materials[m.id],
      about: monsterPartById[m.id] ? tr(monsterPartById[m.id].uses) : componentById[m.id] ? tr(componentById[m.id].adds) : undefined,
    }));
  for (const [key, count] of Object.entries(save.valuables)) {
    const [id, tier] = key.split(':');
    if (count > 0 && valuableById[id]) {
      const def = valuableById[id];
      held.push({ key: `v:${key}`, ref: { kind: 'valuable', id, tier: Number(tier) }, emoji: def.emoji, name: t('inventory.valuable', { name: tr(def.name), tier }), count });
    }
  }
  for (const { uid, relicId } of save.relics) {
    const def = relicById[relicId];
    held.push({ key: `r:${uid}`, ref: { kind: 'relic', id: relicId }, emoji: '🏺', name: tr(def.name), count: 1, about: tr(def.effect) });
  }
  for (const rarity of RARITIES) {
    const count = save.manuals[rarity] ?? 0;
    if (count > 0) {
      held.push({ key: `manual:${rarity}`, ref: { kind: 'manual' }, emoji: baseItems.trainingManual.emoji, name: t('expeditions.manual', { rarity: t(`expeditions.rarity.${rarity}`) }).replace(/^📖 /, ''), count, manual: rarity });
    }
  }
  if (save.keyFragments > 0) {
    held.push({ key: 'keyFragments', ref: { kind: 'keyFragment' }, emoji: baseItems.keyFragment.emoji, name: tr(baseItems.keyFragment.name), count: save.keyFragments, about: tr(baseItems.keyFragment.description ?? '') });
  }
  for (const [id, count] of Object.entries(save.consumables)) {
    const item = itemById[id];
    if (count > 0 && item.slot === 'consumable' && item.weakness) {
      held.push({ key: `w:${id}`, ref: { kind: 'weakness', id }, emoji: item.emoji, name: tr(item.name), count, about: item.description ? tr(item.description) : undefined });
    }
  }
  return held;
}

export default function InventoryScreen() {
  useLanguage();
  const save = useGameStore((state) => state.save);
  const readMap = useGameStore((state) => state.readTreasureMap);
  const activateLure = useGameStore((state) => state.activateLure);
  const salvage = useGameStore((state) => state.salvage);
  const player = usePlayerLocation();
  const position = player.status === 'ready' ? player.location.position : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const maps = liveTreasureMaps(save, now);
  const sigilTiers = [...new Set(save.sigils)].sort((a, b) => a - b);
  const [filter, setFilter] = useState<Purpose | null>(null);
  const [opened, setOpened] = useState<InventoryItem | null>(null);
  const held = inventoryItems(save);
  const shown = filter ? held.filter((item) => purposesOf(item.ref).includes(filter)) : held;
  // Weakness items are listed with the other base items.
  const ownedConsumables = Object.entries(save.consumables).filter(([id, count]) => {
    const item = itemById[id];
    return count > 0 && !(item.slot === 'consumable' && item.weakness);
  });

  /** Rare, Legendary and infused pieces ask first, showing what comes back. */
  const confirmSalvage = (gear: GearInstance) => {
    if (!salvageNeedsConfirmation(gear)) return salvage(gear.uid);
    const returns = salvageReturns(gear)
      .map(({ materialId, amount }) => `${amount} ${tr(materialById[materialId].name).toLowerCase()}`)
      .join(', ');
    Alert.alert(t('inventory.salvageTitle', { item: gearName(gear) }), t('inventory.salvageBody', { returns }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('inventory.salvage'), style: 'destructive', onPress: () => salvage(gear.uid) },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TutorialHint screen="inventory" />
      <Row emoji="🪙" title={t('common.gold')} right={save.gold} />

      <StepChests />

      <SectionTitle>{t('inventory.expeditionFinds')}</SectionTitle>
      <Row
        emoji="🎟️"
        title={t('inventory.sigils')}
        subtitle={save.sigils.length ? t('inventory.sigilsHint') : t('inventory.sigilsEmpty')}
        right={sigilTiers.map((t) => `T${t}×${save.sigils.filter((s) => s === t).length}`).join(' ') || '0'}
      />
      {maps.map((map) => (
        <Row
          key={map.id}
          emoji="🗺️"
          title={t('inventory.treasureMap', { rarity: t(`expeditions.rarity.${map.rarity}`), tier: map.tier })}
          badge={purposeBadge({ kind: 'treasureMap' })}
          subtitle={t('inventory.expiresIn', {
            state: map.location ? t('inventory.marked') : t('inventory.notRead'),
            hours: Math.ceil((map.expiresAt - now) / HOUR),
          })}
          right={
            map.location ? undefined : (
              <Button title={t('inventory.read')} disabled={!position} onPress={() => position && readMap(map.id, position)} />
            )
          }
        />
      ))}
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
            onPress={() => position && activateLure(position)}
          />
        }
      />
      <Row emoji="⛏️" title={t('inventory.ruins')} subtitle={t('places.digProgress', { dots: ruinsDots(save.ruinsProgress) })} />

      <SectionTitle>{t('inventory.items')}</SectionTitle>
      <View style={styles.chips}>
        {[null, ...PURPOSES].map((purpose) => (
          <Pressable
            key={purpose ?? 'all'}
            onPress={() => setFilter(purpose)}
            style={[styles.chip, filter === purpose && styles.chipOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === purpose }}
          >
            <Text>{purpose ? `${purposeInfo[purpose].icon} ${tr(purposeInfo[purpose].name)}` : t('inventory.filterAll')}</Text>
          </Pressable>
        ))}
      </View>
      {shown.length === 0 && <Text style={styles.empty}>{t('inventory.noMaterials')}</Text>}
      {shown.map((item) => (
        <Row
          key={item.key}
          emoji={item.emoji}
          icon={item.ref.kind === 'material' ? materialById[item.ref.id]?.icon : undefined}
          title={item.name}
          right={item.count}
          badge={purposeBadge(item.ref)}
          onPress={() => setOpened(item)}
        />
      ))}
      {opened && <ItemSheet item={opened} save={save} onClose={() => setOpened(null)} />}

      <SectionTitle>{t('inventory.tools')}</SectionTitle>
      {save.tools.length === 0 && <Text style={styles.empty}>{t('inventory.noTools')}</Text>}
      {save.tools.map((toolId) => (
        <Row key={toolId} emoji={itemById[toolId].emoji} icon={itemById[toolId].icon} title={tr(itemById[toolId].name)} />
      ))}

      <SectionTitle>{t('inventory.gear')}</SectionTitle>
      {save.gear.length === 0 && <Text style={styles.empty}>{t('inventory.noGear')}</Text>}
      {save.gear.map((gear) => {
        const holder = wornBy(save, gear.uid);
        return (
          <GearRow
            key={gear.uid}
            gear={gear}
            note={holder ? t('common.wornBy', { name: holder.name }) : null}
            right={<Button title={t('inventory.salvage')} disabled={!canSalvage(save, gear.uid)} onPress={() => confirmSalvage(gear)} />}
          />
        );
      })}
      {save.gear.length > 0 && (
        <Text style={styles.empty}>{t('inventory.salvageHint')}</Text>
      )}

      <SectionTitle>{t('inventory.consumables')}</SectionTitle>
      {ownedConsumables.length === 0 && <Text style={styles.empty}>{t('inventory.noConsumables')}</Text>}
      {ownedConsumables.map(([itemId, count]) => (
        <Row key={itemId} emoji={itemById[itemId].emoji} icon={itemById[itemId].icon} title={tr(itemById[itemId].name)} right={count} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  empty: { color: colors.muted, paddingVertical: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingVertical: 6 },
  chip: { paddingHorizontal: 8, paddingVertical: 2, borderWidth: 2, borderColor: colors.parchmentDark },
  chipOn: { borderColor: colors.ink, backgroundColor: colors.parchmentDark },
});
