/**
 * Map UI pass, prompt 2 step 3: what route mode costs. Entering it (the
 * markers dim, the pins and the bar mount) and each pin tap after that (only
 * the pins, the bar and the route line re-render), with eight buildings on the
 * map. Logged, not asserted beyond "it rendered": the numbers move with the
 * machine. Phone estimate: ×4.
 */
import { Profiler, type ProfilerOnRenderCallback, type ReactNode } from "react";
import { act, create } from "react-test-renderer";

import { cellAt } from "@/game/discovery/cells";
import { offsetPosition } from "@/game/generation/geo";
import { createInitialSave } from "@/game/save";
import type { Building } from "@/game/supply/types";
import { SupplyMarkers } from "@/components/SupplyMarkers";
import { SupplyRoute } from "@/components/SupplyRoute";
import { RouteBar } from "@/components/routeMode/RouteBar";
import { RouteModePins } from "@/components/routeMode/RouteModePins";
import { useGameStore } from "@/store/gameStore";
import { useMapPanels } from "@/store/mapPanelsStore";

jest.mock(
  "react-native-safe-area-context",
  () => jest.requireActual("react-native-safe-area-context/jest/mock").default,
);
jest.mock("expo-router", () => ({
  ...jest.requireActual("expo-router"),
  useIsFocused: () => true,
}));
jest.mock("@/services/mapTiles", () => ({
  walkableTiles: { load: () => Promise.resolve(null) },
}));
jest.mock("@maplibre/maplibre-react-native", () => {
  const { createElement: h } = jest.requireActual("react");
  const { View: V } = jest.requireActual("react-native");
  const piece = ({ children, ...props }: { children?: ReactNode }) =>
    h(V, props, children);
  return {
    Marker: piece,
    ViewAnnotation: piece,
    GeoJSONSource: piece,
    Layer: () => null,
  };
});

const PHONE_FACTOR = 4;
const origin = { latitude: -41.2865, longitude: 174.7762 };
const kinds: Building["kind"][] = [
  "farm",
  "quarry",
  "lumberCamp",
  "herbGarden",
  "huntingCamp",
  "farm",
  "quarry",
  "lumberCamp",
];

const building = (i: number): Building => ({
  id: `b${i}`,
  kind: kinds[i],
  siteId: `site-${i}`,
  position: offsetPosition(origin, 120 * Math.cos(i), 120 * Math.sin(i)),
  quality: 2,
  builtAt: Date.now(),
  expiresAt: Date.now() + 4 * 24 * 3_600_000,
  heroId: null,
  postedAt: null,
  stock: { grain: 3 },
  progress: 0,
  made: 0,
  settledAt: Date.now(),
  inspectedUntil: 0,
  closedUntil: 0,
});

describe("route mode", () => {
  it("times entering route mode and each pin tap", () => {
    const base = createInitialSave();
    act(() => {
      useGameStore.setState({
        save: {
          ...base,
          supply: {
            ...base.supply,
            debugUnlocked: true,
            hall: { cell: cellAt(origin), moves: [] },
            buildings: kinds.map((_, i) => building(i)),
          },
        },
      });
    });
    let markers = 0;
    let pinsMs = 0;
    let route = 0;
    const onMarkers: ProfilerOnRenderCallback = (_, __, actual) => {
      markers += actual;
    };
    const onRoute: ProfilerOnRenderCallback = (_, __, actual) => {
      route += actual;
    };
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <>
          <Profiler id="markers" onRender={onMarkers}>
            <SupplyMarkers sites={[]} now={Date.now()} />
          </Profiler>
          <Profiler id="route" onRender={onRoute}>
            <SupplyRoute />
            <RouteModePins />
            <RouteBar />
          </Profiler>
        </>,
      );
    });
    markers = 0;
    route = 0;
    const started = performance.now();
    act(() => useMapPanels.getState().openRouteMode([]));
    const enter = { wall: performance.now() - started, markers, route };

    const taps: number[] = [];
    const pinTaps: number[] = [];
    pinsMs = 0;
    const tapMarkers: number[] = [];
    for (let i = 0; i < kinds.length; i++) {
      markers = 0;
      route = 0;
      act(() => {
        renderer.root
          .find(
            (node) =>
              node.props?.id === `route-pin:b${i}` &&
              typeof node.props?.onPress === "function",
          )
          .props.onPress();
      });
      taps.push(route);
      pinTaps.push(pinsMs);
      pinsMs = 0;
      tapMarkers.push(markers);
    }
    expect(useMapPanels.getState().routeMode?.draft).toHaveLength(kinds.length);
    const median = [...taps].sort((a, b) => a - b)[Math.floor(taps.length / 2)];
    console.log(
      [
        "Route mode (8 buildings), render ms on this machine (phone ≈ ×4):",
        `  enter: wall ${enter.wall.toFixed(1)}, markers dimming ${enter.markers.toFixed(1)}, pins + bar ${enter.route.toFixed(1)}`,
        `  pin tap: pins + bar + line median ${median.toFixed(1)} (max ${Math.max(...taps).toFixed(1)}), phone ≈ ${(median * PHONE_FACTOR).toFixed(0)}`,
        `  each tap: ${taps.map((ms) => ms.toFixed(0)).join(", ")}`,
        `  of which the pins: median ${[...pinTaps].sort((a, b) => a - b)[Math.floor(pinTaps.length / 2)].toFixed(1)}`,
        `  other markers re-rendered by the taps: ${tapMarkers.reduce((a, b) => a + b, 0).toFixed(1)} ms`,
      ].join("\n"),
    );
    expect(tapMarkers.every((ms) => ms === 0)).toBe(true);
    act(() => {
      useMapPanels.getState().closeRouteMode();
      renderer.unmount();
    });
  });
});
