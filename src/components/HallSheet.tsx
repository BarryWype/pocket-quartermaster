import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { IconLabel } from '@/components/IconLabel';
import { Overlay } from '@/components/Overlay';
import { Panel } from '@/components/Panel';
import { Text } from '@/components/Text';
import { supplyRules } from '@/content/supplyLines';
import { cellAt } from '@/game/discovery/cells';
import { distanceMeters } from '@/game/generation/geo';
import { tileCenter } from '@/game/generation/tiles';
import type { LatLng } from '@/game/generation/types';
import { buildingCell, buildingReach } from '@/game/supply/buildings';
import { buildingsOutOfReach, hallMoveBackAt, hallMovesLeft, hallProblem } from '@/game/supply/hall';
import type { Terrain } from '@/game/supply/types';
import { formatDistance, formatDuration, t, type TextKey } from '@/i18n';
import { useCellTerrains } from '@/hooks/useCellTerrains';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';
import { colors, ui } from '@/theme';

import { MapSheet, type MapSheetSecondary } from './MapSheet';

export const terrainNames: Record<Terrain | 'water', TextKey> = {
  green: 'supply.terrain.green',
  waterside: 'supply.terrain.waterside',
  built: 'supply.terrain.built',
  water: 'supply.terrain.water',
};

export const terrainEmojis: Record<Terrain | 'water', string> = {
  green: '🌳',
  waterside: '💧',
  built: '🏘️',
  water: '🌊',
};

/** Asks before the hall moves: the moves left this week, when the next comes back, and the buildings it would leave out of reach. */
function MoveHallDialog({ cell, now, onConfirm, onClose }: { cell: string; now: number; onConfirm: () => void; onClose: () => void }) {
  const save = useGameStore((s) => s.save);
  const backAt = hallMoveBackAt(save, now);
  const outOfReach = buildingsOutOfReach(save, cell).length;
  return (
    <Overlay onClose={onClose}>
      <Panel style={styles.dialog}>
        <Text style={styles.dialogTitle}>{t('supply.hall.moveTitle')}</Text>
        <Text>
          {t('supply.hall.movesLeft', {
            left: hallMovesLeft(save, now),
            max: supplyRules.hall.movesPerWeek,
          })}
        </Text>
        {backAt !== null && (
          <Text>
            {t('supply.hall.nextBack', {
              time: formatDuration(backAt - now, false),
            })}
          </Text>
        )}
        {outOfReach > 0 && (
          <IconLabel
            emoji="⚠️"
            size={16}
            label={t('supply.hall.outOfReach', {
              count: outOfReach,
              distance: formatDistance(buildingReach(save).meters),
            })}
          />
        )}
        <View style={styles.dialogActions}>
          <Button title={t('common.cancel')} color={colors.muted} onPress={onClose} />
          <Button title={t('supply.hall.move')} onPress={onConfirm} />
        </View>
      </Panel>
    </Overlay>
  );
}

type Props = { cell: string; player: LatLng; onClose: () => void };

/**
 * The hall's sheet for one cell, on the map sheet template: the player's own
 * cell (from their marker or the Network tab), the hall's (from its marker),
 * or a cell picked on the map. Placing or moving the hall there is the main
 * action, from any distance, as before; a move asks first. "Pick a spot on
 * the map" lets the next map tap choose the cell instead.
 */
export function HallSheet({ cell, player, onClose }: Props) {
  const save = useGameStore((s) => s.save);
  const placeHall = useGameStore((s) => s.placeHall);
  const terrain = useCellTerrains([cell])[cell];
  const [now] = useState(() => Date.now());
  const [confirming, setConfirming] = useState(false);
  const hall = save.supply.hall;
  const hallHere = hall?.cell === cell;
  const here = cellAt(player) === cell;
  const problem = hallHere ? 'here' : hallProblem(save, cell, now);
  const buildingHere = save.supply.buildings.find((building) => buildingCell(building) === cell) ?? null;
  const distance = distanceMeters(player, tileCenter(cell));

  const secondary: MapSheetSecondary[] = [
    { key: 'pick', title: t('hallSheet.pickOnMap'), onPress: () => useMapPanels.getState().startPlacingHall() },
    ...(buildingHere
      ? [{ key: 'building', title: t('supply.building.open'), onPress: () => useMapPanels.getState().openSupplyBuilding(buildingHere.id) }]
      : []),
  ];

  return (
    <>
      <MapSheet
        onClose={onClose}
        emoji={hallHere ? '🏠' : terrain ? terrainEmojis[terrain] : '❓'}
        ring={null}
        title={hallHere ? t('hallSheet.title') : terrain ? t(terrainNames[terrain]) : '...'}
        status={here ? t('mapSheet.here') : t('mapSheet.away', { distance: formatDistance(distance) })}
        summary={
          <View style={styles.summary}>
            <Text style={styles.line}>{hallHere ? t('supply.hall.here') : hall ? t('hallSheet.moveLine') : t('hallSheet.placeLine')}</Text>
            {hall && <Text style={styles.muted}>{t('supply.network.hallMoves', { n: hallMovesLeft(save, now) })}</Text>}
            {problem === 'noMovesLeft' && (
              <Text style={styles.muted}>{t('supply.hall.noMovesLeft', { time: formatDuration((hallMoveBackAt(save, now) ?? 0) - now, false) })}</Text>
            )}
          </View>
        }
        action={{
          state: problem ? { kind: 'blocked', reason: problem } : { kind: 'act' },
          verb: '',
          label: t(hall ? 'supply.hall.move' : 'supply.hall.place'),
          blockedLabel: problem === 'here' ? t('hallSheet.isHere') : t('hallSheet.noMoves'),
          onPress: () => {
            if (hall) setConfirming(true);
            else {
              placeHall(cell);
              onClose();
            }
          },
        }}
        secondary={secondary}
      />
      {confirming && (
        <MoveHallDialog
          cell={cell}
          now={now}
          onConfirm={() => {
            placeHall(cell);
            setConfirming(false);
            onClose();
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}

/** While the hall is being placed: a slim bar over the map saying what a tap does, and a way out. */
export function PlacingHallBar() {
  const placing = useMapPanels((state) => state.placingHall);
  const cancel = useMapPanels((state) => state.cancelPlacingHall);
  if (!placing) return null;
  return (
    <View style={styles.bar} accessibilityLiveRegion="polite">
      <Text style={styles.barText}>{t('hallSheet.tapToPlace')}</Text>
      <Button title={t('common.cancel')} color={colors.muted} onPress={cancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { gap: 6 },
  line: { fontSize: 19, color: ui.ink },
  muted: { color: ui.inkMuted },
  bar: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 110,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: 10,
    backgroundColor: ui.parchment,
    borderWidth: 3,
    borderColor: ui.outline,
  },
  barText: { flex: 1, fontSize: 17, color: ui.ink },
  dialog: { gap: 10, padding: 14 },
  dialogTitle: { fontSize: 24 },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
});
