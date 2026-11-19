import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { heistRules } from '@/content/placeActivities';
import { threatById } from '@/content/lookup';
import { placeInfo } from '@/content/places';
import { heistLevel, heistOdds, heistProblem } from '@/game/places/heists';
import type { SaveData } from '@/game/save';
import { isExhausted } from '@/game/team/health';
import { isAway } from '@/game/team/team';
import type { Briefing } from '@/game/types';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { ui } from '@/theme';

import { MapSheet } from '../MapSheet';
import { PartyDialog } from '../PartyDialog';
import { Text } from '../Text';
import { ThreatChip } from '../ThreatChip';
import { asRecalled, recallWorkingHeroes } from '../workingHeroes';
import { PlaceSummary } from './PlaceSummary';
import { someTabs, usePlaceSheet, type PlaceSheetProps } from './usePlaceSheet';
import { blockedText, useShop } from './useShop';

/** The thieves' guild: one hero on a heist against its locks, picked in the party dialog like every other fight. */
export function ThievesGuildSheet({ place, player, now, onClose }: PlaceSheetProps) {
  const base = usePlaceSheet(place, player, now);
  const shop = useShop(place, base, now);
  const info = placeInfo[place.kind];
  const { save } = base;
  const [picking, setPicking] = useState(false);
  const level = heistLevel(save);
  const briefing = useMemo<Briefing>(() => ({ threats: [{ id: heistRules.threat, level: level as 1 | 2 | 3 }], restriction: null, opportunity: null }), [level]);
  // The heist's odds are the family scoring of one hero against the locks: cheap, so the key carries the result.
  const oddsOf = useCallback((dressed: SaveData, heroIds: string[]) => {
    const success = heroIds[0] ? heistOdds(dressed, heroIds[0]) : 0;
    return { key: `heist|${place.id}|${heroIds[0] ?? ''}|${success}`, run: () => ({ success, flawless: success, progress: success }) };
  }, [place.id]);

  const underway = save.heists.some((heist) => heist.placeId === place.id);
  const free = save.heroes.some((hero) => !isAway(save, hero.id) && !isExhausted(hero, now));
  // The guild's own problem, before a hero is picked: gone, or out of range.
  const own = heistProblem(save, place, '', player, now);
  const problem = own === 'gone' ? (underway ? 'heistAway' : 'gone') : own === 'tooFar' ? 'tooFar' : free ? null : 'noHeroes';
  const heroProblem = (state: SaveData, heroIds: string[]) => {
    const found = heroIds[0] ? heistProblem(asRecalled(state, heroIds), place, heroIds[0], player, now) : null;
    return found && found !== 'tooFar' ? blockedText(found) : null;
  };

  const hint = t('places.heistHint', {
    min: heistRules.minutes[0],
    max: heistRules.minutes[1],
    threat: tr(threatById[heistRules.threat].name),
    level,
  });

  return (
    <>
      <MapSheet
        onClose={onClose}
        emoji={info.emoji}
        ring={base.ring}
        title={tr(info.name)}
        status={base.status}
        summary={
          <PlaceSummary
            line={t('placeSheet.heistLine', { min: heistRules.minutes[0], max: heistRules.minutes[1] })}
            stock={shop.stock}
            note={
              <>
                <View style={styles.threats}>
                  {briefing.threats.map((threat) => (
                    <ThreatChip key={threat.id} threat={threat} />
                  ))}
                </View>
                {underway && <Text style={styles.muted}>{t('places.heistAway')}</Text>}
                {base.discoverLine}
              </>
            }
          />
        }
        action={
          shop.pickedAction() ?? {
            state: base.decide(problem),
            verb: t('mapSheet.verbs.heist'),
            label: t('placeSheet.heist'),
            blockedLabel: problem === 'heistAway' ? t('placeSheet.blocked.heistAway') : problem === 'noHeroes' ? t('placeSheet.blocked.noHeroes') : t('placeSheet.blocked.gone'),
            onPress: () => setPicking(true),
            onWalk: base.onWalk,
          }
        }
        tabs={someTabs(shop.tab, base.detailsTab(<Text style={styles.muted}>{hint}</Text>))}
        inRange={base.inRange}
      />
      {picking && (
        <PartyDialog
          title={tr(info.name)}
          subtitle={t('placeSheet.heistLine', { min: heistRules.minutes[0], max: heistRules.minutes[1] })}
          slots={1}
          draftKey={`heist:${place.id}`}
          briefing={briefing}
          oddsOf={oddsOf}
          now={now}
          sendLabel={t('placeSheet.heist')}
          problem={heroProblem}
          onSend={(heroIds) => {
            setPicking(false);
            // The pure heist rule refuses a working hero: recall them first, in the same tap.
            recallWorkingHeroes(heroIds);
            useGameStore.getState().startHeist(place, heroIds[0], player);
            onClose();
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  threats: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  muted: { color: ui.inkMuted },
});
