import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { MapMarker, RouteDimContext } from '@/components/MapMarker';

import { Countdown } from '@/components/Countdown';
import { GameIcon } from '@/components/GameIcon';
import { IconLabel } from '@/components/IconLabel';
import { SiteMarker } from '@/components/SiteMarker';
import { Text } from '@/components/Text';
import { TimeRing } from '@/components/ui';
import { clockConfig } from '@/content/clockConfig';
import { buildingEmoji, buildingNameKey, isLastDay, timeLeftShare } from '@/game/supply/buildings';
import { isAnnounced } from '@/game/supply/raids';
import { buildingStockTotal, settleBuilding } from '@/game/supply/production';
import type { PlaceSpawn } from '@/game/places/generate';
import { formatDuration, t } from '@/i18n';
import { useNow } from '@/hooks/useNow';
import { colors, ui } from '@/theme';
import { tileCenter } from '@/game/generation/tiles';
import { feel } from '@/services/feel';
import { useSupplyOn } from '@/hooks/useSupply';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';

const MARKER_SIZE = 26;

/** A marker tap plays the press haptic, like the map's other markers. */
const tapped = (action: () => void) => () => {
  feel('press');
  action();
};

const toLngLat = (position: { latitude: number; longitude: number }): [number, number] => [position.longitude, position.latitude];

/** Under a building's marker while a raid on it is announced: the time left before it lands. */
function RaidCountdown({ buildingId }: { buildingId: string }) {
  const save = useGameStore((s) => s.save);
  const now = useNow(clockConfig.minutesMs);
  const raid = save.supply.raid;
  if (!raid || raid.buildingId !== buildingId || !isAnnounced(save, raid, now)) return null;
  return (
    <IconLabel
      emoji="⚔️"
      size={14}
      style={styles.raid}
      labelStyle={styles.raidText}
      label={<Countdown endsAt={raid.landsAt} render={(ms) => t('supply.raid.marker', { time: formatDuration(ms, false) })} />}
    />
  );
}

/** A building's whole stock under its marker; the time ring's badge says its last day. */
function BuildingBadges({ buildingId }: { buildingId: string }) {
  const save = useGameStore((s) => s.save);
  const now = useNow(clockConfig.minutesMs);
  const building = save.supply.buildings.find((entry) => entry.id === buildingId);
  if (!building) return null;
  const stock = buildingStockTotal(settleBuilding(save, building, now));
  const last = isLastDay(building.expiresAt, now);
  return (
    <View
      style={styles.badges}
      accessibilityLabel={[
        t('supply.building.markerLabel', {
          building: t(buildingNameKey[building.kind]),
          stock,
          time: formatDuration(Math.max(0, building.expiresAt - now), false),
        }),
        ...(last ? [t('supply.time.lastDayLabel')] : []),
      ].join(', ')}
    >
      <View style={styles.stockBadge}>
        <Text style={styles.badgeText}>{stock}</Text>
      </View>
    </View>
  );
}

type Props = { sites: PlaceSpawn[]; now: number };

/**
 * The hall, the buildings and the sites on the map. Panels open through the
 * panels store, so the map screen's renders never reach this tree; `sites` is
 * the map screen's memoised list.
 */
export const SupplyMarkers = memo(function SupplyMarkers({ sites, now }: Props) {
  const on = useSupplyOn();
  const hall = useGameStore((s) => s.save.supply.hall);
  const buildings = useGameStore((s) => s.save.supply.buildings);
  const discovered = useGameStore((s) => s.save.supply.discovered);
  // Route mode dims every marker; the switch alone re-renders them, once on the way in and once out.
  const routing = useMapPanels((state) => state.routeMode !== null);
  if (!on) return null;
  return (
    <RouteDimContext.Provider value={routing}>
      {hall && (
        <MapMarker id="supply-hall" lngLat={toLngLat(tileCenter(hall.cell))} onPress={tapped(() => useMapPanels.getState().openHall(hall.cell))}>
          <GameIcon emoji="🏠" size={MARKER_SIZE} />
        </MapMarker>
      )}
      {buildings.map((building) => (
        <MapMarker
          key={building.id}
          id={`supply-building:${building.id}`}
          lngLat={toLngLat(building.position)}
          onPress={tapped(() => useMapPanels.getState().openSupplyBuilding(building.id))}
        >
          <View style={styles.building}>
            <TimeRing
              left={timeLeftShare(building.builtAt, building.expiresAt, now)}
              last={isLastDay(building.expiresAt, now)}
              size={MARKER_SIZE}
            >
              <GameIcon emoji={buildingEmoji[building.kind]} size={MARKER_SIZE} />
            </TimeRing>
            <BuildingBadges buildingId={building.id} />
            <RaidCountdown buildingId={building.id} />
          </View>
        </MapMarker>
      ))}
      {sites.map((site) => (
        <MapMarker
          key={site.id}
          id={`supply-site:${site.id}`}
          lngLat={toLngLat(site.position)}
          onPress={tapped(() => useMapPanels.getState().openSite(site))}
        >
          <SiteMarker
            site={site}
            discovered={discovered}
            timeLeft={timeLeftShare(site.startsAt, site.expiresAt, now)}
            lastDay={isLastDay(site.expiresAt, now)}
          />
        </MapMarker>
      ))}
    </RouteDimContext.Provider>
  );
});

const styles = StyleSheet.create({
  building: { alignItems: 'center' },
  raid: { backgroundColor: colors.danger, paddingHorizontal: 4, borderRadius: 2 },
  raidText: { fontSize: 13, color: ui.parchment },
  badges: { flexDirection: 'row', gap: 4 },
  stockBadge: {
    backgroundColor: ui.woodDark,
    borderWidth: 1,
    borderColor: ui.brass,
    paddingHorizontal: 4,
    borderRadius: 2,
  },
  badgeText: { fontSize: 12, color: ui.parchment },
});
