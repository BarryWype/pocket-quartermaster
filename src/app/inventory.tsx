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
import { isLureActive, lureEndsAt } from '@/game/rewards/lures';
import { liveTreasureMaps } from '@/game/rewards/treasure';
import { usePlayerLocation } from '@/hooks/usePlayerLocation';
import type { GearInstance } from '@/game/types';
import { useGameStore } from '@/store/gameStore';

const HOUR = 3_600_000;

export default function InventoryScreen() {
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
      .map(({ materialId, amount }) => `${amount} ${materialById[materialId].name.toLowerCase()}`)
      .join(', ');
    Alert.alert(`Salvage ${gearName(gear)}?`, `It is destroyed and you get back ${returns}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Salvage', style: 'destructive', onPress: () => salvage(gear.uid) },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TutorialHint screen="inventory" />
      <Row emoji="🪙" title="Gold" right={save.gold} />

      <StepChests />

      <SectionTitle>Expedition finds</SectionTitle>
      <Row
        emoji="🎟️"
        title="Sanctum Sigils"
        subtitle={save.sigils.length ? 'Tap a Sanctum on the map to use one.' : 'Successful expeditions sometimes bring one back.'}
        right={sigilTiers.map((t) => `T${t}×${save.sigils.filter((s) => s === t).length}`).join(' ') || '0'}
      />
      {maps.map((map) => (
        <Row
          key={map.id}
          emoji="🗺️"
          title={`Treasure map (tier ${map.tier})`}
          subtitle={`${map.location ? 'Marked on your map' : 'Not read yet'} · expires in ${Math.ceil((map.expiresAt - now) / HOUR)} h`}
          right={
            map.location ? undefined : (
              <Button title="Read" disabled={!position} onPress={() => position && readMap(map.id, position)} />
            )
          }
        />
      ))}
      <Row
        emoji="🪤"
        title={`Lures: ${save.lures}`}
        subtitle={
          isLureActive(save, now)
            ? `Active: ${Math.ceil((lureEndsAt(save) - now) / 60_000)} min left`
            : 'Draws extra herbs and animals around you for 30 minutes.'
        }
        right={
          <Button
            title="Activate"
            disabled={!position || save.lures === 0 || isLureActive(save, now)}
            onPress={() => position && activateLure(position)}
          />
        }
      />

      <SectionTitle>Materials</SectionTitle>
      {ownedMaterials.length === 0 && <Text style={styles.empty}>Walk around to gather materials.</Text>}
      {ownedMaterials.map((m) => (
        <Row key={m.id} emoji={m.emoji} icon={m.icon} title={m.name} right={save.materials[m.id]} />
      ))}

      <SectionTitle>Tools</SectionTitle>
      {save.tools.length === 0 && <Text style={styles.empty}>Craft a pickaxe at the forge.</Text>}
      {save.tools.map((toolId) => (
        <Row key={toolId} emoji={itemById[toolId].emoji} icon={itemById[toolId].icon} title={itemById[toolId].name} />
      ))}

      <SectionTitle>Gear</SectionTitle>
      {save.gear.length === 0 && <Text style={styles.empty}>Forge weapons and armor at the forge.</Text>}
      {save.gear.map((gear) => {
        const holder = wornBy(save, gear.uid);
        return (
          <GearRow
            key={gear.uid}
            gear={gear}
            note={holder ? `Worn by ${holder.name}` : null}
            right={<Button title="Salvage" disabled={!canSalvage(save, gear.uid)} onPress={() => confirmSalvage(gear)} />}
          />
        );
      })}
      {save.gear.length > 0 && (
        <Text style={styles.empty}>Salvage gives back part of the materials: more for better quality. Take gear off first.</Text>
      )}

      <SectionTitle>Consumables</SectionTitle>
      {ownedConsumables.length === 0 && <Text style={styles.empty}>Brew potions and rations with alchemy.</Text>}
      {ownedConsumables.map(([itemId, count]) => (
        <Row key={itemId} emoji={itemById[itemId].emoji} icon={itemById[itemId].icon} title={itemById[itemId].name} right={count} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  empty: { color: '#666', paddingVertical: 8 },
});
