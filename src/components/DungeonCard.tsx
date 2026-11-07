import { Pressable, StyleSheet, View } from 'react-native';

import { dungeonById, itemById, threatById } from '@/content/lookup';
import { placeInfo } from '@/content/places';
import { weaknessByBoss } from '@/content/weaknesses';
import type { Rotation } from '@/game/dungeons/rotation';
import { briefingOf, dungeonLootSource, firstWinAvailable, isDungeonAvailable } from '@/game/expeditions/expeditions';
import { oddsBand } from '@/game/expeditions/odds';
import type { SaveData } from '@/game/save';
import { briefingCoverage } from '@/game/threats/coverage';
import { isTutorialDungeon } from '@/game/tutorial/tutorial';
import type { DungeonDef } from '@/game/types';
import { formatDuration, t, tr } from '@/i18n';
import { fonts, ui } from '@/theme';

import { BriefingChips } from './BriefingChips';
import { EnemyTags } from './EnemyTags';
import { IconLabel, RewardLabel } from './IconLabel';
import { Chip, DifficultyPips, DifficultyRing, EmberButton, ParchmentCard } from './ui';
import { Text } from './Text';
import { ThreatCoverageChips } from './ThreatDetail';
import { TrophyLine } from './TrophyLine';
import { GameIcon } from './GameIcon';

type Props = {
  save: SaveData;
  dungeon: DungeonDef;
  rotation: Rotation;
  now: number;
  durationMs: number;
  /** Success chance with the selected party: undefined while it computes, null without one. */
  chance: number | null | undefined;
  expanded: boolean;
  onToggle: () => void;
  onSend: () => void;
};

const ODDS_TONE = { AlmostSure: 'good', Favourable: 'good', Fair: 'neutral', Risky: 'bad', Hopeless: 'bad' } as const;

/** A dungeon at a glance (name, kind, time, odds); tapped, its details and the Send button. */
export function DungeonCard({ save, dungeon, rotation, now, durationMs, chance, expanded, onToggle, onSend }: Props) {
  const band = typeof chance === 'number' ? oddsBand(chance) : null;
  const available = isDungeonAvailable(save, dungeon, rotation);
  const newTier = !save.clearedDungeons.some((id) => dungeonById[id]?.tier === dungeon.tier);
  const firstWin = firstWinAvailable(save, dungeon, now);
  const briefing = briefingOf(save, dungeon, rotation, now);
  // The tutorial shows its threat up front, against the whole roster: red until a hero's family covers it.
  const tutorial = save.tutorial.step !== 'done' && isTutorialDungeon(dungeon.id);
  const kind = dungeon.isBoss ? 'boss' : dungeon.difficulty === 'easy' ? 'short' : 'long';
  const weakness = dungeon.isBoss ? weaknessByBoss[dungeon.boss.id] : undefined;
  const weaknessHeld =
    !!weakness &&
    ((save.consumables[weakness.itemId] ?? 0) > 0 || save.heroes.some((h) => h.equipment.consumable === weakness.itemId));

  const oddsChip =
    band && typeof chance === 'number' ? (
      <Chip tone={ODDS_TONE[band]} label={t(`odds.${band}`)} />
    ) : (
      chance === undefined && <Chip tone="neutral" label="…" />
    );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={tr(dungeon.name)}
      onPress={onToggle}
    >
      <ParchmentCard
        title={tr(dungeon.name)}
        titleIconNode={
          <View style={styles.ringedIcon}>
            <DifficultyRing difficulty={dungeon.difficulty} shape="square" size={22}>
              <GameIcon emoji={dungeon.emoji} size={22} />
            </DifficultyRing>
            <DifficultyPips difficulty={dungeon.difficulty} />
          </View>
        }
        titleSub={`${t(`expeditions.kind.${kind}`)} · ${formatDuration(durationMs)}`}
        contentStyle={styles.content}
      >
        {tutorial ? (
          <ThreatCoverageChips
            coverage={briefingCoverage(save, save.heroes.map((h) => h.id), briefing, now, false)}
            labelled
          />
        ) : (
          <View style={styles.chipRow}>
            {briefing.threats.map((threat) => {
              const def = threatById[threat.id];
              const pips = '●'.repeat(threat.level) + '○'.repeat(3 - threat.level);
              return <Chip key={threat.id} tone="neutral" label={`${tr(def.name)} ${pips}`} />;
            })}
          </View>
        )}
        <View style={styles.metaRow}>
          {oddsChip}
          {newTier && <GameIcon emoji="✨" size={18} />}
          <View style={styles.spacer} />
          <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
        </View>

        {expanded && (
          <View style={styles.details}>
            {band && (
              <Text style={styles.sub}>
                {t(`odds.${band}`)} · {t('expeditions.tips.odds')}
              </Text>
            )}
            {!tutorial && <BriefingChips briefing={briefing} />}
            <View style={styles.foe}>
              <Text style={styles.sub}>{t('expeditions.boss')}</Text>
              <EnemyTags mob={dungeon.boss} />
            </View>
            <TrophyLine source={dungeonLootSource(dungeon)} labelStyle={styles.line} />
            {newTier && <RewardLabel text={t('expeditions.newTierBonus')} size={16} labelStyle={styles.line} />}
            {firstWin && <RewardLabel text={t('expeditions.firstWinToday')} size={16} labelStyle={styles.line} />}
            {weakness && (
              <View style={styles.lineRow}>
                <IconLabel
                  emoji={itemById[weakness.itemId].emoji}
                  label={t('expeditions.weakness', {
                    item: tr(itemById[weakness.itemId].name),
                    place: tr(placeInfo[weakness.place].name).toLowerCase(),
                  })}
                  labelStyle={[styles.line, { color: weaknessHeld ? ui.good : ui.inkMuted }]}
                />
                {weaknessHeld && (
                  <Text style={[styles.line, { color: ui.good }]}> {t('expeditions.weaknessHeld')}</Text>
                )}
              </View>
            )}
            <View style={styles.footer}>
              {!available && <Text style={styles.sub}>{t('expeditions.afterTutorial')}</Text>}
              <EmberButton title={t('expeditions.send')} compact disabled={!available || chance === null} onPress={onSend} />
            </View>
          </View>
        )}
      </ParchmentCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ringedIcon: { alignItems: 'center' },
  content: { gap: 7 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  spacer: { flex: 1 },
  chevron: { fontSize: 22, color: ui.inkMuted, width: 16 },
  details: { gap: 7 },
  foe: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  lineRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  line: { fontFamily: fonts.serif, fontSize: 14, color: ui.ink },
  sub: { fontFamily: fonts.serif, fontSize: 13, color: ui.inkMuted },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 },
});
