import { Marker, type MarkerProps } from '@maplibre/maplibre-react-native';
import { createContext, useContext } from 'react';
import { StyleSheet, View } from 'react-native';

/** True while route mode is on: the markers under it are dimmed and take no taps. */
export const RouteDimContext = createContext(false);

/**
 * A map marker that route mode can dim: the same element whether dimmed or
 * not, so entering or leaving route mode re-renders the markers once without
 * remounting them.
 */
export function MapMarker({ onPress, children, ...props }: MarkerProps) {
  const dimmed = useContext(RouteDimContext);
  return (
    <Marker {...props} onPress={dimmed ? undefined : onPress}>
      <View style={dimmed ? styles.dimmed : undefined} pointerEvents={dimmed ? 'none' : 'auto'}>
        {children}
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({ dimmed: { opacity: 0.3 } });
