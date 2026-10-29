import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { elementInfo } from '@/content/elements';
import { items } from '@/content/items';
import { threatById } from '@/content/lookup';
import { threatRules } from '@/content/threats';
import { highestUnlockedTier } from '@/game/dungeons/unlock';
import { kitTier } from '@/game/threats/compose';
import type { BriefingCoverage, ThreatCoverage } from '@/game/threats/coverage';
import { threatPenalties, type AppliedPenalty } from '@/game/threats/penalties';
import type { ThreatScore } from '@/game/threats/score';
import type { ConsumableDef, ThreatId } from '@/game/types';
import { formatPercent, t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors, pixel } from '@/theme';

import { ThreatChip } from './ThreatChip';
import { Text } from './Text';

/** One penalty as the run applies it, as a short line. */
function appliedText(penalty: AppliedPenalty): string {
  switch (penalty.kind) {
    case 'exposed':
      if (penalty.fights === 'all') {
        return t(penalty.everyOther ? 'threats.penalty.exposedEveryOther' : 'threats.penalty.exposedAll');
      }
      return Number.isInteger(penalty.fights)
        ? t('threats.penalty.exposed', { count: penalty.fights })
        : t('threats.penalty.exposedChance');
    case 'weakened':
      return t('threats.penalty.weakened', { pct: formatPercent(penalty.pct) });
    case 'trapWounds':
      return t('threats.penalty.trapWounds', { pct: formatPercent(penalty.pct) });
    case 'fightWounds':
      return t(
        penalty.targets === 'all' ? 'threats.penalty.fightWoundsAll' : 'threats.penalty.fightWoundsOne',
        { pct: formatPercent(penalty.pct) },
      );
    case 'delay':
      return t('threats.penalty.delay', { pct: formatPercent(penalty.pct) });
    case 'hunger':
      return t('threats.penalty.hunger', { count: penalty.supply });
    case 'lostLoot':
      return t('threats.penalty.lostLoot', { pct: formatPercent(penalty.pct) });
    case 'extraFight':
      return penalty.chance === 1 ? t('threats.penalty.extraFight') : t('threats.penalty.extraFightChance');
    case 'elementalDamage':
      return t('threats.penalty.elementalDamage', { multiplier: penalty.multiplier });
    case 'enemyDamage':
      return t('threats.penalty.enemyDamage', { pct: formatPercent(penalty.pct) });
    case 'enemyHp':
      return t('threats.penalty.enemyHp', { pct: formatPercent(penalty.pct) });
    case 'weakenedAgainst':
      return t('threats.penalty.weakenedAgainst', { pct: formatPercent(penalty.pct) });
    case 'extraEnemies':
      return Number.isInteger(penalty.count)
        ? t('threats.penalty.extraEnemies', { count: penalty.count })
        : t('threats.penalty.extraEnemiesChance', { count: Math.ceil(penalty.count) });
    case 'bruteDamage':
      return t('threats.penalty.bruteDamage', { pct: formatPercent(penalty.pct) });
    case 'healingHalved':
      return penalty.multiplier === 0.5
        ? t('threats.penalty.healingHalved')
        : t('threats.penalty.healingReduced', { pct: formatPercent(1 - penalty.multiplier) });
  }
}

/** The kits and ward salves that answer a threat, by name. */
function kitNames(threatId: ThreatId): string[] {
  return items
    .filter((item) => item.slot === 'consumable' && ((item as ConsumableDef).kit?.threats ?? []).includes(threatId))
    .map((item) => tr(item.name));
}

/** One line per answer, alternative, kit and miss penalty of a threat, in order. */
function DetailLines({ coverage }: { coverage: ThreatCoverage }) {
  const playerTier = useGameStore((state) => highestUnlockedTier(state.save));
  const threat = coverage.threat;
  const def = threatById[threat.id];
  const element = threat.id === 'element' && threat.element ? tr(elementInfo[threat.element].name) : null;
  const lines: string[] = [tr(def.description)];
  if (def.answer.kind === 'approach') {
    lines.push(t('threats.answerApproach', { approach: t(`threats.approach.${def.answer.approach}`), needed: coverage.needed }));
  } else if (def.answer.kind === 'keyword') {
    lines.push(t('threats.answerKeyword', { count: coverage.needed, keyword: t(`threats.keyword.${def.answer.keyword}`) }));
  } else {
    lines.push(t('threats.answerResist', { element: element ?? '' }));
  }
  if (threat.id === 'locked') lines.push(t('threats.forced', { pct: formatPercent(threatRules.forcedLockLoss) }));
  if (threat.id === 'locals') lines.push(t('threats.intimidated'));
  const kits = kitNames(threat.id);
  if (kits.length > 0) lines.push(t('threats.kits', { names: kits.join(', ') }));
  // The player's highest tier, not the dungeon's: a kit opened elsewhere can be brought along.
  const tier = kitTier(threat.id);
  if (tier !== null && tier > playerTier) lines.push(t('threats.noKitYet'));

  const scoreOf = (state: 'half' | 'full'): ThreatScore => ({
    threat, state, have: coverage.have, needed: coverage.needed, coveredBy: [], kitHeroes: [],
  });
  return (
    <>
      {lines.map((line) => (
        <Text key={line} style={styles.line}>
          {line}
        </Text>
      ))}
      <Text style={[styles.line, { color: colors.gold }]}>{t('threats.missHalf')}</Text>
      {threatPenalties(scoreOf('half')).map((penalty) => (
        <Text key={penalty.kind} style={styles.line}>
          {'· ' + appliedText(penalty)}
        </Text>
      ))}
      <Text style={[styles.line, { color: colors.danger }]}>{t('threats.missFull')}</Text>
      {threatPenalties(scoreOf('full')).map((penalty) => (
        <Text key={penalty.kind} style={styles.line}>
          {'· ' + appliedText(penalty)}
        </Text>
      ))}
    </>
  );
}

/** The briefing's threats against the current party: a chip each, tapping one explains it. */
export function ThreatCoverageChips({ coverage }: { coverage: BriefingCoverage }) {
  const [detail, setDetail] = useState<ThreatCoverage | null>(null);
  return (
    <View style={styles.chips}>
      {coverage.threats.map((threat) => (
        <View key={threat.threat.id} style={styles.one}>
          <ThreatChip threat={threat.threat} state={threat.display} onPress={() => setDetail(threat)} />
          {threat.coveredBy.length > 0 && (
            <Text style={styles.names} numberOfLines={1}>
              {t('threats.coveredBy', {
                names: threat.coveredBy
                  .map(
                    (hero) =>
                      `${hero.heroName} (${hero.porterName ? t('classes.carried', { item: tr(hero.sourceName), name: hero.porterName }) : tr(hero.sourceName)})`,
                  )
                  .join(', '),
              })}
            </Text>
          )}
          {threat.loweredBy && <Text style={styles.signature}>🔭 {t('classes.lowered', { name: threat.loweredBy })}</Text>}
        </View>
      ))}
      {coverage.restriction && (
        <View style={styles.one}>
          <Text style={coverage.restriction.cancelledBy ? styles.cancelled : undefined}>
            {coverage.restriction.def.emoji} {tr(coverage.restriction.def.name)}
          </Text>
          {coverage.restriction.cancelledBy && (
            <Text style={styles.signature}>{t('classes.cancelled', { name: coverage.restriction.cancelledBy })}</Text>
          )}
        </View>
      )}
      {detail && (
        <Modal animationType="slide" transparent onRequestClose={() => setDetail(null)}>
          <Pressable style={styles.backdrop} onPress={() => setDetail(null)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <Text style={styles.title}>
                {threatById[detail.threat.id].emoji} {tr(threatById[detail.threat.id].name)} ·{' '}
                {t('threats.level', { level: detail.threat.level })}
              </Text>
              <DetailLines coverage={detail} />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'flex-start' },
  one: { gap: 2 },
  names: { fontSize: 14, color: colors.muted, maxWidth: 220 },
  signature: { fontSize: 14, color: colors.success, maxWidth: 220 },
  cancelled: { textDecorationLine: 'line-through', color: colors.muted },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.parchment,
    borderTopWidth: pixel.outline + 1,
    borderColor: colors.ink,
    padding: 16,
    gap: 6,
  },
  title: { fontSize: 22, marginBottom: 4 },
  line: { fontSize: 17 },
});
