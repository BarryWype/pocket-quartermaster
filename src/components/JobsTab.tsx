import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { clockConfig } from '@/content/clockConfig';
import { type JobDef, jobRules, jobs } from '@/content/jobs';
import { heroClasses } from '@/content/heroes';
import { materialById } from '@/content/lookup';
import { currentEnergy, isJobFull, jobCap, jobOutputNow, jobWorker } from '@/game/jobs/jobs';
import type { SaveData } from '@/game/save';
import { isBusy } from '@/game/team/team';
import { formatPercent, t, tr } from '@/i18n';
import { useNow } from '@/hooks/useNow';
import { colors, pixel } from '@/theme';
import { useGameStore } from '@/store/gameStore';

import { EnergyBar } from './EnergyBar';
import { GameIcon } from './GameIcon';
import { IconLabel } from './IconLabel';
import { PixelBar } from './PixelBar';
import { SpecialLabel } from './SpecialLabel';
import { Text } from './Text';
import { EmberButton, ParchmentCard, WoodButton } from './ui';

/**
 * The Expeditions screen's Jobs tab: one card per station, with its worker,
 * output and energy, and Collect, Recall and Assign. `preselect` is the hero
 * the hero card sent over: their assign picker opens on them.
 */
export function JobsTab({ preselect }: { preselect?: string | null }) {
  const noteTips = useGameStore((state) => state.noteTips);
  // The tip queues the first time the tab is on screen; later times change nothing.
  useEffect(() => {
    noteTips(['jobs']);
  }, [noteTips]);

  /** The station whose assign picker is open. */
  const [picking, setPicking] = useState<string | null>(() => (preselect ? jobs[0].id : null));

  return (
    <>
      {jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          picking={picking === job.id}
          preselect={preselect}
          onTogglePicker={() => setPicking(picking === job.id ? null : job.id)}
          onPicked={() => setPicking(null)}
        />
      ))}
    </>
  );
}

/** One station: who works there, how full its output is and how the worker's energy is doing. */
function JobCard({
  job,
  picking,
  preselect,
  onTogglePicker,
  onPicked,
}: {
  job: JobDef;
  picking: boolean;
  preselect?: string | null;
  onTogglePicker: () => void;
  onPicked: () => void;
}) {
  const save = useGameStore((state) => state.save);
  const assignJob = useGameStore((state) => state.assignJob);
  const recallFromJob = useGameStore((state) => state.recallFromJob);
  const collectJob = useGameStore((state) => state.collectJob);
  // The buttons turn on the settled output, so the clock is coarse; the bars tick on their own.
  const now = useNow(clockConfig.minutesMs);
  const worker = jobWorker(save, job.id);

  return (
    <ParchmentCard
      title={tr(job.name)}
      titleEmoji={job.emoji}
      titleSub={worker ? worker.name : t('jobs.noOne')}
      contentStyle={styles.card}
    >
      <OutputBar save={save} job={job} />
      {worker && <EnergyBar save={save} hero={worker} />}
      <View style={styles.actions}>
        <EmberButton
          title={t('jobs.collect')}
          compact
          disabled={Math.floor(jobOutputNow(save, job.id, now)) < 1}
          onPress={() => collectJob(job.id)}
        />
        {worker ? (
          <WoodButton title={t('jobs.recall')} compact onPress={() => recallFromJob(worker.id)} />
        ) : (
          <EmberButton title={t('jobs.assign')} compact onPress={onTogglePicker} />
        )}
      </View>
      {picking &&
        (worker ? (
          <View style={styles.picker}>
            <Text style={styles.muted}>{t('jobs.taken', { name: worker.name })}</Text>
            <WoodButton title={t('jobs.recall')} compact onPress={() => recallFromJob(worker.id)} />
          </View>
        ) : (
          <View style={styles.picker}>
            <Text style={styles.subtitle}>{t('jobs.pickTitle')}</Text>
            <HeroChips save={save} preselect={preselect} onPick={(heroId) => {
              assignJob(heroId, job.id);
              onPicked();
            }} />
          </View>
        ))}
    </ParchmentCard>
  );
}

/** The free heroes, each with their energy; the preselected one comes marked. */
function HeroChips({ save, preselect, onPick }: { save: SaveData; preselect?: string | null; onPick: (heroId: string) => void }) {
  const now = useNow(clockConfig.minutesMs);
  const free = save.heroes.filter((hero) => !isBusy(save, hero.id));
  if (free.length === 0) return <Text style={styles.muted}>{t('jobs.noFreeHeroes')}</Text>;
  return (
    <View style={styles.chips}>
      {free.map((hero) => (
        <Pressable
          key={hero.id}
          onPress={() => onPick(hero.id)}
          style={[styles.chip, preselect === hero.id && styles.chipActive]}
        >
          <GameIcon emoji={heroClasses[hero.classId].emoji} icon={heroClasses[hero.classId].icon} size={20} />
          <Text>
            {hero.name} · {formatPercent(currentEnergy(save, hero, now) / jobRules.energy.max)}
          </Text>
          <SpecialLabel classId={hero.classId} special={hero.special} short />
        </Pressable>
      ))}
    </View>
  );
}

/** The output waiting at a station, towards the cap it fills after `capHours` of work. */
function OutputBar({ save, job }: { save: SaveData; job: JobDef }) {
  // Its own clock, so the bar ticks without re-rendering the card around it.
  const now = useNow(clockConfig.minutesMs);
  const output = jobOutputNow(save, job.id, now);
  const cap = jobCap(job.id);
  const material = materialById[job.produces];
  return (
    <View>
      <PixelBar value={cap > 0 ? output / cap : 0} color={colors.success} />
      <View style={styles.row}>
        <IconLabel
          emoji={material.emoji}
          icon={material.icon}
          label={t('jobs.output', { amount: output.toFixed(1), cap })}
          labelStyle={styles.barText}
        />
        {isJobFull(save, job.id, now) && <Text style={styles.barText}> · {t('jobs.full')}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  barText: { fontSize: 16, color: colors.muted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  picker: { gap: 8 },
  subtitle: { fontSize: 21 },
  muted: { color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: pixel.outline, borderColor: colors.woodDark, paddingHorizontal: 10, paddingVertical: 6 },
  chipActive: { borderColor: colors.ink, backgroundColor: colors.highlight },
});
