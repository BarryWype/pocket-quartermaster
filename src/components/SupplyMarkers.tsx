import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { MapMarker, markerDim, RouteDimContext } from '@/components/MapMarker';
import { BadgeIcon, badgeLabel } from '@/components/network/NetworkBadge';
import { routeTap } from '@/components/routeMode/routeTap';

import { GameIcon } from '@/components/GameIcon';
import { SiteMarker } from '@/components/SiteMarker';
import { TimeRing } from '@/components/ui';
import { clockConfig } from '@/content/clockConfig';
import { buildingBadge } from '@/game/supply/badges';
import { buildingEmoji, buildingNameKey, isLastDay, timeLeftShare } from '@/game/supply/buildings';
import type { PlaceSpawn } from '@/game/places/generate';
import { t } from '@/i18n';
import { useNow } from '@/hooks/useNow';
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

/**
 * A building's one badge, the most urgent (buildingBadge), with its own icon
 * so colour is never the only signal, and the marker's accessibility label:
 * the building's name and what the badge means.
 */
function BuildingBadge({ buildingId }: { buildingId: string }) {
  const save = useGameStore((s) => s.save);
  const now = useNow(clockConfig.minutesMs);
  const building = save.supply.buildings.find((entry) => entry.id === buildingId);
  if (!building) return null;
  const name = t(buildingNameKey[building.kind]);
  const badge = buildingBadge(save, building, now);
  if (!badge) return <View accessible accessibilityLabel={name} style={styles.badgeSpot} />;
  return (
    <View accessible accessibilityLabel={badgeLabel(save, building, badge, name, now)} style={styles.badgeAt}>
      <BadgeIcon badge={badge} />
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
  // Route mode dims every marker; the Network toggle keeps these lit. A switch alone re-renders them once.
  const dim = useMapPanels((state) => markerDim(state.routeMode !== null, state.networkOnly));
  if (!on) return null;
  return (
    <RouteDimContext.Provider value={dim}>
      {hall && (
        <MapMarker id="supply-hall" network lngLat={toLngLat(tileCenter(hall.cell))} onPress={tapped(() => useMapPanels.getState().openHall(hall.cell))}>
          <GameIcon emoji="🏠" size={MARKER_SIZE} />
        </MapMarker>
      )}
      {buildings.map((building) => (
        <MapMarker
          key={building.id}
          id={`supply-building:${building.id}`}
          network
          lngLat={toLngLat(building.position)}
          onRouteTap={() => routeTap({ kind: 'building', id: building.id, position: building.position }, t(buildingNameKey[building.kind]))}
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
            <BuildingBadge buildingId={building.id} />
          </View>
        </MapMarker>
      ))}
      {sites.map((site) => (
        <MapMarker
          key={site.id}
          id={`supply-site:${site.id}`}
          network
          lngLat={toLngLat(site.position)}
          onRouteTap={() => routeTap(site, '')}
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
  badgeSpot: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  badgeAt: { position: 'absolute', top: -8, right: -10 },
});
