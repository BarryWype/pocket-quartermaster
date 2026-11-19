import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { placeInfo } from '@/content/places';
import { fishProblem } from '@/game/places/dock';
import { digProblem, ruinsDots } from '@/game/places/ruins';
import { lootTiles, type RewardTile } from '@/game/loot/tiles';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { ui } from '@/theme';

import { gainsPrefix } from '../lootText';
import { LootGrid } from '../LootGrid';
import { MapSheet } from '../MapSheet';
import { Text } from '../Text';
import { PlaceSummary } from './PlaceSummary';
import { someTabs, usePlaceSheet, type PlaceSheetProps } from './usePlaceSheet';
import { useShop } from './useShop';

/**
 * The ruins and the fishing dock: one dig or one catch, as the main action.
 * What it brought shows in the loot grid under the summary, as it did.
 */
export function FindSheet({ place, player, now, onClose }: PlaceSheetProps) {
  const base = usePlaceSheet(place, player, now);
  const shop = useShop(place, base, now);
  const info = placeInfo[place.kind];
  /** What the dig or catch brought, shown until the sheet closes. */
  const [result, setResult] = useState<{ text: string; tiles: RewardTile[] } | null>(null);
  const ruins = place.kind === 'ruins';
  const problem = ruins ? digProblem(base.save, place, player, now) : fishProblem(base.save, place, player, now);

  const find = () => {
    const actions = useGameStore.getState();
    const before = actions.save;
    if (ruins) {
      const { reward, relic } = actions.digRuin(place, player);
      setResult({ text: gainsPrefix(t(relic ? 'places.relicFound' : 'places.dug', { gains: '' })), tiles: lootTiles(reward, { before }) });
    } else {
      setResult({ text: gainsPrefix(t('places.caught', { gains: '' })), tiles: lootTiles(actions.fish(place, player), { before }) });
    }
  };

  return (
    <MapSheet
      onClose={onClose}
      emoji={info.emoji}
      ring={base.ring}
      title={tr(info.name)}
      status={base.status}
      summary={
        <PlaceSummary line={ruins ? t('places.digProgress', { dots: ruinsDots(base.save.ruinsProgress) }) : t('places.fishHint')} stock={shop.stock} note={base.discoverLine}>
          {result && (
            <View style={styles.result}>
              <Text style={styles.resultText}>{result.text}</Text>
              <LootGrid key={result.tiles.map((tile) => tile.key).join()} tiles={result.tiles} reveal />
            </View>
          )}
        </PlaceSummary>
      }
      action={
        shop.pickedAction() ?? {
          state: base.decide(problem),
          verb: t(ruins ? 'mapSheet.verbs.dig' : 'mapSheet.verbs.fish'),
          label: ruins ? t('places.dig') : t('places.fishAction'),
          blockedLabel: ruins ? t('placeSheet.blocked.dug') : t('placeSheet.blocked.fished'),
          onPress: find,
          onWalk: base.onWalk,
        }
      }
      tabs={someTabs(shop.tab, base.detailsTab(ruins ? <Text style={styles.muted}>{t('places.digHint')}</Text> : null))}
      inRange={base.inRange}
    />
  );
}

const styles = StyleSheet.create({
  result: { gap: 6 },
  resultText: { fontSize: 19 },
  muted: { color: ui.inkMuted },
});
