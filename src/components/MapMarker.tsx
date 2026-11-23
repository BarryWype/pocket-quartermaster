import { Marker, type MarkerProps } from '@maplibre/maplibre-react-native';
import { createContext, useContext } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@/i18n';
import { feel } from '@/services/feel';
import { useMapPanels } from '@/store/mapPanelsStore';

/**
 * What the markers under it dim for: route mode dims every one, the Network
 * toggle every one that isn't part of the supply network. A dimmed marker
 * takes no taps.
 */
export type MarkerDim = 'none' | 'route' | 'network';
export const RouteDimContext = createContext<MarkerDim>('none');

/** The context value from the two switches: route mode wins. */
export const markerDim = (routing: boolean, networkOnly: boolean): MarkerDim => (routing ? 'route' : networkOnly ? 'network' : 'none');

/**
 * A map marker that route mode and the Network toggle can dim: the same
 * element whether dimmed or not, so a switch re-renders the markers once
 * without remounting them. `network` marks a marker that stays lit with the
 * Network toggle on. `notAStop` says why it can’t be a stop of the
 * delivery route (the general rule when left out).
 */
export function MapMarker({ onPress, children, network, notAStop, ...props }: MarkerProps & { network?: boolean; notAStop?: () => string | null }) {
  const dim = useContext(RouteDimContext);
  const routing = dim === 'route';
  const dimmed = routing || (dim === 'network' && !network);
  const press = routing ? () => explain(notAStop) : dimmed ? undefined : onPress;
  return (
    <Marker {...props} onPress={press}>
      <View style={dimmed ? styles.dimmed : undefined} pointerEvents={dimmed && !routing ? 'none' : 'auto'}>
        {children}
      </View>
    </Marker>
  );
}

/** A tap on a marker route mode dimmed: the route bar says why it isn't a stop. */
const explain = (notAStop?: () => string | null) => {
  feel('press');
  useMapPanels.getState().setRouteTapNote(notAStop?.() ?? t('routeTap.generic'));
};

const styles = StyleSheet.create({ dimmed: { opacity: 0.3 } });
