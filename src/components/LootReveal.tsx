import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { heroClasses, xpToNextLevel } from '@/content/heroes';
import { dungeonById, materialById } from '@/content/lookup';
import { shardId } from '@/game/elements';
import type { ExpeditionOutcome, ExpeditionReport, HeroState } from '@/game/types';
import { t, tr } from '@/i18n';
import { colors, pixel } from '@/theme';

import { Button } from './Button';
import { lootLabels } from './lootText';
import { Overlay } from './Overlay';
import { Panel } from './Panel';
import { Text } from './Text';

export const OUTCOME_COLORS: Record<ExpeditionOutcome, string> = {
  flawless: colors.gold,
  success: colors.success,
  retreat: colors.wood,
  defeat: colors.danger,
};

/** Everything a report brought back, one short label each: gold first, then the rarer finds, then materials. */
export function lootItems(report: ExpeditionReport): string[] {
  return [
    report.firstTierClear ? t('expeditions.firstTierClear') : report.firstWin ? t('expeditions.firstWin') : null,
    report.sigil ? t('expeditions.sigil', { tier: report.sigil }) : null,
    report.sigilShards
      ? t('expeditions.sigilShards', { emoji: materialById[shardId(report.sigilShards.element)].emoji, amount: report.sigilShards.amount })
      : null,
    ...lootLabels(report.loot),
  ].filter((item): item is string => item !== null);
}

const totalXp = (hero: HeroState) => Array.from({ length: hero.level - 1 }, (_, i) => xpToNextLevel(i + 1)).reduce((a, b) => a + b, hero.xp);

const STAGGER_MS = 280;

/** One line that pops in after `delay`. */
function Pop({ delay, children }: { delay: number; children: React.ReactNode }) {
  const [value] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(value, { toValue: 1, duration: 260, delay, easing: Easing.out(Easing.back(2)), useNativeDriver: true }).start();
  }, [value, delay]);
  const scale = value.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  return <Animated.View style={{ opacity: value, transform: [{ scale }] }}>{children}</Animated.View>;
}

type Props = {
  report: ExpeditionReport;
  /** The heroes before and after the loot was collected, for XP and level-ups. */
  before: HeroState[];
  after: HeroState[];
  onClose: () => void;
  onReadReport: () => void;
};

/** The loot of a finished expedition, revealed one find at a time. */
export function LootReveal({ report, before, after, onClose, onReadReport }: Props) {
  const dungeon = dungeonById[report.dungeonId];
  const items = lootItems(report);
  const heroes = report.heroIds.flatMap((id) => {
    const was = before.find((h) => h.id === id);
    const now = after.find((h) => h.id === id);
    return was && now ? [{ hero: now, xp: totalXp(now) - totalXp(was), levelUp: now.level > was.level }] : [];
  });
  return (
    <Overlay onClose={onClose} backdropStyle={styles.backdrop}>
        <Panel style={styles.dialog}>
          <Text style={styles.title}>
            {dungeon.emoji} {tr(dungeon.name)}
          </Text>
          <Text style={[styles.outcome, { color: OUTCOME_COLORS[report.outcome] }]}>
            {t(`expeditions.outcome.${report.outcome}`)} ({report.encountersCleared}/{report.encounterCount})
          </Text>
          <View style={styles.loot}>
            {items.length === 0 && <Text style={styles.muted}>{t('expeditions.loot.nothing')}</Text>}
            {items.map((item, i) => (
              <Pop key={i} delay={300 + i * STAGGER_MS}>
                <View style={[styles.item, i === 0 && report.gold > 0 && styles.itemGold]}>
                  <Text style={[styles.itemText, i === 0 && report.gold > 0 && styles.itemTextBig]}>{item}</Text>
                </View>
              </Pop>
            ))}
          </View>
          {heroes.map(({ hero, xp, levelUp }, i) => (
            <Pop key={hero.id} delay={300 + (items.length + i) * STAGGER_MS}>
              <View style={styles.hero}>
                <Text style={styles.heroName}>
                  {heroClasses[hero.classId].emoji} {hero.name}
                </Text>
                <Text style={styles.xp}>{t('expeditions.loot.xp', { xp })}</Text>
                {levelUp && <Text style={styles.levelUp}>⬆ {t('expeditions.loot.levelUp', { level: hero.level })}</Text>}
              </View>
            </Pop>
          ))}
          <View style={styles.actions}>
            <Button title={t('expeditions.loot.report')} color={colors.muted} onPress={onReadReport} />
            <Button title={t('expeditions.loot.great')} onPress={onClose} />
          </View>
        </Panel>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.6)' },
  dialog: { gap: 10, padding: 16 },
  title: { fontSize: 26, textAlign: 'center' },
  outcome: { fontSize: 21, textAlign: 'center' },
  muted: { color: colors.muted, textAlign: 'center' },
  loot: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingVertical: 6 },
  item: { paddingHorizontal: 10, paddingVertical: 4, borderWidth: pixel.outline, borderColor: colors.ink, backgroundColor: colors.parchmentDark },
  itemGold: { backgroundColor: colors.highlight, paddingHorizontal: 16 },
  itemText: { fontSize: 20 },
  itemTextBig: { fontSize: 28 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2 },
  heroName: { flex: 1, fontSize: 19 },
  xp: { fontSize: 18, color: colors.success },
  levelUp: { fontSize: 18, paddingHorizontal: 6, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.highlight },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 6 },
});
