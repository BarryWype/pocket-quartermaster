import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { DungeonCard } from '@/components/DungeonCard';
import { HpBar } from '@/components/HpBar';
import { LootReveal } from '@/components/LootReveal';
import { OvernightCard } from '@/components/OvernightCard';
import { Panel } from '@/components/Panel';
import { PixelBar } from '@/components/PixelBar';
import { IconSlot, Row, SectionTitle } from '@/components/Row';
import { ReportCard } from '@/components/ReportCard';
import { SendDialog } from '@/components/SendDialog';
import { Text } from '@/components/Text';
import { Tip } from '@/components/Tip';
import { TutorialHint } from '@/components/TutorialHint';
import { abilityText } from '@/content/abilities';
import { dungeons } from '@/content/dungeons';
import { heroClasses } from '@/content/heroes';
import { dungeonById } from '@/content/lookup';
import { modifierById } from '@/content/modifiers';
import { provisionRules } from '@/content/provisions';
import { tutorialRules } from '@/content/tutorial';
import { countersFor } from '@/game/dungeons/counters';
import { modifierFor, nextRotationAt, rotationDay, withModifier } from '@/game/dungeons/rotation';
import { expeditionMinutes, isDungeonUnlocked, readyExpeditions, type Loadout } from '@/game/expeditions/expeditions';
import { estimateOdds } from '@/game/expeditions/odds';
import { supplyHeld } from '@/game/expeditions/provisions';
import { prepareParty } from '@/game/expeditions/simulate';
import { guildRank, partySize } from '@/game/guild/guild';
import { isOnExpedition } from '@/game/team/team';
import type { ExpeditionReport, HeroState } from '@/game/types';
import { useLanguage } from '@/hooks/useLanguage';
import { useNow } from '@/hooks/useNow';
import { syncPlan } from '@/hooks/useNotifications';
import { formatDuration, formatPercent, t, tr } from '@/i18n';
import { deviceNotifications } from '@/services/notifications';
import { currentRotation, debugEnabled, useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { colors, pixel } from '@/theme';

type Tab = 'dungeons' | 'teams' | 'reports';
const TABS: Tab[] = ['dungeons', 'teams', 'reports'];

/** What the loot reveal shows: the report, and the heroes before and after for XP and level-ups. */
type Collected = { report: ExpeditionReport; before: HeroState[]; after: HeroState[] };

export default function QuestsScreen() {
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
  const now = useNow();
  const ready = readyExpeditions(save, now);

  // Open on the teams when one is back, so the loot is the first thing to see.
  const [tab, setTabState] = useState<Tab>(() => (readyExpeditions(save, Date.now()).length > 0 ? 'teams' : 'dungeons'));
  const [selected, setSelected] = useState<string[]>(() =>
    save.heroes.filter((h) => !isOnExpedition(save, h.id)).slice(0, partySize(save)).map((h) => h.id),
  );
  /** The dungeon card opened: its details show, and heroes good there get a badge. */
  const [focused, setFocused] = useState<string | null>(null);
  const [tier, setTier] = useState<number | null>(null);
  /** The dungeon whose Send was tapped, waiting for confirmation. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [openReport, setOpenReport] = useState<string | null>(null);
  const [collected, setCollected] = useState<Collected | null>(null);
  /** Scouting report (Guild Hall): tomorrow's rotation. */
  const [showTomorrow, setShowTomorrow] = useState(false);

  // Reports count as read once the player leaves their tab or the screen.
  const tabRef = useRef(tab);
  const setTab = (next: Tab) => {
    if (tabRef.current === 'reports' && next !== 'reports') markReportsSeen();
    tabRef.current = next;
    setTabState(next);
  };
  useFocusEffect(useCallback(() => () => markReportsSeen(), [markReportsSeen]));

  // Re-read when the day changes or a debug override does.
  const day = rotationDay(now);
  const dayOffset = useDebugStore((state) => state.rotationDayOffset);
  const forcedSlots = useDebugStore((state) => state.forcedSlots);
  const forcedModifiers = useDebugStore((state) => state.forcedModifiers);
  const rotation = useMemo(
    () => currentRotation(now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [day, dayOffset, forcedSlots, forcedModifiers],
  );

  /** The first launch asks, in game, before the OS permission prompt. */
  const send = async (dungeonId: string, party: string[], loadout: Loadout) => {
    start(dungeonId, party, durationScale, loadout);
    if (askedPermission) return;
    setSettings({ askedNotificationPermission: true });
    const permission = await deviceNotifications.getPermission().catch(() => null);
    if (!permission || permission.granted || !permission.canAskAgain) return;
    Alert.alert(t('expeditions.askTitle'), t('expeditions.askBody'), [
      { text: t('expeditions.notNow'), style: 'cancel' },
      { text: t('expeditions.yes'), onPress: () => deviceNotifications.requestPermission().then(syncPlan, () => {}) },
    ]);
  };

  const collect = (expeditionId: string) => {
    const before = useGameStore.getState().save.heroes;
    const report = collectLoot(expeditionId);
    if (report) setCollected({ report, before, after: useGameStore.getState().save.heroes });
  };

  const party = useMemo(
    () => selected.filter((id) => !isOnExpedition(save, id)).slice(0, partySize(save)),
    [selected, save],
  );

  // Today's open dungeons per unlocked tier, with their modifier; the tutorial's stays until it's done.
  const open = useMemo(() => {
    const ids = Object.values(rotation.tiers).flatMap((t) => [t.short, t.long, t.boss]);
    if (save.tutorial.step !== 'done' && !ids.includes(tutorialRules.firstExpedition.dungeonId)) {
      ids.unshift(tutorialRules.firstExpedition.dungeonId);
    }
    return ids
      .map((id) => withModifier(dungeonById[id], modifierFor(rotation, id)))
      .filter((d) => isDungeonUnlocked(save, d))
      .sort((a, b) => a.tier - b.tier);
  }, [rotation, save]);
  // The overnight quest of each unlocked tier, open every day.
  const overnight = useMemo(
    () => dungeons.filter((d) => d.overnight && isDungeonUnlocked(save, d)).sort((a, b) => a.tier - b.tier),
    [save],
  );
  const tiers = [...new Set(open.map((d) => d.tier))];
  // The highest tier by default; the first one while the tutorial runs.
  const shownTier = tier !== null && tiers.includes(tier) ? tier : save.tutorial.step === 'done' ? tiers[tiers.length - 1] : tiers[0];
  const shown = open.filter((d) => d.tier === shownTier);
  const shownOvernight = overnight.find((d) => d.tier === shownTier) ?? null;

  // Simulated runs for the dungeons shown, with current HP; recomputed when the party, the save or the tier
  // changes, and once a minute as heroes heal.
  const minute = Math.floor(now / 60_000);
  const odds = useMemo(
    () =>
      Object.fromEntries(
        [...shown, ...(shownOvernight ? [shownOvernight] : [])].map((d) => [
          d.id,
          estimateOdds(save, party, d, undefined, { now: minute * 60_000 }),
        ]),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [save, party, shownTier, rotation, minute],
  );

  const focusedDungeon = open.find((d) => d.id === focused);
  const confirmingDungeon = party.length > 0 ? [...open, ...overnight].find((d) => d.id === confirming) : undefined;
  const counters = (heroId: string) => (focusedDungeon ? countersFor(prepareParty(save, [heroId])[0].abilities, focusedDungeon) : []);

  /** Parties are capped: a hero can only join while there's room. */
  const toggle = (heroId: string) => {
    if (party.includes(heroId)) return setSelected((current) => current.filter((id) => id !== heroId));
    if (party.length >= partySize(save)) return;
    setSelected([...party, heroId]);
  };

  const lowSupply = save.tutorial.step === 'done' && !save.cookingHintSeen && supplyHeld(save.consumables) < provisionRules.lowStockPoints;
  const unseen = save.reports.filter((r) => !r.seen).length;
  const tabLabel = (key: Tab) => {
    const count = key === 'teams' ? save.expeditions.length : key === 'reports' ? unseen : 0;
    return `${t(`expeditions.tabs.${key}`)}${count ? ` (${count})` : ''}`;
  };

  const dungeonsTab = (
    <>
      {lowSupply && (
        <Pressable onPress={closeCookingHint} style={styles.hint}>
          <Text style={styles.hintText}>{t('map.cookingHint')}</Text>
        </Pressable>
      )}
      <SectionTitle>{t('expeditions.party', { count: party.length, max: partySize(save) })}</SectionTitle>
      <View style={styles.party}>
        {save.heroes.map((hero) => {
          const away = isOnExpedition(save, hero.id);
          const active = party.includes(hero.id);
          const good = counters(hero.id);
          return (
            <Pressable
              key={hero.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active, disabled: away }}
              disabled={away}
              onPress={() => toggle(hero.id)}
              style={[styles.hero, active && styles.heroActive, away && styles.heroAway]}
            >
              <IconSlot emoji={heroClasses[hero.classId].emoji} size={28} />
              <View style={styles.heroBody}>
                <Text style={styles.heroName} numberOfLines={1}>
                  {hero.name}
                </Text>
                <Text style={styles.muted}>{away ? t('expeditions.away') : t('common.levelShort', { level: hero.level })}</Text>
                {!away && <HpBar save={save} hero={hero} now={now} />}
                {good.length > 0 && (
                  <Tip title={t('expeditions.goodHereTitle', { name: hero.name })} text={good.map(abilityText).join('\n')} style={styles.goodHere}>
                    <Text style={styles.goodHereText}>★ {t('expeditions.goodHere')}</Text>
                  </Tip>
                )}
              </View>
              {active && <Text style={styles.check}>✓</Text>}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.tiers}>
        {tiers.map((n) => (
          <Pressable key={n} onPress={() => setTier(n)} style={[styles.pill, n === shownTier && styles.pillActive]}>
            <Text style={styles.pillText}>{t('expeditions.tier', { tier: n })}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.muted}>{t('expeditions.tapDungeon', { time: formatDuration(nextRotationAt(now) - now) })}</Text>
      {shown.map((dungeon) => (
        <DungeonCard
          key={dungeon.id}
          save={save}
          dungeon={dungeon}
          rotation={rotation}
          now={now}
          durationMs={expeditionMinutes(save, dungeon) * 60_000 * durationScale}
          chance={party.length > 0 ? odds[dungeon.id]?.success ?? null : null}
          goodHere={save.heroes.filter((h) => party.includes(h.id) && countersFor(prepareParty(save, [h.id])[0].abilities, dungeon).length > 0).map((h) => h.name)}
          expanded={focused === dungeon.id}
          onToggle={() => setFocused(focused === dungeon.id ? null : dungeon.id)}
          onSend={() => setConfirming(dungeon.id)}
        />
      ))}
      {shownOvernight && (
        <OvernightCard
          save={save}
          dungeon={shownOvernight}
          now={now}
          chance={party.length > 0 ? odds[shownOvernight.id]?.success ?? null : null}
          onSend={() => setConfirming(shownOvernight.id)}
        />
      )}

      {guildRank(save, 'scouting') > 0 && (
        <View style={styles.tomorrow}>
          <Button title={showTomorrow ? t('expeditions.hideTomorrow') : t('expeditions.tomorrow')} onPress={() => setShowTomorrow(!showTomorrow)} />
        </View>
      )}
      {showTomorrow &&
        Object.entries(currentRotation(nextRotationAt(now)).tiers)
          .filter(([, slots]) => isDungeonUnlocked(save, dungeonById[slots.boss]))
          .map(([n, slots]) => {
            const modifier = slots.modifier ? modifierById[slots.modifier.modifierId] : null;
            const name = (id: string) => `${dungeonById[id].emoji} ${tr(dungeonById[id].name)}`;
            return (
              <Text key={n} style={styles.muted}>
                {t('expeditions.tomorrowLine', { tier: n, short: name(slots.short), long: name(slots.long) })}
                {modifier
                  ? t('expeditions.tomorrowModifier', {
                      modifier: `${modifier.emoji} ${tr(modifier.name)}`,
                      dungeon: tr(dungeonById[slots.modifier!.dungeonId].name),
                    })
                  : ''}
              </Text>
            );
          })}
    </>
  );

  const teamsTab = (
    <>
      {save.expeditions.length === 0 && <Text style={styles.muted}>{t('expeditions.noTeams')}</Text>}
      {[...save.expeditions]
        .sort((a, b) => a.endsAt - b.endsAt)
        .map((expedition) => {
          const dungeon = dungeonById[expedition.dungeonId];
          const names = save.heroes.filter((h) => expedition.heroIds.includes(h.id)).map((h) => h.name);
          const progress = Math.min(1, Math.max(0, (now - expedition.startedAt) / (expedition.endsAt - expedition.startedAt)));
          const back = expedition.endsAt <= now;
          return (
            <Panel key={expedition.id} color={back ? colors.highlight : undefined} borderColor={back ? colors.gold : undefined}>
              <Row emoji={dungeon.emoji} title={tr(dungeon.name)} subtitle={names.join(', ')} right={back ? t('expeditions.back') : formatDuration(expedition.endsAt - now)} />
              {back ? (
                <Button title={t('expeditions.collect')} onPress={() => collect(expedition.id)} />
              ) : (
                <>
                  <PixelBar value={progress} />
                  <Text style={styles.muted}>{t('expeditions.explored', { percent: formatPercent(progress) })}</Text>
                </>
              )}
            </Panel>
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

  return (
    <View style={styles.screen}>
      <View style={styles.tabs}>
        {TABS.map((key) => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
            onPress={() => setTab(key)}
            style={[styles.tab, tab === key && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]} numberOfLines={1}>
              {tabLabel(key)}
            </Text>
            {key === 'teams' && ready.length > 0 && <View style={styles.dot} />}
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.container}>
        <TutorialHint screen="expeditions" />
        {ready.length > 0 && tab !== 'teams' && (
          <Pressable onPress={() => setTab('teams')} style={styles.banner}>
            <Text style={styles.bannerText}>{t('expeditions.readyBanner', { count: ready.length })}</Text>
          </Pressable>
        )}
        {tab === 'dungeons' ? dungeonsTab : tab === 'teams' ? teamsTab : reportsTab}
      </ScrollView>

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
  screen: { flex: 1 },
  container: { padding: 16 },
  muted: { color: colors.muted, paddingVertical: 2 },
  tabs: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, backgroundColor: colors.parchmentDark },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 6, borderWidth: pixel.outline, borderColor: colors.woodDark, backgroundColor: colors.parchment },
  tabActive: { borderColor: colors.ink, backgroundColor: colors.wood },
  tabText: { fontSize: 17 },
  tabTextActive: { color: colors.parchment },
  dot: { position: 'absolute', top: -6, right: -6, width: 14, height: 14, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.gold },
  banner: { padding: 10, marginBottom: 8, borderWidth: pixel.outline, borderColor: colors.ink, backgroundColor: colors.gold },
  bannerText: { color: colors.ink, fontSize: 19 },
  party: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hero: {
    width: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 6,
    borderWidth: pixel.outline,
    borderColor: colors.woodDark,
    backgroundColor: colors.parchment,
  },
  heroActive: { borderColor: colors.ink, backgroundColor: colors.highlight },
  heroAway: { opacity: 0.4 },
  heroBody: { flex: 1 },
  heroName: { fontSize: 19 },
  check: { fontSize: 24, color: colors.success },
  goodHere: { alignSelf: 'flex-start', marginTop: 2, paddingHorizontal: 6, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.success },
  goodHereText: { color: '#fff', fontSize: 15 },
  tiers: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 16, marginBottom: 4 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderWidth: 2, borderColor: colors.woodDark, backgroundColor: colors.parchment },
  pillActive: { borderColor: colors.ink, backgroundColor: colors.highlight },
  pillText: { fontSize: 18 },
  tomorrow: { alignSelf: 'flex-start', marginVertical: 4 },
  hint: { padding: 10, marginBottom: 8, borderWidth: pixel.outline, borderColor: colors.ink, backgroundColor: colors.wood },
  hintText: { color: colors.parchment, fontSize: 18 },
});
