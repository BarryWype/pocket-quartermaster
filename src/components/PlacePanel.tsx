import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import { gearName, itemById, materialById, recipeById, recipeOutput, threatById } from '@/content/lookup';
import { heistRules } from '@/content/placeActivities';
import { placeInfo, placeRules, type PlaceKind } from '@/content/places';
import { serviceRules } from '@/content/services';
import { wornBy } from '@/game/forging/salvage';
import { pickaxeTier } from '@/game/gathering/gathering';
import { distanceMeters } from '@/game/generation/geo';
import type { LatLng } from '@/game/generation/types';
import { fishProblem } from '@/game/places/dock';
import { isLockedMine, type PlaceSpawn } from '@/game/places/generate';
import { heistLevel, heistOdds, heistProblem } from '@/game/places/heists';
import { digProblem, ruinsDots } from '@/game/places/ruins';
import {
  apothecaryCarePrice,
  apothecaryCareProblem,
  blessRelicsProblem,
  chapelBlessingProblem,
  chapelCareProblem,
  trainPrice,
  trainProblem,
  trainXp,
  type CareKind,
} from '@/game/places/services';
import { buyProblem, gearSellPrice, materialSellPrice, placeStock, sellGearProblem, sellMaterialProblem, stockLeft, type StockLine } from '@/game/places/shops';
import { currentHp, isExhausted, maxHp } from '@/game/team/health';
import { isAway } from '@/game/team/team';
import { placeRewardText } from '@/hooks/usePatrols';
import { formatPercent, t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors, pixel } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';

/** Kinds this sheet knows how to open; other kinds stay off the map until their rules exist. */
export const PANEL_KINDS: PlaceKind[] = [
  'sawmill',
  'quarry',
  'copperMine',
  'ironMine',
  'coalPit',
  'huntingLodge',
  'smithy',
  'apothecary',
  'chapel',
  'market',
  'library',
  'ruins',
  'thievesGuild',
  'fishingDock',
];

const HOUR = 3_600_000;

export function leavesIn(ms: number) {
  const time = ms >= HOUR ? t('places.hours', { count: Math.floor(ms / HOUR) }) : t('places.minutes', { count: Math.max(1, Math.ceil(ms / 60_000)) });
  return t('places.leavesIn', { time });
}

function lineName(line: StockLine) {
  if (line.kind === 'material') return `${materialById[line.id].emoji} ${tr(materialById[line.id].name)}`;
  if (line.kind === 'item') return `${itemById[line.id].emoji} ${tr(itemById[line.id].name)}`;
  if (line.kind === 'gear') return `${itemById[line.id].emoji} ${gearName(line.gear!)}`;
  return `📜 ${t('places.recipe', { name: tr(recipeOutput(recipeById[line.id]).name) })}`;
}

type Props = { place: PlaceSpawn; player: LatLng; now: number; onClose: () => void };

/** What a place offers: its stock (and what it buys), and its services for heroes at home. */
export function PlacePanel({ place, player, now, onClose }: Props) {
  const save = useGameStore((state) => state.save);
  const actions = useGameStore.getState();
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  /** What the last dig or catch brought, shown until the sheet closes. */
  const [result, setResult] = useState<string | null>(null);
  const info = placeInfo[place.kind];
  const distance = distanceMeters(player, place.position);
  const locked = isLockedMine(place.kind, pickaxeTier(save));
  const stock = placeStock(save, place);
  const sells = place.kind === 'smithy' || place.kind === 'market';
  const homeHeroes = save.heroes.filter((hero) => !isAway(save, hero.id));

  const heroLine = (heroId: string) => {
    const hero = save.heroes.find((h) => h.id === heroId)!;
    return (
      t('places.heroHp', { name: hero.name, hp: Math.round(currentHp(save, hero, now)), max: Math.round(maxHp(save, hero)) }) +
      (isExhausted(hero, now) ? t('places.exhausted') : '')
    );
  };

  const stockRow = (line: StockLine) => {
    const left = stockLeft(save, place, line);
    const problem = buyProblem(save, place, line.key, 1, player, now);
    return (
      <View key={line.key} style={styles.row}>
        <Text style={styles.name}>{lineName(line)}</Text>
        <View style={styles.actions}>
          <Text style={styles.muted}>
            {problem === 'known' ? t('places.known') : left > 0 ? t('places.left', { count: left }) : t('places.soldOut')}
          </Text>
          <Text style={styles.price}>🪙 {line.price}</Text>
          <Button title={t('places.buy')} disabled={problem !== null} onPress={() => actions.buyAtPlace(place, line.key, 1, player)} />
        </View>
      </View>
    );
  };

  const sellRows = () => {
    if (place.kind === 'smithy') {
      const gear = save.gear.filter((g) => !wornBy(save, g.uid));
      if (gear.length === 0) return <Text style={styles.muted}>{t('places.nothingToSell')}</Text>;
      return gear.map((g) => (
        <View key={g.uid} style={[styles.row, styles.actions]}>
          <Text style={styles.name}>
            {itemById[g.itemId].emoji} {gearName(g)}
          </Text>
          <Text style={styles.price}>🪙 {gearSellPrice(g)}</Text>
          <Button
            title={t('places.sell')}
            disabled={sellGearProblem(save, place, g.uid, player, now) !== null}
            onPress={() => actions.sellGearAtPlace(place, g.uid, player)}
          />
        </View>
      ));
    }
    const held = Object.entries(save.materials).filter(([id, count]) => count > 0 && materialSellPrice(id) > 0);
    if (held.length === 0) return <Text style={styles.muted}>{t('places.nothingToSell')}</Text>;
    return held.map(([id, count]) => (
      <View key={id} style={styles.row}>
        <Text style={styles.name}>
          {materialById[id].emoji} {tr(materialById[id].name)} ×{count}
        </Text>
        <View style={styles.actions}>
          <Text style={styles.price}>🪙 {materialSellPrice(id)}</Text>
          <Button
            title={t('places.sell')}
            disabled={sellMaterialProblem(save, place, id, 1, player, now) !== null}
            onPress={() => actions.sellMaterialAtPlace(place, id, 1, player)}
          />
          <Button
            title={t('places.sellAll')}
            disabled={sellMaterialProblem(save, place, id, count, player, now) !== null}
            onPress={() => actions.sellMaterialAtPlace(place, id, count, player)}
          />
        </View>
      </View>
    ));
  };

  /** Heal and rest buttons for each home hero who needs them; the chapel's are free, the apothecary's paid. */
  const careRows = (paid: boolean) => {
    const problemOf = (heroId: string, care: CareKind) =>
      paid ? apothecaryCareProblem(save, place, heroId, care, player, now) : chapelCareProblem(save, place, heroId, care, player, now);
    const give = (heroId: string, care: CareKind) =>
      paid ? actions.apothecaryCare(place, heroId, care, player) : actions.chapelCare(place, heroId, care, player);
    const needing = homeHeroes.filter((hero) => currentHp(save, hero, now) < maxHp(save, hero) || isExhausted(hero, now));
    if (!paid && place.id in save.chapelVisits) return <Text style={styles.muted}>{t('places.careUsed')}</Text>;
    if (needing.length === 0) return <Text style={styles.muted}>{t('places.noCare')}</Text>;
    return needing.map((hero) => (
      <View key={hero.id} style={styles.row}>
        <Text style={styles.name}>{heroLine(hero.id)}</Text>
        <View style={styles.actions}>
          {(['heal', 'rest'] as const).map((care) => (
            <Button
              key={care}
              title={`${t(care === 'heal' ? 'places.heal' : 'places.rest')} · ${paid ? `🪙 ${apothecaryCarePrice(save, care)}` : t('places.free')}`}
              disabled={problemOf(hero.id, care) !== null}
              onPress={() => give(hero.id, care)}
            />
          ))}
        </View>
      </View>
    ));
  };

  return (
    <Modal animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title}>
              {info.emoji} {tr(info.name)}
            </Text>
            <Text style={styles.muted}>{tr(info.description)}</Text>
            <Text style={styles.muted}>
              {leavesIn(place.expiresAt - now)} · {t('places.gold', { gold: save.gold })}
            </Text>
            {locked && <Text style={styles.problem}>{t('places.lockedMine')}</Text>}
            {distance > placeRules.interactionMeters && (
              <Text style={styles.problem}>{t('places.walkCloser', { distance: Math.round(distance) })}</Text>
            )}

            {sells && (
              <View style={styles.tabs}>
                <Button title={t('places.buyTab')} color={tab === 'buy' ? undefined : colors.muted} onPress={() => setTab('buy')} />
                <Button title={t('places.sellTab')} color={tab === 'sell' ? undefined : colors.muted} onPress={() => setTab('sell')} />
              </View>
            )}
            {sells && tab === 'sell' ? sellRows() : stock.map(stockRow)}

            {(place.kind === 'chapel' || place.kind === 'apothecary') && (
              <View style={styles.section}>
                <Text style={styles.name}>{t('places.careHeader')}</Text>
                {careRows(place.kind === 'apothecary')}
              </View>
            )}

            {place.kind === 'chapel' && (
              <>
                <View style={styles.section}>
                  <Text style={styles.name}>🕯️ {t('places.bless')}</Text>
                  <Text style={styles.muted}>{t('places.blessHint', { count: save.consumables.holyRelics ?? 0 })}</Text>
                  <Button
                    title={t('places.bless')}
                    disabled={blessRelicsProblem(save, place, player, now) !== null}
                    onPress={() => actions.blessRelics(place, player)}
                  />
                </View>
                <View style={styles.section}>
                  <Text style={styles.name}>🙏 {t('places.blessing')}</Text>
                  <Text style={styles.muted}>
                    {save.expeditionBlessing
                      ? t('places.blessingWaiting')
                      : t('places.blessingHint', { percent: Math.round(serviceRules.chapel.blessingDamage * 100) })}
                  </Text>
                  <Button
                    title={t('places.blessing')}
                    disabled={chapelBlessingProblem(save, place, player, now) !== null}
                    onPress={() => actions.takeChapelBlessing(place, player)}
                  />
                </View>
              </>
            )}

            {place.kind === 'ruins' && (
              <View style={styles.section}>
                <Text style={styles.name}>{t('places.digProgress', { dots: ruinsDots(save.ruinsProgress) })}</Text>
                <Text style={styles.muted}>{t('places.digHint')}</Text>
                <Button
                  title={t('places.dig')}
                  disabled={digProblem(save, place, player, now) !== null}
                  onPress={() => {
                    const { reward, relic } = actions.digRuin(place, player);
                    setResult(t(relic ? 'places.relicFound' : 'places.dug', { gains: placeRewardText(reward) }));
                  }}
                />
              </View>
            )}

            {place.kind === 'fishingDock' && (
              <View style={styles.section}>
                <Text style={styles.muted}>{t('places.fishHint')}</Text>
                <Button
                  title={t('places.fishAction')}
                  disabled={fishProblem(save, place, player, now) !== null}
                  onPress={() => setResult(t('places.caught', { count: actions.fish(place, player) }))}
                />
              </View>
            )}

            {place.kind === 'thievesGuild' && (
              <View style={styles.section}>
                <Text style={styles.name}>🗝️ {t('places.heist')}</Text>
                <Text style={styles.muted}>
                  {t('places.heistHint', {
                    min: heistRules.minutes[0],
                    max: heistRules.minutes[1],
                    threat: tr(threatById[heistRules.threat].name),
                    level: heistLevel(save),
                  })}
                </Text>
                {save.heists.some((h) => h.placeId === place.id) && <Text style={styles.problem}>{t('places.heistAway')}</Text>}
                {homeHeroes.length === 0 && <Text style={styles.muted}>{t('places.noHeroes')}</Text>}
                {homeHeroes.map((hero) => (
                  <View key={hero.id} style={[styles.row, styles.actions]}>
                    <Text style={styles.name}>
                      {hero.name} · {t('places.heistOdds', { percent: formatPercent(heistOdds(save, hero.id)) })}
                    </Text>
                    <Button
                      title={t('places.heist')}
                      disabled={heistProblem(save, place, hero.id, player, now) !== null}
                      onPress={() => {
                        actions.startHeist(place, hero.id, player);
                        onClose();
                      }}
                    />
                  </View>
                ))}
              </View>
            )}

            {result && <Text style={styles.result}>{result}</Text>}

            {place.kind === 'library' && (
              <View style={styles.section}>
                <Text style={styles.name}>📖 {t('places.train')}</Text>
                <Text style={styles.muted}>{t('places.trainHint', { xp: trainXp(save) })}</Text>
                {homeHeroes.map((hero) => {
                  const problem = trainProblem(save, place, hero.id, player, now);
                  return (
                    <View key={hero.id} style={[styles.row, styles.actions]}>
                      <Text style={styles.name}>
                        {hero.name} · {t('common.levelShort', { level: hero.level })}
                      </Text>
                      {problem === 'maxLevel' ? (
                        <Text style={styles.muted}>{t('places.maxLevel')}</Text>
                      ) : (
                        <Button
                          title={`${t('places.train')} · 🪙 ${trainPrice(save)}`}
                          disabled={problem !== null}
                          onPress={() => actions.trainHero(place, hero.id, player)}
                        />
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
          <Button title={t('common.close')} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.parchment,
    borderTopWidth: pixel.outline + 1,
    borderColor: colors.ink,
    padding: 16,
    maxHeight: '85%',
  },
  content: { gap: 6, paddingBottom: 12 },
  title: { fontSize: 26 },
  muted: { color: colors.muted },
  row: { gap: 4, paddingVertical: 8, borderTopWidth: 2, borderTopColor: colors.parchmentDark },
  section: { gap: 4, paddingVertical: 10, borderTopWidth: 2, borderTopColor: colors.parchmentDark },
  name: { fontSize: 21 },
  price: { fontSize: 21 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  tabs: { flexDirection: 'row', gap: 8 },
  problem: { color: colors.muted, fontStyle: 'italic' },
  result: { fontSize: 21 },
});
