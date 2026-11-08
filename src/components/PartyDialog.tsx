import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { familyById, type FamilyId } from '@/content/families';
import { heroClasses } from '@/content/heroes';
import { gearName, itemById, threatById } from '@/content/lookup';
import { canJoin, dressWith, dropSwaps, GEAR_SLOTS, heroStatus, partyBanners, prunedDraft, shortFamilies, slotHints, socketGroups, type GearSlot, type SocketGroup } from '@/game/expeditions/party';
import { gearFamilyTags, partyFamilies } from '@/game/families/families';
import { gearIconOf } from '@/game/gear/gearIcon';
import type { SaveData } from '@/game/save';
import { briefingCoverage } from '@/game/threats/coverage';
import { suggestParty, type GearSwap } from '@/game/threats/suggest';
import { currentHp, maxHp } from '@/game/team/health';
import { hasPotionSlot } from '@/game/team/team';
import type { Briefing, GearDef } from '@/game/types';
import { useOdds, type OddsJob } from '@/hooks/useOdds';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { dropDraft, keepDraft, partyDraft } from '@/store/partyDrafts';
import { fonts, ui } from '@/theme';

import { EquipPicker } from './EquipPicker';
import { FamilySheet } from './FamilySheet';
import { GameIcon } from './GameIcon';
import { GearPicker } from './GearPicker';
import { GemSocket } from './GemSocket';
import { HeroPicker } from './HeroPicker';
import { Overlay } from './Overlay';
import { OddsMedallion } from './PartyOdds';
import { hintText } from './partyText';
import { Text } from './Text';
import { EmberButton, ItemSlot, ParchmentCard, WoodButton } from './ui';
import { includesWorking } from './workingHeroes';

export type PartyDialogProps = {
  title: string;
  /** The header's second line: difficulty, time, rewards. */
  subtitle?: string;
  /** How many heroes fit: 1 to 3. */
  slots: number;
  /** The place, so its unsent party is back when the dialog opens again (until sent). */
  draftKey: string;
  /** The place's threats (none for a Sanctum) and the rest of its briefing, scored as the run scores it. */
  briefing: Briefing;
  /** The odds of a party in a save (the dialog passes the save dressed in pending swaps). */
  oddsOf: (save: SaveData, heroIds: string[]) => OddsJob;
  now: number;
  initialHeroIds?: string[];
  sendLabel: string;
  /** Why the party can't go yet, shown above the footer; Send waits for null. */
  problem?: (save: SaveData, heroIds: string[]) => string | null;
  /** The place's own section under the plates (supplies, meal, sigil). */
  details?: (save: SaveData, heroIds: string[]) => ReactNode;
  /** The consumable slot (and an Alchemist's potion slot) on each plate. */
  consumables?: boolean;
  onSend: (heroIds: string[]) => void;
  onClose: () => void;
};

function NeedsCard({ groups, counts, empty }: { groups: SocketGroup[]; counts: ReturnType<typeof partyFamilies>; empty: boolean }) {
  const [open, setOpen] = useState<FamilyId | null>(null);
  const { banners, singles } = partyBanners(counts);
  return (
    <ParchmentCard contentStyle={styles.needs}>
      {groups.length > 0 && (
        <>
          <Text style={styles.cap}>{t('partyDialog.needs')}</Text>
          <View style={styles.groups}>
            {groups.map((group) => {
              const threat = tr(threatById[group.threat.id].name);
              const family = tr(familyById[group.family].name);
              return (
                <View key={group.threat.id} style={styles.group}>
                  <View style={styles.groupSockets}>
                    {group.sockets.map((socket, i) => (
                      <GemSocket key={i} family={group.family} state={socket} size={34} />
                    ))}
                  </View>
                  <Text style={styles.line}>
                    {group.state === 'covered'
                      ? t('partyDialog.answered', { threat })
                      : group.state === 'short'
                        ? t('partyDialog.short', { threat, count: group.short, family })
                        : t('partyDialog.needsCount', { threat, count: group.sockets.length, family })}
                  </Text>
                  {group.state === 'short' && group.hint.length > 0 && <Text style={styles.hint}>{hintText(group)}</Text>}
                </View>
              );
            })}
          </View>
          <View style={styles.rule} />
        </>
      )}
      <Text style={styles.cap}>{t('partyDialog.families')}</Text>
      {empty ? (
        <Text style={styles.line}>{t('partyDialog.familiesEmpty')}</Text>
      ) : (
        <>
          <View style={styles.banners}>
            {banners.map((banner) => {
              const def = familyById[banner.family];
              return (
                <Pressable
                  key={banner.family}
                  accessibilityRole="button"
                  accessibilityLabel={t('families.chip', { family: tr(def.name), count: banner.count, lit: banner.level })}
                  onPress={() => setOpen(banner.family)}
                  style={styles.banner}
                >
                  <View style={styles.bannerIcon}>
                    <GameIcon emoji={def.emoji} icon={def.icon} size={26} />
                  </View>
                  <View style={styles.bannerText}>
                    <Text style={styles.bannerName}>{`${tr(def.name)} ${banner.count}`}</Text>
                    <View style={styles.pips}>
                      {[1, 2, 3].map((level) => (
                        <View key={level} style={[styles.pip, level <= banner.level && styles.pipOn]} />
                      ))}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
          {singles.length > 0 && (
            <Text style={styles.small}>{t('partyDialog.singles', { names: singles.map((f) => tr(familyById[f].name)).join(', ') })}</Text>
          )}
        </>
      )}
      {open && <FamilySheet family={open} count={counts[open] ?? 0} onClose={() => setOpen(null)} />}
    </ParchmentCard>
  );
}

const SLOT_SIZE = 50;

function HeroPlate({
  save,
  heroId,
  now,
  hints,
  consumables,
  onSlot,
  onRemove,
}: {
  save: SaveData;
  heroId: string;
  now: number;
  hints: Set<string>;
  consumables: boolean;
  onSlot: (slot: GearSlot | 'consumable' | 'potion') => void;
  onRemove: () => void;
}) {
  const hero = save.heroes.find((h) => h.id === heroId);
  if (!hero) return null;
  const heroClass = heroClasses[hero.classId];
  const max = maxHp(save, hero);
  const share = max > 0 ? currentHp(save, hero, now) / max : 0;
  const extra = consumables ? (['consumable', ...(hasPotionSlot(hero) ? ['potion' as const] : [])] as const) : [];
  return (
    <View style={styles.plate}>
      <View style={styles.plateTop}>
        <ItemSlot
          state="ready"
          emoji={heroClass.emoji}
          icon={heroClass.icon}
          size={SLOT_SIZE}
          families={[{ family: heroClass.familyTag, count: 1 }]}
          accessibilityLabel={tr(heroClass.name)}
        />
        <View style={styles.plateText}>
          <View style={styles.nameRow}>
            <Text style={styles.heroName} numberOfLines={1}>
              {hero.name}
            </Text>
            <Text style={styles.heroClass} numberOfLines={1}>
              {t('partyDialog.classLevel', { className: tr(heroClass.name), level: hero.level })}
            </Text>
          </View>
          <View style={styles.hpTrack}>
            <View style={[styles.hpFill, { width: `${share * 100}%` }, share < 0.5 && styles.hpLow]} />
          </View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('partyDialog.remove', { name: hero.name })} onPress={onRemove} hitSlop={8} style={styles.remove}>
          <Text style={styles.removeText}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.gearRow}>
        {GEAR_SLOTS.map((slot) => {
          const gear = hero.equipment[slot] ? save.gear.find((g) => g.uid === hero.equipment[slot]) : undefined;
          const item = gear ? (itemById[gear.itemId] as GearDef) : undefined;
          const glow = hints.has(`${hero.id}:${slot}`);
          const label = `${t(`hero.slots.${slot}`)}: ${gear ? gearName(gear) : t('hero.empty')}${glow ? `. ${t('partyDialog.swapHint')}` : ''}`;
          return (
            <View key={slot} style={glow && styles.glow}>
              <ItemSlot
                state={gear ? 'ready' : 'empty'}
                emoji={item?.emoji}
                icon={gear ? gearIconOf(gear) : undefined}
                legendary={gear?.rarity === 'legendary'}
                families={item ? gearFamilyTags(item, gear?.relicId) : undefined}
                size={SLOT_SIZE}
                onPress={() => onSlot(slot)}
                accessibilityLabel={label}
              />
            </View>
          );
        })}
        {extra.map((slot) => {
          const id = hero.equipment[slot];
          return (
            <ItemSlot
              key={slot}
              state={id ? 'ready' : 'empty'}
              emoji={id ? itemById[id].emoji : undefined}
              icon={id ? itemById[id].icon : undefined}
              size={40}
              onPress={() => onSlot(slot)}
              accessibilityLabel={`${t(`hero.slots.${slot}`)}: ${id ? tr(itemById[id].name) : t('hero.empty')}`}
              style={styles.smallSlot}
            />
          );
        })}
      </View>
    </View>
  );
}

/**
 * The party dialog (doc/design/expeditions/): what the place needs and the
 * party's families on top, a plate per hero with its four gear slots, Suggest,
 * and the odds beside Send. Suggest's gear stays pending until Send; gear
 * picked by hand is equipped at once. Expeditions, patrols, place fights and
 * Sanctums all build their party here.
 */
export function PartyDialog({
  title,
  subtitle,
  slots,
  draftKey,
  briefing,
  oddsOf,
  now: clock,
  initialHeroIds = [],
  sendLabel,
  problem,
  details,
  consumables = false,
  onSend,
  onClose,
}: PartyDialogProps) {
  const save = useGameStore((state) => state.save);
  const equip = useGameStore((state) => state.equip);
  const dress = useGameStore((state) => state.dress);
  const noteTips = useGameStore((state) => state.noteTips);
  const hasNeeds = briefing.threats.length > 0;
  useEffect(() => {
    if (hasNeeds) noteTips(['threats']);
  }, [hasNeeds, noteTips]);
  const [draft] = useState(() => {
    const kept = partyDraft(draftKey);
    return kept ? prunedDraft(save, kept, clock) : { heroIds: initialHeroIds, swaps: [] };
  });
  const [heroIds, setHeroIds] = useState<string[]>(draft.heroIds);
  const [swaps, setSwaps] = useState<GearSwap[]>(draft.swaps);
  const [picking, setPicking] = useState<{ heroId: string; slot: GearSlot | 'consumable' | 'potion' } | null>(null);
  const [addingHero, setAddingHero] = useState(false);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // A minute is fine enough for HP and who is free: a map's faster clock would recompute coverage on every tick.
  const now = Math.floor(clock / 60_000) * 60_000;

  // The party as the dialog shows it: away heroes dropped, Suggest's swaps put on.
  const party = useMemo(
    () =>
      heroIds
        .filter((id) => {
          const hero = save.heroes.find((h) => h.id === id);
          return hero !== undefined && canJoin(heroStatus(save, hero, now));
        })
        .slice(0, slots),
    [heroIds, save, now, slots],
  );
  useEffect(() => {
    keepDraft(draftKey, { heroIds: party, swaps: swaps.filter((swap) => party.includes(swap.heroId)) });
  }, [draftKey, party, swaps]);
  const dressed = useMemo(() => dressWith(save, swaps), [save, swaps]);
  const coverage = useMemo(() => (party.length > 0 ? briefingCoverage(dressed, party, briefing, now) : null), [dressed, party, briefing, now]);
  const groups = useMemo(() => socketGroups(briefing.threats, coverage?.threats ?? null), [briefing, coverage]);
  const short = useMemo(() => shortFamilies(groups), [groups]);
  const counts = useMemo(() => coverage?.families ?? partyFamilies(dressed, party), [coverage, dressed, party]);
  const hints = useMemo(() => slotHints(dressed, party, short), [dressed, party, short]);
  const job = useMemo(() => (party.length > 0 ? oddsOf(dressed, party) : null), [oddsOf, dressed, party]);
  const chance = useOdds(job);
  const blocked = problem?.(dressed, party) ?? null;

  const suggest = () => {
    const candidates = save.heroes.filter((h) => canJoin(heroStatus(save, h, now))).map((h) => h.id);
    const suggested = suggestParty(save, briefing, slots, { candidates });
    setHeroIds(suggested.heroIds);
    setSwaps(suggested.swaps);
  };
  const send = () => {
    dropDraft(draftKey);
    if (swaps.length > 0) dress(swaps);
    onSend(party);
  };
  const pickGear = (heroId: string, slot: GearSlot | 'consumable' | 'potion', id: string | null) => {
    if (slot !== 'consumable' && slot !== 'potion') {
      // The hero's pending swaps go on first: the piece may need them (a tome needs the suggested magic weapon).
      const mine = swaps.filter((swap) => swap.heroId === heroId);
      if (mine.length > 0) dress(mine);
      setSwaps((current) => dropSwaps(current.filter((swap) => swap.heroId !== heroId), heroId, slot, id));
    }
    equip(heroId, slot, id);
    setPicking(null);
  };

  return (
    <Overlay onClose={onClose} position="bottom">
      <View style={[styles.dialog, { height, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} style={styles.back}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
          <NeedsCard groups={groups} counts={counts} empty={party.length === 0} />
          {Array.from({ length: slots }, (_, i) => {
            const heroId = party[i];
            if (!heroId)
              return (
                <Pressable key={`empty${i}`} accessibilityRole="button" accessibilityLabel={t('partyDialog.addHero')} onPress={() => setAddingHero(true)} style={[styles.plate, styles.emptyPlate]}>
                  <View style={styles.emptyPortrait}>
                    <Text style={styles.plus}>+</Text>
                  </View>
                  <Text style={styles.addHero}>{t('partyDialog.addHero')}</Text>
                </Pressable>
              );
            return (
              <HeroPlate
                key={heroId}
                save={dressed}
                heroId={heroId}
                now={now}
                hints={hints}
                consumables={consumables}
                onSlot={(slot) => setPicking({ heroId, slot })}
                onRemove={() => {
                  setHeroIds(party.filter((id) => id !== heroId));
                  setSwaps((current) => current.filter((swap) => swap.heroId !== heroId));
                }}
              />
            );
          })}
          <WoodButton title={t('partyDialog.suggest')} onPress={suggest} />
          {details?.(dressed, party)}
        </ScrollView>
        {blocked && <Text style={styles.problem}>{blocked}</Text>}
        <View style={styles.footer}>
          <OddsMedallion chance={chance} />
          <EmberButton
            title={includesWorking(save, party) ? t('jobs.recallAndSend') : sendLabel}
            disabled={party.length === 0 || blocked !== null}
            onPress={send}
            style={styles.send}
          />
        </View>
      </View>
      {picking && (picking.slot === 'consumable' || picking.slot === 'potion') && (
        <EquipPicker
          save={dressed}
          heroId={picking.heroId}
          slot={picking.slot}
          onPick={(id) => pickGear(picking.heroId, picking.slot, id)}
          onClose={() => setPicking(null)}
        />
      )}
      {picking && picking.slot !== 'consumable' && picking.slot !== 'potion' && (
        <GearPicker
          save={dressed}
          party={party}
          heroId={picking.heroId}
          slot={picking.slot}
          groups={groups}
          oddsOf={oddsOf}
          chance={chance}
          onPick={(id) => pickGear(picking.heroId, picking.slot, id)}
          onClose={() => setPicking(null)}
        />
      )}
      {addingHero && (
        <HeroPicker
          save={dressed}
          party={party}
          groups={groups}
          ordinal={party.length + 1}
          now={now}
          oddsOf={oddsOf}
          chance={chance}
          onPick={(id) => {
            setHeroIds([...party, id]);
            setAddingHero(false);
          }}
          onClose={() => setAddingHero(false)}
        />
      )}
    </Overlay>
  );
}

const styles = StyleSheet.create({
  dialog: { backgroundColor: ui.woodDark },
  header: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: ui.woodMid,
    borderBottomWidth: 3,
    borderBottomColor: ui.outline,
  },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 30, color: ui.brassLight },
  headerText: { flex: 1 },
  title: { fontFamily: fonts.body, fontSize: 26, lineHeight: 28, color: ui.brassLight },
  subtitle: { fontFamily: fonts.serif, fontSize: 14, color: ui.onWoodMuted },
  scroll: { flex: 1 },
  body: { padding: 12, gap: 10 },
  needs: { paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  cap: { fontFamily: fonts.body, fontSize: 17, letterSpacing: 1, color: ui.woodSelected },
  groups: { flexDirection: 'row', flexWrap: 'wrap', gap: 22, paddingLeft: 4 },
  group: { gap: 6, maxWidth: 200 },
  groupSockets: { flexDirection: 'row', gap: 4 },
  line: { fontFamily: fonts.serif, fontSize: 15, color: ui.inkMuted },
  hint: { fontFamily: fonts.serif, fontSize: 13, color: ui.bad },
  small: { fontFamily: fonts.serif, fontSize: 13, color: ui.inkMuted },
  rule: { height: 2, backgroundColor: ui.parchmentRule },
  banners: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 8,
    backgroundColor: ui.woodDark,
    borderWidth: 2,
    borderColor: ui.outline,
  },
  bannerIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: ui.woodDeep, borderWidth: 2, borderColor: ui.brass },
  bannerText: { gap: 3 },
  bannerName: { fontFamily: fonts.serifBold, fontSize: 14, color: ui.onWood },
  pips: { flexDirection: 'row', gap: 5, paddingLeft: 2 },
  pip: { width: 7, height: 7, borderWidth: 1, borderColor: ui.outline, backgroundColor: ui.woodMid, transform: [{ rotate: '45deg' }] },
  pipOn: { backgroundColor: ui.brassLight },
  plate: { gap: 10, padding: 10, backgroundColor: ui.woodDark, borderWidth: 3, borderColor: ui.outline },
  emptyPlate: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  emptyPortrait: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: ui.woodDeep, borderWidth: 2, borderStyle: 'dashed', borderColor: ui.brassDim },
  plus: { fontSize: 30, color: ui.brassDim },
  addHero: { fontFamily: fonts.body, fontSize: 21, color: ui.onWoodMuted },
  plateTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  plateText: { flex: 1, gap: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  heroName: { fontFamily: fonts.body, fontSize: 21, color: ui.brassLight, flexShrink: 1 },
  heroClass: { fontFamily: fonts.serif, fontSize: 13, color: ui.onWoodMuted, flexShrink: 1 },
  hpTrack: { height: 8, backgroundColor: ui.outline },
  hpFill: { height: '100%', backgroundColor: ui.hp },
  hpLow: { backgroundColor: ui.hpLow },
  remove: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  removeText: { fontSize: 18, color: ui.onWoodMuted },
  gearRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  glow: { boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 8, spreadDistance: 2, color: 'rgba(224,122,62,0.8)' }], borderWidth: 2, borderColor: ui.emberLight },
  smallSlot: { marginLeft: 4 },
  problem: { fontFamily: fonts.serif, fontSize: 14, color: ui.onWoodMuted, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: ui.woodDark },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: ui.woodMid,
    borderTopWidth: 3,
    borderTopColor: ui.outline,
  },
  send: { flex: 1 },
});
