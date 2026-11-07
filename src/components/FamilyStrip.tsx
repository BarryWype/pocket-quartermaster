import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { familyById, type FamilyId } from '@/content/families';
import { partyFamilies, type FamilyCounts } from '@/game/families/families';
import { familyStrip, type FamilyNeed, type StripChip } from '@/game/families/strip';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors, pixel } from '@/theme';

import { FamilyLevelLines } from './FamilyTag';
import { GameIcon } from './GameIcon';
import { Overlay } from './Overlay';
import { Sheet } from './Sheet';
import { Text } from './Text';

/** The family tags of the heroes picked, recomputed only when the picks, the heroes or the gear change. */
export function usePartyFamilies(heroIds: string[]): FamilyCounts {
  const heroes = useGameStore((state) => state.save.heroes);
  const gear = useGameStore((state) => state.save.gear);
  return useMemo(() => partyFamilies({ heroes, gear }, heroIds), [heroes, gear, heroIds]);
}

/** The level marks: one filled dot per level reached, "●●○". */
const marks = (level: number) => '●'.repeat(level) + '○'.repeat(3 - level);

function Chip({ chip, onPress }: { chip: StripChip; onPress: () => void }) {
  const def = familyById[chip.family];
  const name = tr(def.name);
  return (
    <View style={styles.one}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('families.chip', { family: name, count: chip.count, level: chip.level })}
        onPress={onPress}
        style={[styles.chip, chip.level > 0 && styles.lit, chip.level >= 3 && styles.full]}
      >
        <GameIcon emoji={def.emoji} icon={def.icon} size={18} />
        <Text style={[styles.name, chip.level === 0 && styles.dim]}>{`${name} ${chip.count}`}</Text>
        <Text style={[styles.marks, chip.level > 0 && styles.marksLit]}>{marks(chip.level)}</Text>
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
  const opened = open ? chips.find((chip) => chip.family === open) : undefined;
  return (
    <View style={styles.strip} accessibilityLabel={t('families.strip')}>
      {chips.length === 0 && <Text style={styles.none}>{t('families.none')}</Text>}
      {chips.map((chip) => (
        <Chip key={chip.family} chip={chip} onPress={() => setOpen(chip.family)} />
      ))}
      {open && (
        <Overlay onClose={() => setOpen(null)} position="bottom">
          <Sheet
            emoji={familyById[open].emoji}
            icon={familyById[open].icon}
            title={`${tr(familyById[open].name)} · ${opened?.count ?? 0}`}
            bodyStyle={styles.body}
          >
            <FamilyLevelLines family={open} count={opened?.count ?? 0} />
          </Sheet>
        </Overlay>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'flex-start' },
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
  body: { gap: 6 },
});
