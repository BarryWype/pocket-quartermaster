import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { familyById, type FamilyId } from '@/content/families';
import { partyFamilies, type FamilyCounts } from '@/game/families/families';
import { familyStrip, levelMarks, type FamilyNeed, type StripChip } from '@/game/families/strip';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors, pixel } from '@/theme';

import { FamilySheet } from './FamilySheet';
import { GameIcon } from './GameIcon';
import { Text } from './Text';

/** The family tags of the heroes picked, recomputed only when the picks, the heroes or the gear change. */
export function usePartyFamilies(heroIds: string[]): FamilyCounts {
  const heroes = useGameStore((state) => state.save.heroes);
  const gear = useGameStore((state) => state.save.gear);
  return useMemo(() => partyFamilies({ heroes, gear }, heroIds), [heroes, gear, heroIds]);
}

const SCROLL_FROM = 6;

function Chip({ chip, onPress }: { chip: StripChip; onPress: () => void }) {
  const def = familyById[chip.family];
  const name = tr(def.name);
  return (
    <View style={styles.one}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('families.chip', { family: name, count: chip.count, lit: chip.level })}
        onPress={onPress}
        style={[styles.chip, chip.level > 0 && styles.lit, chip.level >= 3 && styles.full]}
      >
        <GameIcon emoji={def.emoji} icon={def.icon} size={18} />
        <Text style={[styles.name, chip.level === 0 && styles.dim]}>{`${name} ${chip.count}`}</Text>
        <Text style={[styles.marks, chip.level > 0 && styles.marksLit]}>{levelMarks(chip.level)}</Text>
      </Pressable>
      {chip.need && (
        <Text style={[styles.need, { color: chip.need.met ? colors.success : colors.danger }]}>
          {t('families.needs', { family: name, count: chip.need.count })}
        </Text>
      )}
    </View>
  );
}

/**
 * The party's families as chips, needed ones first: a chip lights up at each
 * level reached, and tapping it opens the family's levels. It recomputes only
 * when the counts or the needs change, so callers pass memoized ones.
 */
export function FamilyStrip({ counts, needs }: { counts: FamilyCounts; needs?: FamilyNeed[] }) {
  const chips = useMemo(() => familyStrip(counts, needs), [counts, needs]);
  const [open, setOpen] = useState<FamilyId | null>(null);
  const noteTips = useGameStore((state) => state.noteTips);
  const hasNeeds = (needs?.length ?? 0) > 0;
  useEffect(() => {
    if (hasNeeds) noteTips(['threats']);
  }, [hasNeeds, noteTips]);
  const opened = open ? chips.find((chip) => chip.family === open) : undefined;
  const items = chips.map((chip) => <Chip key={chip.family} chip={chip} onPress={() => setOpen(chip.family)} />);
  return (
    <View accessibilityLabel={t('families.strip')}>
      {chips.length === 0 && <Text style={styles.none}>{t('families.none')}</Text>}
      {/* Past a couple of lines' worth of chips, the strip scrolls sideways instead of wrapping. */}
      {chips.length >= SCROLL_FROM ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {items}
        </ScrollView>
      ) : (
        <View style={[styles.row, styles.wrap]}>{items}</View>
      )}
      {open && <FamilySheet family={open} count={opened?.count ?? 0} onClose={() => setOpen(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  wrap: { flexWrap: 'wrap' },
  one: { gap: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: pixel.outline,
    borderColor: colors.woodLight,
    backgroundColor: colors.parchmentDark,
    alignSelf: 'flex-start',
  },
  lit: { borderColor: colors.gold, backgroundColor: colors.highlight },
  full: { borderColor: colors.ink },
  name: { fontSize: 16 },
  dim: { color: colors.muted },
  marks: { fontSize: 13, color: colors.muted },
  marksLit: { color: colors.gold },
  need: { fontSize: 14 },
  none: { color: colors.muted },
});
