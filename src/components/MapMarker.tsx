import { Marker, type MarkerProps } from '@maplibre/maplibre-react-native';
import { createContext, useContext } from 'react';
import { StyleSheet, View } from 'react-native';

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
 * Network toggle on.
 */
export function MapMarker({ onPress, children, network, ...props }: MarkerProps & { network?: boolean }) {
  const dim = useContext(RouteDimContext);
  const dimmed = dim === 'route' || (dim === 'network' && !network);
  return (
    <Marker {...props} onPress={dimmed ? undefined : onPress}>
      <View style={dimmed ? styles.dimmed : undefined} pointerEvents={dimmed ? 'none' : 'auto'}>
        {children}
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({ dimmed: { opacity: 0.3 } });
