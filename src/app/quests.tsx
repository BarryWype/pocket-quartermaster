import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { lootLabels } from '@/components/lootText';
import { Text } from '@/components/Text';
import { itemById } from '@/content/lookup';
import { lootMatrix } from '@/content/loot/matrix';
import { placeInfo } from '@/content/places';
import { objectives, questRules } from '@/content/quests';
import { LOOT_CATEGORIES, type LootCategory } from '@/game/loot/types';
import type { PlaceSpawn } from '@/game/places/generate';
import { rerollProblem, rerollsLeft } from '@/game/quests/arrival';
import { deliverProblem } from '@/game/quests/progress';
import { QUEST_SOURCES } from '@/game/quests/rewards';
import { compassDirection, targetDistance } from '@/game/quests/targets';
import type { Quest } from '@/game/quests/types';
import { isRevealed } from '@/game/reveal/reveal';
import { useLanguage } from '@/hooks/useLanguage';
import { useNow } from '@/hooks/useNow';
import { useQuestPlaces } from '@/hooks/useQuestPlaces';
import { formatDistance, formatDuration, t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { useWorldStore } from '@/store/worldStore';
import { colors, pixel } from '@/theme';
import { IconLabel } from '@/components/IconLabel';

/** One emoji per loot category, for the reward hint. */
const CATEGORY_EMOJI: Record<LootCategory, string> = {
  gold: '🪙',
  xp: '✨',
  materials: '🪵',
  shards: '🔮',
  blueprints: '📜',
  gear: '⚔️',
  trinkets: '💍',
  components: '🧩',
  relics: '🏺',
  monsterParts: '🦴',
  valuables: '💎',
  consumables: '🧪',
  treasureMaps: '🗺️',
  manuals: '📖',
  keyFragments: '🔑',
};

/** The band's row at a glance: what usually drops, and the rarer finds. */
function rewardHint(quest: Quest) {
  const marks = lootMatrix[QUEST_SOURCES[quest.band]].marks;
  const pick = (wanted: string[]) => LOOT_CATEGORIES.filter((c) => wanted.includes(marks[c])).map((c) => CATEGORY_EMOJI[c]).join(' ');
  const likely = pick(['A', 'O', 'S']);
  const maybe = pick(['R', 'R/2']);
  return maybe ? t('quests.rewardsMaybe', { likely, maybe }) : t('quests.rewards', { likely });
}

function objectiveText(quest: Quest) {
  const place = quest.target && quest.target.kind !== 'mark' ? tr(placeInfo[quest.target.kind].name).toLowerCase() : '';
  switch (quest.objective) {
    case 'mark':
      return t('quests.objective.mark');
    case 'patrols':
      return t('quests.objective.patrols', { count: quest.amount });
    case 'gatherOnWay':
      return t('quests.objective.gatherOnWay', { count: quest.amount });
    case 'walk':
      return t('quests.objective.walk', { distance: formatDistance(quest.amount) });
    case 'deliver':
      return t('quests.objective.deliver', { count: quest.amount, item: tr(itemById[quest.itemId ?? '']?.name ?? ''), place });
    case 'mine':
      return t('quests.objective.mine', { count: quest.amount, place });
    case 'fightEvent':
      return t('quests.objective.fightEvent', { place });
    default:
      return t(`quests.objective.${quest.objective}`);
  }
}

function progressText(quest: Quest) {
  if (quest.doneAt !== null) return t('quests.done');
  if (quest.amount <= 1) return null;
  return quest.objective === 'walk'
    ? t('quests.progress', { progress: formatDistance(quest.progress), amount: formatDistance(quest.amount) })
    : t('quests.progress', { progress: quest.progress, amount: quest.amount });
}

const order = (quest: Quest) => (quest.band === 'secret' ? 0 : quest.doneAt !== null ? 1 : 2);

/**
 * The daily quests: each one's objective, band, where its target is, time
 * left, what it may pay and how far along it is. Opening the list accepts new
 * quests and fixes their targets from where the player stands.
 */
export default function QuestsScreen() {
  useLanguage();
  const now = useNow(5000);
  const save = useGameStore((state) => state.save);
  const game = useGameStore.getState();
  const player = useWorldStore((state) => state.player);
  const { places, ready } = useQuestPlaces(save, player, now);
  const [claimed, setClaimed] = useState<Record<string, string>>({});

  useEffect(() => {
    if (ready && player) useGameStore.getState().fixQuestTargets(places, player);
  }, [ready, places, player]);

  // Everything shown counts as seen, also what finishes while the list is open.
  useEffect(() => {
    useGameStore.getState().markQuestsSeen();
  }, [save.quests.list]);

  if (!isRevealed(save, 'quests')) {
    return (
      <View style={styles.container}>
        <Text style={styles.muted}>{t('quests.locked')}</Text>
      </View>
    );
  }

  const rerolls = rerollsLeft(save, now);
  const quests = [...save.quests.list].sort((a, b) => order(a) - order(b) || a.expiresAt - b.expiresAt);

  const claim = (quest: Quest) => {
    const loot = useGameStore.getState().claimQuest(quest.id);
    setClaimed((current) => ({ ...current, [quest.id]: lootLabels(loot).join(', ') || t('quests.nothing') }));
  };

  const targetLine = (quest: Quest) => {
    if (quest.doneAt !== null) return null;
    if (!quest.target) return quest.acceptedAt === null || !ready ? t('quests.searching') : null;
    if (!player) return null;
    const distance = targetDistance(quest, player) ?? 0;
    if (distance <= questRules.arrivalMeters) return t('quests.here');
    return t('quests.target', { distance: formatDistance(Math.round(distance / 10) * 10), direction: compassDirection(player, quest.target.position) });
  };

  const deliverButton = (quest: Quest) => {
    if (quest.objective !== 'deliver' || quest.doneAt !== null || !quest.target || !player) return null;
    const place: PlaceSpawn | undefined = places.find((p) => p.id === quest.target?.placeId);
    const problem = place ? deliverProblem(save, quest.id, place, player, now) : 'tooFar';
    const item = tr(itemById[quest.itemId ?? '']?.name ?? '');
    return (
      <>
        <Button title={t('quests.deliver')} disabled={problem !== null || !place} onPress={() => place && game.deliverQuest(quest.id, place, player)} />
        {problem === 'missing' && <Text style={styles.muted}>{t('quests.deliverMissing', { count: quest.amount, item })}</Text>}
      </>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.muted}>{rerolls === 0 ? t('quests.rerollUsed') : t('quests.rerollFree', { count: rerolls })}</Text>
      {quests.length === 0 && Object.keys(claimed).length === 0 && <Text style={styles.muted}>{t('quests.empty')}</Text>}
      {Object.entries(claimed)
        .filter(([id]) => !quests.some((q) => q.id === id))
        .map(([id, gains]) => (
          <Text key={id} style={styles.claimed}>
            {t('quests.claimed', { gains })}
          </Text>
        ))}
      {quests.map((quest) => {
        const secret = quest.band === 'secret';
        const emoji = quest.objective === 'mark' ? '❓' : objectives[quest.objective].emoji;
        const progress = progressText(quest);
        const target = targetLine(quest);
        return (
          <View key={quest.id} style={[styles.card, secret && styles.secret, quest.doneAt !== null && styles.done]}>
            {secret && <Text style={styles.secretTitle}>{t('quests.secretTitle')}</Text>}
            <View style={styles.header}>
              <IconLabel emoji={emoji} label={objectiveText(quest)} labelStyle={styles.objective} />
              <Text style={styles.band}>{t(`quests.band.${quest.band}`)}</Text>
            </View>
            {target && <IconLabel emoji="🧭" label={target} />}
            {progress && <Text style={quest.doneAt !== null && styles.doneText}>{progress}</Text>}
            <Text style={styles.muted}>{rewardHint(quest)}</Text>
            {quest.doneAt === null && <Text style={styles.muted}>{t('quests.timeLeft', { time: formatDuration(quest.expiresAt - now) })}</Text>}
            <View style={styles.actions}>
              {quest.doneAt !== null ? <Button title={t('quests.claim')} color={colors.success} onPress={() => claim(quest)} /> : deliverButton(quest)}
              {!secret && quest.doneAt === null && (
                <Button title={t('quests.reroll')} disabled={rerollProblem(save, quest.id, now) !== null} onPress={() => game.rerollQuest(quest.id)} />
              )}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8 },
  muted: { color: colors.muted },
  card: { gap: 4, padding: 10, borderWidth: pixel.outline, borderColor: colors.ink, backgroundColor: colors.parchment },
  secret: { borderColor: colors.gold, backgroundColor: colors.parchmentDark },
  secretTitle: { fontSize: 20, color: colors.gold },
  done: { backgroundColor: colors.highlight },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  objective: { flex: 1, fontSize: 21 },
  band: { fontSize: 16, color: colors.wood },
  doneText: { color: colors.success },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  claimed: { padding: 8, backgroundColor: colors.highlight },
});
