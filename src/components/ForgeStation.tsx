import { useRef, useState, type ComponentRef } from 'react';
import { ScrollView, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { masteryTypeNames } from '@/content/forging';
import { gearProfiles } from '@/content/equipment';
import { materialById, recipeById, recipeOutput, relicById } from '@/content/lookup';
import { tierMaterials } from '@/content/materials';
import { canCraft, forgedItem, ownsTool, type ForgeResult } from '@/game/crafting/crafting';
import { forgeList, pageTypeOf, type ForgeTierList, type ForgePageType } from '@/game/crafting/forgeList';
import { tierRecipes } from '@/game/crafting/recipeUnlocks';
import { highestUnlockedTier } from '@/game/dungeons/unlock';
import { canRestore, relicRecipe } from '@/game/forging/relics';
import { guildBonus } from '@/game/guild/guild';
import type { SaveData } from '@/game/save';
import type { RecipeDef } from '@/game/types';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors, fonts, ui } from '@/theme';

import { Button } from './Button';
import { ForgeBanner } from './ForgeBanner';
import { ForgeConfirmDialog, ROMAN, type ForgePending, type PopupAnchor } from './ForgeConfirmDialog';
import { GameIcon } from './GameIcon';
import { GearMarks } from './GearMarks';
import { RecipeInputs, recipeInputsStyles } from './RecipeInputs';
import { Row } from './Row';
import { Text } from './Text';
import { TutorialHint } from './TutorialHint';
import { DiamondRail, ItemSlot, type RailItem } from './ui';

/** The gear sections, always in this order; the Other section joins last when it has content. */
const GEAR_SECTIONS = ['weapons', 'armour', 'offhands'] as const;

/** One emoji (and icon, for the weapons) per rail section. */
const RAIL_ICONS: Record<ForgePageType, { emoji: string; icon?: ImageSourcePropType }> = {
  weapons: { emoji: '🗡️', icon: require('../../assets/icons/scaled/menu-forge.png') },
  armour: { emoji: '🧥' },
  offhands: { emoji: '🛡️' },
  other: { emoji: '⚒️' },
};

/** The page the player last swiped to, kept for this session only. */
let lastPage: ForgePageType | null = null;

/** The forge: a rail of item types on the left, the chosen section's tiers of blueprints on the right. */
export function ForgeStation() {
  const save = useGameStore((state) => state.save);
  const craft = useGameStore((state) => state.craft);
  const forgeWithComponent = useGameStore((state) => state.forgeWithComponent);
  const restoreRelic = useGameStore((state) => state.restoreRelic);
  const [result, setResult] = useState<ForgeResult | null>(null);
  /** The forge or restore waiting for its confirmation, if any, and the slot it opened from. */
  const [pending, setPending] = useState<ForgePending | null>(null);
  const [anchor, setAnchor] = useState<PopupAnchor | null>(null);
  const [section, setSection] = useState<ForgePageType>(() => {
    // The tutorial's forge step must land on the sword's section, whatever was last used.
    if (save.tutorial.step === 'forgeSword') return 'weapons';
    return lastPage ?? 'weapons';
  });
  const [contentWidth, setContentWidth] = useState(0);
  const { pages, tiers } = forgeList(save);

  const otherVisible = pages.some(({ type }) => type === 'other');
  const sections = otherVisible ? ([...GEAR_SECTIONS, 'other'] as ForgePageType[]) : ([...GEAR_SECTIONS] as ForgePageType[]);
  const railItems: RailItem[] = sections.map((type) => {
    const page = pages.find((one) => one.type === type);
    return {
      key: type,
      label: t(`crafting.pages.${type}`),
      ...RAIL_ICONS[type],
      badge: page && page.craftable > 0 ? page.craftable : undefined,
    };
  });

  const confirmPending = () => {
    if (!pending) return;
    // A confirmed forge goes straight through; a cancel keeps everything as it is.
    if (pending.kind === 'restore') setResult(restoreRelic(pending.relicUid));
    else setResult(pending.componentId ? forgeWithComponent(pending.recipeId, pending.componentId) : craft(pending.recipeId));
    setPending(null);
    setAnchor(null);
  };
  const closeDialog = () => {
    setPending(null);
    setAnchor(null);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.body}>
        <DiamondRail
          items={railItems}
          selected={section}
          onSelect={(key) => {
            setSection(key as ForgePageType);
            lastPage = key as ForgePageType;
          }}
        />
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentInner}
          onLayout={({ nativeEvent }) => setContentWidth(nativeEvent.layout.width - 24)}
        >
          <TutorialHint screen="forge" />
          {result && <ForgeBanner result={result} onClose={() => setResult(null)} />}
          {pages.length === 0 ? (
            <Text style={styles.nothing}>{t('crafting.nothingKnown')}</Text>
          ) : section === 'other' ? (
            <OtherPage
              save={save}
              onRestore={(uid) => {
                setAnchor(null);
                setPending({ kind: 'restore', relicUid: uid });
              }}
              onCraft={(id) => setResult(craft(id))}
            />
          ) : (
            <GearSection
              save={save}
              type={section}
              tiers={[...tiers].reverse()}
              contentWidth={contentWidth}
              pending={pending}
              onForge={(recipeId, slot) => {
                setAnchor(slot);
                setPending({ kind: 'forge', recipeId, componentId: null });
              }}
            />
          )}
        </ScrollView>
      </View>
      {pending && (
        <ForgeConfirmDialog
          save={save}
          pending={pending}
          anchor={anchor}
          onPickComponent={(componentId) =>
            setPending((current) => (current && current.kind === 'forge' ? { ...current, componentId } : current))
          }
          onConfirm={confirmPending}
          onClose={closeDialog}
        />
      )}
    </View>
  );
}

/** One item type's blueprints: per tier newest first, its progress line, its slot grid and its materials. */
function GearSection({
  save,
  type,
  tiers,
  contentWidth,
  pending,
  onForge,
}: {
  save: SaveData;
  type: 'weapons' | 'armour' | 'offhands';
  tiers: ForgeTierList[];
  contentWidth: number;
  pending: ForgePending | null;
  onForge: (recipeId: string, anchor: PopupAnchor) => void;
}) {
  const rows = tiers.filter(({ tier }) => tierRecipes(tier).some((id) => pageTypeOf(recipeById[id]) === type));
  if (rows.length === 0) return <Text style={styles.nothing}>{t('crafting.nothingKnown')}</Text>;
  return (
    <>
      {rows.map(({ tier, recipeIds }) => (
        <TierBlock
          key={tier}
          save={save}
          type={type}
          tier={tier}
          knownIds={recipeIds}
          contentWidth={contentWidth}
          pending={pending}
          onForge={onForge}
        />
      ))}
    </>
  );
}

/** One tier of one item type: the tier line, the blueprint grid and the material strip. */
function TierBlock({
  save,
  type,
  tier,
  knownIds,
  contentWidth,
  pending,
  onForge,
}: {
  save: SaveData;
  type: 'weapons' | 'armour' | 'offhands';
  tier: number;
  knownIds: string[];
  contentWidth: number;
  pending: ForgePending | null;
  onForge: (recipeId: string, anchor: PopupAnchor) => void;
}) {
  const allIds = tierRecipes(tier).filter((id) => pageTypeOf(recipeById[id]) === type);
  const known = allIds.filter((id) => knownIds.includes(id));
  const unknown = allIds.filter((id) => !knownIds.includes(id));
  const material = materialById[tierMaterials[tier - 1]];
  // Each slot is wrapped in a 2 px ring, so its face is 4 px narrower than its cell.
  const cell = Math.floor((contentWidth - 3 * 6) / 4) - 4;
  if (cell <= 0) return null;
  return (
    <View style={styles.tier}>
      <View style={styles.tierHead}>
        <Text style={styles.tierName}>{t('crafting.tierName', { tier: ROMAN[tier - 1], material: tr(material.name) })}</Text>
        <Text style={styles.knownCount}>{t('crafting.knownCount', { known: known.length, total: allIds.length })}</Text>
      </View>
      <View style={styles.grid}>
        {known.map((id) => (
          <GearSlot
            key={id}
            save={save}
            recipeId={id}
            size={cell}
            selected={pending !== null && pending.kind === 'forge' && pending.recipeId === id}
            onForge={onForge}
          />
        ))}
        {unknown.map((id) => (
          <ItemSlot key={id} state="empty" size={cell} accessibilityLabel={t('crafting.notFound')} />
        ))}
      </View>
      <MaterialStrip save={save} recipes={known.map((id) => recipeById[id])} itemWidth={Math.floor((contentWidth - 2 * 6) / 3)} />
    </View>
  );
}

/** One known blueprint as a slot: ready when craftable, red-marked when short, selected while its pop-up is open. */
function GearSlot({
  save,
  recipeId,
  size,
  selected,
  onForge,
}: {
  save: SaveData;
  recipeId: string;
  size: number;
  selected: boolean;
  onForge: (recipeId: string, anchor: PopupAnchor) => void;
}) {
  const wrapper = useRef<ComponentRef<typeof View>>(null);
  const recipe = recipeById[recipeId];
  const item = forgedItem(recipe);
  if (!item) return null;
  const short = !canCraft(save, recipe);
  return (
    <View ref={wrapper} collapsable={false}>
      <ItemSlot
        state={selected ? 'selected' : short ? 'short' : 'ready'}
        size={size}
        emoji={item.emoji}
        icon={item.icon}
        accessibilityLabel={short ? `${tr(item.name)}, ${t('crafting.missing')}` : tr(item.name)}
        onPress={() =>
          wrapper.current?.measureInWindow((x, y, width, height) => onForge(recipeId, { x, y, width, height }))
        }
      />
    </View>
  );
}

/** A parchment counter for every material the tier's known recipes of this type use, in first-seen order. */
function MaterialStrip({ save, recipes, itemWidth }: { save: SaveData; recipes: RecipeDef[]; itemWidth: number }) {
  const ids: string[] = [];
  for (const recipe of recipes) {
    for (const { materialId } of recipe.inputs) if (!ids.includes(materialId)) ids.push(materialId);
  }
  if (ids.length === 0) return null;
  return (
    <View style={styles.strip}>
      {ids.map((id) => {
        const material = materialById[id];
        return (
          <View key={id} style={[styles.material, { width: itemWidth }]}>
            <GameIcon emoji={material.emoji} icon={material.icon} size={20} />
            <Text style={styles.materialName}>{tr(material.name)}</Text>
            <Text style={styles.materialCount}>{save.materials[id] ?? 0}</Text>
          </View>
        );
      })}
    </View>
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
    <View>
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
    </View>
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, flexDirection: 'row' },
  content: { flex: 1, backgroundColor: ui.woodDark },
  contentInner: { paddingVertical: 14, paddingHorizontal: 12, gap: 10 },
  nothing: { color: ui.onWoodMuted },
  tier: { gap: 8 },
  tierHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  tierName: { fontSize: 19, color: ui.brassLight },
  knownCount: { fontFamily: fonts.serif, fontSize: 13, color: ui.onWoodMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  strip: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 4 },
  material: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: ui.parchment,
    borderWidth: 2,
    borderColor: ui.outline,
  },
  materialName: { flex: 1, fontFamily: fonts.serif, fontSize: 14, color: ui.ink },
  materialCount: { fontFamily: fonts.serifBold, fontSize: 14, color: ui.ink },
  mastery: { fontSize: 16, color: colors.muted },
  family: { fontSize: 18, color: ui.onWood, marginTop: 8, marginBottom: 2 },
  relicHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
