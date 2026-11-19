import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GameIcon } from "@/components/GameIcon";
import { IconLabel } from "@/components/IconLabel";
import { TOP_BAR_HEIGHT } from "@/components/MapTopBar";
import { Overlay } from "@/components/Overlay";
import { PressScale } from "@/components/motion";
import { Sheet } from "@/components/Sheet";
import { Text } from "@/components/Text";
import { EmberButton, WoodButton } from "@/components/ui";
import { clockConfig } from "@/content/clockConfig";
import { materialById } from "@/content/lookup";
import { placeInfo } from "@/content/places";
import { networkGoods, supplyRules } from "@/content/supplyLines";
import { distanceMeters } from "@/game/generation/geo";
import { tileCenter } from "@/game/generation/tiles";
import {
  buildingReach,
  buildingEmoji,
  buildingNameKey,
  isLastDay,
} from "@/game/supply/buildings";
import { loopPreview, routeProblem } from "@/game/supply/cart";
import { orderPlaceName, stillNeeded } from "@/game/supply/orders";
import {
  plannerStops,
  stopPosition,
  suggestOrder,
} from "@/game/supply/planner";
import { settleBuilding } from "@/game/supply/production";
import type { BuildingKind, RoutePoint, StreetPath } from "@/game/supply/types";
import type { SaveData } from "@/game/save";
import { tavernNameOf } from "@/game/taverns/taverns";
import { useNow } from "@/hooks/useNow";
import { useStreetPath } from "@/hooks/useStreetPath";
import { formatDistance, formatDuration, formatPercent, t } from "@/i18n";
import { feel } from "@/services/feel";
import { useGameStore } from "@/store/gameStore";
import { useMapPanels } from "@/store/mapPanelsStore";
import { fonts, ui } from "@/theme";

const DAY = 24 * 3_600_000;

/** Whether two route points are the same stop (a via point is only ever equal to itself). */
const sameStop = (a: RoutePoint, b: RoutePoint): boolean =>
  ("building" in a && "building" in b && a.building === b.building) ||
  ("place" in a && "place" in b && a.place === b.place);

/** The goods a building kind makes. */
const makes = (kind: BuildingKind): string[] =>
  Object.keys(supplyRules.buildings.kinds[kind].makes);

type Props = { onClose: () => void };

/**
 * The route planner: a guided bottom sheet in three steps — pick the stops,
 * put them in order, see the loop the route makes. On the last step "Adjust on
 * the map" shrinks it to a bar above the island menu, and only then does a map
 * tap send the cart through a street.
 */
export function RoutePlannerSheet({ onClose }: Props) {
  const save = useGameStore((s) => s.save);
  const setRoute = useGameStore((s) => s.setRoute);
  const now = useNow(clockConfig.minutesMs);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState<RoutePoint[]>(
    () => useMapPanels.getState().routePlanner ?? [],
  );
  const { path, finding } = useStreetPath(draft);
  // The map draws the route being planned, so a stop or a via point shows on the streets as soon as it is added.
  const setPlannerPath = useMapPanels((s) => s.setPlannerPath);
  useEffect(() => {
    setPlannerPath(draft.length > 0 ? path : null);
  }, [draft.length, path, setPlannerPath]);
  useEffect(() => () => setPlannerPath(null), [setPlannerPath]);
  const tap = useMapPanels((s) => s.plannerTap);
  const adjusting = useMapPanels((s) => s.plannerAdjusting);
  const setAdjusting = useMapPanels((s) => s.setPlannerAdjusting);
  // The route as it stood when adjusting began, for Cancel.
  const [beforeAdjust, setBeforeAdjust] = useState<RoutePoint[] | null>(null);
  const { top } = useSafeAreaInsets();

  // While adjusting, a tap on the map becomes a via point after the stop nearest to it, off the press.
  useEffect(() => {
    if (!tap || !adjusting) return;
    const timer = setTimeout(() => {
      setDraft((current) => {
        let best = -1;
        let bestDistance = Infinity;
        current.forEach((point, i) => {
          const at = stopPosition(save, point);
          if (at) {
            const distance = distanceMeters(tap.position, at);
            if (distance < bestDistance) {
              bestDistance = distance;
              best = i;
            }
          }
        });
        const next = [...current];
        next.splice(best + 1, 0, { via: tap.position });
        return next;
      });
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tap?.seq]);

  const hall = save.supply.hall;
  const centre = hall ? tileCenter(hall.cell) : null;
  const reach = buildingReach(save).meters;
  const stops = plannerStops(save, now);
  const pickedCount = draft.filter(
    (point) => "building" in point || "place" in point,
  ).length;

  const nameOf = (point: RoutePoint): string => {
    if ("building" in point) {
      const building = save.supply.buildings.find(
        (b) => b.id === point.building,
      );
      return building
        ? t(buildingNameKey[building.kind])
        : t("supply.planner.stop");
    }
    if ("place" in point) {
      const order = save.supply.orders[point.place];
      return order
        ? orderPlaceName(order, tavernNameOf)
        : t("supply.planner.stop");
    }
    return t("supply.planner.stop");
  };

  const iconOf = (point: RoutePoint): string => {
    if ("building" in point) {
      const building = save.supply.buildings.find(
        (b) => b.id === point.building,
      );
      return building ? buildingEmoji[building.kind] : "⬤";
    }
    if ("place" in point) {
      const order = save.supply.orders[point.place];
      return order ? placeInfo[order.kind].emoji : "⬤";
    }
    return "⬤";
  };

  /** '{n} d' for whole days left, else the hour-and-minute form. */
  const timeLeft = (expiresAt: number): string => {
    const days = Math.floor(Math.max(0, expiresAt - now) / DAY);
    return days >= 1
      ? t("supply.planner.daysLeft", { count: days })
      : formatDuration(Math.max(0, expiresAt - now), false);
  };

  const toggle = (point: RoutePoint) =>
    setDraft((current) =>
      current.some((picked) => sameStop(picked, point))
        ? current.filter((picked) => !sameStop(picked, point))
        : [...current, point],
    );

  const move = (from: number, by: -1 | 1) =>
    setDraft((current) => {
      const to = from + by;
      if (to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });

  const problem = routeProblem(save, draft);
  const tooFarName = centre
    ? draft.find((point) => {
        const at = stopPosition(save, point);
        return at !== null && distanceMeters(centre, at) > reach;
      })
    : undefined;
  const problemText =
    problem === "noHall"
      ? t("supply.cart.noHall")
      : problem === "noStop"
        ? t("supply.planner.problem.noStop")
        : problem === "tooFar" && tooFarName
          ? t("supply.planner.problem.tooFar", {
              name: nameOf(tooFarName),
              distance: formatDistance(reach),
            })
          : null;

  const stepLabels = [
    t("supply.planner.step.stops"),
    t("supply.planner.step.order"),
    t("supply.planner.step.result"),
  ];
  const subtitle =
    step === 1
      ? pickedCount > 0
        ? `${t("supply.planner.subStops")} · ${t("supply.planner.picked", { count: pickedCount })}`
        : t("supply.planner.subStops")
      : step === 2
        ? t("supply.planner.subOrder")
        : t("supply.planner.subResult");

  if (adjusting) {
    return (
      // At the top, under the top bar: the bottom of the map holds the walk pills and the island menu.
      <View style={[styles.adjustBar, { top: top + TOP_BAR_HEIGHT + 8 }]}>
        <Text style={styles.adjustText}>{t("supply.planner.adjustBar")}</Text>
        <View style={styles.adjustButtons}>
          <WoodButton
            compact
            title={t("common.cancel")}
            onPress={() => {
              if (beforeAdjust) setDraft(beforeAdjust);
              setAdjusting(false);
            }}
          />
          <EmberButton
            compact
            title={t("supply.planner.done")}
            onPress={() => setAdjusting(false)}
          />
        </View>
      </View>
    );
  }

  const sheet = (
    <Sheet
      variant="wood"
      emoji="🐴"
      title={t("supply.planner.title")}
      subtitle={subtitle}
      footer={
        <View style={styles.footer}>
          {step === 1 && (
            <WoodButton title={t("common.cancel")} onPress={onClose} />
          )}
          {(step === 2 || step === 3) && (
            <WoodButton
              title={t("common.back")}
              onPress={() => setStep((step === 3 ? 2 : 1) as 1 | 2)}
            />
          )}
          {step === 3 && (
            <WoodButton
              title={t("supply.planner.adjust")}
              onPress={() => {
                setBeforeAdjust(draft);
                setAdjusting(true);
              }}
            />
          )}
          {step === 1 && (
            <EmberButton
              title={t("supply.planner.nextOrder")}
              disabled={pickedCount === 0}
              onPress={() => {
                feel("press");
                setStep(2);
              }}
            />
          )}
          {step === 2 && (
            <EmberButton
              title={t("supply.planner.nextResult")}
              onPress={() => {
                feel("press");
                setStep(3);
              }}
            />
          )}
          {step === 3 && (
            <EmberButton
              title={t("supply.planner.setRoute")}
              disabled={problem !== null || finding}
              onPress={() => {
                setRoute(draft, path ?? undefined);
                feel("reward");
                onClose();
              }}
            />
          )}
        </View>
      }
    >
      <View style={styles.stepsBar}>
        {stepLabels.map((label, i) => (
          <Text
            key={label}
            style={[
              styles.stepText,
              i + 1 === step && styles.stepOn,
              i + 1 < step && styles.stepDone,
            ]}
          >
            {label}
          </Text>
        ))}
      </View>

      {step === 1 &&
        (stops.length === 0 ? (
          <View style={styles.body}>
            <Text style={styles.line}>{t("supply.planner.empty")}</Text>
            <EmberButton
              title={t("supply.planner.showSites")}
              onPress={onClose}
            />
          </View>
        ) : (
          <View style={styles.list}>
            {stops.map((stop) => {
              const on = draft.some((picked) => sameStop(picked, stop.point));
              const last = isLastDay(stop.expiresAt, now);
              if (stop.kind === "building") {
                const stock = settleBuilding(save, stop.building, now).stock;
                return (
                  <StopRow
                    key={stop.building.id}
                    on={on}
                    emoji={buildingEmoji[stop.building.kind]}
                    name={`${t(buildingNameKey[stop.building.kind])} ${"★".repeat(stop.building.quality)}${"☆".repeat(3 - stop.building.quality)}`}
                    goodsLabel={t("supply.planner.gives")}
                    goods={makes(stop.building.kind).map((good) => ({
                      good,
                      count: stock[good] ?? 0,
                    }))}
                    dim={false}
                    time={timeLeft(stop.expiresAt)}
                    last={last}
                    onToggle={() => toggle(stop.point)}
                  />
                );
              }
              const order = save.supply.orders[stop.place.id];
              const needed = stillNeeded(order);
              const goods = (
                order.wants === null ? networkGoods : Object.keys(order.wants)
              )
                .filter((good) => needed[good] > 0)
                .map((good) => ({ good, count: needed[good] }));
              const nothingYouMake = !save.supply.buildings.some((building) =>
                (order.wants === null
                  ? networkGoods
                  : Object.keys(order.wants)
                ).some(
                  (good) =>
                    good in supplyRules.buildings.kinds[building.kind].makes,
                ),
              );
              return (
                <StopRow
                  key={stop.place.id}
                  on={on}
                  emoji={placeInfo[order.kind].emoji}
                  name={orderPlaceName(order, tavernNameOf)}
                  goodsLabel={t("supply.planner.wants")}
                  goods={goods}
                  dim={nothingYouMake}
                  time={timeLeft(stop.expiresAt)}
                  last={last}
                  onToggle={() => toggle(stop.point)}
                />
              );
            })}
          </View>
        ))}

      {step === 1 && pickedCount === 0 && (
        <Text style={styles.reason}>{t("supply.planner.problem.noStop")}</Text>
      )}

      {step === 2 && (
        <View style={styles.list}>
          <WoodButton
            emoji="✨"
            title={t("supply.planner.suggest")}
            onPress={() => setDraft((current) => suggestOrder(save, current))}
          />
          {draft.map((point, i) => (
            <View key={i} style={styles.orderRow}>
              <Text style={styles.number}>{i + 1}</Text>
              <GameIcon emoji={iconOf(point)} size={20} />
              <View style={styles.orderName}>
                <Text style={styles.line}>{nameOf(point)}</Text>
                {"building" in point && (
                  <Text style={styles.small}>{t("supply.planner.loads")}</Text>
                )}
                {"place" in point && (
                  <Text style={styles.small}>
                    {t("supply.planner.unloads")}
                  </Text>
                )}
              </View>
              <WoodButton
                compact
                title="▲"
                disabled={i === 0}
                onPress={() => move(i, -1)}
              />
              <WoodButton
                compact
                title="▼"
                disabled={i === draft.length - 1}
                onPress={() => move(i, 1)}
              />
            </View>
          ))}
        </View>
      )}

      {step === 3 && (
        <View style={styles.body}>
          {finding && (
            <Text style={styles.muted}>{t("supply.planner.finding")}</Text>
          )}
          {!finding && path && (
            <ResultStep
              save={save}
              now={now}
              draft={draft}
              path={path}
              nameOf={nameOf}
              iconOf={iconOf}
              timeLeft={timeLeft}
            />
          )}
          {problemText && <Text style={styles.reason}>{problemText}</Text>}
        </View>
      )}
    </Sheet>
  );

  return (
    <Overlay onClose={onClose} position="bottom">
      {sheet}
    </Overlay>
  );
}

/** One stop of the result step: the flow strip, the stats, the warnings and the straight legs. */
function ResultStep({
  save,
  now,
  draft,
  path,
  nameOf,
  iconOf,
  timeLeft,
}: {
  save: SaveData;
  now: number;
  draft: RoutePoint[];
  path: StreetPath;
  nameOf: (point: RoutePoint) => string;
  iconOf: (point: RoutePoint) => string;
  timeLeft: (expiresAt: number) => string;
}) {
  const preview = loopPreview(save, draft, path, now);
  const hallName = t("supply.network.hall");
  const goods = (amounts: Record<string, number>, mark: string) =>
    Object.entries(amounts)
      .filter(([, count]) => count > 0)
      .map(([good, count]) => (
        <IconLabel
          key={good}
          emoji={materialById[good]?.emoji}
          icon={materialById[good]?.icon}
          label={`${mark} ${count}`}
          size={14}
          labelStyle={styles.small}
        />
      ));
  const leavingOf = (
    id: string,
  ): { name: string; expiresAt: number } | null => {
    const building = save.supply.buildings.find((b) => b.id === id);
    if (building)
      return {
        name: t(buildingNameKey[building.kind]),
        expiresAt: building.expiresAt,
      };
    const order = save.supply.orders[id];
    return order
      ? {
          name: orderPlaceName(order, tavernNameOf),
          expiresAt: order.expiresAt,
        }
      : null;
  };
  // The anchors of each leg: the hall, the stops in order, the hall again.
  const anchorName = (i: number): string =>
    i === 0 || i === draft.length + 1 ? hallName : nameOf(draft[i - 1]);
  const loopsLeft = (expiresAt: number) =>
    Math.max(1, Math.round((expiresAt - now) / (preview.minutes * 60_000)));

  return (
    <>
      <View style={styles.strip}>
        <View style={styles.cell}>
          <GameIcon emoji="🏠" size={20} />
          <Text style={styles.cellName}>{hallName}</Text>
          <Text style={styles.smallMuted}>
            {t("supply.planner.emptyCargo")}
          </Text>
        </View>
        {preview.stops.map((stop, i) => {
          const point = draft[i];
          if (!point) return null;
          const id = stop.point.buildingId ?? stop.point.placeId;
          const leaving = id !== null && preview.leaving.includes(id);
          return (
            <View key={i} style={[styles.cell, leaving && styles.cellLeaving]}>
              <View style={styles.cellHead}>
                <GameIcon emoji={iconOf(point)} size={20} />
                {leaving && <GameIcon emoji="⏳" size={12} />}
              </View>
              <Text style={styles.cellName}>{nameOf(point)}</Text>
              {goods(stop.loads, "▲")}
              {goods(stop.unloads, "▼")}
            </View>
          );
        })}
        <View style={styles.cell}>
          <GameIcon emoji="🏠" size={20} />
          <Text style={styles.cellName}>{hallName}</Text>
          {goods(preview.home, "▲")}
        </View>
      </View>
      <Text style={styles.line}>
        {t("supply.planner.statsLine", {
          minutes: Math.round(preview.minutes),
          distance: formatDistance(preview.meters),
          percent: formatPercent(preview.ambushChance),
        })}
      </Text>
      {preview.leaving.flatMap((id) => {
        const leaving = leavingOf(id);
        return leaving
          ? [
              <Text key={id} style={styles.banner}>
                {t("supply.planner.leavesAfterLoops", {
                  name: leaving.name,
                  time: timeLeft(leaving.expiresAt),
                  n: loopsLeft(leaving.expiresAt),
                })}
              </Text>,
            ]
          : [];
      })}
      {path.straightLegs.map((leg) => (
        <Text key={leg} style={styles.muted}>
          {t("supply.planner.noStreet", {
            a: anchorName(leg),
            b: anchorName(leg + 1),
          })}
        </Text>
      ))}
      <Text style={styles.muted}>{t("supply.planner.tapHint")}</Text>
    </>
  );
}

/** One pickable stop of step 1: its check box, its goods by icon, and its time left. */
function StopRow({
  on,
  emoji,
  name,
  goodsLabel,
  goods,
  dim,
  time,
  last,
  onToggle,
}: {
  on: boolean;
  emoji: string;
  name: string;
  goodsLabel: string;
  goods: { good: string; count: number }[];
  dim: boolean;
  time: string;
  last: boolean;
  onToggle: () => void;
}) {
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onToggle}
      style={[styles.row, on && styles.rowOn, dim && styles.rowDim]}
    >
      <View style={styles.checkbox}>
        {on && <Text style={styles.check}>✓</Text>}
      </View>
      <GameIcon emoji={emoji} size={22} />
      <View style={styles.rowText}>
        <Text style={styles.line}>{name}</Text>
        <View style={styles.goods}>
          <Text style={styles.small}>{goodsLabel}</Text>
          {goods.map(({ good, count }) => (
            <IconLabel
              key={good}
              emoji={materialById[good]?.emoji}
              icon={materialById[good]?.icon}
              label={String(count)}
              size={14}
              labelStyle={styles.small}
            />
          ))}
          {dim && (
            <Text style={styles.smallMuted}>
              {t("supply.planner.nothingYouMake")}
            </Text>
          )}
        </View>
      </View>
      <IconLabel
        emoji="⏳"
        label={time}
        size={14}
        labelStyle={[styles.small, last && styles.lastDay]}
      />
    </PressScale>
  );
}

const styles = StyleSheet.create({
  adjustBar: {
    position: "absolute",
    left: 12,
    right: 12,
    gap: 8,
    padding: 10,
    borderWidth: 3,
    borderColor: ui.outline,
    backgroundColor: ui.parchment,
  },
  adjustText: { color: ui.ink },
  adjustButtons: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  body: { gap: 10 },
  list: { gap: 6 },
  stepsBar: { flexDirection: "row", gap: 14 },
  stepText: { color: ui.inkMuted },
  stepOn: { color: ui.ink, fontFamily: fonts.serifBold },
  stepDone: { color: ui.ink },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 8,
    flex: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 8,
    borderWidth: 2,
    borderColor: ui.outline,
    backgroundColor: ui.parchmentShade,
  },
  rowOn: { borderColor: ui.brass, backgroundColor: ui.parchment },
  rowDim: { opacity: 0.55 },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: ui.outline,
    alignItems: "center",
    justifyContent: "center",
  },
  check: { color: ui.ink, fontFamily: fonts.serifBold },
  rowText: { flex: 1, gap: 2 },
  goods: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  orderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  number: { width: 20, color: ui.ink, fontFamily: fonts.serifBold },
  orderName: { flex: 1, gap: 0 },
  strip: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cell: {
    gap: 2,
    padding: 6,
    borderWidth: 2,
    borderColor: ui.outline,
    backgroundColor: ui.parchmentShade,
    minWidth: 72,
  },
  cellLeaving: { backgroundColor: "#F2CBB4" },
  cellHead: { flexDirection: "row", alignItems: "center", gap: 4 },
  cellName: { fontSize: 15, color: ui.ink },
  line: { color: ui.ink },
  small: { fontSize: 15 },
  smallMuted: { fontSize: 15, color: ui.inkMuted },
  muted: { color: ui.inkMuted },
  reason: { color: ui.inkMuted, fontStyle: "italic" },
  banner: { color: "#8A2E1C", fontFamily: fonts.serifBold },
  lastDay: { color: "#B4471C", fontFamily: fonts.serifBold },
});
