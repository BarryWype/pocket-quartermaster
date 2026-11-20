import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { IconLabel } from '@/components/IconLabel';
import { PressScale } from '@/components/motion';
import { Price } from '@/components/Price';
import { Text } from '@/components/Text';
import { WoodButton } from '@/components/ui';
import { clockConfig } from '@/content/clockConfig';
import { materialById } from '@/content/lookup';
import { placeInfo, placeRules } from '@/content/places';
import { supplyRules } from '@/content/supplyLines';
import { distanceMeters } from '@/game/generation/geo';
import { tileCenter } from '@/game/generation/tiles';
import type { LatLng } from '@/game/generation/types';
import { mainAction } from '@/game/places/mainAction';
import type { PlaceSpawn } from '@/game/places/generate';
import { buildCost, buildingEmoji, buildingNameKey, buildingReach, buildProblem, isLastDay, openBuildingKinds, timeLeftShare } from '@/game/supply/buildings';
import { networkPlacesAround } from '@/game/supply/discovery';
import { orderPlaceName } from '@/game/supply/orders';
import { serves } from '@/game/supply/planner';
import { siteQuality } from '@/game/supply/sites';
import type { BuildingKind } from '@/game/supply/types';
import { tavernNameOf } from '@/game/taverns/taverns';
import { formatDistance, formatDuration, t, tr } from '@/i18n';
import { useNow } from '@/hooks/useNow';
import { feel } from '@/services/feel';
import { debugEnabled, useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';
import { useWorldStore } from '@/store/worldStore';
import { ui } from '@/theme';

import { MapSheet, mapSheetStatus, type MapSheetAction, type MapSheetSecondary, type MapSheetView } from './MapSheet';
import { GoodsRow, InfoRow, stars } from './network/networkBits';

type Props = { site: PlaceSpawn; player: LatLng; onClose: () => void };

const round2 = (n: number) => String(Math.round(n * 100) / 100);
const groundKey = { 1: 'networkSheet.site.ground.one', 2: 'networkSheet.site.ground.two', 3: 'networkSheet.site.ground.three' } as const;

/** What a kind makes an hour on this ground with a hero posted, good by good. */
function ratesOf(kind: BuildingKind, quality: 1 | 2 | 3): Record<string, number> {
  const { makes, baseRate } = supplyRules.buildings.kinds[kind];
  const total = Object.values(makes).reduce((sum, weight) => sum + weight, 0);
  return Object.fromEntries(Object.entries(makes).map(([good, weight]) => [good, Math.round(baseRate * quality * (weight / total) * 100) / 100]));
}

/**
 * A site on the map sheet template. Undiscovered, it says only to walk there.
 * Discovered, the summary gives the ground and what the picked building would
 * make; the Build tab lists the open kinds as tiles with their rate and who
 * nearby wants the goods, and the main action builds the picked one, which
 * still needs the player there.
 */
export function SupplySitePanel({ site, player, onClose }: Props) {
  const save = useGameStore((s) => s.save);
  const debugOn = useDebugStore(debugEnabled);
  const now = useNow(clockConfig.minutesMs);
  const [picked, setPicked] = useState<BuildingKind | null>(null);

  const discovered = site.id in save.supply.discovered;
  const distance = distanceMeters(player, site.position);
  const range = placeRules.interactionMeters;
  const ring = { kind: 'time' as const, left: timeLeftShare(site.startsAt, site.expiresAt, now), last: isLastDay(site.expiresAt, now) };
  const status = mapSheetStatus({ distance, range, expiresAt: site.expiresAt, now });
  const focus = () => useWorldStore.getState().set({ focusPlace: { latitude: site.position.latitude, longitude: site.position.longitude } });

  if (!discovered) {
    return (
      <MapSheet
        onClose={onClose}
        emoji="❔"
        ring={ring}
        title={t('networkSheet.site.title')}
        status={status}
        summary={<Text style={styles.summaryLine}>{t('networkSheet.site.undiscovered')}</Text>}
        action={{
          // Discovery happens by itself on arrival; in range, the button only waits for it.
          state: mainAction({ player, target: site.position, range, problem: 'discovering' }),
          verb: t('networkSheet.site.discoverVerb'),
          label: t('networkSheet.site.discovering'),
          blockedLabel: t('networkSheet.site.discovering'),
          onPress: () => {},
          onWalk: focus,
        }}
      />
    );
  }

  const quality = siteQuality(site);
  const reach = buildingReach(save);
  const kinds = openBuildingKinds(save);
  const cost = buildCost(save);
  // The discovered, live places near the site, with their orders, for "who wants it".
  const places = networkPlacesAround(save, site.position, now).filter(
    (place) => place.id in save.supply.discovered && place.startsAt <= now && now < place.expiresAt && save.supply.orders[place.id],
  );
  const wantedBy = (kind: BuildingKind) =>
    places
      .filter((place) => serves(save.supply.orders[place.id].wants, kind))
      .map((place) => ({ place, meters: distanceMeters(site.position, place.position) }))
      .sort((a, b) => a.meters - b.meters);
  // Until the player picks, the kind most wanted nearby (the first open kind when none is).
  const suggested = kinds.reduce<BuildingKind | null>((best, kind) => (best === null || wantedBy(kind).length > wantedBy(best).length ? kind : best), null);
  const kind = picked && kinds.includes(picked) ? picked : suggested;
  const rates = kind ? ratesOf(kind, quality) : {};
  const mainGood = kind ? Object.keys(supplyRules.buildings.kinds[kind].makes)[0] : null;
  const wanting = kind ? wantedBy(kind) : [];

  const summary = [
    t(groundKey[quality]),
    ...(kind && mainGood
      ? [
          t('networkSheet.site.makesHere', { kind: t(buildingNameKey[kind]), rate: round2(rates[mainGood]), good: tr(materialById[mainGood]?.name ?? mainGood).toLowerCase() }),
          wanting.length > 0 ? t('networkSheet.site.wantedBy', { count: wanting.length }) : t('networkSheet.site.nobodyWants'),
        ]
      : []),
  ].join(' · ');

  const onBuild = (free: boolean) => {
    if (!kind) return;
    useGameStore.getState().build(site, kind, player, free);
    feel('reward');
    const built = useGameStore.getState().save.supply.buildings.find((entry) => entry.siteId === site.id);
    if (built) {
      useMapPanels.getState().closeSite();
      useMapPanels.getState().openSupplyBuilding(built.id);
    }
  };

  const problem = kind ? buildProblem(save, site, kind, player, now) : 'notOpen';
  const blockedLabel = (() => {
    switch (problem) {
      case 'noHall':
        return t('networkSheet.site.blocked.noHall');
      case 'tooFarFromHall':
        return t('networkSheet.site.blocked.tooFarFromHall');
      case 'full':
        return t('networkSheet.site.blocked.full', { max: reach.count });
      case 'cost':
        return t('networkSheet.site.blocked.cost');
      case 'taken':
        return t('networkSheet.site.blocked.taken');
      default:
        return t('networkSheet.site.blocked.notOpen');
    }
  })();

  const action = (): MapSheetAction => {
    const build = kind ? t('networkSheet.site.build', { kind: t(buildingNameKey[kind]) }) : t('networkSheet.site.pick');
    // The rules that hold wherever the player stands come first: no walk to a site that can't be built on.
    const anywhere = problem === 'noHall' || problem === 'tooFarFromHall' || problem === 'full' || problem === 'taken' || problem === 'notOpen';
    return {
      state: mainAction({ player, target: site.position, range, problem: problem === 'notHere' ? null : problem, anywhere }),
      verb: t('networkSheet.site.buildVerb'),
      label: build,
      blockedLabel,
      onPress: () => onBuild(false),
      onWalk: focus,
    };
  };
  const secondary = (view: MapSheetView): MapSheetSecondary[] =>
    view.full ? [] : [{ key: 'build', title: t('networkSheet.site.seeBuild'), onPress: () => view.open('build') }];

  const buildTab = () => (
    <View style={styles.tab}>
      <View style={styles.tiles}>
        {kinds.map((entry) => {
          const on = entry === kind;
          const entryRates = ratesOf(entry, quality);
          const good = Object.keys(entryRates)[0];
          return (
            <PressScale
              key={entry}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t('networkSheet.site.kindLabel', { kind: t(buildingNameKey[entry]), rate: round2(entryRates[good]) })}
              onPress={() => setPicked(entry)}
              style={[styles.kindTile, on && styles.kindTileOn]}
            >
              <IconLabel emoji={buildingEmoji[entry]} label={t(buildingNameKey[entry])} size={20} labelStyle={styles.kindName} />
              <IconLabel emoji={materialById[good]?.emoji ?? '📦'} icon={materialById[good]?.icon} label={t('networkSheet.site.perHour', { rate: round2(entryRates[good]) })} size={14} labelStyle={styles.kindRate} />
            </PressScale>
          );
        })}
      </View>
      {kind && (
        <>
          <GoodsRow goods={rates} size={18} />
          <InfoRow label={t('networkSheet.site.wantedList')}>
            {wanting.length > 0 ? (
              wanting.map(({ place, meters }) => (
                <IconLabel
                  key={place.id}
                  emoji={placeInfo[place.kind].emoji}
                  label={`${orderPlaceName(save.supply.orders[place.id], tavernNameOf)} (${formatDistance(meters)})`}
                  size={16}
                  labelStyle={styles.line}
                />
              ))
            ) : (
              <Text style={styles.line}>{t('networkSheet.site.goesHome')}</Text>
            )}
          </InfoRow>
          {wanting.length > 0 && <Text style={styles.muted}>{t('networkSheet.site.addedOnBuild')}</Text>}
          <InfoRow label={t('networkSheet.site.cost')}>
            <Price amount={cost.gold} size={18} />
            {cost.materials.map((entry) => (
              <IconLabel key={entry.materialId} emoji={materialById[entry.materialId]?.emoji ?? '📦'} icon={materialById[entry.materialId]?.icon} label={String(entry.amount)} size={18} labelStyle={styles.line} />
            ))}
          </InfoRow>
          {debugOn && <WoodButton compact title={t('supply.site.buildFree')} onPress={() => onBuild(true)} />}
        </>
      )}
    </View>
  );

  const hall = save.supply.hall;
  const detailsTab = () => (
    <View style={styles.tab}>
      <InfoRow label={t('networkSheet.building.ground')}>{t('networkSheet.building.groundLine', { stars: stars(quality), n: quality })}</InfoRow>
      {hall && <InfoRow label={t('networkSheet.fromHall')}>{formatDistance(distanceMeters(tileCenter(hall.cell), site.position))}</InfoRow>}
      <InfoRow label={t('networkSheet.leaves')}>{formatDuration(Math.max(0, site.expiresAt - now), false)}</InfoRow>
      <Text style={styles.muted}>{t('supply.site.limits', { count: save.supply.buildings.length, max: reach.count, distance: formatDistance(reach.meters) })}</Text>
      {debugOn && <WoodButton compact title={t('supply.site.expire')} onPress={() => useGameStore.getState().debugExpireSite(site)} />}
    </View>
  );

  return (
    <MapSheet
      onClose={onClose}
      emoji={kind ? buildingEmoji[kind] : '🪧'}
      ring={ring}
      title={t('networkSheet.site.title')}
      status={`${stars(quality)} · ${status}`}
      summary={<Text style={styles.summaryLine}>{summary}</Text>}
      action={action}
      secondary={secondary}
      tabs={[
        { key: 'build', label: t('networkSheet.tabs.build'), render: buildTab },
        { key: 'details', label: t('networkSheet.tabs.details'), render: detailsTab },
      ]}
      inRange={distance <= range}
    />
  );
}

const styles = StyleSheet.create({
  summaryLine: { color: ui.ink, fontSize: 18 },
  tab: { gap: 10 },
  line: { color: ui.ink },
  muted: { color: ui.inkMuted, fontSize: 16 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kindTile: {
    minWidth: '47%',
    flexGrow: 1,
    minHeight: 56,
    padding: 8,
    gap: 4,
    borderWidth: 2,
    borderColor: ui.outline,
    backgroundColor: ui.parchmentShade,
  },
  kindTileOn: { borderWidth: 3, borderColor: ui.brass, backgroundColor: ui.parchment },
  kindName: { fontSize: 17, color: ui.ink },
  kindRate: { fontSize: 14, color: ui.inkMuted },
});
