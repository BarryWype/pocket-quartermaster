import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import PagerView from 'react-native-pager-view';

import { GainsLine, IconLabel, RewardLabel } from '@/components/IconLabel';
import { StepChests } from '@/components/StepChests';
import { gainsPrefix, lootLabels } from '@/components/lootText';
import { Text } from '@/components/Text';
import { itemById, valuableById } from '@/content/lookup';
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
import { chestState, dayKey, stepChests } from '@/game/rewards/chests';
import { useTodaySteps } from '@/hooks/useTodaySteps';
import { useLanguage } from '@/hooks/useLanguage';
import { useNow } from '@/hooks/useNow';
import { useQuestPlaces } from '@/hooks/useQuestPlaces';
import { formatDistance, formatDuration, t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { useWorldStore } from '@/store/worldStore';
import { fonts, ui } from '@/theme';

import { Deferred, DiamondRail, EmberButton, GhostScreen, ItemSlot, ParchmentCard, WoodButton, useLazyPages, type RailItem } from '@/components/ui';
import { timed } from '@/components/timed';

/** One emoji per loot category, for the reward slots. */
const CATEGORY_EMOJI: Record<LootCategory, string> = {
  gold: '🪙', // coin-ok: the gold category's slot icon, no amount
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

/** The band's categories at a glance: what usually drops, and the rarer finds. */
function rewardCategories(quest: Quest) {
  const marks = lootMatrix[QUEST_SOURCES[quest.band]].marks;
  const pick = (wanted: string[]) => LOOT_CATEGORIES.filter((category) => wanted.includes(marks[category]));
  return { likely: pick(['A', 'O', 'S']), maybe: pick(['R', 'R/2']) };
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
    case 'collector':
      return t('quests.objective.collector', { item: tr(valuableById[quest.itemId ?? '']?.name ?? '') });
    case 'sellGoods':
      return t('quests.objective.sellGoods', { gold: quest.amount });
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

/** The tilt of each notice in turn, so the board looks pinned by hand. */
const TILTS = [-1, 1, 0] as const;

type QuestsPageId = 'quests' | 'chests';

/** The page the player last swiped to, kept for this session only. */
let lastPage: QuestsPageId | null = null;

/** The rail's items — quests waiting to be seen or claimed, chests ready to open — and the page the screen opens on. */
export function useQuestsRail(): { items: RailItem[]; selected: QuestsPageId } {
  const save = useGameStore((state) => state.save);
  const steps = useTodaySteps();
  const day = dayKey(new Date());
  const questNews = save.quests.list.filter((quest) => !quest.seen || quest.doneAt !== null).length;
  const readyChests = stepChests.filter((chest) => chestState(save, chest, steps, day) === 'ready').length;
  const items: RailItem[] = [
    { key: 'quests', label: t('quests.pages.quests'), emoji: '📜', badge: questNews > 0 ? questNews : undefined },
    { key: 'chests', label: t('quests.pages.chests'), emoji: '🎁', badge: readyChests > 0 ? readyChests : undefined },
  ];
  return { items, selected: lastPage === 'chests' ? 'chests' : 'quests' };
}

/**
 * The daily quests and the step chests, one swipable page each. Opening the
 * list accepts new quests and fixes their targets from where the player stands.
 */
function QuestsScreen() {
  const save = useGameStore((state) => state.save);
  const rail = useQuestsRail();
  if (!isRevealed(save, 'quests')) {
    return (
      <View style={styles.locked}>
        <Text style={styles.muted}>{t('quests.locked')}</Text>
      </View>
    );
  }
  return (
    <Deferred
      name="quests"
      ghost={<GhostScreen variant="cards" rail={<DiamondRail items={rail.items} selected={rail.selected} onSelect={() => {}} />} />}
    >
      <QuestsContent />
    </Deferred>
  );
}

function QuestsContent() {
  useLanguage();
  const now = useNow(5000);
  const save = useGameStore((state) => state.save);
  const game = useGameStore.getState();
  const player = useWorldStore((state) => state.player);
  const { places, ready } = useQuestPlaces(save, player, now);
  const [claimed, setClaimed] = useState<Record<string, string[]>>({});
  const rail = useQuestsRail();
  const [page, setPage] = useState<QuestsPageId>(() => rail.selected);
  const pager = useRef<PagerView>(null);

  useEffect(() => {
    if (ready && player) useGameStore.getState().fixQuestTargets(places, player);
  }, [ready, places, player]);

  // Everything shown counts as seen, also what finishes while the list is open.
  useEffect(() => {
    useGameStore.getState().markQuestsSeen();
  }, [save.quests.list]);

  const rerolls = rerollsLeft(save, now);
  const quests = [...save.quests.list].sort((a, b) => order(a) - order(b) || a.expiresAt - b.expiresAt);

  const claim = (quest: Quest) => {
    const loot = useGameStore.getState().claimQuest(quest.id);
    setClaimed((current) => ({ ...current, [quest.id]: lootLabels(loot) }));
  };

  const targetLine = (quest: Quest) => {
    if (quest.doneAt !== null) return null;
    if (!quest.target) return quest.acceptedAt === null || !ready ? t('quests.searching') : null;
    if (!player) return null;
    const distance = targetDistance(quest, player) ?? 0;
    if (distance <= questRules.arrivalMeters) return t('quests.here');
    return t('quests.target', { distance: formatDistance(Math.round(distance / 10) * 10), direction: compassDirection(player, quest.target.position) });
  };

  const deliver = (quest: Quest) => {
    if (quest.objective !== 'deliver' || quest.doneAt !== null || !quest.target || !player) return null;
    const place: PlaceSpawn | undefined = places.find((p) => p.id === quest.target?.placeId);
    const problem = place ? deliverProblem(save, quest.id, place, player, now) : 'tooFar';
    const missing = problem === 'missing';
    return (
      <>
        <EmberButton
          title={t('quests.deliver')}
          compact
          disabled={problem !== null || !place}
          onPress={() => place && game.deliverQuest(quest.id, place, player)}
        />
        {missing && (
          <Text style={styles.mutedInk}>
            {t('quests.deliverMissing', { count: quest.amount, item: tr(itemById[quest.itemId ?? '']?.name ?? '') })}
          </Text>
        )}
      </>
    );
  };

  const pagerPages = useLazyPages({
    keys: ['quests', 'chests'] as QuestsPageId[],
    active: page,
    variant: 'cards',
    render: (key) =>
      key === 'chests' ? (
        <ScrollView style={styles.content} contentContainerStyle={styles.page}>
          <StepChests />
        </ScrollView>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.page}>
          <View style={styles.pageHead}>
            <Text style={styles.pageTitle}>{t('quests.notices')}</Text>
            <RewardLabel
              text={rerolls === 0 ? t('quests.rerollUsed') : t('quests.rerollFree', { count: rerolls })}
              size={13}
              labelStyle={styles.rerolls}
            />
          </View>
          {quests.length === 0 && Object.keys(claimed).length === 0 && <Text style={styles.muted}>{t('quests.empty')}</Text>}
          {Object.entries(claimed)
            .filter(([id]) => !quests.some((q) => q.id === id))
            .map(([id, gains]) => (
              <View key={id} style={styles.claimed}>
                <RewardLabel text={gainsPrefix(t('quests.claimed', { gains: '' }))} size={13} labelStyle={styles.claimedText} />
                <GainsLine gains={gains.length > 0 ? gains : [t('quests.nothing')]} size={13} labelStyle={styles.claimedText} />
              </View>
            ))}
          {quests.map((quest, index) => (
            <QuestCard
              key={quest.id}
              quest={quest}
              index={index}
              now={now}
              secret={quest.band === 'secret'}
              rerollDisabled={quest.band !== 'secret' && rerollProblem(save, quest.id, now) !== null}
              target={targetLine(quest)}
              onClaim={() => claim(quest)}
              onDeliver={() => deliver(quest)}
              onReroll={() => game.rerollQuest(quest.id)}
            />
          ))}
        </ScrollView>
      ),
  });

  return (
    <View style={styles.screen}>
      <View style={styles.body}>
        <DiamondRail
          items={rail.items}
          selected={page}
          onSelect={(key) => {
            pager.current?.setPage(key === 'chests' ? 1 : 0);
            lastPage = key as QuestsPageId;
          }}
        />
        <PagerView
          ref={pager}
          style={styles.pager}
          initialPage={page === 'chests' ? 1 : 0}
          onPageSelected={({ nativeEvent }) => {
            setPage(nativeEvent.position === 1 ? 'chests' : 'quests');
            lastPage = nativeEvent.position === 1 ? 'chests' : 'quests';
          }}
        >
          {pagerPages}
        </PagerView>
      </View>
    </View>
  );
}

/** One pinned notice: objective, sub-line, progress, reward slots and the action. */
function QuestCard({
  quest,
  index,
  now,
  secret,
  rerollDisabled,
  target,
  onClaim,
  onDeliver,
  onReroll,
}: {
  quest: Quest;
  index: number;
  now: number;
  secret: boolean;
  rerollDisabled: boolean;
  target: string | null;
  onClaim: () => void;
  onDeliver: () => ReactNode;
  onReroll: () => void;
}) {
  const done = quest.doneAt !== null;
  const emoji = quest.objective === 'mark' ? '❓' : objectives[quest.objective].emoji;
  const progress = progressText(quest);
  const { likely, maybe } = rewardCategories(quest);
  return (
    <ParchmentCard pinned tilt={secret ? 0 : TILTS[index % 3]} contentStyle={styles.card}>
      {secret && <RewardLabel text={t('quests.secretTitle')} size={18} labelStyle={styles.secretTitle} />}
      <IconLabel emoji={emoji} label={objectiveText(quest)} size={24} labelStyle={styles.objective} />
      <View style={styles.subline}>
        <Text style={styles.sub}>
          {t(`quests.band.${quest.band}`)}
          {!done && ` · ${t('quests.timeLeft', { time: formatDuration(quest.expiresAt - now) })}`}
        </Text>
        {target && <IconLabel emoji="🧭" label={target} size={13} gap={2} labelStyle={styles.sub} />}
      </View>
      {progress !== null && (
        <View style={styles.progressRow}>
          <View style={styles.barTrack}>
            <View
              style={[styles.barFill, { width: `${Math.min(1, done ? 1 : quest.progress / quest.amount) * 100}%` }, done && styles.barDone]}
            />
          </View>
          <RewardLabel text={progress} size={13} labelStyle={styles.progressText} />
        </View>
      )}
      <View style={styles.rewardRow}>
        {likely.map((category) => (
          <ItemSlot key={category} state="ready" size={32} emoji={CATEGORY_EMOJI[category]} accessibilityLabel={t(`quests.categories.${category}`)} />
        ))}
        {maybe.map((category) => (
          <ItemSlot key={category} state="ready" size={32} faded emoji={CATEGORY_EMOJI[category]} accessibilityLabel={t(`quests.categories.${category}`)} />
        ))}
        <View style={styles.spacer} />
        {done ? (
          <EmberButton title={t('quests.claim')} compact onPress={onClaim} />
        ) : (
          <>
            {onDeliver()}
            {!secret && <WoodButton title={t('quests.reroll')} style={styles.rerollButton} disabled={rerollDisabled} onPress={onReroll} />}
          </>
        )}
      </View>
    </ParchmentCard>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.woodDark },
  body: { flex: 1, flexDirection: 'row' },
  pager: { flex: 1 },
  content: { flex: 1, backgroundColor: ui.woodDark },
  page: { paddingVertical: 12, paddingHorizontal: 14, gap: 14 },
  locked: { flex: 1, backgroundColor: ui.woodDark, alignItems: 'center', justifyContent: 'center', padding: 16 },
  muted: { color: ui.onWoodMuted },
  mutedInk: { fontFamily: fonts.serif, fontSize: 13, color: ui.inkMuted },
  pageHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  pageTitle: { fontSize: 19, color: ui.brassLight },
  rerolls: { fontFamily: fonts.serif, fontSize: 13, color: ui.onWoodMuted },
  claimed: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    backgroundColor: ui.parchment,
    borderWidth: 2,
    borderColor: ui.outline,
  },
  claimedText: { fontFamily: fonts.serif, fontSize: 14, color: ui.ink },
  card: { gap: 6 },
  secretTitle: { fontSize: 18, color: ui.brass },
  objective: { flex: 1, fontSize: 21, lineHeight: 24, color: ui.ink },
  subline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  sub: { fontFamily: fonts.serif, fontSize: 13, color: ui.inkMuted },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barTrack: { flex: 1, height: 12, borderWidth: 2, borderColor: ui.outline, backgroundColor: ui.woodDark },
  barFill: { height: '100%', backgroundColor: ui.hp },
  barDone: { backgroundColor: ui.good },
  progressText: { fontFamily: fonts.serifBold, fontSize: 13, color: ui.ink },
  rewardRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
  spacer: { flex: 1 },
  rerollButton: { minHeight: 44 },
});

export default timed('screen: quests', QuestsScreen);
