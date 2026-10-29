import { StyleSheet, View } from 'react-native';

import { opportunityById, restrictionById, threatById } from '@/content/lookup';
import type { Briefing, ThreatPenalty } from '@/game/types';
import { formatPercent, t, tr } from '@/i18n';

import { OpportunityChip, RestrictionChip, ThreatChip } from './ThreatChip';
import { Tip } from './Tip';

function penaltyText(penalty: ThreatPenalty): string {
  switch (penalty.kind) {
    case 'exposed':
      return penalty.fights === 'all'
        ? t('threats.penalty.exposedAll')
        : t('threats.penalty.exposed', { count: penalty.fights });
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
      return t('threats.penalty.extraFight');
    case 'elementalDamage':
      return t('threats.penalty.elementalDamage', { multiplier: penalty.multiplier });
    case 'enemyDamage':
      return t('threats.penalty.enemyDamage', { pct: formatPercent(penalty.pct) });
    case 'enemyHp':
      return t('threats.penalty.enemyHp', { pct: formatPercent(penalty.pct) });
    case 'weakenedAgainst':
      return t('threats.penalty.weakenedAgainst', { pct: formatPercent(penalty.pct) });
    case 'extraEnemies':
      return t('threats.penalty.extraEnemies', { count: penalty.count });
    case 'bruteDamage':
      return t('threats.penalty.bruteDamage', { pct: formatPercent(penalty.pct) });
    case 'healingHalved':
      return t('threats.penalty.healingHalved');
  }
}

/** The briefing as a row of chips: threats (tapped, what they do), the opportunity, the restriction. */
export function BriefingChips({ briefing }: { briefing: Briefing }) {
  return (
    <View style={styles.chips}>
      {briefing.threats.map((threat) => {
        const def = threatById[threat.id];
        const text = [tr(def.description), ...def.penalties[threat.level - 1].map(penaltyText)].join('\n');
        return (
          <Tip key={threat.id} title={tr(def.name)} text={text}>
            <ThreatChip threat={threat} />
          </Tip>
        );
      })}
      {briefing.opportunity && <OpportunityChip opportunity={opportunityById[briefing.opportunity]} />}
      {briefing.restriction && <RestrictionChip restriction={restrictionById[briefing.restriction]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
