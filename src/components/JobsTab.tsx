import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FillBar, PressScale } from '@/components/motion';

import { clockConfig } from '@/content/clockConfig';
import { type JobDef, jobRules, jobs } from '@/content/jobs';
import { heroClasses } from '@/content/heroes';
import { materialById } from '@/content/lookup';
import { placeInfo } from '@/content/places';
import { workToolByKind, workToolNames, workTools } from '@/content/workTools';
import { currentEnergy, isJobFull, isJobOpen, jobCap, jobChoices, jobMaterials, jobOutputDetail, jobOutputNow, jobWorker, openJobs, wornWorkTool } from '@/game/jobs/jobs';
import type { SaveData } from '@/game/save';
import type { HeroState } from '@/game/types';
import { isBusy } from '@/game/team/team';
import { formatPercent, t, tr } from '@/i18n';
import { useNow } from '@/hooks/useNow';
import { colors, pixel } from '@/theme';
import { useGameStore } from '@/store/gameStore';

import { EnergyBar } from './EnergyBar';
import { GameIcon } from './GameIcon';
import { IconLabel } from './IconLabel';
import { SpecialLabel } from './SpecialLabel';
import { Text } from './Text';
import { Tip } from './Tip';
import { EmberButton, ParchmentCard, WoodButton } from './ui';

import { GathererCard } from './GathererCard';

/**
 * The Expeditions screen's Jobs tab: one card per station, with its worker,
 * output and energy, and Collect, Recall and Assign. `preselect` is the hero
 * the hero card sent over: their assign picker opens on them.
 */
export function JobsTab({ preselect }: { preselect?: string | null }) {
  const noteTips = useGameStore((state) => state.noteTips);
  const save = useGameStore((state) => state.save);
  // The tip queues the first time the tab is on screen; later times change nothing.
  useEffect(() => {
    noteTips(['jobs']);
  }, [noteTips]);

  /** The station whose assign picker is open. */
  const [picking, setPicking] = useState<string | null>(() => (preselect ? jobs[0].id : null));

  return (
    <>
      {openJobs(save).map((job) => (
        <JobCard
          key={job.id}
          job={job}
          picking={picking === job.id}
          preselect={preselect}
          onTogglePicker={() => setPicking(picking === job.id ? null : job.id)}
          onPicked={() => setPicking(null)}
        />
      ))}
      {isJobOpen(save, 'gatherer') && <GathererCard />}
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
      <OrePicker save={save} job={job} />
      {worker && <EnergyBar save={save} hero={worker} />}
      {worker && <ToolLine save={save} job={job} worker={worker} />}
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

/** The station's tool: its icon on the worker wearing it, otherwise a hint where to buy one. */
function ToolLine({ save, job, worker }: { save: SaveData; job: JobDef; worker: HeroState }) {
  const tool = wornWorkTool(save, worker);
  if (tool && tool.job === job.id) {
    const def = workToolByKind[tool.kind];
    return (
      <View style={styles.row}>
        <GameIcon emoji={def.emoji} icon={def.icon} size={20} />
        <Text style={styles.barText}>{tr(workToolNames[tool.kind][tool.tier - 1])}</Text>
      </View>
    );
  }
  const def = workTools.find((w) => w.job === job.id);
  if (!def) return null;
  return (
    <Text style={styles.muted}>
      {t('jobs.toolHint', { tool: t(`workTool.kind.${def.kind}`), place: tr(placeInfo[def.places[0]].name) })}
    </Text>
  );
}

/** The materials worth showing as a job's produce: every one it makes, unlocked ores only for a choice job. */
function producesOf(save: SaveData, job: JobDef): string[] {
  const choices = jobChoices(save, job.id);
  return choices.length > 0 ? choices : jobMaterials(job);
}

/** The produces row's tip text: the odds for weighted jobs, otherwise the material names. */
function producesTip(save: SaveData, job: JobDef): string {
  const ids = producesOf(save, job);
  if (typeof job.produces === 'object' && 'weights' in job.produces) {
    const weights = job.produces.weights;
    const sum = Object.values(weights).reduce((total, weight) => total + weight, 0);
    return ids
      .map((id) => t('jobs.odds', { name: tr(materialById[id].name), percent: formatPercent((weights[id] ?? 0) / sum) }))
      .join(' · ');
  }
  return ids.map((id) => tr(materialById[id].name)).join(' · ');
}

/** The ore picker of a choice job: one chip per unlocked material, the chosen one highlighted. */
function OrePicker({ save, job }: { save: SaveData; job: JobDef }) {
  const setJobChoice = useGameStore((state) => state.setJobChoice);
  const choices = jobChoices(save, job.id);
  if (choices.length === 0) return null;
  const choice = save.jobChoice[job.id];
  const current = choice !== null && choice !== undefined && choices.includes(choice) ? choice : choices[choices.length - 1];
  return (
    <View style={styles.row}>
      <Text style={styles.barText}>{t('jobs.ore')}</Text>
      <View style={styles.chips}>
        {choices.map((material) => (
          <PressScale
            key={material}
            onPress={() => setJobChoice(job.id, material)}
            style={[styles.chip, current === material && styles.chipActive]}
          >
            <IconLabel emoji={materialById[material].emoji} icon={materialById[material].icon} label={tr(materialById[material].name)} />
          </PressScale>
        ))}
      </View>
    </View>
  );
}

/** The output waiting at a station, towards the cap it fills after `capHours` of work. */
function OutputBar({ save, job }: { save: SaveData; job: JobDef }) {
  // Its own clock, so the bar ticks without re-rendering the card around it.
  const now = useNow(clockConfig.minutesMs);
  const output = jobOutputNow(save, job.id, now);
  const cap = jobCap(job.id);
  const detail = jobOutputDetail(save, job.id, now);
  const waiting = jobMaterials(job).filter((id) => (detail.amounts[id] ?? 0) > 0);
  return (
    <View style={styles.bar}>
      <FillBar value={cap > 0 ? output / cap : 0} color={colors.success} />
      <View style={styles.row}>
        {waiting.map((materialId) => (
          <IconLabel
            key={materialId}
            emoji={materialById[materialId].emoji}
            icon={materialById[materialId].icon}
            label={String(detail.amounts[materialId])}
            labelStyle={styles.barText}
          />
        ))}
        <Text style={styles.barText}>{t('jobs.output', { amount: output.toFixed(1), cap })}</Text>
        {isJobFull(save, job.id, now) && <Text style={styles.barText}> · {t('jobs.full')}</Text>}
      </View>
      <View style={styles.row}>
        <Text style={styles.barText}>{t('jobs.produces')}</Text>
        <Tip text={producesTip(save, job)}>
          <View style={styles.row}>
            {producesOf(save, job).map((materialId) => (
              <GameIcon key={materialId} emoji={materialById[materialId].emoji} icon={materialById[materialId].icon} size={20} />
            ))}
          </View>
        </Tip>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  bar: { gap: 4 },
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
