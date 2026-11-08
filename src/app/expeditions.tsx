import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import PagerView from 'react-native-pager-view';

import { Countdown, countdownText } from '@/components/Countdown';
import { ExpeditionDialog } from '@/components/ExpeditionDialog';
import { GameIcon } from '@/components/GameIcon';
import { LootReveal } from '@/components/LootReveal';
import { OvernightCard } from '@/components/OvernightCard';
import { PlaceNotice } from '@/components/PlaceNotice';
import { ReportCard } from '@/components/ReportCard';
import { Text } from '@/components/Text';
import { TutorialHint } from '@/components/TutorialHint';
import { IconLabel, RewardLabel, splitLeadingEmoji } from '@/components/IconLabel';
import { Deferred, DiamondButton, DiamondRail, EmberButton, GhostScreen, ParchmentCard, useLazyPages, type RailItem } from '@/components/ui';
import { clockConfig } from '@/content/clockConfig';
import { dungeons } from '@/content/dungeons';
import { heroClasses } from '@/content/heroes';
import { dungeonById } from '@/content/lookup';
import { provisionRules } from '@/content/provisions';
import { tutorialRules } from '@/content/tutorial';
import { nextRotationAt, rotationDay } from '@/game/dungeons/rotation';
import { tierChain } from '@/game/dungeons/unlock';
import {
  briefingOf,
  dungeonLootSource,
  expeditionMinutes,
  firstWinAvailable,
  isDungeonAvailable,
  isDungeonUnlocked,
  readyExpeditions,
  type Loadout,
} from '@/game/expeditions/expeditions';
import { isJobFull, isTired } from '@/game/jobs/jobs';
import { includesWorking, recallWorkingHeroes } from '@/components/workingHeroes';
import { JobsTab } from '@/components/JobsTab';
import { jobs } from '@/content/jobs';
import { isRevealed } from '@/game/reveal/reveal';
import { supplyHeld } from '@/game/expeditions/provisions';
import { briefingReadiness } from '@/game/threats/readiness';
import type { ExpeditionReport, HeroState } from '@/game/types';
import { syncBackground } from '@/hooks/useAutoGather';
import { useLanguage } from '@/hooks/useLanguage';
import { useNow } from '@/hooks/useNow';
import { syncPlan } from '@/hooks/useNotifications';
import { formatDuration, formatPercent, t, tr } from '@/i18n';
import { deviceNotifications } from '@/services/notifications';
import { currentRotation, debugEnabled, useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { fonts, ui } from '@/theme';
import { timed } from '@/components/timed';

type Tab = 'places' | 'out' | 'jobs';
const TABS: Tab[] = ['places', 'out', 'jobs'];

/** The tier diamonds' labels. */
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
/** The notices hang a little crooked on the board, each its own way. */
const NOTICE_TILTS = [-1, 1, 0] as const;

/** What the loot reveal shows: the report, and the heroes before and after for XP and level-ups. */
type Collected = { report: ExpeditionReport; before: HeroState[]; after: HeroState[] };

/** The rail's items, and the tab the screen opens on: Out now when a team is back, so the loot is the first thing to see. */
export function useExpeditionsRail(): { items: RailItem[]; initial: Tab } {
  const save = useGameStore((state) => state.save);
  const now = useNow(clockConfig.minutesMs);
  const ready = readyExpeditions(save, now);
  const unseen = save.reports.filter((r) => !r.seen).length;
  const outBadge = ready.length > 0 ? ready.length : unseen > 0 ? unseen : save.expeditions.length > 0 ? save.expeditions.length : undefined;
  // Stations full of output and tired workers, waiting on a check-in.
  const jobNews =
    jobs.filter((job) => isJobFull(save, job.id, now)).length + save.heroes.filter((hero) => isTired(save, hero, now)).length;
  const items: RailItem[] = [
    {
      key: 'places',
      label: t('expeditions.tabs.places'),
      emoji: '🏰',
      icon: require('../../assets/icons/scaled/menu-expeditions.png'),
    },
    { key: 'out', label: t('expeditions.tabs.out'), emoji: '🧭', badge: outBadge },
    { key: 'jobs', label: t('expeditions.tabs.jobs'), emoji: '🪓', badge: jobNews > 0 ? jobNews : undefined },
  ];
  return { items, initial: ready.length > 0 ? 'out' : 'places' };
}

export function ExpeditionsScreen() {
  const rail = useExpeditionsRail();
  return (
    <Deferred
      name="expeditions"
      ghost={<GhostScreen variant="cards" rail={<DiamondRail items={rail.items} selected={rail.initial} onSelect={() => {}} />} />}
    >
      <ExpeditionsContent />
    </Deferred>
  );
}

function ExpeditionsContent() {
  useLanguage();
  const save = useGameStore((state) => state.save);
  const start = useGameStore((state) => state.startExpedition);
  const collectLoot = useGameStore((state) => state.collectLoot);
  const markReportsSeen = useGameStore((state) => state.markReportsSeen);
  const closeCookingHint = useGameStore((state) => state.closeCookingHint);
  const askedPermission = useSettingsStore((state) => state.askedNotificationPermission);
  const setSettings = useSettingsStore((state) => state.set);
  const fastExpeditions = useDebugStore((state) => debugEnabled(state) && state.fastExpeditions);
  const durationScale = fastExpeditions ? 1 / 60 : 1;
  const now = useNow(clockConfig.minutesMs);
  const ready = readyExpeditions(save, now);

  const rail = useExpeditionsRail();
  // The hero card opens the Jobs tab on a hero: tab=jobs preselects them in the assign picker.
  const { tab: tabParam, heroId } = useLocalSearchParams<{ tab?: string; heroId?: string }>();
  // Open on Out now when a team is back, so the loot is the first thing to see.
  const [tab, setTabState] = useState<Tab>(() => (tabParam === 'jobs' ? 'jobs' : rail.initial));
  const [tier, setTier] = useState<number | null>(null);
  /** The place whose notice was tapped: its party dialog is open. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [openReport, setOpenReport] = useState<string | null>(null);
  const [collected, setCollected] = useState<Collected | null>(null);

  // Reports count as read once the player leaves their tab or the screen.
  const tabRef = useRef(tab);
  const pager = useRef<PagerView>(null);
  const [initialTab] = useState(tab);
  /** Follows a swipe; `setTab` also turns the page. */
  const showTab = (next: Tab) => {
    if (tabRef.current === 'out' && next !== 'out') markReportsSeen();
    tabRef.current = next;
    setTabState(next);
  };
  const setTab = (next: Tab) => {
    pager.current?.setPage(TABS.indexOf(next));
    showTab(next);
  };
  useFocusEffect(useCallback(() => () => markReportsSeen(), [markReportsSeen]));

  // A hero card's link can also land while the screen is open: follow its tab then.
  useEffect(() => {
    if (tabParam === 'jobs')
      // eslint-disable-next-line react-hooks/set-state-in-effect -- navigation params are external input, not render state.
      setTab('jobs');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setTab comes from this render and is stable.
  }, [tabParam]);

  // Re-read when the day changes or a debug override does.
  const day = rotationDay(now);
  const dayOffset = useDebugStore((state) => state.rotationDayOffset);
  const forcedBriefings = useDebugStore((state) => state.forcedBriefings);
  const rotation = useMemo(
    () => currentRotation(now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [day, dayOffset, forcedBriefings],
  );

  /** The first launch asks, in game, before the OS permission prompt. */
  const send = (dungeonId: string, party: string[], loadout: Loadout) => {
    const setOut = async () => {
      // The pure send rule refuses working heroes: recall them first, in the same tap.
      recallWorkingHeroes(party);
      start(dungeonId, party, durationScale, loadout);
      syncBackground();
      if (askedPermission) return;
      setSettings({ askedNotificationPermission: true });
      const permission = await deviceNotifications.getPermission().catch(() => null);
      if (!permission || permission.granted || !permission.canAskAgain) return;
      Alert.alert(t('expeditions.askTitle'), t('expeditions.askBody'), [
        { text: t('expeditions.notNow'), style: 'cancel' },
        { text: t('expeditions.yes'), onPress: () => deviceNotifications.requestPermission().then(syncPlan, () => {}) },
      ]);
    };
    const escortId = save.escort?.heroId;
    const escort = escortId && party.includes(escortId) ? save.heroes.find((h) => h.id === escortId) : undefined;
    if (!escort) return setOut();
    Alert.alert(t('expeditions.confirm.escortTitle', { hero: escort.name }), t('expeditions.confirm.escortBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: includesWorking(save, party) ? t('jobs.recallAndSend') : t('expeditions.send'), onPress: () => void setOut() },
    ]);
  };

  const collect = (expeditionId: string) => {
    const before = useGameStore.getState().save.heroes;
    const report = collectLoot(expeditionId);
    if (report) setCollected({ report, before, after: useGameStore.getState().save.heroes });
  };

  // The unlocked chain dungeons per tier, in chain order; until dungeons are
  // revealed, only the tutorial's.
  const dungeonsShown = isRevealed(save, 'dungeons');
  const open = useMemo(() => {
    if (!dungeonsShown) {
      return save.tutorial.step !== 'done' ? [dungeonById[tutorialRules.dungeonId]] : [];
    }
    return dungeons
      .filter((d) => !d.overnight && isDungeonUnlocked(save, d))
      .sort((a, b) => a.tier - b.tier || (a.chainIndex ?? 0) - (b.chainIndex ?? 0));
  }, [save, dungeonsShown]);
  // The overnight expedition of each unlocked tier, open every day.
  const overnight = useMemo(
    () => dungeons.filter((d) => dungeonsShown && d.overnight && isDungeonUnlocked(save, d)).sort((a, b) => a.tier - b.tier),
    [save, dungeonsShown],
  );
  const tiers = [...new Set(open.map((d) => d.tier))];
  // The highest tier by default; the first one while the tutorial runs.
  const shownTier = tier !== null && tiers.includes(tier) ? tier : save.tutorial.step === 'done' ? tiers[tiers.length - 1] : tiers[0];
  const shown = useMemo(() => open.filter((d) => d.tier === shownTier), [open, shownTier]);
  const shownOvernight = overnight.find((d) => d.tier === shownTier) ?? null;
  // The chain's next locked dungeon shows greyed; the ones behind it hide behind a count.
  const chain = dungeonsShown ? tierChain(shownTier) : [];
  const firstLocked = chain.find((d) => !isDungeonUnlocked(save, d)) ?? null;
  const hiddenCount = firstLocked
    ? chain.filter((d) => (d.chainIndex ?? 0) > (firstLocked.chainIndex ?? 0) && !isDungeonUnlocked(save, d)).length
    : 0;
  const lockedPrevious = !firstLocked
    ? null
    : firstLocked.chainIndex === 0
      ? dungeons.find((d) => d.tier === shownTier - 1 && d.isBoss)
      : chain.find((d) => d.chainIndex === firstLocked.chainIndex! - 1);

  // Today's briefings of the places shown, and their readiness stamps: once per
  // save change for all of them, never per notice render (briefingReadiness
  // also keeps its answers per save).
  const briefings = useMemo(
    () => Object.fromEntries(shown.map((dungeon) => [dungeon.id, briefingOf(save, dungeon, rotation, now)])),
    // The briefing changes with the rotation, the tutorial and the safe start only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, rotation, save.tutorial.step, save.stats.expeditionsLaunched],
  );
  const readiness = useMemo(
    () => Object.fromEntries(Object.entries(briefings).map(([id, briefing]) => [id, briefingReadiness(save, briefing)])),
    [save, briefings],
  );

  const confirmingDungeon = [...open, ...overnight].find((d) => d.id === confirming);

  const lowSupply = save.tutorial.step === 'done' && !save.cookingHintSeen && supplyHeld(save.consumables) < provisionRules.lowStockPoints;
  const readyBanner = t('expeditions.readyBanner', { count: ready.length });

  const placesTab = (
    <>
      {lowSupply && (
        <Pressable onPress={closeCookingHint} accessibilityLabel={t('map.cookingHint')} style={styles.hint}>
          <RewardLabel text={t('map.cookingHint')} size={16} labelStyle={styles.hintText} />
        </Pressable>
      )}
      <View style={styles.tiers}>
        {ROMAN.map((roman, i) => {
          const n = i + 1;
          const unlocked = tiers.includes(n);
          return (
            <DiamondButton
              key={n}
              label={roman}
              size={36}
              selected={shownTier === n}
              disabled={!unlocked}
              accessibilityLabel={t('expeditions.tier', { tier: n })}
              onPress={() => unlocked && setTier(n)}
            />
          );
        })}
      </View>
      <Countdown
        endsAt={nextRotationAt(now)}
        render={(ms) => <Text style={styles.muted}>{t('expeditions.tapPlace', { time: countdownText(ms) })}</Text>}
      />
      <View style={styles.notices}>
        {shown.map((dungeon, i) => {
          const available = isDungeonAvailable(save, dungeon, rotation);
          return (
            <PlaceNotice
              key={dungeon.id}
              dungeon={dungeon}
              briefing={briefings[dungeon.id]}
              sub={`${t(`expeditions.kind.${dungeon.isBoss ? 'boss' : dungeon.difficulty === 'easy' ? 'short' : 'long'}`)} · ${formatDuration(expeditionMinutes(save, dungeon) * 60_000 * durationScale)}`}
              source={dungeonLootSource(dungeon)}
              firstWin={firstWinAvailable(save, dungeon, now)}
              readiness={available ? readiness[dungeon.id] : null}
              tilt={NOTICE_TILTS[i % NOTICE_TILTS.length]}
              disabled={!available}
              onPress={() => setConfirming(dungeon.id)}
            />
          );
        })}
      </View>
      {firstLocked && lockedPrevious && (
        <View style={styles.locked}>
          <IconLabel emoji="🔒" label={tr(firstLocked.name)} labelStyle={styles.lockedText} />
          <Text style={styles.lockedText}>{t('expeditions.clearFirst', { name: tr(lockedPrevious.name) })}</Text>
        </View>
      )}
      {hiddenCount > 0 && <Text style={styles.muted}>{t('expeditions.moreToDiscover', { count: hiddenCount })}</Text>}
      {shownOvernight && (
        <OvernightCard save={save} dungeon={shownOvernight} rotation={rotation} now={now} onSend={() => setConfirming(shownOvernight.id)} />
      )}
    </>
  );

  const outTab = (
    <>
      {save.expeditions.length === 0 && <Text style={styles.muted}>{t('expeditions.noTeams')}</Text>}
      {[...save.expeditions]
        .sort((a, b) => a.endsAt - b.endsAt)
        .map((expedition) => {
          const dungeon = dungeonById[expedition.dungeonId];
          const heroes = save.heroes.filter((h) => expedition.heroIds.includes(h.id));
          const progress = Math.min(1, Math.max(0, (now - expedition.startedAt) / (expedition.endsAt - expedition.startedAt)));
          const back = expedition.endsAt <= now;
          const collectSplit = splitLeadingEmoji(t('expeditions.collect')) ?? { emoji: undefined, label: t('expeditions.collect') };
          return (
            <ParchmentCard
              key={expedition.id}
              title={tr(dungeon.name)}
              titleEmoji={dungeon.emoji}
              titleSub={back ? t('expeditions.back') : <Countdown endsAt={expedition.endsAt} />}
              contentStyle={styles.teamCard}
            >
              <View style={styles.teamRow}>
                {heroes.map((hero) => (
                  <View key={hero.id} style={styles.teamHero}>
                    <View style={styles.teamPortrait}>
                      <GameIcon emoji={heroClasses[hero.classId].emoji} icon={heroClasses[hero.classId].icon} size={28} />
                    </View>
                    <Text style={styles.teamHeroName} numberOfLines={1}>
                      {hero.name}
                    </Text>
                  </View>
                ))}
              </View>
              {back ? (
                <EmberButton
                  title={collectSplit.label}
                  emoji={collectSplit.emoji}
                  compact
                  onPress={() => collect(expedition.id)}
                />
              ) : (
                <View style={styles.progressRow}>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
                  </View>
                  <Text style={styles.mutedInk}>{t('expeditions.explored', { percent: formatPercent(progress) })}</Text>
                </View>
              )}
            </ParchmentCard>
          );
        })}
      <Text style={styles.heading}>{t('expeditions.reports')}</Text>
      {save.reports.length === 0 && <Text style={styles.muted}>{t('expeditions.noReports')}</Text>}
      {save.reports.map((report) => (
        <ReportCard
          key={report.id}
          report={report}
          heroes={save.heroes}
          now={now}
          expanded={openReport === report.id}
          onToggle={() => setOpenReport(openReport === report.id ? null : report.id)}
        />
      ))}
    </>
  );

  const pagerPages = useLazyPages({
    keys: TABS,
    active: tab,
    variant: 'cards',
    render: (key) => (
      <ScrollView style={styles.content} contentContainerStyle={styles.container}>
        <TutorialHint screen="expeditions" />
        {ready.length > 0 && key !== 'out' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={readyBanner}
            onPress={() => setTab('out')}
            style={styles.banner}
          >
            <RewardLabel text={readyBanner} size={16} labelStyle={styles.bannerText} />
          </Pressable>
        )}
        {key === 'places' ? placesTab : key === 'out' ? outTab : <JobsTab key={heroId ?? 'none'} preselect={heroId ?? null} />}
      </ScrollView>
    ),
  });

  return (
    <View style={styles.screen}>
      <View style={styles.body}>
        <DiamondRail items={rail.items} selected={tab} onSelect={(key) => setTab(key as Tab)} />
        <PagerView
          ref={pager}
          style={styles.pager}
          initialPage={TABS.indexOf(initialTab)}
          onPageSelected={({ nativeEvent }) => showTab(TABS[nativeEvent.position])}
        >
          {pagerPages}
        </PagerView>
      </View>

      {confirmingDungeon && (
        <ExpeditionDialog
          dungeon={confirmingDungeon}
          durationScale={durationScale}
          now={now}
          onClose={() => setConfirming(null)}
          onSend={(party, loadout) => {
            setConfirming(null);
            send(confirmingDungeon.id, party, loadout);
          }}
        />
      )}
      {collected && (
        <LootReveal
          {...collected}
          onClose={() => setCollected(null)}
          onReadReport={() => {
            setOpenReport(collected.report.id);
            setCollected(null);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.woodDark },
  body: { flex: 1, flexDirection: 'row' },
  pager: { flex: 1 },
  content: { flex: 1, backgroundColor: ui.woodDark },
  container: { paddingVertical: 14, paddingHorizontal: 12, gap: 10 },
  muted: { fontFamily: fonts.serif, fontSize: 13, color: ui.onWoodMuted },
  locked: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, opacity: 0.6 },
  lockedText: { fontFamily: fonts.serif, fontSize: 14, color: ui.onWoodMuted },
  banner: { minHeight: 44, justifyContent: 'center', padding: 10, borderWidth: 2, borderColor: ui.outline, backgroundColor: ui.parchment },
  bannerText: { fontFamily: fonts.serif, fontSize: 14, color: ui.ink },
  heading: { fontSize: 19, color: ui.brassLight },
  hint: { minHeight: 44, justifyContent: 'center', padding: 10, borderWidth: 2, borderColor: ui.outline, backgroundColor: ui.parchment },
  hintText: { fontFamily: fonts.serif, fontSize: 14, color: ui.ink },
  tiers: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingVertical: 4 },
  notices: { gap: 18, paddingTop: 6 },
  teamCard: { gap: 9 },
  teamRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' },
  teamHero: { alignItems: 'center', gap: 2, width: 52 },
  teamPortrait: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.woodMid,
    borderWidth: 2,
    borderColor: ui.outline,
  },
  teamHeroName: { fontFamily: fonts.serif, fontSize: 12, color: ui.inkMuted },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barTrack: { flex: 1, height: 12, borderWidth: 2, borderColor: ui.outline, backgroundColor: ui.woodDark },
  barFill: { height: '100%', backgroundColor: ui.xp },
  mutedInk: { fontFamily: fonts.serif, fontSize: 13, color: ui.inkMuted },
});

export default timed('screen: expeditions', ExpeditionsScreen);
