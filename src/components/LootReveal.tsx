import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, ScrollView, StyleSheet, View } from 'react-native';

import { heroClasses, xpToNextLevel } from '@/content/heroes';
import { dungeonById } from '@/content/lookup';
import { gearNameLines, heroNewsLines, type CardLine } from '@/game/expeditions/reportCard';
import { reportTiles } from '@/game/loot/tiles';
import type { SaveData } from '@/game/save';
import type { ExpeditionOutcome, ExpeditionReport, HeroState } from '@/game/types';
import { t, tr } from '@/i18n';
import { colors, fonts, pixel, ui } from '@/theme';

import { Button } from './Button';
import { GameIcon } from './GameIcon';
import { IconLabel } from './IconLabel';
import { LootGrid } from './LootGrid';
import { Overlay } from './Overlay';
import { Panel } from './Panel';
import { useSheetMaxHeight } from './Sheet';
import { Text } from './Text';
import { DifficultyChip } from './ui';

export const OUTCOME_COLORS: Record<ExpeditionOutcome, string> = {
  flawless: colors.gold,
  success: colors.success,
  retreat: colors.wood,
  defeat: colors.danger,
};

/** The report's one-line note on top of its loot: the day's first win, a new tier's or a chain dungeon's first clear. */
export function reportNote(report: ExpeditionReport): string | null {
  if (report.firstTierClear) return t('expeditions.firstTierClear');
  if (report.firstDungeonClear) return t('expeditions.firstDungeonClear');
  return report.firstWin ? t('expeditions.firstWin') : null;
}

/** The names show once the loot's reveal is done. */
const NAME_DELAY_MS = 1600;

const totalXp = (hero: HeroState) => Array.from({ length: hero.level - 1 }, (_, i) => xpToNextLevel(i + 1)).reduce((a, b) => a + b, hero.xp);
const levelShare = (hero: HeroState) => Math.min(1, hero.xp / xpToNextLevel(hero.level));

/** A hero of the run: portrait, name, XP gained, a bar that fills from where they were, and a level-up badge. */
function HeroPlate({ was, now }: { was: HeroState; now: HeroState }) {
  const levelUp = now.level > was.level;
  const [fill] = useState(() => new Animated.Value(levelUp ? 0 : levelShare(was)));
  useEffect(() => {
    Animated.timing(fill, { toValue: levelShare(now), duration: 700, delay: 400, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [fill, now]);
  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={styles.plate}>
      <View style={styles.portrait}>
        <GameIcon emoji={heroClasses[now.classId].emoji} icon={heroClasses[now.classId].icon} size={28} />
      </View>
      <View style={styles.plateBody}>
        <View style={styles.plateHead}>
          <Text style={styles.heroName} numberOfLines={1}>
            {now.name}
          </Text>
          <Text style={styles.xp}>{t('expeditions.loot.xp', { xp: totalXp(now) - totalXp(was) })}</Text>
        </View>
        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, { width }]} />
        </View>
      </View>
      {levelUp && <IconLabel emoji="⬆" label={t('expeditions.loot.levelUp', { level: now.level })} labelStyle={styles.levelUp} style={styles.levelUpBadge} />}
    </View>
  );
}

/** After the loot: a piece's earned name, popping in with a brass flourish (static with reduce motion on). */
function NameFlourish({ line, delay }: { line: CardLine; delay: number }) {
  const [value] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then(
      (reduce) => {
        if (reduce) return value.setValue(1);
        animation = Animated.timing(value, { toValue: 1, duration: 420, delay, easing: Easing.out(Easing.back(2.5)), useNativeDriver: true });
        animation.start();
      },
      () => value.setValue(1),
    );
    return () => animation?.stop();
  }, [value, delay]);
  const scale = value.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  return (
    <Animated.View style={[styles.flourish, { opacity: value, transform: [{ scale }] }]}>
      <IconLabel emoji={line.emoji} label={line.text} size={22} labelStyle={styles.flourishText} />
    </Animated.View>
  );
}

type Props = {
  report: ExpeditionReport;
  /** The save before and after the loot was collected: "New" finds, XP and level-ups. */
  before: SaveData;
  after: SaveData;
  onClose: () => void;
  onReadReport: () => void;
};

/** The loot of a finished expedition: its tiles revealed, then the heroes' XP. */
export function LootReveal({ report, before, after, onClose, onReadReport }: Props) {
  const dungeon = dungeonById[report.dungeonId];
  const tiles = reportTiles(report, before);
  const note = reportNote(report);
  const heroes = report.heroIds.flatMap((id) => {
    const was = before.heroes.find((h) => h.id === id);
    const now = after.heroes.find((h) => h.id === id);
    return was && now ? [{ was, now }] : [];
  });
  const maxHeight = useSheetMaxHeight();
  return (
    <Overlay onClose={onClose} backdropStyle={styles.backdrop}>
      <Panel style={[styles.dialog, { maxHeight }]}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <View style={styles.titleRow}>
            <IconLabel emoji={dungeon.emoji} label={tr(dungeon.name)} size={22} labelStyle={styles.title} />
            <DifficultyChip difficulty={dungeon.difficulty} />
          </View>
          <Text style={[styles.outcome, { color: OUTCOME_COLORS[report.outcome] }]}>
            {t(`expeditions.outcome.${report.outcome}`)} ({report.encountersCleared}/{report.encounterCount})
          </Text>
          {note && <Text style={styles.note}>{note}</Text>}
          {tiles.length === 0 ? <Text style={styles.muted}>{t('expeditions.loot.nothing')}</Text> : <LootGrid tiles={tiles} reveal />}
          {[...gearNameLines(report), ...heroNewsLines(report, after.heroes)].map((line, i) => (
            <NameFlourish key={i} line={line} delay={NAME_DELAY_MS + i * 300} />
          ))}
          {heroes.map(({ was, now }) => (
            <HeroPlate key={now.id} was={was} now={now} />
          ))}
        </ScrollView>
        <View style={styles.actions}>
          <Button title={t('expeditions.loot.report')} color={colors.muted} onPress={onReadReport} />
          <Button title={t('expeditions.loot.great')} onPress={onClose} />
        </View>
      </Panel>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.6)' },
  dialog: { gap: 10, padding: 16 },
  scroll: { flexShrink: 1 },
  content: { gap: 10 },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 26, textAlign: 'center' },
  outcome: { fontSize: 21, textAlign: 'center' },
  note: { fontFamily: fonts.serifBold, fontSize: 15, color: ui.inkMuted, textAlign: 'center' },
  muted: { color: colors.muted, textAlign: 'center' },
  plate: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  portrait: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: ui.woodMid, borderWidth: 2, borderColor: ui.outline },
  plateBody: { flex: 1, gap: 3 },
  plateHead: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  heroName: { flex: 1, fontSize: 18 },
  xp: { fontSize: 16, color: colors.success },
  barTrack: { height: 10, borderWidth: 2, borderColor: ui.outline, backgroundColor: ui.woodDark },
  barFill: { height: '100%', backgroundColor: ui.xp },
  levelUpBadge: { paddingHorizontal: 6, borderWidth: pixel.outline, borderColor: colors.ink, backgroundColor: colors.highlight },
  levelUp: { fontSize: 15 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 6 },
  flourish: { padding: 8, borderWidth: 3, borderColor: ui.brass, backgroundColor: ui.parchmentShade, alignItems: 'center' },
  flourishText: { flexShrink: 1, fontFamily: fonts.serifBold, fontSize: 16, color: ui.ink, textAlign: 'center' },
});
