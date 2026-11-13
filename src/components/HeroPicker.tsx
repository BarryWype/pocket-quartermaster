import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { PressScale } from '@/components/motion';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { familyById } from '@/content/families';
import { heroClasses } from '@/content/heroes';
import { gearName, itemById } from '@/content/lookup';
import { GEAR_SLOTS, heroChoices, shortFamilies, type GearSlot, type HeroChoice, type SocketGroup } from '@/game/expeditions/party';
import { gearFamilyTags } from '@/game/families/families';
import { gearIconOf } from '@/game/gear/gearIcon';
import type { SaveData } from '@/game/save';
import { currentHp, maxHp } from '@/game/team/health';
import type { GearDef, GearInstance, HeroState } from '@/game/types';
import { useOdds, type OddsJob } from '@/hooks/useOdds';
import { formatDuration, t, tr } from '@/i18n';
import { fonts, ui } from '@/theme';

import { GameIcon } from './GameIcon';
import { GearCard } from './GearDetails';
import { Overlay } from './Overlay';
import { OddsChange } from './PartyOdds';
import { lightsLine, stillNeeded } from './partyText';
import { Text } from './Text';
import { AnchoredPopup, EmberButton, ItemSlot, ParchmentCard, type PopupAnchor } from './ui';

type Props = {
  save: SaveData;
  party: string[];
  groups: SocketGroup[];
  /** Which hero this is: 1 to 3, for the title. */
  ordinal: number;
  now: number;
  oddsOf: (save: SaveData, heroIds: string[]) => OddsJob;
  /** The party's odds now, for "before → after". */
  chance: number | null | undefined;
  onPick: (heroId: string) => void;
  onClose: () => void;
};

const ORDINALS = ['first', 'second', 'third'] as const;

const statusText = (choice: HeroChoice) =>
  choice.status.kind === 'hurt'
    ? t('partyDialog.hurt', { time: formatDuration(choice.status.ms) })
    : choice.status.kind === 'out'
      ? t('partyDialog.out', { time: formatDuration(choice.status.ms) })
      : null;

/** The hero picker: a portrait grid (▲ lights a need; busy or hurt heroes greyed), then the picked hero's card and odds. */
export function HeroPicker({ save, party, groups, ordinal, now, oddsOf, chance, onPick, onClose }: Props) {
  const short = useMemo(() => shortFamilies(groups), [groups]);
  const choices = useMemo(() => heroChoices(save, party, short, now), [save, party, short, now]);
  const [selected, setSelected] = useState<string | null>(() => choices.find((c) => c.status.kind === 'free' || c.status.kind === 'working')?.hero.id ?? null);
  const choice = choices.find((c) => c.hero.id === selected) ?? null;
  const [openGear, setOpenGear] = useState<{ gear: GearInstance; slot: GearSlot; anchor: PopupAnchor } | null>(null);
  const job = useMemo(() => (choice ? oddsOf(save, [...party, choice.hero.id]) : null), [choice, oddsOf, save, party]);
  const after = useOdds(job);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sub = stillNeeded(groups);

  return (
    <Overlay onClose={onClose} position="bottom">
      <View style={[styles.sheet, { height: height - insets.top - 96, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{t(`partyDialog.ordinal.${ORDINALS[Math.min(3, ordinal) - 1]}`)}</Text>
            {sub && <Text style={styles.sub}>{sub}</Text>}
          </View>
          <PressScale accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>✕</Text>
          </PressScale>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
          <Text style={styles.cap}>{t('partyDialog.yourHeroes')}</Text>
          {choices.length === 0 && <Text style={styles.empty}>{t('partyDialog.noHeroes')}</Text>}
          <View style={styles.grid}>
            {choices.map((c) => {
              const heroClass = heroClasses[c.hero.classId];
              const status = statusText(c);
              const free = status === null;
              return (
                <PressScale
                  key={c.hero.id}
                  accessibilityRole="button"
                  accessibilityLabel={[c.hero.name, tr(heroClass.name), c.lights.length > 0 ? t('partyDialog.coversNeed') : null, status].filter(Boolean).join(', ')}
                  accessibilityState={{ disabled: !free, selected: selected === c.hero.id }}
                  disabled={!free}
                  onPress={() => setSelected(c.hero.id)}
                  style={styles.hero}
                >
                  <View style={!free && styles.busy}>
                    <ItemSlot
                      state={selected === c.hero.id ? 'selected' : 'ready'}
                      emoji={heroClass.emoji}
                      icon={heroClass.icon}
                      size={64}
                      mark={c.lights.length > 0 ? 'up' : undefined}
                      families={[{ family: heroClass.familyTag, count: 1 }]}
                      accessibilityLabel={c.hero.name}
                    />
                  </View>
                  {status && <Text style={styles.state}>{status}</Text>}
                  <Text style={styles.heroName} numberOfLines={1}>
                    {c.hero.name}
                  </Text>
                </PressScale>
              );
            })}
          </View>
          {choice && (
            <ParchmentCard
              title={choice.hero.name}
              titleEmoji={heroClasses[choice.hero.classId].emoji}
              titleIcon={heroClasses[choice.hero.classId].icon}
              titleSub={t('partyDialog.heroSub', {
                className: tr(heroClasses[choice.hero.classId].name),
                level: choice.hero.level,
                hp: Math.floor(currentHp(save, choice.hero, now)),
                max: maxHp(save, choice.hero),
              })}
              contentStyle={styles.card}
            >
              <View style={styles.minis}>
                <ItemSlot
                  state="ready"
                  emoji={heroClasses[choice.hero.classId].emoji}
                  icon={heroClasses[choice.hero.classId].icon}
                  size={40}
                  families={[{ family: heroClasses[choice.hero.classId].familyTag, count: 1 }]}
                  accessibilityLabel={tr(heroClasses[choice.hero.classId].name)}
                />
                {GEAR_SLOTS.map((slot) => (
                  <MiniGear key={slot} save={save} hero={choice.hero} slot={slot} onOpen={(gear, anchor) => setOpenGear({ gear, slot, anchor })} />
                ))}
              </View>
              {(choice.lights.length > 0 || choice.changes.length > 0) && (
                <View style={styles.lightsRow}>
                  {choice.lights[0] && (
                    <View style={styles.lightsIcon}>
                      <GameIcon emoji={familyById[choice.lights[0]].emoji} icon={familyById[choice.lights[0]].icon} size={20} />
                    </View>
                  )}
                  <Text style={[styles.lights, choice.lights.length > 0 && styles.good]}>{lightsLine(choice, groups)}</Text>
                </View>
              )}
              <OddsChange before={chance} after={after} />
            </ParchmentCard>
          )}
        </ScrollView>
        <View style={styles.footer}>
          <EmberButton
            title={choice ? t('partyDialog.add', { name: choice.hero.name }) : t('partyDialog.addHero')}
            disabled={!choice}
            onPress={() => choice && onPick(choice.hero.id)}
          />
        </View>
      </View>
      {openGear && choice && (
        <AnchoredPopup
          anchor={openGear.anchor}
          onClose={() => setOpenGear(null)}
          render={(pointer) => <GearCard gear={openGear.gear} compare={{ save, heroId: choice.hero.id, slot: openGear.slot }} pointer={pointer} />}
        />
      )}
    </Overlay>
  );
}

/** One of the picked hero's gear slots, small, with its family gems; tapping a piece opens its card. */
function MiniGear({
  save,
  hero,
  slot,
  onOpen,
}: {
  save: SaveData;
  hero: HeroState;
  slot: GearSlot;
  onOpen: (gear: GearInstance, anchor: PopupAnchor) => void;
}) {
  const wrapper = useRef<ComponentRef<typeof View>>(null);
  const uid = hero.equipment[slot];
  const gear = uid ? save.gear.find((g) => g.uid === uid) : undefined;
  const item = gear ? (itemById[gear.itemId] as GearDef) : undefined;
  return (
    <View ref={wrapper} collapsable={false}>
      <ItemSlot
        state={gear ? 'ready' : 'empty'}
        emoji={item?.emoji}
        icon={gear ? gearIconOf(gear) : undefined}
        size={40}
        families={item ? gearFamilyTags(item, gear?.relicId) : undefined}
        accessibilityLabel={`${t(`hero.slots.${slot}`)}: ${gear ? gearName(gear) : t('hero.empty')}`}
        onPress={gear ? () => wrapper.current?.measureInWindow((x, y, width, height) => onOpen(gear, { x, y, width, height })) : undefined}
      />
    </View>
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
  headerText: { flex: 1 },
  title: { fontFamily: fonts.body, fontSize: 23, lineHeight: 25, color: ui.brassLight },
  sub: { fontFamily: fonts.serif, fontSize: 14, color: ui.onWoodMuted },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 20, color: ui.brassLight },
  scroll: { flex: 1 },
  body: { padding: 14, gap: 12 },
  cap: { fontFamily: fonts.body, fontSize: 17, letterSpacing: 1, color: ui.onWoodMuted },
  empty: { fontFamily: fonts.serif, fontSize: 14, color: ui.onWoodMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  hero: { width: 72, alignItems: 'center', gap: 4 },
  busy: { opacity: 0.4 },
  state: { position: 'absolute', top: 26, left: 0, right: 0, textAlign: 'center', fontFamily: fonts.body, fontSize: 13, color: ui.emberLight },
  heroName: { fontFamily: fonts.serif, fontSize: 14, color: ui.onWood },
  card: { gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  minis: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  lightsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lightsIcon: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: ui.woodDeep, borderWidth: 2, borderColor: ui.brass },
  lights: { flex: 1, fontFamily: fonts.serifBold, fontSize: 15, color: ui.inkMuted },
  good: { color: ui.good },
  footer: { padding: 12, backgroundColor: ui.woodMid, borderTopWidth: 3, borderTopColor: ui.outline },
});
