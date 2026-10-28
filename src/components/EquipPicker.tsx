import { Modal, Pressable, ScrollView, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { heroClasses } from '@/content/heroes';
import { qualities } from '@/content/forging';
import { gearName, itemById } from '@/content/lookup';
import { gearStats } from '@/game/forging/quality';
import { rollToScale } from '@/game/forging/roll';
import { canWield } from '@/game/team/team';
import type { SaveData } from '@/game/save';
import type { EquipmentSlot } from '@/game/types';
import { t, tr } from '@/i18n';
import { colors, pixel } from '@/theme';

import { Button } from './Button';
import { Row } from './Row';
import { Text } from './Text';

type Props = {
  save: SaveData;
  heroId: string;
  slot: EquipmentSlot;
  onPick: (id: string | null) => void;
  onClose: () => void;
};

type Option = { id: string; emoji: string; icon?: ImageSourcePropType; title: string; subtitle?: string; color?: string };

function optionsFor(save: SaveData, heroId: string, slot: EquipmentSlot): Option[] {
  if (slot === 'consumable') {
    // Potions, elixirs and charms; food and kits are for the whole party.
    return Object.entries(save.consumables)
      .filter(([itemId, count]) => count > 0 && itemById[itemId]?.slot === 'consumable')
      .map(([itemId, count]) => {
        const item = itemById[itemId];
        return {
          id: itemId,
          emoji: item.emoji,
          icon: item.icon,
          title: tr(item.name),
          subtitle: [t('equip.inStock', { count }), item.description ? tr(item.description) : null].filter(Boolean).join(' · '),
        };
      });
  }
  const hero = save.heroes.find((h) => h.id === heroId);
  const affinities = hero ? heroClasses[hero.classId].affinities : {};
  return save.gear
    .flatMap((gear) => {
      const item = itemById[gear.itemId];
      if (item.slot !== slot || (item.slot !== 'weapon' && item.slot !== 'armor')) return [];
      if (hero && !canWield(hero, item)) return [];
      const holder = save.heroes.find((h) => h.id !== heroId && h.equipment[slot] === gear.uid);
      const away = holder && save.expeditions.some((e) => e.heroIds.includes(holder.id));
      if (away) return [];
      // The main stat this hero would actually get: attack or magic with class affinity, or defense.
      const stats = gearStats(item, gear);
      const affinity = item.weaponType ? (affinities[item.weaponType] ?? 1) : 1;
      const power = item.slot === 'weapon' ? ((stats.attack ?? 0) + (stats.magic ?? 0)) * affinity : (stats.defense ?? 0);
      return [{ gear, item, holder, power }];
    })
    .sort((a, b) => b.power - a.power)
    .map(({ gear, item, holder, power }) => ({
      id: gear.uid,
      emoji: item.emoji,
      icon: item.icon,
      title: gearName(gear),
      subtitle: `${item.slot === 'weapon' ? '⚔️' : '🛡️'} ${Math.round(power)} · ${t('gear.roll', { roll: rollToScale(gear.roll ?? 1), max: 7 })}${holder ? t('equip.usedBy', { name: holder.name }) : ''}`,
      color: qualities[gear.quality].color,
    }));
}

export function EquipPicker({ save, heroId, slot, onPick, onClose }: Props) {
  const options = optionsFor(save, heroId, slot);

  return (
    <Modal animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t(`equip.choose.${slot}`)}</Text>
          <ScrollView>
            <Pressable onPress={() => onPick(null)}>
              <Row emoji="🚫" title={t('equip.nothing')} />
            </Pressable>
            {options.map((option) => (
              <Pressable key={option.id} onPress={() => onPick(option.id)}>
                <Row
                  emoji={option.emoji}
                  icon={option.icon}
                  title={option.title}
                  subtitle={option.subtitle}
                  titleColor={option.color}
                />
              </Pressable>
            ))}
            {options.length === 0 && <Text style={styles.empty}>{t('equip.empty')}</Text>}
          </ScrollView>
          <Button title={t('common.cancel')} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.parchment,
    borderTopWidth: pixel.outline + 1,
    borderColor: colors.ink,
    padding: 16,
    maxHeight: '70%',
    gap: 8,
  },
  title: { fontSize: 22 },
  empty: { color: colors.muted, paddingVertical: 8 },
});
