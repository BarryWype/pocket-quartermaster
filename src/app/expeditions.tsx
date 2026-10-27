import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { HpBar } from '@/components/HpBar';
import { Panel } from '@/components/Panel';
import { PixelBar } from '@/components/PixelBar';
import { IconSlot, Row, SectionTitle } from '@/components/Row';
import { ODDS_COLORS, SendDialog } from '@/components/SendDialog';
import { Text } from '@/components/Text';
import { Tip } from '@/components/Tip';
import { TutorialHint } from '@/components/TutorialHint';
import { abilityText } from '@/content/abilities';
import { tutorialRules } from '@/content/tutorial';
import { heroClasses } from '@/content/heroes';
import { dungeonById, itemById, materialById, recipeById, recipeOutput } from '@/content/lookup';
import { provisionRules } from '@/content/provisions';
import { modifierById } from '@/content/modifiers';
import { tagInfo } from '@/content/rotation';
import { countersFor } from '@/game/dungeons/counters';
import { shardId } from '@/game/elements';
import { guildRank, partySize } from '@/game/guild/guild';
import { modifierFor, nextRotationAt, rotationDay, withModifier } from '@/game/dungeons/rotation';
import { dungeonTags } from '@/game/dungeons/tags';
import { bossBonusAvailable, expeditionMinutes, isDungeonAvailable, isDungeonUnlocked, type Loadout } from '@/game/expeditions/expeditions';
import { estimateOdds, oddsBand } from '@/game/expeditions/odds';
import { supplyHeld } from '@/game/expeditions/provisions';
import { prepareParty } from '@/game/expeditions/simulate';
import { isOnExpedition } from '@/game/team/team';
import type { ExpeditionOutcome } from '@/game/types';
import { useLanguage } from '@/hooks/useLanguage';
import { syncPlan } from '@/hooks/useNotifications';
import { formatDuration, formatPercent, t, tr } from '@/i18n';
import { deviceNotifications } from '@/services/notifications';
import { currentRotation, debugEnabled, useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { colors, pixel } from '@/theme';

export default function ExpeditionsScreen() {
  useLanguage();
  const save = useGameStore((state) => state.save);
  const start = useGameStore((state) => state.startExpedition);
  const markReportsSeen = useGameStore((state) => state.markReportsSeen);
  const closeCookingHint = useGameStore((state) => state.closeCookingHint);
  const askedPermission = useSettingsStore((state) => state.askedNotificationPermission);
  const setSettings = useSettingsStore((state) => state.set);
  const fastExpeditions = useDebugStore((state) => debugEnabled(state) && state.fastExpeditions);
  const durationScale = fastExpeditions ? 1 / 60 : 1;
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState<string[]>(() =>
    save.heroes.filter((h) => !isOnExpedition(save, h.id)).slice(0, partySize(save)).map((h) => h.id),
  );
  /** The dungeon card tapped last: heroes who are good there get a badge. */
  const [focused, setFocused] = useState<string | null>(null);
  /** The dungeon whose Send was tapped, waiting for confirmation. */
  const [confirming, setConfirming] = useState<string | null>(null);
  /** Scouting report (Guild Hall): tomorrow's rotation. */
  const [showTomorrow, setShowTomorrow] = useState(false);
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

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      // Bring finished expeditions home right away rather than on the app-wide check.
      const { save: current, resolveDue } = useGameStore.getState();
      if (current.expeditions.some((e) => e.endsAt <= Date.now())) resolveDue();
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useFocusEffect(useCallback(() => () => markReportsSeen(), [markReportsSeen]));

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

  // Simulated runs per open dungeon with current HP; recomputed when the party, the save or the rotation
  // changes, and once a minute as heroes heal.
  const minute = Math.floor(now / 60_000);
  const odds = useMemo(
    () => Object.fromEntries(open.map((d) => [d.id, estimateOdds(save, party, d, undefined, { now: minute * 60_000 })])),
    [save, party, open, minute],
  );

  const focusedDungeon = open.find((d) => d.id === focused);
  const confirmingDungeon = party.length > 0 ? open.find((d) => d.id === confirming) : undefined;
  const counters = (heroId: string) =>
    focusedDungeon ? countersFor(prepareParty(save, [heroId])[0].abilities, focusedDungeon) : [];

  /** Parties are capped: a hero can only join while there's room. */
  const toggle = (heroId: string) => {
    if (party.includes(heroId)) return setSelected((current) => current.filter((id) => id !== heroId));
    if (party.length >= partySize(save)) return;
    setSelected([...party, heroId]);
  };

  const lowSupply = save.tutorial.step === 'done' && !save.cookingHintSeen && supplyHeld(save.consumables) < provisionRules.lowStockPoints;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TutorialHint screen="expeditions" />
      {lowSupply && (
        <Pressable onPress={closeCookingHint} style={styles.hint}>
          <Text style={styles.hintText}>{t('map.cookingHint')}</Text>
        </Pressable>
      )}
      {save.expeditions.length > 0 && <SectionTitle>{t('expeditions.underWay')}</SectionTitle>}
      {save.expeditions.map((expedition) => {
        const dungeon = dungeonById[expedition.dungeonId];
        const names = save.heroes.filter((h) => expedition.heroIds.includes(h.id)).map((h) => h.name);
        const progress = Math.min(1, Math.max(0, (now - expedition.startedAt) / (expedition.endsAt - expedition.startedAt)));
        return (
          <Panel key={expedition.id}>
            <Row emoji={dungeon.emoji} title={tr(dungeon.name)} subtitle={names.join(', ')} right={formatDuration(expedition.endsAt - now)} />
            <PixelBar value={progress} />
            <Text style={styles.muted}>
              {progress >= 1 ? t('expeditions.comingHome') : t('expeditions.explored', { percent: formatPercent(progress) })}
            </Text>
          </Panel>
        );
      })}

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
                <Text style={styles.heroLevel}>{away ? t('expeditions.away') : t('common.levelShort', { level: hero.level })}</Text>
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
      <Text style={styles.muted}>{t('expeditions.tapDungeon', { time: formatDuration(nextRotationAt(now) - now) })}</Text>
      {guildRank(save, 'scouting') > 0 && (
        <View style={styles.tomorrow}>
          <Button title={showTomorrow ? t('expeditions.hideTomorrow') : t('expeditions.tomorrow')} onPress={() => setShowTomorrow(!showTomorrow)} />
        </View>
      )}
      {showTomorrow &&
        Object.entries(currentRotation(nextRotationAt(now)).tiers)
          .filter(([, slots]) => isDungeonUnlocked(save, dungeonById[slots.boss]))
          .map(([tier, slots]) => {
            const modifier = slots.modifier ? modifierById[slots.modifier.modifierId] : null;
            const name = (id: string) => `${dungeonById[id].emoji} ${tr(dungeonById[id].name)}`;
            return (
              <Text key={tier} style={styles.muted}>
                {t('expeditions.tomorrowLine', { tier, short: name(slots.short), long: name(slots.long) })}
                {modifier
                  ? t('expeditions.tomorrowModifier', {
                      modifier: `${modifier.emoji} ${tr(modifier.name)}`,
                      dungeon: tr(dungeonById[slots.modifier!.dungeonId].name),
                    })
                  : ''}
              </Text>
            );
          })}

      {open.map((dungeon, i) => {
        const chance = odds[dungeon.id].success;
        const band = oddsBand(chance);
        const available = isDungeonAvailable(save, dungeon, rotation);
        const modifier = modifierFor(rotation, dungeon.id);
        const fresh = dungeon.slot && !save.firstClears.includes(dungeon.id);
        const kind = dungeon.isBoss ? 'boss' : dungeon.slot === 'short' ? 'short' : 'long';
        return (
          <View key={dungeon.id}>
            {open[i - 1]?.tier !== dungeon.tier && <SectionTitle>{t('expeditions.tierDungeons', { tier: dungeon.tier })}</SectionTitle>}
            <Pressable onPress={() => setFocused(focused === dungeon.id ? null : dungeon.id)}>
              <Panel color={focused === dungeon.id ? colors.highlight : undefined} borderColor={dungeon.isBoss ? colors.danger : undefined}>
                <View style={styles.dungeonHeader}>
                  <IconSlot emoji={dungeon.emoji} />
                  <Text style={styles.dungeonName}>{tr(dungeon.name)}</Text>
                  <Text style={[styles.kind, dungeon.isBoss && styles.kindBoss]}>{t(`expeditions.kind.${kind}`)}</Text>
                </View>
                <View style={styles.chips}>
                  <Tip text={t('expeditions.tips.duration')} style={styles.chip}>
                    <Text style={styles.chipText}>⏳ {formatDuration(expeditionMinutes(save, dungeon) * 60_000 * durationScale)}</Text>
                  </Tip>
                  {party.length > 0 && (
                    <Tip title={t(`odds.${band}`)} text={t('expeditions.tips.odds')} style={[styles.chip, { backgroundColor: ODDS_COLORS[band] }]}>
                      <Text style={[styles.chipText, styles.chipTextLight]}>
                        {formatPercent(chance)} · {t(`odds.${band}`)}
                      </Text>
                    </Tip>
                  )}
                  {dungeonTags(dungeon).map((tag) => (
                    <Tip key={tag} title={tr(tagInfo[tag].name)} text={t('expeditions.tips.tag')} style={styles.chip}>
                      <Text style={styles.chipText}>{tagInfo[tag].emoji}</Text>
                    </Tip>
                  ))}
                  {modifier && (
                    <Tip title={tr(modifier.name)} text={tr(modifier.description)} style={[styles.chip, styles.chipModifier]}>
                      <Text style={styles.chipText}>
                        {modifier.emoji} {tr(modifier.name)}
                      </Text>
                    </Tip>
                  )}
                  {fresh && (
                    <Tip text={t('expeditions.neverCleared')} style={styles.chip}>
                      <Text style={styles.chipText}>✨</Text>
                    </Tip>
                  )}
                  {dungeon.isBoss && (
                    <Tip
                      text={t(bossBonusAvailable(save, dungeon.id, now) ? 'expeditions.bossBonusAvailable' : 'expeditions.bossBonusClaimed')}
                      style={[styles.chip, !bossBonusAvailable(save, dungeon.id, now) && styles.chipDone]}
                    >
                      <Text style={styles.chipText}>🎁</Text>
                    </Tip>
                  )}
                </View>
                <View style={styles.dungeonFooter}>
                  {!available && <Text style={styles.muted}>{t('expeditions.afterTutorial')}</Text>}
                  <Button title={t('expeditions.send')} disabled={!available || party.length === 0} onPress={() => setConfirming(dungeon.id)} />
                </View>
              </Panel>
            </Pressable>
          </View>
        );
      })}
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
            send(confirmingDungeon.id, party, loadout);
          }}
        />
      )}

      <SectionTitle>{t('expeditions.reports')}</SectionTitle>
      {save.reports.length === 0 && <Text style={styles.muted}>{t('expeditions.noReports')}</Text>}
      {save.reports.map((report) => {
        const dungeon = dungeonById[report.dungeonId];
        const loot = [
          report.gold > 0 ? `🪙 ${report.gold}` : null,
          ...report.materials.map((m) => `${materialById[m.materialId].emoji} ${m.amount}`),
          report.recipeId ? `📜 ${tr(recipeOutput(recipeById[report.recipeId]).name)}` : null,
          report.firstClear ? t('expeditions.firstClear', { gold: report.firstClear.gold }) : null,
          ...(report.mainRewards ?? []).map((reward) => {
            if (reward.kind === 'goldPouch') return `👛 +${reward.gold}`;
            if (reward.kind === 'sigil') return t('expeditions.sigil', { tier: reward.tier });
            if (reward.kind === 'treasureMap') return t('expeditions.treasureMap');
            if (reward.kind === 'mapGold') return `🗺️ +${reward.gold}`;
            if (reward.kind === 'shards') return `${materialById[shardId(reward.element)].emoji} ${reward.amount}`;
            return t('expeditions.lure');
          }),
          `+${report.xp} XP`,
          report.hunger && report.hunger !== 'fed' ? t(`expeditions.hunger.${report.hunger}`) : null,
          report.mealId ? `${itemById[report.mealId].emoji} ${tr(itemById[report.mealId].name)}` : null,
          report.kitId
            ? `${itemById[report.kitId].emoji} ${t(report.kitUsed ? 'expeditions.kitUsed' : 'expeditions.kitBack', { kit: tr(itemById[report.kitId].name) })}`
            : null,
        ].filter(Boolean);
        return (
          <Panel key={report.id} borderColor={OUTCOME_COLORS[report.outcome]} color={report.seen ? undefined : colors.highlight}>
            <Text style={styles.reportTitle}>
              {dungeon.emoji} {tr(dungeon.name)}
              {report.seen ? '' : t('expeditions.new')}
            </Text>
            <Text style={[styles.outcome, { color: OUTCOME_COLORS[report.outcome] }]}>
              {t(`expeditions.outcome.${report.outcome}`)} ({report.encountersCleared}/{report.encounterCount})
            </Text>
            {report.log.map((line, i) => (
              <Text key={i} style={styles.logLine}>
                {line}
              </Text>
            ))}
            <View style={styles.chips}>
              {loot.map((item, i) => (
                <View key={i} style={styles.chip}>
                  <Text style={styles.chipText}>{item}</Text>
                </View>
              ))}
            </View>
            {report.heroHp.map(({ heroId, hp, maxHp, before }) => (
              <View key={heroId} style={styles.hp}>
                <Text style={styles.hpName} numberOfLines={1}>
                  {save.heroes.find((h) => h.id === heroId)?.name ?? heroId}
                </Text>
                <View style={styles.hpBar}>
                  <PixelBar value={hp / maxHp} color={hp / maxHp < 0.3 ? colors.danger : colors.success} />
                </View>
                <Text style={styles.muted}>
                  {before === undefined ? `${hp}/${maxHp}` : t('expeditions.hpChange', { before, hp, max: maxHp })}
                </Text>
              </View>
            ))}
          </Panel>
        );
      })}
    </ScrollView>
  );
}

const OUTCOME_COLORS: Record<ExpeditionOutcome, string> = {
  flawless: colors.gold,
  success: colors.success,
  retreat: colors.wood,
  defeat: colors.danger,
};

const styles = StyleSheet.create({
  container: { padding: 16 },
  muted: { color: colors.muted, paddingVertical: 4 },
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
  heroLevel: { color: colors.muted },
  check: { fontSize: 24, color: colors.success },
  goodHere: { alignSelf: 'flex-start', marginTop: 2, paddingHorizontal: 6, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.success },
  goodHereText: { color: '#fff', fontSize: 15 },
  tomorrow: { alignSelf: 'flex-start', marginVertical: 4 },
  dungeonHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dungeonName: { flex: 1, fontSize: 21 },
  kind: { paddingHorizontal: 6, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.parchmentDark, fontSize: 16 },
  kindBoss: { backgroundColor: colors.danger, color: colors.parchment },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 6, paddingVertical: 2, borderWidth: 2, borderColor: colors.woodDark, backgroundColor: colors.parchmentDark },
  chipModifier: { borderColor: colors.danger },
  chipDone: { opacity: 0.4 },
  chipText: { fontSize: 17 },
  chipTextLight: { color: colors.parchment },
  dungeonFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 },
  reportTitle: { fontSize: 20 },
  outcome: { fontSize: 19 },
  logLine: { fontSize: 18 },
  hp: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hpName: { width: 90 },
  hint: { padding: 10, marginBottom: 8, borderWidth: pixel.outline, borderColor: colors.ink, backgroundColor: colors.wood },
  hintText: { color: colors.parchment, fontSize: 18 },
  hpBar: { flex: 1 },
});
