import { GeoJSONSource, Layer } from "@maplibre/maplibre-react-native";
import { memo, useMemo } from "react";

import { useSupplyOn } from "@/hooks/useSupply";
import { useGameStore } from "@/store/gameStore";
import { useMapPanels } from "@/store/mapPanelsStore";
import { ui } from "@/theme";

/** The route's colour: a violet no ground, street, water or marker on the map uses, over a dark casing. */
export const ROUTE_COLOUR = "#B26BFF";
const ROUTE_CASING = ui.outline;

/**
 * The cart's route on the map: the stored street path's points, dashed while a
 * changed route waits for the next departure; while the planner is open, the
 * route being planned instead, so each change shows at once. One GeoJSON line
 * with a dark casing under it, so it reads on any ground. Memoised on the path
 * object.
 */
export const SupplyRoute = memo(function SupplyRoute() {
  const on = useSupplyOn();
  const saved = useGameStore(
    (s) => s.save.supply.cart.nextPath ?? s.save.supply.cart.path,
  );
  const planned = useMapPanels((s) => s.plannerPath);
  const path = planned ?? saved;
  const pending =
    useGameStore(
      (s) =>
        s.save.supply.cart.loop !== null &&
        s.save.supply.cart.nextPath !== null,
    ) && planned === null;

  const lineData = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "supply-route",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: (path?.points ?? []).map((point) => [
              point.longitude,
              point.latitude,
            ]),
          },
        },
      ],
    }),
    [path],
  );

  // The hall and back with no stop between is no route.
  if (!on || !path || path.points.length < 3) return null;
  return (
    <GeoJSONSource id="supply-route" data={lineData}>
      <Layer
        type="line"
        id="supply-route-casing"
        layout={{ "line-join": "round", "line-cap": "round" }}
        paint={{ "line-color": ROUTE_CASING, "line-width": 8 }}
      />
      <Layer
        type="line"
        id="supply-route-line"
        layout={{ "line-join": "round", "line-cap": "round" }}
        paint={{
          "line-color": ROUTE_COLOUR,
          "line-width": 4,
          ...(pending ? { "line-dasharray": [2, 1.5] } : {}),
        }}
      />
    </GeoJSONSource>
  );
});
