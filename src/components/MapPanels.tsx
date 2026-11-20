import { timed } from '@/components/timed';
import { clockConfig } from '@/content/clockConfig';
import type { LatLng } from '@/game/generation/types';
import { isPatrolKind, isTravellerKind, type PatrolSpawn } from '@/game/patrols/generate';
import { isFightPlace } from '@/game/places/fights';
import type { PlaceSpawn } from '@/game/places/generate';
import { useNow } from '@/hooks/useNow';
import { useMapPanels } from '@/store/mapPanelsStore';
import { useWorldStore } from '@/store/worldStore';

import { PatrolSheet } from './fights/PatrolSheet';
import { PlaceFightSheet } from './fights/PlaceFightSheet';
import { SanctumSheet } from './fights/SanctumSheet';
import { TravellerSheet } from './fights/TravellerSheet';
import { HallSheet, PlacingHallBar } from './HallSheet';
import { MarkerChooser } from './MarkerChooser';
import { PlaceSheet } from './places/PlaceSheet';
import { SecretSheet } from './places/SecretSheet';
import { TavernSheet } from './places/TavernSheet';
import { RouteBar } from './routeMode/RouteBar';
import { SupplyCampPanel } from './SupplyCampPanel';
import { SupplyCartPanel } from './SupplyCartPanel';
import { SupplySitePanel } from './SupplySitePanel';

const TimedSanctumSheet = timed('panel: sanctum', SanctumSheet);
const TimedPlaceFightSheet = timed('panel: place fight', PlaceFightSheet);
const TimedPlaceSheet = timed('panel: place', PlaceSheet);
const TimedSecretSheet = timed('panel: secret', SecretSheet);
const TimedTavernSheet = timed('panel: tavern', TavernSheet);
const TimedTravellerSheet = timed('panel: traveller', TravellerSheet);
const TimedPatrolSheet = timed('panel: patrol', PatrolSheet);
const TimedHallSheet = timed('panel: hall', HallSheet);
const TimedSupplyBuildingPanel = timed('panel: supply building', SupplyCampPanel);
const TimedSupplyCartPanel = timed('panel: supply cart', SupplyCartPanel);
const TimedSupplySitePanel = timed('panel: supply site', SupplySitePanel);

type Props = {
  player: LatLng;
  /** The patrols the map shows, to find the one a notification pointed at. */
  patrols: PatrolSpawn[];
};

/** Whether the place kind opens the fight panel, the secret panel or the plain one. */
const isSecretKind = (kind: PlaceSpawn['kind']) => kind === 'hiddenDen' || kind === 'blackMarket' || kind === 'underwaterDungeon';

/**
 * The map's panels, on their own store slice: opening or closing one never
 * re-renders the map screen's markers, only this component. A notification's
 * held patrol stays selected while it is still around.
 */
export function MapPanels({ player, patrols }: Props) {
  // Its own clock: a panel's countdowns tick without re-rendering the map screen.
  const now = useNow(clockConfig.mapMovingMs);
  const openSanctum = useMapPanels((state) => state.sanctum);
  const openPlace = useMapPanels((state) => state.place);
  const openTavern = useMapPanels((state) => state.tavern);
  const openPatrol = useMapPanels((state) => state.patrol);
  const hallCell = useMapPanels((state) => state.hallCell);
  const supplyBuilding = useMapPanels((state) => state.supplyBuilding);
  const site = useMapPanels((state) => state.site);
  const closeSanctum = useMapPanels((state) => state.closeSanctum);
  const closePlace = useMapPanels((state) => state.closePlace);
  const closeTavern = useMapPanels((state) => state.closeTavern);
  const closePatrol = useMapPanels((state) => state.closePatrol);
  const closeHall = useMapPanels((state) => state.closeHall);
  const closeSupplyBuilding = useMapPanels((state) => state.closeSupplyBuilding);
  const closeSite = useMapPanels((state) => state.closeSite);
  const cartOpen = useMapPanels((state) => state.cartOpen);
  const closeCart = useMapPanels((state) => state.closeCart);
  const routing = useMapPanels((state) => state.routeMode !== null);
  const focusPatrol = useWorldStore((state) => state.focusPatrol);
  const focusedPatrol = focusPatrol ? (patrols.find((spawn) => spawn.id === focusPatrol.id) ?? null) : null;
  const selectedPatrol = openPatrol ?? focusedPatrol;

  return (
    <>
      {openSanctum && <TimedSanctumSheet spawn={openSanctum} player={player} now={now} onClose={closeSanctum} />}
      {openPlace && isFightPlace(openPlace.kind) && (
        <TimedPlaceFightSheet place={openPlace} player={player} now={now} onClose={closePlace} />
      )}
      {openPlace && isSecretKind(openPlace.kind) && <TimedSecretSheet place={openPlace} player={player} now={now} onClose={closePlace} />}
      {openPlace && !isFightPlace(openPlace.kind) && !isSecretKind(openPlace.kind) && (
        <TimedPlaceSheet place={openPlace} player={player} now={now} onClose={closePlace} />
      )}
      {openTavern && <TimedTavernSheet tavern={openTavern} player={player} now={now} onClose={closeTavern} />}
      {selectedPatrol && isPatrolKind(selectedPatrol.kind) && (
        <TimedPatrolSheet spawn={selectedPatrol} player={player} now={now} onClose={closePatrol} />
      )}
      {selectedPatrol && isTravellerKind(selectedPatrol.kind) && (
        <TimedTravellerSheet spawn={selectedPatrol} player={player} now={now} onClose={closePatrol} />
      )}
      {hallCell && <TimedHallSheet cell={hallCell} player={player} onClose={closeHall} />}
      <PlacingHallBar />
      <MarkerChooser />
      {supplyBuilding && <TimedSupplyBuildingPanel id={supplyBuilding} player={player} onClose={closeSupplyBuilding} />}
      {site && <TimedSupplySitePanel site={site} player={player} onClose={closeSite} />}
      {cartOpen && <TimedSupplyCartPanel onClose={closeCart} />}
      {routing && <RouteBar />}
    </>
  );
}
