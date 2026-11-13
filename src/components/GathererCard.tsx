import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FillBar, PressScale } from '@/components/motion';

import { clockConfig } from '@/content/clockConfig';
import { jobById, type GathererFocus } from '@/content/jobs';
import { materialById } from '@/content/lookup';
import { gathererCapNodes, gathererNodesToday, type GathererWound } from '@/game/jobs/gatherer';
import { isJobFull, jobOutputDetail, jobWorker } from '@/game/jobs/jobs';
import type { SaveData } from '@/game/save';
import { t, tr } from '@/i18n';
import { useNow } from '@/hooks/useNow';
import { colors, pixel } from '@/theme';
import { useGameStore } from '@/store/gameStore';

import { EnergyBar } from './EnergyBar';
import { HeroChips } from './JobsTab';
import { IconLabel } from './IconLabel';
import { Text } from './Text';
import { EmberButton, ParchmentCard, WoodButton } from './ui';

const FOCUS_CHOICES: GathererFocus[] = ['any', 'wood', 'food', 'ore'];

/**
 * The gatherer's card: the hero gathers the nodes visible around the player,
 * so the card picks a focus, shows what it gathered and collects it.
 */
export function GathererCard() {
  const save = useGameStore((state) => state.save);
  const assignJob = useGameStore((state) => state.assignJob);
  const collectJob = useGameStore((state) => state.collectJob);
  const recallFromJob = useGameStore((state) => state.recallFromJob);
  const setGathererFocus = useGameStore((state) => state.setGathererFocus);
  const noteTips = useGameStore((state) => state.noteTips);
  const [picking, setPicking] = useState(false);
  // After a collect, the wounds it cleared stay on show until the next action.
  const [collectedWounds, setCollectedWounds] = useState<GathererWound[] | null>(null);
  // The buttons turn on the settled output, so the clock is coarse; the bar ticks on its own.
  const now = useNow(clockConfig.minutesMs);
  const worker = jobWorker(save, 'gatherer');
  const detail = jobOutputDetail(save, 'gatherer', now);

  // The tip queues the first time the card is on screen; later times change nothing.
  useEffect(() => {
    noteTips(['jobGatherer']);
  }, [noteTips]);

  const working = worker ? { worker } : null;
  const wounds = collectedWounds ?? detail.wounds ?? [];
  const nameOf = (heroId: string) => save.heroes.find((hero) => hero.id === heroId)?.name ?? heroId;

  return (
    <ParchmentCard
      title={tr(jobById.gatherer.name)}
      titleEmoji={jobById.gatherer.emoji}
      titleSub={working ? working.worker.name : t('jobs.noOne')}
      contentStyle={styles.card}
    >
      <Text style={styles.muted}>{t('jobs.gatherer.around')}</Text>
      <View style={styles.picker}>
        <Text style={styles.pickerLabel}>{t('jobs.gatherer.focus')}</Text>
        <View style={styles.options}>
          {FOCUS_CHOICES.map((focus) => (
            <PressScale
              key={focus}
              onPress={() => setGathererFocus(focus)}
              style={[styles.option, save.gatherer.focus === focus && styles.optionActive]}
            >
              <Text style={styles.optionText}>{t(`jobs.gatherer.focusChoices.${focus}`)}</Text>
            </PressScale>
          ))}
        </View>
      </View>
      {working ? (
        <>
          <GathererOutput save={save} />
          <EnergyBar save={save} hero={working.worker} />
          <Text style={styles.muted}>{t('jobs.gatherer.today', { count: gathererNodesToday(save, now) })}</Text>
          {wounds.map((wound, index) => (
            <Text key={`${wound.at}:${index}`} style={styles.muted}>
              {t('jobs.gatherer.hurt', { hero: nameOf(wound.heroId), hp: Math.round(wound.hp) })}
            </Text>
          ))}
          <View style={styles.actions}>
            <EmberButton
              title={t('jobs.collect')}
              compact
              disabled={Object.values(detail.amounts).every((amount) => amount <= 0)}
              onPress={() => {
                setCollectedWounds(detail.wounds ?? []);
                collectJob('gatherer');
              }}
            />
            <WoodButton
              title={t('jobs.recall')}
              compact
              onPress={() => {
                setCollectedWounds(null);
                recallFromJob(working.worker.id);
              }}
            />
          </View>
        </>
      ) : (
        <>
          <View style={styles.actions}>
            <EmberButton title={t('jobs.assign')} compact onPress={() => setPicking(true)} />
          </View>
          {picking && (
            <View style={styles.picker}>
              <Text style={styles.subtitle}>{t('jobs.pickTitle')}</Text>
              <HeroChips
                save={save}
                onPick={(heroId) => {
                  assignJob(heroId, 'gatherer');
                  setPicking(false);
                }}
              />
            </View>
          )}
        </>
      )}
    </ParchmentCard>
  );
}

/** The nodes gathered around the player, with what they gave, towards the cap a collect clears. */
function GathererOutput({ save }: { save: SaveData }) {
  // Its own clock, so the bar ticks without re-rendering the card around it.
  const now = useNow(clockConfig.minutesMs);
  const detail = jobOutputDetail(save, 'gatherer', now);
  const cap = gathererCapNodes();
  const waiting = Object.entries(detail.amounts).filter(([, amount]) => amount > 0);
  const nodes = detail.nodes ?? 0;
  return (
    <View style={styles.bar}>
      <FillBar value={nodes / cap} color={colors.success} />
      <View style={styles.row}>
        {waiting.map(([materialId, amount]) => (
          <IconLabel
            key={materialId}
            emoji={materialById[materialId].emoji}
            icon={materialById[materialId].icon}
            label={String(amount)}
            labelStyle={styles.barText}
          />
        ))}
        <Text style={styles.barText}>{t('jobs.gatherer.nodes', { count: nodes, cap })}</Text>
        {isJobFull(save, 'gatherer', now) && <Text style={styles.barText}> · {t('jobs.full')}</Text>}
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
  picker: { gap: 4 },
  pickerLabel: { fontSize: 16, color: colors.muted, textTransform: 'uppercase' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  option: { paddingHorizontal: 8, paddingVertical: 4, borderWidth: 2, borderColor: colors.woodDark, backgroundColor: colors.parchmentDark },
  optionActive: { borderColor: colors.ink, borderWidth: pixel.outline, backgroundColor: colors.highlight },
  optionText: { fontSize: 17 },
  subtitle: { fontSize: 21 },
  muted: { color: colors.muted },
});
