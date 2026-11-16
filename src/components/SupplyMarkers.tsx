import { Marker } from '@maplibre/maplibre-react-native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Countdown } from '@/components/Countdown';
import { GameIcon } from '@/components/GameIcon';
import { IconLabel } from '@/components/IconLabel';
import { clockConfig } from '@/content/clockConfig';
import { isAnnounced } from '@/game/supply/raids';
import { formatDuration, t } from '@/i18n';
import { useNow } from '@/hooks/useNow';
import { colors, ui } from '@/theme';
import { tileCenter } from '@/game/generation/tiles';
import { feel } from '@/services/feel';
import { useSupplyOn } from '@/hooks/useSupply';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';

const MARKER_SIZE = 26;

/** A marker tap plays the press haptic, like the map's other markers. */
const tapped = (action: () => void) => () => {
  feel('press');
  action();
};

const toLngLat = (position: { latitude: number; longitude: number }): [number, number] => [position.longitude, position.latitude];

/** Under a camp's marker while a raid on it is announced: the time left before it lands. */
function RaidCountdown({ campId }: { campId: string }) {
  const save = useGameStore((s) => s.save);
  const now = useNow(clockConfig.minutesMs);
  const raid = save.supply.raid;
  if (!raid || raid.campId !== campId || !isAnnounced(save, raid, now)) return null;
  return (
    <IconLabel
      emoji="⚔️"
      size={14}
      style={styles.raid}
      labelStyle={styles.raidText}
      label={<Countdown endsAt={raid.landsAt} render={(ms) => t('supply.raid.marker', { time: formatDuration(ms, false) })} />}
    />
  );
}

/**
 * The hall and the camps on the map. It takes no props: opening a panel goes
 * through the panels store, so the map screen's renders never reach it.
 */
export const SupplyMarkers = memo(function SupplyMarkers() {
  const on = useSupplyOn();
  const planning = useMapPanels((state) => state.routeDraft !== null);
  const hall = useGameStore((s) => s.save.supply.hall);
  const camps = useGameStore((s) => s.save.supply.camps);
  if (!on) return null;
  // While the planner is open, a camp tap adds it to the draft instead of opening its sheet.
  const openCamp = (id: string) =>
    planning ? useMapPanels.getState().addToRoute({ camp: id }) : useMapPanels.getState().openSupplyCamp(id);
  return (
    <>
      {hall && (
        <Marker id="supply-hall" lngLat={toLngLat(tileCenter(hall.cell))} onPress={tapped(() => useMapPanels.getState().openSupplyCell(hall.cell))}>
          <GameIcon emoji="🏠" size={MARKER_SIZE} />
        </Marker>
      )}
      {camps.map((camp) => (
        <Marker
          key={camp.id}
          id={`supply-camp:${camp.id}`}
          lngLat={toLngLat(tileCenter(camp.cell))}
          onPress={tapped(() => openCamp(camp.id))}
        >
          <View style={styles.camp}>
            <GameIcon emoji={camp.kind === 'timber' ? '🪵' : '🪤'} size={MARKER_SIZE} />
            <RaidCountdown campId={camp.id} />
          </View>
        </Marker>
      ))}
    </>
  );
});

const styles = StyleSheet.create({
  camp: { alignItems: 'center' },
  raid: { backgroundColor: colors.danger, paddingHorizontal: 4, borderRadius: 2 },
  raidText: { fontSize: 13, color: ui.parchment },
});
