import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Countdown } from '@/components/Countdown';
import { IconLabel } from '@/components/IconLabel';
import { PartyDialog } from '@/components/PartyDialog';
import { Text } from '@/components/Text';
import { EmberButton } from '@/components/ui';
import { clockConfig } from '@/content/clockConfig';
import { isElitePatrolKind } from '@/content/enemies';
import { frPatrolTexts } from '@/content/fr/patrols';
import { patrolTexts } from '@/content/patrols';
import { supplyRules } from '@/content/supplyLines';
import { fightOddsKey } from '@/game/expeditions/oddsCache';
import { patrolBriefing, patrolOdds } from '@/game/patrols/fight';
import type { SaveData } from '@/game/save';
import { defendProblem, isAnnounced, raidSpawn, raidTravelMs, type DefendProblem } from '@/game/supply/raids';
import { buildingNameKey } from '@/game/supply/buildings';
import type { Building, Raid } from '@/game/supply/types';
import { formatDuration, localized, t } from '@/i18n';
import { useNow } from '@/hooks/useNow';
import { useGameStore } from '@/store/gameStore';
import { colors, ui } from '@/theme';

import { asRecalled, recallWorkingHeroes } from './workingHeroes';

const buildingNameOf = (kind: Building['kind']) => t(buildingNameKey[kind]).toLowerCase();

/**
 * The announced raid: who is coming, when, who will fight, and sending
 * defenders through the party dialog. With `buildingId`, only a raid on that
 * building.
 */
export function RaidBanner({ buildingId }: { buildingId?: string }) {
  const save = useGameStore((s) => s.save);
  const now = useNow(clockConfig.minutesMs);
  const [picking, setPicking] = useState(false);
  const raid = save.supply.raid;
  const building = raid ? save.supply.buildings.find((b) => b.id === raid.buildingId) : undefined;

  const posted = building?.heroId ?? null;
  const shown = !!raid && !!building && (!buildingId || raid.buildingId === buildingId) && isAnnounced(save, raid, now);
  const noteTips = useGameStore((s) => s.noteTips);
  // The first announced raid queues its tip.
  useEffect(() => {
    if (shown) noteTips(['supplyRaid']);
  }, [shown, noteTips]);

  if (!shown) return null;

  const kind = localized({ en: patrolTexts, fr: frPatrolTexts }).kinds[raid.kind];
  const buildingName = buildingNameOf(building.kind);
  const travel = raidTravelMs(save, raid.buildingId);
  const slots = supplyRules.raids.maxDefenders - raid.defenders.length;
  const canSend = slots > 0 && now + travel <= raid.landsAt;
  const postedHero = posted ? save.heroes.find((hero) => hero.id === posted) : undefined;

  return (
    <View style={styles.banner}>
      <View style={styles.heading}>
        <IconLabel
          emoji="⚔️"
          label={<Countdown endsAt={raid.landsAt} render={(ms) => t('supply.raid.banner', { kind, building: buildingName, time: formatDuration(ms, false) })} />}
          size={18}
        />
      </View>
      <Text style={styles.line}>{postedHero ? t('supply.raid.posted', { name: postedHero.name }) : t('supply.raid.unguarded')}</Text>
      {raid.defenders.map((defender) => {
        const name = save.heroes.find((hero) => hero.id === defender.heroId)?.name ?? defender.heroId;
        return (
          <Text key={defender.heroId} style={styles.line}>
            {defender.arrivesAt > now
              ? t('supply.raid.onTheirWay', { name, time: formatDuration(defender.arrivesAt - now, false) })
              : t('supply.raid.atBuilding', { name })}
          </Text>
        );
      })}
      <EmberButton title={t('supply.raid.defend')} disabled={!canSend} onPress={() => setPicking(true)} />
      {picking && <DefendDialog raid={raid} building={building} now={now} onClose={() => setPicking(false)} />}
    </View>
  );
}

/** Sending defenders: the party dialog with the raid's odds (the posted hero fights too) and the arrival time. */
function DefendDialog({ raid, building, now, onClose }: { raid: Raid; building: Building; now: number; onClose: () => void }) {
  const save = useGameStore((s) => s.save);
  const sendDefenders = useGameStore((s) => s.sendDefenders);
  const posted = building.heroId;
  const oddsOf = useCallback(
    (dressed: SaveData, heroIds: string[]) => {
      const fighters = [...(posted ? [posted] : []), ...heroIds];
      const spawn = raidSpawn(dressed, raid, fighters);
      return {
        key: fightOddsKey(dressed, fighters, spawn, raid.tier, isElitePatrolKind(raid.kind), now),
        run: () => patrolOdds(dressed, spawn, fighters, now),
      };
    },
    [raid, posted, now],
  );
  const kind = localized({ en: patrolTexts, fr: frPatrolTexts }).kinds[raid.kind];
  const travel = raidTravelMs(save, raid.buildingId);
  const problemText = (problem: Exclude<DefendProblem, null>) =>
    t(`supply.raid.problem.${problem}`, { max: supplyRules.raids.maxDefenders });

  return (
    <PartyDialog
      title={t('supply.raid.dialogTitle', { building: buildingNameOf(building.kind) })}
      subtitle={t('supply.raid.dialogSubtitle', { kind, time: formatDuration(Math.max(0, raid.landsAt - now), false) })}
      slots={supplyRules.raids.maxDefenders - raid.defenders.length}
      draftKey={`raid:${raid.landsAt}`}
      briefing={patrolBriefing(raidSpawn(save, raid, posted ? [posted] : []))}
      oddsOf={oddsOf}
      now={now}
      sendLabel={t('supply.raid.send')}
      problem={(state, heroIds) => {
        if (heroIds.length === 0) return null;
        const found = defendProblem(asRecalled(state, heroIds), heroIds, now);
        return found ? problemText(found) : null;
      }}
      details={() => (
        <Text style={styles.muted}>
          {t('supply.raid.arrival', { time: formatDuration(travel, false), lands: formatDuration(Math.max(0, raid.landsAt - now), false) })}
        </Text>
      )}
      onSend={(heroIds) => {
        recallWorkingHeroes(heroIds);
        sendDefenders(heroIds);
        onClose();
      }}
      onClose={onClose}
    />
  );
}

const styles = StyleSheet.create({
  banner: { gap: 6, padding: 10, borderWidth: 2, borderColor: colors.danger, backgroundColor: ui.parchment },
  heading: { flexDirection: 'row', alignItems: 'center' },
  line: { color: ui.ink },
  muted: { color: ui.inkMuted },
});
