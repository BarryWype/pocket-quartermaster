import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { IconLabel } from '@/components/IconLabel';
import { Overlay } from '@/components/Overlay';
import { Price } from '@/components/Price';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { WoodButton } from '@/components/ui';
import { materialById } from '@/content/lookup';
import { supplyRules, type SupplyResource } from '@/content/supplyLines';
import { cellAt, cellPeriod } from '@/game/discovery/cells';
import { distanceMeters } from '@/game/generation/geo';
import { tileCenter } from '@/game/generation/tiles';
import type { LatLng } from '@/game/generation/types';
import { campProblem, type CampProblem } from '@/game/supply/camps';
import { hallProblem, type HallProblem } from '@/game/supply/hall';
import { cellRichness } from '@/game/supply/richness';
import type { Terrain } from '@/game/supply/types';
import { formatDistance, formatDuration, t, type TextKey } from '@/i18n';
import { useCellTerrains } from '@/hooks/useCellTerrains';
import { supplyPeriodNow } from '@/hooks/useSupply';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';
import { colors, ui } from '@/theme';

const DAY_MS = 24 * 3_600_000;

export const terrainNames: Record<Terrain | 'water', TextKey> = {
  green: 'supply.terrain.green',
  waterside: 'supply.terrain.waterside',
  built: 'supply.terrain.built',
  water: 'supply.terrain.water',
};

export const terrainEmojis: Record<Terrain | 'water', string> = { green: '🌳', waterside: '💧', built: '🏘️', water: '🌊' };

const resourceEmojis: Record<SupplyResource, string> = { timber: '🪵', game: '🦌' };
const resourceKeys: Record<SupplyResource, TextKey> = { timber: 'supply.resource.timber', game: 'supply.resource.game' };

const hallProblemKeys: Record<Exclude<HallProblem, null>, TextKey> = {
  tooSoon: 'supply.hall.tooSoon',
  campsOutOfRange: 'supply.hall.campsOutOfRange',
};

const campProblemKeys: Record<Exclude<CampProblem, null>, TextKey> = {
  noHall: 'supply.campProblem.noHall',
  notHere: 'supply.campProblem.notHere',
  unknownTerrain: 'supply.campProblem.unknownTerrain',
  water: 'supply.campProblem.water',
  notGreen: 'supply.campProblem.notGreen',
  occupied: 'supply.campProblem.occupied',
  full: 'supply.campProblem.full',
  tooFar: 'supply.campProblem.tooFar',
  cost: 'supply.campProblem.cost',
};

/** A richness as pips: `level` filled of 3, drawn as small views. */
export function RichnessPips({ level, muted }: { level: number; muted?: boolean }) {
  return (
    <View style={styles.pips}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.pip, i < level && !muted && styles.pipFilled, muted && styles.pipMuted]} />
      ))}
    </View>
  );
}

type Props = { cell: string; player: LatLng; onClose: () => void };

/** A cell's sheet: what it holds, and the hall and camp actions that stand there. */
export function SupplyCellPanel({ cell, player, onClose }: Props) {
  const save = useGameStore((s) => s.save);
  const placeHall = useGameStore((s) => s.placeHall);
  const foundCamp = useGameStore((s) => s.foundCamp);
  const terrain = useCellTerrains([cell])[cell];
  const [now] = useState(() => Date.now());
  const period = supplyPeriodNow(now);
  const ownPeriod = cellPeriod(save.supply.scouted, cell);
  const scouted = ownPeriod !== null;
  const stale = scouted && ownPeriod !== period;
  const here = cellAt(player) === cell;
  const hall = save.supply.hall;
  const hallHere = hall?.cell === cell;
  const hallProblemNow = hallHere ? null : hallProblem(save, cell, now);
  const campHere = save.supply.camps.find((camp) => camp.cell === cell) ?? null;
  const { gold, materials } = supplyRules.camps.foundCost;
  const wood = materials[0];

  const foundButton = (kind: 'timber' | 'trapper') => {
    const problem = campProblem(save, kind, cell, terrain, cellAt(player), now);
    return (
      <View key={kind} style={styles.found}>
        <WoodButton
          title={t(kind === 'timber' ? 'supply.camp.foundTimber' : 'supply.camp.foundTrapper')}
          disabled={problem !== null}
          onPress={() => {
            foundCamp(kind, cell, terrain, cellAt(player));
            onClose();
          }}
        />
        <View style={styles.cost}>
          <Price amount={gold} short={save.gold < gold} size={14} />
          <IconLabel emoji={materialById[wood.materialId].emoji} icon={materialById[wood.materialId].icon} label={String(wood.amount)} size={14} />
        </View>
        {problem && <Text style={styles.problem}>{t(campProblemKeys[problem], problemVars(problem))}</Text>}
      </View>
    );
  };

  return (
    <Overlay onClose={onClose} position="bottom">
      <Sheet
        variant="wood"
        emoji={terrain ? terrainEmojis[terrain] : '❓'}
        title={terrain ? t(terrainNames[terrain]) : '...'}
        footer={<WoodButton title={t('common.close')} onPress={onClose} />}
      >
        <View style={styles.body}>
          <Text style={styles.line}>{here ? t('supply.youAreHere') : formatDistance(distanceMeters(player, tileCenter(cell)))}</Text>
          {scouted ? (
            terrain && terrain !== 'water' ? (
              <View style={stale ? styles.stale : undefined}>
                {(['timber', 'game'] as SupplyResource[]).map(
                  (resource) =>
                    supplyRules.richness[resource][terrain!] && (
                      <View key={resource} style={styles.richnessRow}>
                        <IconLabel emoji={resourceEmojis[resource]} label={t(resourceKeys[resource])} size={16} />
                        <RichnessPips level={cellRichness(cell, ownPeriod!, terrain!, resource)} muted={stale} />
                      </View>
                    ),
                )}
                {stale && <Text style={styles.problem}>{t('supply.stale')}</Text>}
              </View>
            ) : null
          ) : (
            <Text style={styles.line}>{t('supply.notScouted')}</Text>
          )}
          {hallHere ? (
            <Text style={styles.line}>{t('supply.hall.here')}</Text>
          ) : (
            <View style={styles.section}>
              <WoodButton
                title={t(hall ? 'supply.hall.move' : 'supply.hall.place')}
                disabled={hallProblemNow !== null}
                onPress={() => placeHall(cell)}
              />
              {hallProblemNow && (
                <Text style={styles.problem}>
                  {t(hallProblemKeys[hallProblemNow], {
                    time: formatDuration(supplyRules.hall.moveEveryDays * DAY_MS - (now - (hall?.movedAt ?? 0)), false),
                  })}
                </Text>
              )}
            </View>
          )}
          {campHere ? (
            <WoodButton
              title={t('supply.camp.open')}
              onPress={() => {
                onClose();
                useMapPanels.getState().openSupplyCamp(campHere.id);
              }}
            />
          ) : (
            <View style={styles.section}>
              {foundButton('timber')}
              {foundButton('trapper')}
            </View>
          )}
        </View>
      </Sheet>
    </Overlay>
  );
}

/** The placeholders a camp problem's text fills. */
function problemVars(problem: CampProblem): Record<string, string | number> {
  if (problem === 'full') return { max: supplyRules.camps.max };
  if (problem === 'cost') {
    const { gold, materials } = supplyRules.camps.foundCost;
    return { gold, wood: materials[0].amount };
  }
  return {};
}

const styles = StyleSheet.create({
  body: { gap: 12 },
  line: { color: ui.ink },
  section: { gap: 8 },
  found: { gap: 4 },
  cost: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  richnessRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stale: { opacity: 0.6 },
  problem: { color: colors.muted },
  pips: { flexDirection: 'row', gap: 4 },
  pip: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: colors.wood },
  pipFilled: { backgroundColor: colors.wood },
  pipMuted: { opacity: 0.5 },
});
