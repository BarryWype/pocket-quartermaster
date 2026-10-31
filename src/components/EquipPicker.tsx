import type { ReactNode } from 'react';
import { Pressable, StyleSheet, type ImageSourcePropType } from 'react-native';

import { qualities } from '@/content/forging';
import { gearName, itemById } from '@/content/lookup';
import { slotProblem } from '@/game/equipment/slots';
import { affinityOf, equipPreview, healingPotion } from '@/game/team/team';
import { kitAnswers } from '@/game/threats/coverage';
import type { SaveData } from '@/game/save';
import type { Briefing, EquipmentSlot, GearDef, StatKey, Stats } from '@/game/types';
import { t, tr } from '@/i18n';
import { colors } from '@/theme';

import { Button } from './Button';
import { GearMarks } from './GearMarks';
import { Overlay } from './Overlay';
import { Sheet } from './Sheet';
import { Row } from './Row';
import { Text } from './Text';
import { gearEffectParts, statIcons, trinketParts } from './GearRow';
import { PartsLine, type LabelPart } from './IconLabel';

type Props = {
  save: SaveData;
  heroId: string;
  slot: EquipmentSlot;
  /** With a briefing, consumables that answer today's threats or opportunity come first, marked. */
  briefing?: Briefing;
  /** The dungeon's boss: its weakness item comes first, marked. */
  bossId?: string;
  onPick: (id: string | null) => void;
  onClose: () => void;
};

type Option = {
  id: string;
  emoji: string;
  icon?: ImageSourcePropType;
  title: string;
  subtitle?: ReactNode;
  color?: string;
  disabled?: boolean;
  marks?: ReactNode;
};

const DELTA_KEYS: (keyof Stats)[] = ['hp', 'power', 'magic', 'armour', 'resistance', 'evasion', 'speed', 'crit', 'luck'];

function optionsFor(save: SaveData, heroId: string, slot: EquipmentSlot, briefing?: Briefing, bossId?: string): Option[] {
  if (slot === 'consumable' || slot === 'potion') {
    // Potions, elixirs and charms; food and kits are for the whole party. The Alchemist's second slot takes healing potions only.
    return Object.entries(save.consumables)
      .filter(([itemId, count]) => count > 0 && itemById[itemId]?.slot === 'consumable' && (slot === 'consumable' || healingPotion(itemId)))
      .map(([itemId, count]) => {
        const item = itemById[itemId];
        const answers = briefing ? kitAnswers(itemId, briefing) : false;
        const weakens = item.slot === 'consumable' && bossId !== undefined && item.weakness === bossId;
        return {
          id: itemId,
          emoji: item.emoji,
          icon: item.icon,
          title: tr(item.name),
          subtitle: [
            t('equip.inStock', { count }),
            answers ? t('equip.answersToday') : null,
            weakens ? t('equip.weakensBoss') : null,
            item.description ? tr(item.description) : null,
          ]
            .filter(Boolean)
            .join(' · '),
          color: answers || weakens ? colors.success : undefined,
        };
      })
      // Kits and salves that answer the briefing, and the boss's weakness item, come first.
      .sort((a, b) => Number(b.color !== undefined) - Number(a.color !== undefined));
  }
  const hero = save.heroes.find((h) => h.id === heroId);
  if (!hero) return [];
  const offhandGear = hero.equipment.offhand ? save.gear.find((g) => g.uid === hero.equipment.offhand) : undefined;

  return save.gear
    .flatMap((gear) => {
      const item = itemById[gear.itemId] as GearDef;
      if (item.slot !== slot) return [];
      const holder = save.heroes.find((h) => h.id !== heroId && h.equipment[slot] === gear.uid);
      const away = holder && save.expeditions.some((e) => e.heroIds.includes(holder.id));
      if (away) return [];
      const problem = slot !== 'weapon' ? slotProblem(save, hero, slot, gear) : null;
      const preview = problem ? null : equipPreview(save, heroId, slot, gear.uid);
      // A weapon change can strand the off-hand (a two-handed one always does).
      let unequipsOffhand = false;
      if (item.slot === 'weapon' && offhandGear) {
        const withWeapon = { ...hero, equipment: { ...hero.equipment, weapon: gear.uid } };
        unequipsOffhand = !!slotProblem(
          { ...save, heroes: save.heroes.map((h) => (h.id === heroId ? withWeapon : h)) },
          withWeapon,
          'offhand',
          offhandGear,
        );
      }
      return [{ gear, item, holder, problem, preview, unequipsOffhand }];
    })
    .sort((a, b) => {
      const greyedDiff = Number(a.problem !== null || a.preview === null) - Number(b.problem !== null || b.preview === null);
      if (greyedDiff) return greyedDiff;
      return gainOf(b) - gainOf(a);
    })
    .map(({ gear, item, holder, problem, preview, unequipsOffhand }) => {
      const greyed = problem !== null || preview === null;
      const parts: LabelPart[] = greyed
        ? problem
          ? [t(`equip.problem.${problem}`)]
          : []
        : [
            ...(item.slot === 'trinket' ? trinketParts(gear) : deltaParts(preview!)),
            ...gearEffectParts(gear),
            unequipsOffhand ? t('equip.unequipsOffhand') : null,
            holder ? t('equip.usedBy', { name: holder.name }) : null,
          ].filter((part): part is LabelPart => part !== null);
      return {
        id: gear.uid,
        emoji: item.emoji,
        icon: item.icon,
        title: gearName(gear),
        subtitle: parts.length > 0 ? <PartsLine parts={parts} labelStyle={styles.subtitle} /> : undefined,
        color: greyed ? colors.muted : qualities[gear.quality].color,
        disabled: greyed,
        marks: <GearMarks tier={item.tier} affinity={affinityOf(hero.classId, item.gearType)} />,
      };
    });
}

/** The main stat the piece would gain the hero: its damage stat, or armour and resistance. */
function gainOf({ item, preview }: { item: GearDef; preview: { before: Stats; after: Stats } | null }): number {
  if (!preview) return 0;
  const delta = (key: StatKey) => preview.after[key] - preview.before[key];
  if (item.slot === 'weapon') return delta(item.damageStat ?? 'power');
  if (item.slot === 'armor' || item.slot === 'offhand') return delta('armour') + delta('resistance');
  return 0;
}

/** "+3 ⚔️ −1 💨": the non-zero stat changes equipping the piece would make. */
function deltaParts({ before, after }: { before: Stats; after: Stats }): LabelPart[] {
  return DELTA_KEYS.flatMap((key) => {
    const delta = after[key] - before[key];
    return delta ? [{ emoji: statIcons[key], text: `${delta > 0 ? '+' : '−'}${Math.abs(delta)}` }] : [];
  });
}

export function EquipPicker({ save, heroId, slot, briefing, bossId, onPick, onClose }: Props) {
  const options = optionsFor(save, heroId, slot, briefing, bossId);

  return (
    <Overlay onClose={onClose} position="bottom">
      <Sheet title={t(`equip.choose.${slot}`)} bodyStyle={styles.body} footer={<Button title={t('common.cancel')} onPress={onClose} />}>
        <Pressable onPress={() => onPick(null)}>
          <Row emoji="🚫" title={t('equip.nothing')} />
        </Pressable>
        {options.map((option) => (
          <Pressable key={option.id} disabled={option.disabled} onPress={() => onPick(option.id)}>
            <Row
              emoji={option.emoji}
              icon={option.icon}
              title={option.title}
              subtitle={option.subtitle}
              titleColor={option.color}
              right={option.marks}
            />
          </Pressable>
        ))}
        {options.length === 0 && <Text style={styles.empty}>{t('equip.empty')}</Text>}
      </Sheet>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  body: { gap: 4 },
  empty: { color: colors.muted, paddingVertical: 8 },
  subtitle: { fontSize: 17, color: colors.muted },
});
