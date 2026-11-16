import { Marker } from '@maplibre/maplibre-react-native';
import { memo } from 'react';

import { GameIcon } from '@/components/GameIcon';
import { clockConfig } from '@/content/clockConfig';
import { cartPositionAt } from '@/game/supply/cart';
import { useNow } from '@/hooks/useNow';
import { useSupplyOn } from '@/hooks/useSupply';
import { feel } from '@/services/feel';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';

const MARKER_SIZE = 26;

/**
 * The cart on the map while a loop runs. It keeps its own clock, so its
 * movement re-renders nothing but this marker; parked, it renders nothing.
 */
export const CartMarker = memo(function CartMarker() {
  const on = useSupplyOn();
  const loop = useGameStore((state) => state.save.supply.cart.loop);
  const now = useNow(clockConfig.mapMovingMs);
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
      <GameIcon emoji="🐴" size={MARKER_SIZE} />
    </Marker>
  );
});
