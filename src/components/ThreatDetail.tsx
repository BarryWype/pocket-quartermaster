import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { familyById, familyOfThreat } from '@/content/families';
import { threatById } from '@/content/lookup';
import type { BriefingCoverage, ThreatCoverage } from '@/game/threats/coverage';
import { threatPenalties, type AppliedPenalty } from '@/game/threats/penalties';
import type { ThreatScore } from '@/game/threats/score';
import { formatPercent, t, tr } from '@/i18n';
import { colors } from '@/theme';

import { GameIcon } from './GameIcon';
import { Overlay } from './Overlay';
import { Sheet } from './Sheet';
import { stateColors, ThreatChip } from './ThreatChip';
import { Text } from './Text';
import { IconLabel } from './IconLabel';

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
      return t('threats.penalty.fightWoundsAll', { pct: formatPercent(penalty.pct) });
    case 'elementalDamage':
      return t('threats.penalty.elementalDamage', { multiplier: penalty.multiplier });
    case 'enemyDamage':
      return t('threats.penalty.enemyDamage', { pct: formatPercent(penalty.pct) });
    case 'enemyHp':
      return t('threats.penalty.enemyHp', { pct: formatPercent(penalty.pct) });
    case 'weakenedAgainst':
      return t('threats.penalty.weakenedAgainst', { pct: formatPercent(penalty.pct) });
  }
}

/** One line per answer and miss penalty of a threat, in order. */
function DetailLines({ coverage }: { coverage: ThreatCoverage }) {
  const threat = coverage.threat;
  const def = threatById[threat.id];
  const lines: string[] = [
    tr(def.description),
    t('threats.answerFamily', { family: tr(familyById[familyOfThreat(threat.id)].name), needed: coverage.needed }),
  ];

  const scoreOf = (state: 'half' | 'full'): ThreatScore => ({
    threat, state, have: coverage.have, needed: coverage.needed, coveredBy: [],
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
export function ThreatCoverageChips({ coverage, labelled = false }: { coverage: BriefingCoverage; /** Spells out "answered" under each chip (the tutorial). */ labelled?: boolean }) {
  const [detail, setDetail] = useState<ThreatCoverage | null>(null);
  return (
    <View style={styles.chips}>
      {coverage.threats.map((threat) => (
        <View key={threat.threat.id} style={styles.one}>
          <ThreatChip threat={threat.threat} state={threat.display} onPress={() => setDetail(threat)} />
          {labelled && <Text style={[styles.names, { color: stateColors[threat.display] }]}>{t(`threats.answered.${threat.display}`)}</Text>}
          {threat.coveredBy.length > 0 && (
            <Text style={styles.names} numberOfLines={1}>
              {t('threats.coveredBy', {
                names: threat.coveredBy
                  .map(
                    (hero) =>
                      `${hero.heroName} (${tr(hero.sourceName)})`,
                  )
                  .join(', '),
              })}
            </Text>
          )}
          {threat.loweredBy && <IconLabel emoji="🔭" label={t('classes.lowered', { name: threat.loweredBy })} labelStyle={styles.signature} />}
        </View>
      ))}
      {coverage.restriction && (
        <View style={[styles.one, styles.restriction]}>
          <GameIcon emoji={coverage.restriction.def.emoji} size={20} />
          <Text style={coverage.restriction.cancelledBy ? styles.cancelled : undefined}>
            {tr(coverage.restriction.def.name)}
          </Text>
          {coverage.restriction.cancelledBy && (
            <Text style={styles.signature}>{t('classes.cancelled', { name: coverage.restriction.cancelledBy })}</Text>
          )}
        </View>
      )}
      {detail && (
        <Overlay onClose={() => setDetail(null)} position="bottom">
          <Sheet
            emoji={threatById[detail.threat.id].emoji}
            icon={threatById[detail.threat.id].icon}
            title={`${tr(threatById[detail.threat.id].name)} · ${t('threats.level', { level: detail.threat.level })}`}
            bodyStyle={styles.body}
          >
            <DetailLines coverage={detail} />
          </Sheet>
        </Overlay>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'flex-start' },
  one: { gap: 2 },
  restriction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  names: { fontSize: 14, color: colors.muted, maxWidth: 220 },
  signature: { fontSize: 14, color: colors.success, maxWidth: 220 },
  cancelled: { textDecorationLine: 'line-through', color: colors.muted },
  body: { gap: 6 },
  line: { fontSize: 17 },
});
