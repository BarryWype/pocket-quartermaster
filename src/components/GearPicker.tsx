import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { gearTypeNames } from '@/content/equipment';
import { familyById } from '@/content/families';
import { rarityNames } from '@/content/gear';
import { gearName } from '@/content/lookup';
import { gearChoices, shortFamilies, type GearChoice, type GearSlot, type SocketGroup } from '@/game/expeditions/party';
import { gearFamilyTags } from '@/game/families/families';
import { gearIconOf } from '@/game/gear/gearIcon';
import type { SaveData } from '@/game/save';
import { affinityOf, equipPreview } from '@/game/team/team';
import { useOdds, type OddsJob } from '@/hooks/useOdds';
import { t, tr } from '@/i18n';
import { fonts, ui } from '@/theme';

import { DELTA_KEYS } from './EquipPicker';
import { GameIcon } from './GameIcon';
import { Overlay } from './Overlay';
import { OddsChange } from './PartyOdds';
import { lightsLine, stillNeeded } from './partyText';
import { Text } from './Text';
import { EmberButton, ItemSlot, ParchmentCard } from './ui';

type Props = {
  save: SaveData;
  party: string[];
  heroId: string;
  slot: GearSlot;
  groups: SocketGroup[];
  oddsOf: (save: SaveData, heroIds: string[]) => OddsJob;
  /** The party's odds now, for "before → after". */
  chance: number | null | undefined;
  /** Equips the piece: for good, taking it from another hero if needed. */
  onPick: (gearUid: string) => void;
  onClose: () => void;
};

const COLUMNS = 5;
const GAP = 10;

/** "Magic +2 · Armour −3": the hero's stat changes with the piece on. */
function statLine(save: SaveData, heroId: string, slot: GearSlot, choice: GearChoice): string {
  if (choice.worn || choice.blocked) return '';
  const preview = equipPreview(save, heroId, slot, choice.gear.uid);
  if (!preview) return '';
  return DELTA_KEYS.flatMap((key) => {
    const delta = Math.round(preview.after[key] - preview.before[key]);
    return delta ? [`${t(`hero.statNames.${key}`)} ${delta > 0 ? '+' : '−'}${Math.abs(delta)}`] : [];
  }).join(' · ');
}

/**
 * The gear picker for one hero's slot: the owned pieces as a grid (▲ lights a
 * need, "worn" on the current one, another hero's piece dimmed with their
 * name), then the picked piece's card: what it lights, stat and family
 * changes, and the odds before → after.
 */
export function GearPicker({ save, party, heroId, slot, groups, oddsOf, chance, onPick, onClose }: Props) {
  const hero = save.heroes.find((h) => h.id === heroId)!;
  const short = useMemo(() => shortFamilies(groups), [groups]);
  const choices = useMemo(() => gearChoices(save, party, heroId, slot, short), [save, party, heroId, slot, short]);
  const [selected, setSelected] = useState<string | null>(() => (choices.find((c) => !c.worn && !c.blocked) ?? choices[0])?.gear.uid ?? null);
  const choice = choices.find((c) => c.gear.uid === selected) ?? null;
  const job = useMemo(() => (choice?.after ? oddsOf(choice.after, party) : null), [choice, oddsOf, party]);
  const after = useOdds(job);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const size = Math.floor((width - 28 - GAP * (COLUMNS - 1)) / COLUMNS) - 4;
  const worn = choices.find((c) => c.worn);
  const sub = stillNeeded(groups);
  const stats = choice ? statLine(save, heroId, slot, choice) : '';
  const lights = choice ? lightsLine(choice, groups) : '';
  const affinity = choice ? affinityOf(hero.classId, choice.item.gearType) : null;

  return (
    <Overlay onClose={onClose} position="bottom">
      <View style={[styles.sheet, { height: height - insets.top - 96, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            {worn && <GameIcon emoji={worn.item.emoji} icon={gearIconOf(worn.gear)} size={34} />}
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>{`${hero.name} · ${t(`hero.slots.${slot}`)}`}</Text>
            {sub && <Text style={styles.sub}>{sub}</Text>}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
          <Text style={styles.cap}>{t(`partyDialog.yours.${slot}`)}</Text>
          {choices.length === 0 && <Text style={styles.empty}>{t('equip.empty')}</Text>}
          <View style={styles.grid}>
            {choices.map((c) => {
              const tag = c.worn ? t('partyDialog.worn') : c.holder ? c.holder.name : null;
              const label = [
                gearName(c.gear),
                ...gearFamilyTags(c.item, c.gear.relicId).map((f) => tr(familyById[f.family].name)),
                c.lights.length > 0 ? t('partyDialog.coversNeed') : null,
                c.worn ? t('partyDialog.wornNow') : c.holder ? t('partyDialog.wornBy', { name: c.holder.name }) : null,
                selected === c.gear.uid ? t('partyDialog.selected') : null,
              ]
                .filter(Boolean)
                .join(', ');
              return (
                <View key={c.gear.uid} style={(c.holder || c.unfit) && !c.worn ? styles.dim : undefined}>
                  <ItemSlot
                    state={selected === c.gear.uid ? 'selected' : 'ready'}
                    emoji={c.item.emoji}
                    icon={gearIconOf(c.gear)}
                    legendary={c.gear.rarity === 'legendary'}
                    mark={c.lights.length > 0 ? 'up' : undefined}
                    families={gearFamilyTags(c.item, c.gear.relicId)}
                    size={size}
                    onPress={() => setSelected(c.gear.uid)}
                    accessibilityLabel={label}
                    style={c.worn ? styles.worn : undefined}
                  />
                  {tag && (
                    <Text style={styles.tagline} numberOfLines={1} pointerEvents="none">
                      {tag}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
          {short.length > 0 && <Text style={styles.footnote}>{t('partyDialog.legend')}</Text>}
          {choice && (
            <ParchmentCard
              title={gearName(choice.gear)}
              titleEmoji={choice.item.emoji}
              titleIcon={gearIconOf(choice.gear)}
              titleIconLegendary={choice.gear.rarity === 'legendary'}
              titleSub={[
                tr(rarityNames[choice.gear.rarity]),
                choice.item.gearType ? tr(gearTypeNames[choice.item.gearType].name) : null,
                choice.blocked ? t('partyDialog.cannot', { name: hero.name }) : t(`partyDialog.affinity.${affinity ?? 'usable'}`, { name: hero.name }),
              ]
                .filter(Boolean)
                .join(' · ')}
              contentStyle={styles.card}
            >
              {lights !== '' && (
                <View style={styles.lightsRow}>
                  {choice.lights[0] && (
                    <View style={styles.lightsIcon}>
                      <GameIcon emoji={familyById[choice.lights[0]].emoji} icon={familyById[choice.lights[0]].icon} size={20} />
                    </View>
                  )}
                  <Text style={[styles.lights, choice.lights.length > 0 && styles.good]}>{lights}</Text>
                </View>
              )}
              {stats !== '' && <Text style={styles.line}>{stats}</Text>}
              {choice.holder && !choice.worn && <Text style={styles.line}>{t('partyDialog.takesFrom', { name: choice.holder.name })}</Text>}
              {!choice.worn && !choice.blocked && <OddsChange before={chance} after={after} />}
            </ParchmentCard>
          )}
        </ScrollView>
        <View style={styles.footer}>
          <EmberButton
            title={choice?.worn ? t('partyDialog.wornNow') : t('partyDialog.equipOn', { name: hero.name })}
            disabled={!choice || choice.worn || choice.blocked}
            onPress={() => choice && onPick(choice.gear.uid)}
          />
        </View>
      </View>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: ui.woodDark, borderTopWidth: 3, borderTopColor: ui.outline },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: ui.woodMid,
    borderBottomWidth: 3,
    borderBottomColor: ui.outline,
  },
  headerIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: ui.woodDeep, borderWidth: 2, borderColor: ui.brass },
  headerText: { flex: 1 },
  title: { fontFamily: fonts.body, fontSize: 23, lineHeight: 25, color: ui.brassLight },
  sub: { fontFamily: fonts.serif, fontSize: 14, color: ui.onWoodMuted },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 20, color: ui.brassLight },
  scroll: { flex: 1 },
  body: { padding: 14, gap: 12 },
  cap: { fontFamily: fonts.body, fontSize: 17, letterSpacing: 1, color: ui.onWoodMuted },
  empty: { fontFamily: fonts.serif, fontSize: 14, color: ui.onWoodMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  dim: { opacity: 0.55 },
  worn: { borderColor: ui.brass },
  tagline: {
    position: 'absolute',
    top: 5,
    left: 2,
    right: 2,
    textAlign: 'center',
    fontFamily: fonts.body,
    fontSize: 12,
    color: ui.brassLight,
    textShadowColor: ui.outline,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
  footnote: { fontFamily: fonts.serif, fontSize: 14, color: ui.onWoodMuted },
  card: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  lightsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lightsIcon: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: ui.woodDeep, borderWidth: 2, borderColor: ui.brass },
  lights: { flex: 1, fontFamily: fonts.serifBold, fontSize: 15, color: ui.inkMuted },
  good: { color: ui.good },
  line: { fontFamily: fonts.serif, fontSize: 15, color: ui.inkMuted },
  footer: { padding: 12, backgroundColor: ui.woodMid, borderTopWidth: 3, borderTopColor: ui.outline },
});
