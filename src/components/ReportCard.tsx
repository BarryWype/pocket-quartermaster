import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { elementInfo } from '@/content/elements';
import { familyById, families, type FamilyId } from '@/content/families';
import { dungeonById, itemById, materialById, opportunityById, threatById } from '@/content/lookup';
import { heroClasses } from '@/content/heroes';
import { reportCard, type CardLine } from '@/game/expeditions/reportCard';
import { reportTiles } from '@/game/loot/tiles';
import type { ExpeditionReport, HeroState, OpportunityOutcome } from '@/game/types';
import { levelMarks } from '@/game/families/strip';
import { formatDuration, t, tr } from '@/i18n';
import { fonts, ui } from '@/theme';

import { FamilySheet } from './FamilySheet';
import { FreePickPanel } from './FreePickPanel';
import { LootGrid } from './LootGrid';
import { reportNote } from './LootReveal';
import { GainsLine, IconLabel } from './IconLabel';
import { goldLabel } from './Price';
import { GameIcon } from './GameIcon';
import { PixelBar } from './PixelBar';
import { Chip, DifficultyChip, ParchmentCard } from './ui';
import { Text } from './Text';

type Props = {
  report: ExpeditionReport;
  heroes: HeroState[];
  now: number;
  expanded: boolean;
  onToggle: () => void;
};

/** What an answered opportunity handed over, one short label per effect. */
function opportunityGave(outcome: OpportunityOutcome): string {
  return [
    outcome.gold ? goldLabel(outcome.gold, '+') : null,
    ...(outcome.materials ?? []).map((m) => `${materialById[m.materialId].emoji} ${m.amount}`),
    outcome.goldMultiplier ? goldLabel(outcome.goldMultiplier, '×') : null,
    outcome.damageMultiplier ? `⚔️ ×${outcome.damageMultiplier}` : null,
    outcome.xpMultiplier ? `✨ ×${outcome.xpMultiplier}` : null,
    outcome.recipe ? t('expeditions.report.recipe') : null,
    outcome.recruit ? t('expeditions.report.recruit') : null,
    outcome.pilgrim ? t(`expeditions.report.pilgrim.${outcome.pilgrim}`) : null,
  ]
    .filter((item): item is string => item !== null)
    .join(' · ');
}

/** The families the party played with, as dots; tapping one opens its sheet. */
function ReportFamilies({ levels, active }: { levels: Partial<Record<FamilyId, number>>; active: FamilyId[] }) {
  const [open, setOpen] = useState<FamilyId | null>(null);
  return (
    <View style={styles.families} accessibilityLabel={t('families.strip')}>
      {active.map((id) => (
        <Pressable key={id} accessibilityRole="button" onPress={() => setOpen(id)} hitSlop={4}>
          <IconLabel emoji={familyById[id].emoji} icon={familyById[id].icon} label={`${tr(familyById[id].name)} ${levelMarks(levels[id]!)}`} size={16} labelStyle={styles.line} />
        </Pressable>
      ))}
      {open && <FamilySheet family={open} onClose={() => setOpen(null)} />}
    </View>
  );
}

/** A titled block of card lines, each its source's icon then the sentence. */
function CardSection({ title, lines }: { title: string; lines: CardLine[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{title}</Text>
      {lines.map((line, i) => (
        <View key={i} style={[styles.cardLine, line.flourish && styles.flourish]}>
          <GameIcon emoji={line.emoji} icon={line.icon} size={18} />
          <Text style={styles.cardText}>{line.text}</Text>
        </View>
      ))}
    </View>
  );
}

/** A finished expedition: the outcome, the player's work, what would have helped, the hero of the run, the log (collapsed) and the loot. */
export function ReportCard({ report, heroes, now, expanded, onToggle }: Props) {
  const [logOpen, setLogOpen] = useState(false);
  const dungeon = dungeonById[report.dungeonId];
  const win = report.outcome === 'flawless' || report.outcome === 'success';
  const when = t('expeditions.ago', { time: formatDuration(now - report.finishedAt) });
  const label = `${tr(dungeon.name)}, ${t(`expeditions.outcome.${report.outcome}`)}, ${when}`;

  // Older reports travel light: a wood row that opens into the parchment report.
  if (!expanded) {
    return (
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: false }} accessibilityLabel={label} onPress={onToggle} style={styles.row}>
        <View style={styles.rowInner} pointerEvents="none" />
        <Text style={styles.rowName} numberOfLines={1}>
          {tr(dungeon.name)}
          {report.seen ? '' : t('expeditions.new')}
        </Text>
        <Chip tone={win ? 'good' : 'bad'} label={t(`expeditions.outcome.${report.outcome}`)} />
        <Text style={styles.rowWhen}>{when}</Text>
        <Text style={styles.chevron}>▸</Text>
      </Pressable>
    );
  }

  const extras = [
    report.hunger && report.hunger !== 'fed' ? t(`expeditions.hunger.${report.hunger}`) : null,
    report.mealId ? `${itemById[report.mealId].emoji} ${tr(itemById[report.mealId].name)}` : null,
  ].filter((item): item is string => item !== null);
  const tiles = reportTiles(report);
  const note = reportNote(report);
  // The families the party played with, highest level first.
  const active = families.filter((family) => report.families?.[family.id]).sort((a, b) => report.families![b.id]! - report.families![a.id]!);
  const card = reportCard(report, heroes);
  const star = card.hero ? heroes.find((h) => h.id === card.hero!.heroId) : undefined;

  return (
    <ParchmentCard title={tr(dungeon.name)} titleEmoji={dungeon.emoji} titleSub={`${card.outcome} · ${when}`} contentStyle={styles.content}>
      <View style={styles.chips}>
        <Chip tone={win ? 'good' : 'bad'} label={t(`expeditions.outcome.${report.outcome}`)} />
        <DifficultyChip difficulty={dungeon.difficulty} />
      </View>
      {active.length > 0 && <ReportFamilies levels={report.families!} active={active.map((family) => family.id)} />}

      {card.work.length > 0 && <CardSection title={t('expeditions.card.heading.work')} lines={card.work} />}
      {card.helped && <CardSection title={t('expeditions.card.heading.helped')} lines={[card.helped]} />}
      {(card.hero || card.heroNews.length > 0) && (
        <View style={styles.section}>
          <Text style={styles.heading}>{t('expeditions.card.heading.hero')}</Text>
          {card.hero && (
            <View style={styles.cardLine}>
              {star && (
                <View style={styles.portrait}>
                  <GameIcon emoji={heroClasses[star.classId].emoji} icon={heroClasses[star.classId].icon} size={28} />
                </View>
              )}
              <Text style={styles.cardText}>{card.hero.text}</Text>
            </View>
          )}
          {card.heroNews.map((line, i) => (
            <View key={i} style={[styles.cardLine, styles.flourish]}>
              <GameIcon emoji={line.emoji} size={18} />
              <Text style={styles.cardText}>{line.text}</Text>
            </View>
          ))}
        </View>
      )}

      {report.heroHp.map(({ heroId, hp, maxHp, before }) => {
        const hero = heroes.find((h) => h.id === heroId);
        return (
          <View key={heroId} style={styles.hp}>
            {hero && (
              <View style={styles.platePortrait}>
                <GameIcon emoji={heroClasses[hero.classId].emoji} icon={heroClasses[hero.classId].icon} size={20} />
              </View>
            )}
            <View style={styles.plateBody}>
              <View style={styles.plateHead}>
                <Text style={styles.hpName} numberOfLines={1}>
                  {hero?.name ?? heroId}
                </Text>
                {report.xp > 0 && <Text style={styles.plateXp}>{t('expeditions.loot.xp', { xp: report.xp })}</Text>}
              </View>
              <View style={styles.plateHead}>
                <View style={styles.hpBar}>
                  <PixelBar value={hp / maxHp} color={hp / maxHp < 0.3 ? ui.bad : ui.good} />
                </View>
                <Text style={styles.hpText}>
                  {before === undefined ? `${hp}/${maxHp}` : t('expeditions.hpChange', { before, hp, max: maxHp })}
                </Text>
              </View>
            </View>
          </View>
        );
      })}

      <Pressable accessibilityRole="button" accessibilityState={{ expanded: logOpen }} onPress={() => setLogOpen(!logOpen)} style={styles.logToggle}>
        <Text style={styles.heading}>{t('expeditions.card.heading.log')}</Text>
        <Text style={styles.logChevron}>{logOpen ? '▾' : '▸'}</Text>
      </Pressable>
      {logOpen && (
        <View style={styles.log}>
          {(report.threats ?? []).map((threat, i) => {
            const def = threatById[threat.id];
            const element = threat.id === 'element' && threat.element ? elementInfo[threat.element] : null;
            const pips = '●'.repeat(threat.level) + '○'.repeat(3 - threat.level);
            return (
              <View key={i} style={styles.logRow}>
                <View style={styles.bullet} />
                <GameIcon emoji={def.emoji} icon={def.icon} size={18} />
                {element ? <GameIcon emoji={element.emoji} size={18} /> : null}
                <Text style={styles.logLine}>
                  {tr(def.name)} {pips} · {t(`expeditions.report.state.${threat.state}`)}
                </Text>
              </View>
            );
          })}
          {report.opportunity && (
            <View style={styles.logRow}>
              <View style={styles.bullet} />
              <GameIcon emoji={opportunityById[report.opportunity.id].emoji} size={18} />
              {report.opportunity.answered ? (
                <GainsLine gains={[tr(opportunityById[report.opportunity.id].name), ...opportunityGave(report.opportunity)]} labelStyle={styles.logLine} />
              ) : (
                <Text style={styles.logLine}>
                  {tr(opportunityById[report.opportunity.id].name)} · {t('expeditions.report.opportunityMissed')}
                </Text>
              )}
            </View>
          )}
          {(report.salvaged ?? []).map((entry, i) => {
            const item = itemById[entry.itemId];
            const returns = [
              ...entry.materials.map((m) => `${materialById[m.materialId].emoji} ${m.amount}`),
              entry.gold ? goldLabel(entry.gold, '+') : null,
            ]
              .filter((part): part is string => part !== null)
              .join(' · ');
            return (
              <View key={i} style={styles.logRow}>
                <View style={styles.bullet} />
                <Text style={styles.logLine}> {/* mixed-emoji-ok: the salvaged sentence wraps in a full-width paragraph */}
                  {t('expeditions.report.salvaged', {
                    hero: heroes.find((h) => h.id === entry.heroId)?.name ?? entry.heroId,
                    item: `${item.emoji} ${tr(item.name)}`,
                    returns,
                  })}
                </Text>
              </View>
            );
          })}
          {report.log.map((line, i) => (
            <View key={i} style={styles.logRow}>
              <View style={styles.bullet} />
              <Text style={styles.logLine}>{line}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.loot}>
        {note && <Text style={styles.line}>{note}</Text>}
        {tiles.length > 0 ? <LootGrid tiles={tiles} /> : <Text style={styles.line}>{t('expeditions.loot.nothing')}</Text>}
        <GainsLine gains={extras} size={16} gap={6} labelStyle={styles.line} />
        {report.freePick && <FreePickPanel />}
      </View>
    </ParchmentCard>
  );
}

const styles = StyleSheet.create({
  content: { gap: 6 },
  chips: { flexDirection: 'row', gap: 6 },
  families: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: ui.woodMid,
    borderWidth: 2,
    borderColor: ui.outline,
  },
  rowInner: { position: 'absolute', top: 2, left: 2, right: 2, bottom: 2, borderWidth: 2, borderColor: ui.woodSeam },
  rowName: { flex: 1, fontSize: 16, color: ui.brassLight },
  rowWhen: { fontFamily: fonts.serif, fontSize: 12, color: ui.onWoodMuted },
  chevron: { fontSize: 20, color: ui.onWoodMuted },
  line: { fontFamily: fonts.serif, fontSize: 14, color: ui.ink },
  section: { gap: 4, borderTopWidth: 2, borderTopColor: ui.parchmentRule, borderStyle: 'dashed', paddingTop: 6 },
  heading: { fontSize: 19, color: ui.ink },
  cardLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardText: { flex: 1, fontFamily: fonts.serif, fontSize: 14, color: ui.ink },
  flourish: { padding: 4, borderWidth: 2, borderColor: ui.brass, backgroundColor: ui.parchmentShade },
  portrait: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: ui.woodMid, borderWidth: 2, borderColor: ui.outline },
  logToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 2, borderTopColor: ui.parchmentRule, borderStyle: 'dashed' },
  logChevron: { fontSize: 20, color: ui.inkMuted },
  log: { gap: 5 },
  loot: { gap: 6, borderTopWidth: 2, borderTopColor: ui.parchmentRule, borderStyle: 'dashed', paddingTop: 6 },
  logRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  bullet: { width: 7, height: 7, marginTop: 6, transform: [{ rotate: '45deg' }], backgroundColor: ui.brassDim },
  logLine: { fontFamily: fonts.serif, fontSize: 13, color: ui.ink },
  hp: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hpName: { flex: 1, fontFamily: fonts.serif, fontSize: 14, color: ui.ink },
  plateBody: { flex: 1, gap: 2 },
  plateHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  plateXp: { fontFamily: fonts.serifBold, fontSize: 13, color: ui.good },
  platePortrait: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: ui.woodMid, borderWidth: 2, borderColor: ui.outline },
  hpBar: { flex: 1 },
  hpText: { fontFamily: fonts.serif, fontSize: 14, color: ui.inkMuted },
});
