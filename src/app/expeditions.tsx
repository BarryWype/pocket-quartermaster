import { useFocusEffect } from 'expo-router';
import { rosterRules } from '@/content/roster';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import PagerView from 'react-native-pager-view';

import { DungeonCard } from '@/components/DungeonCard';
import { Countdown, countdownText } from '@/components/Countdown';
import { GameIcon } from '@/components/GameIcon';
import { HpBar } from '@/components/HpBar';
import { LootReveal } from '@/components/LootReveal';
import { OvernightCard } from '@/components/OvernightCard';
import { ReportCard } from '@/components/ReportCard';
import { SendDialog } from '@/components/SendDialog';
import { Text } from '@/components/Text';
import { ThreatCoverageChips } from '@/components/ThreatDetail';
import { TutorialHint } from '@/components/TutorialHint';
import { IconLabel, RewardLabel, splitLeadingEmoji } from '@/components/IconLabel';
import { Deferred, DiamondButton, DiamondRail, EmberButton, GhostScreen, ParchmentCard, useLazyPages, type RailItem } from '@/components/ui';
import { clockConfig } from '@/content/clockConfig';
import { dungeons } from '@/content/dungeons';
import { heroClasses } from '@/content/heroes';
import { dungeonById } from '@/content/lookup';
import { provisionRules } from '@/content/provisions';
import { narrowPartySize } from '@/content/threats';
import { tutorialRules } from '@/content/tutorial';
import { nextRotationAt, rotationDay } from '@/game/dungeons/rotation';
import { tierChain } from '@/game/dungeons/unlock';
import { briefingOf, expeditionMinutes, isDungeonUnlocked, readyExpeditions, type Loadout } from '@/game/expeditions/expeditions';
import type { Odds } from '@/game/expeditions/odds';
import { cachedEstimateOdds, cachedOdds, oddsKey } from '@/game/expeditions/oddsCache';
import { isRevealed } from '@/game/reveal/reveal';
import { supplyHeld } from '@/game/expeditions/provisions';
import { briefingCoverage } from '@/game/threats/coverage';
import { isOnExpedition } from '@/game/team/team';
import type { ExpeditionReport, HeroState } from '@/game/types';
import { syncBackground } from '@/hooks/useAutoGather';
import { useLanguage } from '@/hooks/useLanguage';
import { useNow } from '@/hooks/useNow';
import { syncPlan } from '@/hooks/useNotifications';
import { formatPercent, t, tr } from '@/i18n';
import { deviceNotifications } from '@/services/notifications';
import { recordTiming } from '@/services/timings';
import { currentRotation, debugEnabled, useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { fonts, ui } from '@/theme';
import { timed } from '@/components/timed';

type Tab = 'dungeons' | 'teams' | 'reports';
const TABS: Tab[] = ['dungeons', 'teams', 'reports'];

/** The tier diamonds' labels. */
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

/** What the loot reveal shows: the report, and the heroes before and after for XP and level-ups. */
type Collected = { report: ExpeditionReport; before: HeroState[]; after: HeroState[] };

/** The rail's items, and the tab the screen opens on: teams when a team is back, so the loot is the first thing to see. */
export function useExpeditionsRail(): { items: RailItem[]; initial: Tab } {
  const save = useGameStore((state) => state.save);
  const now = useNow(clockConfig.minutesMs);
  const ready = readyExpeditions(save, now);
  const unseen = save.reports.filter((r) => !r.seen).length;
  const teamsBadge = ready.length > 0 ? ready.length : save.expeditions.length > 0 ? save.expeditions.length : undefined;
  const items: RailItem[] = [
    {
      key: 'dungeons',
      label: t('expeditions.tabs.dungeons'),
      emoji: '🏰',
      icon: require('../../assets/icons/scaled/menu-expeditions.png'),
    },
    { key: 'teams', label: t('expeditions.tabs.teams'), emoji: '🧭', badge: teamsBadge },
    { key: 'reports', label: t('expeditions.tabs.reports'), emoji: '📜', badge: unseen > 0 ? unseen : undefined },
  ];
  return { items, initial: ready.length > 0 ? 'teams' : 'dungeons' };
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
  // In development: how long the first render took to reach its effects (no simulation in it any more).
  const [mountedAt] = useState(() => Date.now());
  useEffect(() => {
    if (__DEV__) console.log(`[odds] expeditions first render ${Date.now() - mountedAt}ms`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  // Open on the teams when one is back, so the loot is the first thing to see.
  const [tab, setTabState] = useState<Tab>(() => rail.initial);
  const [selected, setSelected] = useState<string[]>(() =>
    save.heroes.filter((h) => !isOnExpedition(save, h.id)).slice(0, rosterRules.partySize).map((h) => h.id),
  );
  /** The dungeon card opened: its details show, and heroes good there get a badge. */
  const [focused, setFocused] = useState<string | null>(null);
  const [tier, setTier] = useState<number | null>(null);
  /** The dungeon whose Send was tapped, waiting for confirmation. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [openReport, setOpenReport] = useState<string | null>(null);
  const [collected, setCollected] = useState<Collected | null>(null);
  /** Scouting report (Guild Hall): tomorrow's rotation. */

  // Reports count as read once the player leaves their tab or the screen.
  const tabRef = useRef(tab);
  const pager = useRef<PagerView>(null);
  const [initialTab] = useState(tab);
  /** Follows a swipe; `setTab` also turns the page. */
  const showTab = (next: Tab) => {
    if (tabRef.current === 'reports' && next !== 'reports') markReportsSeen();
    tabRef.current = next;
    setTabState(next);
  };
  const setTab = (next: Tab) => {
    pager.current?.setPage(TABS.indexOf(next));
    showTab(next);
  };
  useFocusEffect(useCallback(() => () => markReportsSeen(), [markReportsSeen]));

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
      { text: t('expeditions.send'), onPress: () => void setOut() },
    ]);
  };

  const collect = (expeditionId: string) => {
    const before = useGameStore.getState().save.heroes;
    const report = collectLoot(expeditionId);
    if (report) setCollected({ report, before, after: useGameStore.getState().save.heroes });
  };

  const party = useMemo(
    () => selected.filter((id) => !isOnExpedition(save, id)).slice(0, rosterRules.partySize),
    [selected, save],
  );

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
  const shown = open.filter((d) => d.tier === shownTier);
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

  // Simulated runs for the dungeons shown, with current HP. Nothing runs on the first
  // render: the odds land from the module cache at once when their key was computed
  // before, and the rest are computed after the interactions, one dungeon per tick, so
  // the screen and Back stay responsive. Only the selected tier's dungeons and the
  // overnight one shown are computed, and only when their key changed (once a minute as
  // heroes heal, or on a party, gear, supply or briefing change).
  const shownList = useMemo(() => [...shown, ...(shownOvernight ? [shownOvernight] : [])], [shown, shownOvernight]);
  const minute = Math.floor(now / 60_000);
  const oddsKeys = useMemo(
    () =>
      Object.fromEntries(
        shownList.map((dungeon) => [
          dungeon.id,
          oddsKey({
            save,
            heroIds: party,
            dungeon,
            options: { now: minute * 60_000, briefing: briefingOf(save, dungeon, rotation, minute * 60_000) },
          }),
        ]),
      ),
    [save, party, shownList, rotation, minute],
  );
  /** The odds computed so far, by dungeon, with the key they belong to. */
  const [odds, setOdds] = useState<Record<string, { key: string; odds: Odds }>>({});
  useEffect(() => {
    if (party.length === 0) return;
    let cancelled = false;
    // The odds not yet held for their key queue up (cache hits resolve inside the tick).
    const queue = shownList.filter((dungeon) => odds[dungeon.id]?.key !== oddsKeys[dungeon.id]);
    // One dungeon per tick (InteractionManager is gone from RN core; a timeout chunk
    // keeps each estimate off the first frames and leaves the thread free between runs).
    const computeNext = () => {
      const dungeon = queue.shift();
      if (cancelled || !dungeon) return;
      setTimeout(() => {
        if (cancelled) return;
        const key = oddsKeys[dungeon.id];
        const start = Date.now();
        const value = recordTiming('odds: expedition', () =>
          cachedEstimateOdds(save, party, dungeon, undefined, {
            now: minute * 60_000,
            briefing: briefingOf(save, dungeon, rotation, minute * 60_000),
          }),
        );
        if (__DEV__) console.log(`[odds] ${dungeon.id} ${Date.now() - start}ms`);
        setOdds((prev) => ({ ...prev, [dungeon.id]: { key, odds: value } }));
        computeNext();
      });
    };
    computeNext();
    return () => {
      cancelled = true;
    };
    // The recompute trigger is the key, not the save: this reruns only when the odds inputs change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oddsKeys, party.length]);

  /** The chance a card shows: the odds for their current key, the cached ones at once, undefined while computing. */
  const chanceOf = (dungeonId: string): number | null | undefined => {
    if (party.length === 0) return null;
    const key = oddsKeys[dungeonId];
    const entry = odds[dungeonId];
    if (entry?.key === key) return entry.odds.success;
    return cachedOdds(key)?.success;
  };

  const confirmingDungeon = party.length > 0 ? [...open, ...overnight].find((d) => d.id === confirming) : undefined;

  // The focused dungeon's briefing, when its card is open: what the party faces there today.
  const focusedDungeon = open.find((d) => d.id === focused);
  const focusedBriefing = useMemo(
    () => (focusedDungeon ? briefingOf(save, focusedDungeon, rotation, minute * 60_000) : null),
    // The tutorial's briefing ends with the tutorial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rotation, focusedDungeon, minute, save.tutorial.step],
  );
  const coverage = useMemo(
    () => (focusedBriefing && party.length > 0 ? briefingCoverage(save, party, focusedBriefing, minute * 60_000) : null),
    [save, party, focusedBriefing, minute],
  );
  // Narrow passages cut the party down for that dungeon, unless a Curse-breaker in it lifts them.
  const narrow = focusedBriefing?.restriction === 'narrowPassages' && !coverage?.restriction?.cancelledBy;
  const cap = narrow ? narrowPartySize(rosterRules.partySize) : rosterRules.partySize;

  /** Parties are capped: a hero can only join while there's room. */
  const toggle = (heroId: string) => {
    if (party.includes(heroId)) return setSelected((current) => current.filter((id) => id !== heroId));
    if (party.length >= cap) return;
    setSelected([...party, heroId]);
  };

  const lowSupply = save.tutorial.step === 'done' && !save.cookingHintSeen && supplyHeld(save.consumables) < provisionRules.lowStockPoints;
  const readyBanner = t('expeditions.readyBanner', { count: ready.length });

  const dungeonsTab = (
    <>
      {lowSupply && (
        <Pressable onPress={closeCookingHint} accessibilityLabel={t('map.cookingHint')} style={styles.hint}>
          <RewardLabel text={t('map.cookingHint')} size={16} labelStyle={styles.hintText} />
        </Pressable>
      )}
      <Text style={styles.heading}>{t('expeditions.party', { count: party.length, max: cap })}</Text>
      {narrow && (
        <Text style={styles.muted}>{t('threats.narrowCap', { count: cap })}</Text>
      )}
      <View style={styles.party}>
        {save.heroes.map((hero) => {
          const away = isOnExpedition(save, hero.id);
          const active = party.includes(hero.id);
          return (
            <Pressable
              key={hero.id}
              accessibilityRole="checkbox"
              accessibilityLabel={hero.name}
              accessibilityState={{ checked: active, disabled: away }}
              disabled={away}
              onPress={() => toggle(hero.id)}
              style={[styles.hero, active && styles.heroActive, away && styles.heroAway]}
            >
              <View style={styles.heroFrame}>
                <GameIcon emoji={heroClasses[hero.classId].emoji} size={22} />
              </View>
              <View style={styles.heroBody}>
                <Text style={styles.heroName} numberOfLines={1}>
                  {hero.name}
                </Text>
                <Text style={styles.heroSub}>
                  {away ? t('expeditions.away') : t('common.levelShort', { level: hero.level })}
                </Text>
                {!away && <HpBar save={save} hero={hero} />}
              </View>
              {active && <Text style={styles.check}>✓</Text>}
            </Pressable>
          );
        })}
      </View>
      {coverage && <ThreatCoverageChips coverage={coverage} />}

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
        render={(ms) => <Text style={styles.muted}>{t('expeditions.tapDungeon', { time: countdownText(ms) })}</Text>}
      />
      {shown.map((dungeon) => (
        <DungeonCard
          key={dungeon.id}
          save={save}
          dungeon={dungeon}
          rotation={rotation}
          now={now}
          durationMs={expeditionMinutes(save, dungeon) * 60_000 * durationScale}
          chance={chanceOf(dungeon.id)}
          expanded={focused === dungeon.id}
          onToggle={() => setFocused(focused === dungeon.id ? null : dungeon.id)}
          onSend={() => setConfirming(dungeon.id)}
        />
      ))}
      {firstLocked && lockedPrevious && (
        <View style={styles.locked}>
          <IconLabel emoji="🔒" label={tr(firstLocked.name)} labelStyle={styles.lockedText} />
          <Text style={styles.lockedText}>{t('expeditions.clearFirst', { name: tr(lockedPrevious.name) })}</Text>
        </View>
      )}
      {hiddenCount > 0 && <Text style={styles.muted}>{t('expeditions.moreToDiscover', { count: hiddenCount })}</Text>}
      {shownOvernight && (
        <OvernightCard
          save={save}
          dungeon={shownOvernight}
          rotation={rotation}
          now={now}
          chance={chanceOf(shownOvernight.id)}
          onSend={() => setConfirming(shownOvernight.id)}
        />
      )}
    </>
  );

  const teamsTab = (
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
                      <GameIcon emoji={heroClasses[hero.classId].emoji} size={28} />
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
    </>
  );

  const reportsTab = (
    <>
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
        {ready.length > 0 && key !== 'teams' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={readyBanner}
            onPress={() => setTab('teams')}
            style={styles.banner}
          >
            <RewardLabel text={readyBanner} size={16} labelStyle={styles.bannerText} />
          </Pressable>
        )}
        {key === 'dungeons' ? dungeonsTab : key === 'teams' ? teamsTab : reportsTab}
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
        <SendDialog
          save={save}
          dungeon={confirmingDungeon}
          party={party}
          durationScale={durationScale}
          now={now}
          onClose={() => setConfirming(null)}
          onSwap={(out, into) => setSelected(party.map((id) => (id === out ? into : id)))}
          onConfirm={(loadout) => {
            setConfirming(null);
            setFocused(null);
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
            setTab('reports');
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
  party: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hero: {
    width: '48%',
    flexGrow: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    borderWidth: 2,
    borderColor: ui.outline,
    backgroundColor: ui.parchment,
  },
  heroActive: { borderColor: ui.good, backgroundColor: ui.goodBg },
  heroAway: { opacity: 0.5 },
  heroFrame: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.woodDeep,
    borderWidth: 2,
    borderColor: ui.outline,
  },
  heroBody: { flex: 1 },
  heroName: { fontSize: 16, lineHeight: 18, color: ui.ink },
  heroSub: { fontFamily: fonts.serif, fontSize: 12, color: ui.inkMuted },
  check: { fontSize: 20, color: ui.good },
  tiers: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingVertical: 4 },
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
