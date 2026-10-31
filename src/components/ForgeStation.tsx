import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import PagerView from 'react-native-pager-view';

import { masteryTypeNames } from '@/content/forging';
import { heroClasses } from '@/content/heroes';
import { gearProfiles } from '@/content/equipment';
import { componentById, recipeById, recipeOutput, relicById } from '@/content/lookup';
import { canCraft, forgedItem, ownsTool, type ForgeResult } from '@/game/crafting/crafting';
import { forgeList, type ForgePage, type ForgePageType } from '@/game/crafting/forgeList';
import { tierRecipes } from '@/game/crafting/recipeUnlocks';
import { highestUnlockedTier } from '@/game/dungeons/unlock';
import { canForgeWithComponent, componentRecipe, fittingComponents } from '@/game/forging/components';
import { affinityOf } from '@/game/team/team';
import { masteryOf, masteryTypeOf } from '@/game/forging/mastery';
import { canRestore, relicRecipe } from '@/game/forging/relics';
import { guildBonus } from '@/game/guild/guild';
import type { SaveData } from '@/game/save';
import type { RecipeDef } from '@/game/types';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors, pixel } from '@/theme';

import { Button } from './Button';
import { ForgeBanner } from './ForgeBanner';
import { ForgeConfirmDialog, type ForgePending } from './ForgeConfirmDialog';
import { GearMarks } from './GearMarks';
import { Panel } from './Panel';
import { RecipeInputs, recipeInputsStyles } from './RecipeInputs';
import { Row } from './Row';
import { statIcons, STATS } from './GearRow';
import { Text } from './Text';
import { TutorialHint } from './TutorialHint';

/** One tab per page: its emoji and short label. */
const PAGE_META: Record<ForgePageType, { emoji: string; label: () => string }> = {
  weapons: { emoji: '🗡️', label: () => t('crafting.pages.weapons') },
  offhands: { emoji: '🛡️', label: () => t('crafting.pages.offhands') },
  armour: { emoji: '🧥', label: () => t('crafting.pages.armour') },
  other: { emoji: '⚒️', label: () => t('crafting.pages.other') },
};

/** The page the player last swiped to, kept for this session only. */
let lastPage: ForgePageType | null = null;

/** The forge: a page of tabs per item type, swiped through, with relics and tools on the last page. */
export function ForgeStation() {
  const save = useGameStore((state) => state.save);
  const craft = useGameStore((state) => state.craft);
  const forgeWithComponent = useGameStore((state) => state.forgeWithComponent);
  const restoreRelic = useGameStore((state) => state.restoreRelic);
  const [result, setResult] = useState<ForgeResult | null>(null);
  /** The forge or restore waiting for its confirmation, if any. */
  const [pending, setPending] = useState<ForgePending | null>(null);
  const { pages } = forgeList(save);
  // The Weapons page opens first; later visits reopen the page last used this session.
  const [index, setIndex] = useState(() => {
    // The tutorial's forge step must land on the sword's card, whatever page was last used.
    if (save.tutorial.step === 'forgeSword') return Math.max(0, pages.findIndex(({ type }) => type === 'weapons'));
    const wanted = pages.findIndex(({ type }) => type === lastPage);
    return wanted === -1 ? 0 : wanted;
  });
  const pager = useRef<PagerView>(null);
  const active = Math.min(index, pages.length - 1);
  const confirmPending = () => {
    if (!pending) return;
    // A confirmed forge goes straight through; a cancel keeps everything as it is.
    if (pending.kind === 'restore') setResult(restoreRelic(pending.relicUid));
    else setResult(pending.componentId ? forgeWithComponent(pending.recipeId, pending.componentId) : craft(pending.recipeId));
    setPending(null);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.hint}>
        <TutorialHint screen="forge" />
      </View>
      {result && <ForgeBanner result={result} onClose={() => setResult(null)} />}
      {pages.length === 0 ? (
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.mastery}>{t('crafting.nothingKnown')}</Text>
        </ScrollView>
      ) : (
        <>
          <View style={styles.tabs}>
            {pages.map(({ type, craftable }, i) => (
              <Pressable
                key={type}
                onPress={() => {
                  pager.current?.setPage(i);
                  lastPage = type;
                }}
                style={[styles.tab, i === active && styles.tabActive]}
              >
                <Text style={[styles.tabLabel, i === active && styles.tabLabelActive]}>
                  {PAGE_META[type].emoji} {PAGE_META[type].label()}
                </Text>
                {craftable > 0 && <Text style={styles.badge}>{craftable}</Text>}
              </Pressable>
            ))}
          </View>
          <PagerView
            style={styles.pager}
            initialPage={Math.min(index, pages.length - 1)}
            onPageSelected={({ nativeEvent }) => {
              setIndex(nativeEvent.position);
              lastPage = pages[nativeEvent.position].type;
            }}
          >
            {pages.map((one) => (
              <View key={one.type}>
                {one.type === 'other' ? (
                  <OtherPage
                    save={save}
                    onRestore={(uid) => setPending({ kind: 'restore', relicUid: uid })}
                    onCraft={(id) => setResult(craft(id))}
                  />
                ) : (
                  <GearPage
                    save={save}
                    page={one}
                    action={t('crafting.forge')}
                    onCraft={(id) => setPending({ kind: 'forge', recipeId: id, componentId: null })}
                    onForgeWith={(id, componentId) => setPending({ kind: 'forge', recipeId: id, componentId })}
                  />
                )}
              </View>
            ))}
          </PagerView>
        </>
      )}
      {pending && (
        <ForgeConfirmDialog save={save} pending={pending} onConfirm={confirmPending} onClose={() => setPending(null)} />
      )}
    </View>
  );
}

/** One item type's blueprints: per tier newest first, the tier's progress line and its cards. */
function GearPage({
  save,
  page,
  action,
  onCraft,
  onForgeWith,
}: {
  save: SaveData;
  page: ForgePage;
  action: string;
  onCraft: (recipeId: string) => void;
  onForgeWith: (recipeId: string, componentId: string) => void;
}) {
  const [picking, setPicking] = useState<string | null>(null);
  return (
    <ScrollView contentContainerStyle={styles.container}>
      {page.tiers.map(({ tier, recipeIds }) => (
        <View key={tier} style={styles.gridRow}>
          <Text style={styles.mastery}>
            {t('crafting.tierProgress', { tier, known: recipeIds.length, total: tierRecipes(tier).length })}
          </Text>
          {recipeIds.map((id) => (
            <GearCard
              key={id}
              save={save}
              recipe={recipeById[id]}
              action={action}
              picking={picking === id}
              onTogglePick={() => setPicking(picking === id ? null : id)}
              onCraft={() => onCraft(id)}
            />
          ))}
          {picking && recipeIds.includes(picking) && (
            <ComponentPicker
              save={save}
              recipe={recipeById[picking]}
              onForge={(componentId) => {
                onForgeWith(picking, componentId);
                setPicking(null);
              }}
            />
          )}
        </View>
      ))}
    </ScrollView>
  );
}

/** Relic restoring and the recipes that need no blueprint: tools and smelting. */
function OtherPage({
  save,
  onRestore,
  onCraft,
}: {
  save: SaveData;
  onRestore: (relicUid: string) => void;
  onCraft: (recipeId: string) => void;
}) {
  const { plainRecipeIds } = forgeList(save);
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <RelicList save={save} onRestore={onRestore} />
      {plainRecipeIds.map((id) => {
        const recipe = recipeById[id];
        const output = recipeOutput(recipe);
        return (
          <Row
            key={id}
            emoji={output.emoji}
            icon={output.icon}
            title={tr(output.name)}
            subtitle={
              <View>
                <View style={recipeInputsStyles.inputs}>
                  <RecipeInputs save={save} recipe={recipe} />
                </View>
                {'description' in output && typeof output.description === 'string' ? (
                  <Text style={styles.mastery}>{tr(output.description)}</Text>
                ) : null}
              </View>
            }
            right={
              ownsTool(save, recipe) ? (
                t('crafting.owned')
              ) : (
                <Button title={t('crafting.forge')} disabled={!canCraft(save, recipe)} onPress={() => onCraft(id)} />
              )
            }
          />
        );
      })}
    </ScrollView>
  );
}

/** Unrestored relics up to the highest unlocked tier, each with its effect, its restore cost and a Restore button. */
function RelicList({ save, onRestore }: { save: SaveData; onRestore: (relicUid: string) => void }) {
  const relics = save.relics.filter(({ relicId }) => relicById[relicId].tier <= highestUnlockedTier(save));
  if (relics.length === 0) return null;
  return (
    <View>
      <Text style={styles.family}>{t('crafting.relics')}</Text>
      {relics.map(({ uid, relicId }) => {
        const relic = relicById[relicId];
        return (
          <Row
            key={uid}
            emoji={gearProfiles[relic.gearType].emoji}
            title={tr(relic.name)}
            subtitle={
              <View>
                <View style={styles.relicHead}>
                  <GearMarks tier={relic.tier} />
                  <Text style={styles.mastery}>{tr(masteryTypeNames[relic.gearType].name)}</Text>
                </View>
                <Text style={styles.mastery}>✦ {tr(relic.effect)}</Text>
                <View style={recipeInputsStyles.inputs}>
                  <RecipeInputs save={save} recipe={relicRecipe(relic, guildBonus(save, 'relicRestore'))} />
                </View>
              </View>
            }
            right={<Button title={t('crafting.restore')} disabled={!canRestore(save, uid)} onPress={() => onRestore(uid)} />}
          />
        );
      })}
    </View>
  );
}

/** The components the player holds that fit a blueprint, each with its swapped recipe and what it adds. */
function ComponentPicker({ save, recipe, onForge }: { save: SaveData; recipe: RecipeDef; onForge: (componentId: string) => void }) {
  return (
    <View style={styles.picker}>
      <Text style={styles.mastery}>{t('crafting.componentHint', { item: tr(recipeOutput(recipe).name) })}</Text>
      {fittingComponents(save, recipe).map((componentId) => {
        const component = componentById[componentId];
        return (
          <Row
            key={componentId}
            emoji={component.emoji}
            title={tr(component.name)}
            subtitle={
              <View>
                <Text style={styles.mastery}>✦ {tr(component.adds)}</Text>
                <View style={recipeInputsStyles.inputs}>
                  <RecipeInputs save={save} recipe={{ ...recipe, inputs: componentRecipe(recipe, componentId) }} />
                </View>
              </View>
            }
            right={
              <Button title={t('crafting.forge')} disabled={!canForgeWithComponent(save, recipe, componentId)} onPress={() => onForge(componentId)} />
            }
          />
        );
      })}
    </View>
  );
}

/** One known blueprint as a full-width card: name and tier, the mastery that sets its quality, its stats, the roster's ▲/▼ affinities, any keywords, the cost held/needed and the craft buttons. */
function GearCard({
  save,
  recipe,
  action,
  picking,
  onTogglePick,
  onCraft,
}: {
  save: SaveData;
  recipe: RecipeDef;
  action: string;
  picking: boolean;
  onTogglePick: () => void;
  onCraft: () => void;
}) {
  const item = forgedItem(recipe);
  if (!item) return null;
  const type = masteryTypeOf(item);
  const { level } = masteryOf(save, type);
  const classIds = [...new Set(save.heroes.map((hero) => hero.classId))];
  const favoured = classIds.filter((classId) => affinityOf(classId, item.gearType) === 'favoured');
  const unfit = classIds.filter((classId) => affinityOf(classId, item.gearType) === 'unfit');
  return (
    <Panel color={colors.parchmentDark}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>
          {item.emoji} {tr(item.name)}
        </Text>
        <GearMarks tier={item.tier} />
      </View>
      <Text style={styles.mastery}>{t('crafting.mastery', { type: tr(masteryTypeNames[type].name), level })}</Text>
      <View style={styles.statGrid}>
        {STATS.filter((key) => item.stats[key]).map((key) => (
          <Text key={key} style={styles.statCell}>
            {statIcons[key]} {Math.round(item.stats[key]!)}
          </Text>
        ))}
      </View>
      {(favoured.length > 0 || unfit.length > 0) && (
        <Text style={styles.mastery}>
          {favoured.length > 0 ? (
            <Text style={styles.favoured}>{t('classes.favoured', { types: favoured.map((classId) => tr(heroClasses[classId].name)).join(', ') })}</Text>
          ) : null}
          {favoured.length > 0 && unfit.length > 0 ? '  ' : ''}
          {unfit.length > 0 ? (
            <Text style={styles.unfit}>{t('classes.unfit', { types: unfit.map((classId) => tr(heroClasses[classId].name)).join(', ') })}</Text>
          ) : null}
        </Text>
      )}
      {item.keywords.length > 0 && (
        <Text style={styles.mastery}>✦ {item.keywords.map((keyword) => t(`threats.keyword.${keyword}`)).join(', ')}</Text>
      )}
      <View style={recipeInputsStyles.inputs}>
        <RecipeInputs save={save} recipe={recipe} />
      </View>
      <Button title={action} disabled={!canCraft(save, recipe)} onPress={onCraft} />
      {fittingComponents(save, recipe).length > 0 && (
        <Button title={t('crafting.withComponent')} color={picking ? undefined : colors.muted} onPress={onTogglePick} />
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  hint: { paddingHorizontal: 16, paddingTop: 12 },
  container: { padding: 16 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    borderWidth: pixel.outline,
    borderColor: colors.ink,
    backgroundColor: colors.parchmentDark,
  },
  tabActive: { backgroundColor: colors.wood, borderBottomColor: colors.highlight },
  tabLabel: { fontSize: 20, color: colors.ink },
  tabLabelActive: { color: colors.parchment },
  badge: {
    minWidth: 20,
    textAlign: 'center',
    fontSize: 14,
    color: colors.parchment,
    backgroundColor: colors.danger,
    paddingHorizontal: 4,
  },
  pager: { flex: 1 },
  mastery: { fontSize: 16, color: colors.muted },
  family: { fontSize: 18, color: colors.ink, marginTop: 8, marginBottom: 2 },
  gridRow: { gap: 4 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { flex: 1, fontSize: 20, color: colors.ink },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 2 },
  statCell: { fontSize: 17 },
  favoured: { color: colors.success },
  unfit: { color: colors.danger },
  picker: { gap: 4, padding: 6, borderWidth: pixel.outline, borderColor: colors.ink },
  relicHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
