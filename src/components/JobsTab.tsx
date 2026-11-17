import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { PressScale } from '@/components/motion';

import { clockConfig } from '@/content/clockConfig';
import { jobRules } from '@/content/jobs';
import { heroClasses } from '@/content/heroes';
import { currentEnergy, isJobOpen } from '@/game/jobs/jobs';
import type { SaveData } from '@/game/save';
import { isBusy } from '@/game/team/team';
import { formatPercent, t } from '@/i18n';
import { useNow } from '@/hooks/useNow';
import { colors, pixel } from '@/theme';
import { useGameStore } from '@/store/gameStore';

import { GameIcon } from './GameIcon';
import { GathererCard } from './GathererCard';
import { SpecialLabel } from './SpecialLabel';
import { Text } from './Text';

/** The Expeditions screen's Gatherer tab: the outdoor gatherer's card. */
export function JobsTab() {
  const noteTips = useGameStore((state) => state.noteTips);
  const open = useGameStore((state) => isJobOpen(state.save, 'gatherer'));
  // The tip queues the first time the tab is on screen; later times change nothing.
  useEffect(() => {
    noteTips(['jobs']);
  }, [noteTips]);
  return open ? <GathererCard /> : null;
}

/** The free heroes, each with their energy; the preselected one comes marked. */
export function HeroChips({ save, preselect, onPick }: { save: SaveData; preselect?: string | null; onPick: (heroId: string) => void }) {
  const now = useNow(clockConfig.minutesMs);
  const free = save.heroes.filter((hero) => !isBusy(save, hero.id));
  if (free.length === 0) return <Text style={styles.muted}>{t('jobs.noFreeHeroes')}</Text>;
  return (
    <View style={styles.chips}>
      {free.map((hero) => (
        <PressScale
          key={hero.id}
          onPress={() => onPick(hero.id)}
          style={[styles.chip, preselect === hero.id && styles.chipActive]}
        >
          <GameIcon emoji={heroClasses[hero.classId].emoji} icon={heroClasses[hero.classId].icon} size={20} />
          <Text>
            {hero.name} · {formatPercent(currentEnergy(save, hero, now) / jobRules.energy.max)}
          </Text>
          <SpecialLabel classId={hero.classId} special={hero.special} short />
        </PressScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // Never wider than the card: a long hero line (name, energy, special) wraps inside the chip.
  chip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
    borderWidth: pixel.outline,
    borderColor: colors.woodDark,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipActive: { borderColor: colors.ink, backgroundColor: colors.highlight },
});
