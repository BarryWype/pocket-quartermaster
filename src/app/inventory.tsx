import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/Button';
import { GearRow } from '@/components/GearRow';
import { Row, SectionTitle } from '@/components/Row';
import { StepChests } from '@/components/StepChests';
import { Text } from '@/components/Text';
import { TutorialHint } from '@/components/TutorialHint';
import { gearName, itemById, materialById } from '@/content/lookup';
import { materials } from '@/content/materials';
import { canSalvage, salvageNeedsConfirmation, salvageReturns, wornBy } from '@/game/forging/salvage';
import { ruinsDots } from '@/game/places/ruins';
import { isLureActive, lureEndsAt } from '@/game/rewards/lures';
import { liveTreasureMaps } from '@/game/rewards/treasure';
import { useLanguage } from '@/hooks/useLanguage';
import { usePlayerLocation } from '@/hooks/usePlayerLocation';
import { t, tr } from '@/i18n';
import type { GearInstance } from '@/game/types';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

const HOUR = 3_600_000;

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
  const ownedMaterials = materials.filter((m) => (save.materials[m.id] ?? 0) > 0);
  const ownedConsumables = Object.entries(save.consumables).filter(([, count]) => count > 0);

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
          title={t('inventory.treasureMap', { tier: map.tier })}
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
      <Row
        emoji="🗝️"
        title={t('inventory.keyFragments')}
        subtitle={t('places.digProgress', { dots: ruinsDots(save.ruinsProgress) })}
        right={save.keyFragments}
      />

      <SectionTitle>{t('inventory.materials')}</SectionTitle>
      {ownedMaterials.length === 0 && <Text style={styles.empty}>{t('inventory.noMaterials')}</Text>}
      {ownedMaterials.map((m) => (
        <Row key={m.id} emoji={m.emoji} icon={m.icon} title={tr(m.name)} right={save.materials[m.id]} />
      ))}

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
});
