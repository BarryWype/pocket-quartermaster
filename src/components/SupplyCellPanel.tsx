import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { IconLabel } from '@/components/IconLabel';
import { Overlay } from '@/components/Overlay';
import { Panel } from '@/components/Panel';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { WoodButton } from '@/components/ui';
import { supplyRules } from '@/content/supplyLines';
import { cellAt } from '@/game/discovery/cells';
import { distanceMeters } from '@/game/generation/geo';
import { tileCenter } from '@/game/generation/tiles';
import type { LatLng } from '@/game/generation/types';
import { buildingCell, buildingReach } from '@/game/supply/buildings';
import { buildingsOutOfReach, hallMoveBackAt, hallMovesLeft, hallProblem, type HallProblem } from '@/game/supply/hall';
import type { Terrain } from '@/game/supply/types';
import { formatDistance, formatDuration, t, type TextKey } from '@/i18n';
import { useCellTerrains } from '@/hooks/useCellTerrains';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';
import { colors, ui } from '@/theme';

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

const hallProblemKeys: Record<Exclude<HallProblem, null>, TextKey> = {
  noMovesLeft: 'supply.hall.noMovesLeft',
};

/** A building's quality as pips: `level` filled of 3, drawn as small views. */
export function QualityPips({ level }: { level: number }) {
  return (
    <View style={styles.pips}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.pip, i < level && styles.pipFilled]} />
      ))}
    </View>
  );
}

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

/** A cell's sheet: what it holds, and the hall and building actions that stand there. */
export function SupplyCellPanel({ cell, player, onClose }: Props) {
  const save = useGameStore((s) => s.save);
  const placeHall = useGameStore((s) => s.placeHall);
  const terrain = useCellTerrains([cell])[cell];
  const [now] = useState(() => Date.now());
  const here = cellAt(player) === cell;
  const hall = save.supply.hall;
  const hallHere = hall?.cell === cell;
  const hallProblemNow = hallHere ? null : hallProblem(save, cell, now);
  const buildingHere = save.supply.buildings.find((building) => buildingCell(building) === cell) ?? null;
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Overlay onClose={onClose} position="bottom">
        <Sheet
          variant="wood"
          emoji={terrain ? terrainEmojis[terrain] : '❓'}
          title={terrain ? t(terrainNames[terrain]) : '...'}
          footer={<WoodButton title={t('common.close')} onPress={onClose} />}
        >
          <View style={styles.body}>
            <Text style={styles.line}>{here ? t('supply.youAreHere') : formatDistance(distanceMeters(player, tileCenter(cell)))}</Text>
            {hallHere ? (
              <Text style={styles.line}>{t('supply.hall.here')}</Text>
            ) : (
              <View style={styles.section}>
                <WoodButton
                  title={t(hall ? 'supply.hall.move' : 'supply.hall.place')}
                  disabled={hallProblemNow !== null}
                  onPress={() => (hall ? setConfirming(true) : placeHall(cell))}
                />
                {hallProblemNow && (
                  <Text style={styles.problem}>
                    {t(hallProblemKeys[hallProblemNow], {
                      time: formatDuration((hallMoveBackAt(save, now) ?? 0) - now, false),
                    })}
                  </Text>
                )}
              </View>
            )}
            {buildingHere && (
              <WoodButton
                title={t('supply.building.open')}
                onPress={() => {
                  onClose();
                  useMapPanels.getState().openSupplyBuilding(buildingHere.id);
                }}
              />
            )}
          </View>
        </Sheet>
      </Overlay>
      {confirming && (
        <MoveHallDialog
          cell={cell}
          now={now}
          onConfirm={() => {
            placeHall(cell);
            setConfirming(false);
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12 },
  line: { color: ui.ink },
  section: { gap: 8 },
  problem: { color: colors.muted },
  pips: { flexDirection: 'row', gap: 4 },
  pip: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.wood,
  },
  pipFilled: { backgroundColor: colors.wood },
  dialog: { gap: 10, padding: 14 },
  dialogTitle: { fontSize: 24 },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
});
