import { Marker } from '@maplibre/maplibre-react-native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Countdown } from '@/components/Countdown';
import { GameIcon } from '@/components/GameIcon';
import { IconLabel } from '@/components/IconLabel';
import { SiteMarker } from '@/components/SiteMarker';
import { Text } from '@/components/Text';
import { clockConfig } from '@/content/clockConfig';
import { buildingEmoji, buildingNameKey, isLastDay } from '@/game/supply/buildings';
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

/** A building's whole stock under its marker, and the hourglass once its last day has come. */
function BuildingBadges({ buildingId }: { buildingId: string }) {
  const save = useGameStore((s) => s.save);
  const now = useNow(clockConfig.minutesMs);
  const building = save.supply.buildings.find((entry) => entry.id === buildingId);
  if (!building) return null;
  const stock = buildingStockTotal(settleBuilding(save, building, now));
  return (
    <View
      style={styles.badges}
      accessibilityLabel={t('supply.building.markerLabel', {
        building: t(buildingNameKey[building.kind]),
        stock,
        time: formatDuration(Math.max(0, building.expiresAt - now), false),
      })}
    >
      <View style={styles.stockBadge}>
        <Text style={styles.badgeText}>{stock}</Text>
      </View>
      {isLastDay(building.expiresAt, now) && (
        <View style={[styles.stockBadge, styles.lastBadge]}>
          <Text style={styles.badgeText}>⏳</Text>
        </View>
      )}
    </View>
  );
}

type Props = { sites: PlaceSpawn[] };

/**
 * The hall, the buildings and the sites on the map. Panels open through the
 * panels store, so the map screen's renders never reach this tree; `sites` is
 * the map screen's memoised list.
 */
export const SupplyMarkers = memo(function SupplyMarkers({ sites }: Props) {
  const on = useSupplyOn();
  const planning = useMapPanels((state) => state.routeDraft !== null);
  const hall = useGameStore((s) => s.save.supply.hall);
  const buildings = useGameStore((s) => s.save.supply.buildings);
  const discovered = useGameStore((s) => s.save.supply.discovered);
  if (!on) return null;
  // While the planner is open, a building tap adds it to the draft instead of opening its sheet.
  const openBuilding = (id: string) =>
    planning ? useMapPanels.getState().addToRoute({ building: id }) : useMapPanels.getState().openSupplyBuilding(id);
  return (
    <>
      {hall && (
        <Marker id="supply-hall" lngLat={toLngLat(tileCenter(hall.cell))} onPress={tapped(() => useMapPanels.getState().openSupplyCell(hall.cell))}>
          <GameIcon emoji="🏠" size={MARKER_SIZE} />
        </Marker>
      )}
      {buildings.map((building) => (
        <Marker
          key={building.id}
          id={`supply-building:${building.id}`}
          lngLat={toLngLat(building.position)}
          onPress={tapped(() => openBuilding(building.id))}
        >
          <View style={styles.building}>
            <GameIcon emoji={buildingEmoji[building.kind]} size={MARKER_SIZE} />
            <BuildingBadges buildingId={building.id} />
            <RaidCountdown buildingId={building.id} />
          </View>
        </Marker>
      ))}
      {sites.map((site) => (
        <Marker
          key={site.id}
          id={`supply-site:${site.id}`}
          lngLat={toLngLat(site.position)}
          onPress={tapped(() => useMapPanels.getState().openSite(site))}
        >
          <SiteMarker site={site} discovered={discovered} />
        </Marker>
      ))}
    </>
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
  lastBadge: { backgroundColor: ui.ember },
  badgeText: { fontSize: 12, color: ui.parchment },
});
