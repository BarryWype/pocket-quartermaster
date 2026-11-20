import { GeoJSONSource, Layer } from "@maplibre/maplibre-react-native";
import { memo, useMemo } from "react";

import { addGrab, legAt } from "@/game/supply/routeEdit";
import { feel } from "@/services/feel";

import { useSupplyOn } from "@/hooks/useSupply";
import { useGameStore } from "@/store/gameStore";
import { useMapPanels } from "@/store/mapPanelsStore";
import { ui } from "@/theme";

/** The route's colour: a violet no ground, street, water or marker on the map uses, over a dark casing. */
export const ROUTE_COLOUR = ui.route;
const ROUTE_CASING = ui.outline;

/** How far from the drawn line a tap in route mode still lands on it: the press's own hitbox does the rest. */
const GRAB_TAP_METERS = 60;

/**
 * A tap on the route in route mode: a grab point there, on that leg, without
 * changing where the route goes until it is dragged.
 */
const tapRoute = (lngLat: [number, number]) => {
  const { routeMode, routePath, setRouteDraft } = useMapPanels.getState();
  if (!routeMode || !routePath) return;
  const hit = legAt(routePath, { longitude: lngLat[0], latitude: lngLat[1] });
  if (hit && hit.meters <= GRAB_TAP_METERS)
    setRouteDraft(addGrab(routeMode.draft, hit.leg, hit.point));
};

/** A tap on the route outside route mode opens the cart's sheet, over whatever lies under the line. */
const openCart = () => {
  feel("press");
  useMapPanels.getState().openCart();
};

/**
 * The cart's route on the map: the stored street path's points, dashed while a
 * changed route waits for the next departure; in route mode, the draft's path
 * instead, so each change shows at once, over a dark wash that dims the ground,
 * and a tap on the line adds a grab point; outside it, a tap opens the cart.
 * One GeoJSON line with a dark casing under it, so it reads on any ground, and
 * chevrons along it in the direction the cart drives. With the Network toggle
 * on, a lighter wash dims the ground under the network. Memoised on the path.
 */
export const SupplyRoute = memo(function SupplyRoute() {
  const on = useSupplyOn();
  const saved = useGameStore(
    (s) => s.save.supply.cart.nextPath ?? s.save.supply.cart.path,
  );
  const routing = useMapPanels((s) => s.routeMode !== null);
  const networkOnly = useMapPanels((s) => s.networkOnly);
  const planned = useMapPanels((s) => s.routePath);
  // In route mode, only the draft: an empty draft draws no route.
  const path = routing ? planned : saved;
  const pending =
    useGameStore(
      (s) =>
        s.save.supply.cart.loop !== null &&
        s.save.supply.cart.nextPath !== null,
    ) && !routing;

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

  if (!on) return null;
  // The hall and back with no stop between is no route.
  const drawn = path !== null && path.points.length >= 3;
  // Under the route line: it dims the ground, the streets and the cells, not the markers (route mode dims those
  // itself). The line's source remounts with route mode, so its layers are added after the wash, on top of it.
  const dim = (routing || networkOnly) && (
    <Layer
      type="background"
      id="route-mode-dim"
      paint={{ "background-color": ROUTE_CASING, "background-opacity": routing ? 0.45 : 0.3 }}
    />
  );
  if (!drawn) return dim || null;
  return (
    <>
      {dim}
      <GeoJSONSource
        key={routing ? "route-mode" : networkOnly ? "route-network" : "route"}
        id="supply-route"
        data={lineData}
        onPress={(event) => {
          event.stopPropagation();
          if (routing) tapRoute(event.nativeEvent.lngLat);
          else openCart();
        }}
      >
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
        <Layer
          type="symbol"
          id="supply-route-arrows"
          layout={{
            "symbol-placement": "line",
            "symbol-spacing": 90,
            "icon-image": "route-arrow",
            "icon-rotation-alignment": "map",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          }}
        />
      </GeoJSONSource>
    </>
  );
});
