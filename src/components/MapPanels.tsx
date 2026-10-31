import { timed } from '@/components/timed';
import type { LatLng } from '@/game/generation/types';
import { isPatrolKind, isTravellerKind, type PatrolSpawn } from '@/game/patrols/generate';
import { isFightPlace } from '@/game/places/fights';
import type { PlaceSpawn } from '@/game/places/generate';
import { useMapPanels } from '@/store/mapPanelsStore';
import { useWorldStore } from '@/store/worldStore';

import { PatrolPanel } from './PatrolPanel';
import { PlaceFightPanel } from './PlaceFightPanel';
import { PlacePanel } from './PlacePanel';
import { SanctumPanel } from './SanctumPanel';
import { SecretPanel } from './SecretPanel';
import { TavernPanel } from './TavernPanel';
import { TravellerPanel } from './TravellerPanel';

const TimedSanctumPanel = timed('panel: sanctum', SanctumPanel);
const TimedPlaceFightPanel = timed('panel: place fight', PlaceFightPanel);
const TimedPlacePanel = timed('panel: place', PlacePanel);
const TimedSecretPanel = timed('panel: secret', SecretPanel);
const TimedTavernPanel = timed('panel: tavern', TavernPanel);
const TimedTravellerPanel = timed('panel: traveller', TravellerPanel);
const TimedPatrolPanel = timed('panel: patrol', PatrolPanel);

type Props = {
  player: LatLng;
  now: number;
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
export function MapPanels({ player, now, patrols }: Props) {
  const openSanctum = useMapPanels((state) => state.sanctum);
  const openPlace = useMapPanels((state) => state.place);
  const openTavern = useMapPanels((state) => state.tavern);
  const openPatrol = useMapPanels((state) => state.patrol);
  const closeSanctum = useMapPanels((state) => state.closeSanctum);
  const closePlace = useMapPanels((state) => state.closePlace);
  const closeTavern = useMapPanels((state) => state.closeTavern);
  const closePatrol = useMapPanels((state) => state.closePatrol);
  const focusPatrol = useWorldStore((state) => state.focusPatrol);
  const focusedPatrol = focusPatrol ? (patrols.find((spawn) => spawn.id === focusPatrol.id) ?? null) : null;
  const selectedPatrol = openPatrol ?? focusedPatrol;

  return (
    <>
      {openSanctum && <TimedSanctumPanel spawn={openSanctum} player={player} onClose={closeSanctum} />}
      {openPlace && isFightPlace(openPlace.kind) && (
        <TimedPlaceFightPanel place={openPlace} player={player} now={now} onClose={closePlace} />
      )}
      {openPlace && isSecretKind(openPlace.kind) && <TimedSecretPanel place={openPlace} player={player} now={now} onClose={closePlace} />}
      {openPlace && !isFightPlace(openPlace.kind) && !isSecretKind(openPlace.kind) && (
        <TimedPlacePanel place={openPlace} player={player} now={now} onClose={closePlace} />
      )}
      {openTavern && <TimedTavernPanel tavern={openTavern} player={player} onClose={closeTavern} />}
      {selectedPatrol && isPatrolKind(selectedPatrol.kind) && (
        <TimedPatrolPanel spawn={selectedPatrol} player={player} now={now} onClose={closePatrol} />
      )}
      {selectedPatrol && isTravellerKind(selectedPatrol.kind) && (
        <TimedTravellerPanel spawn={selectedPatrol} player={player} now={now} onClose={closePatrol} />
      )}
    </>
  );
}
