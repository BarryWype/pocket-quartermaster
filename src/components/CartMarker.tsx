import { Marker } from '@maplibre/maplibre-react-native';
import { memo, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Appear } from '@/components/motion';
import { GameIcon } from '@/components/GameIcon';
import { IconLabel } from '@/components/IconLabel';
import { clockConfig } from '@/content/clockConfig';
import { materialById } from '@/content/lookup';
import { cartPositionAt } from '@/game/supply/cart';
import { useMotion } from '@/hooks/useMotion';
import { useNow } from '@/hooks/useNow';
import { useSupplyOn } from '@/hooks/useSupply';
import { feel } from '@/services/feel';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';
import { useWorldStore } from '@/store/worldStore';

const MARKER_SIZE = 26;
/** How long an unload's pop stays over the marker. */
const POP_MS = 1000;

/**
 * The cart on the map while a loop runs. It keeps its own clock, so its
 * movement re-renders nothing but this marker; parked, it renders nothing. An
 * unload at a place pops a "+n" with the good's icon over it (Full animations).
 */
export const CartMarker = memo(function CartMarker() {
  const on = useSupplyOn();
  const loop = useGameStore((state) => state.save.supply.cart.loop);
  const pop = useWorldStore((state) => state.cartPop);
  const { level } = useMotion();
  const [popShown, setPopShown] = useState<{ good: string; n: number } | null>(null);
  const now = useNow(clockConfig.mapMovingMs);

  useEffect(() => {
    if (!pop || level !== 'full') return;
    setPopShown({ good: pop.good, n: pop.n });
    const timer = setTimeout(() => setPopShown(null), POP_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pop?.at, level]);

  if (!on || !loop) return null;
  const position = cartPositionAt(loop, now);
  if (!position) return null;
  return (
    <Marker
      id="supply-cart"
      lngLat={[position.longitude, position.latitude]}
      onPress={() => {
        feel('press');
        useMapPanels.getState().openCart();
      }}
    >
      <View style={styles.marker}>
        {popShown && (
          <Appear style={styles.pop}>
            <IconLabel
              emoji={materialById[popShown.good]?.emoji ?? '📦'}
              icon={materialById[popShown.good]?.icon}
              label={`+${popShown.n}`}
              size={16}
              labelStyle={styles.popText}
            />
          </Appear>
        )}
        <GameIcon emoji="🐴" size={MARKER_SIZE} />
      </View>
    </Marker>
  );
});

const styles = StyleSheet.create({
  marker: { alignItems: 'center' },
  pop: { position: 'absolute', bottom: 30 },
  popText: { color: '#8A2E1C', fontFamily: 'serif' },
});
