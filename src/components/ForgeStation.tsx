import { useRef, useState, type ComponentRef } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import PagerView from 'react-native-pager-view';

import { gearTypeNames , gearProfiles } from '@/content/equipment';
import { materialById, recipeById, recipeOutput, relicById } from '@/content/lookup';
import { tierMaterials } from '@/content/materials';
import { systemIcons } from '@/content/systemIcons';
import { canCraft, forgedItem, ownsTool, type ForgeResult } from '@/game/crafting/crafting';
import { forgeList, pageTypeOf, type ForgeTierList, type ForgePageType } from '@/game/crafting/forgeList';
import { tierRecipes } from '@/game/crafting/recipeUnlocks';
import { highestUnlockedTier } from '@/game/dungeons/unlock';
import { ELEMENTS, stoneId } from '@/game/elements';
import { gearFamilyTags } from '@/game/families/families';
import { canRestore, relicRecipe } from '@/game/forging/relics';
import { guildBonus } from '@/game/guild/guild';
import type { SaveData } from '@/game/save';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors, fonts, ui } from '@/theme';

import { Button } from './Button';
import { FamilyTags } from './FamilyTag';
import { ForgeBanner } from './ForgeBanner';
import { ForgeConfirmDialog, ROMAN, type ForgePending, type PopupAnchor } from './ForgeConfirmDialog';
import { GearMarks } from './GearMarks';
import { ReworkStation } from './ReworkStation';
import { RecipeInputs, recipeInputsStyles } from './RecipeInputs';
import { Row } from './Row';
import { Text } from './Text';
import { TutorialHint } from './TutorialHint';
import { DiamondRail, ItemSlot, useLazyPages, type RailItem } from './ui';

/** The gear sections, always in this order; the Other section joins last when it has content. */
const GEAR_SECTIONS = ['weapons', 'armour', 'helmets', 'offhands'] as const;

/** The rail's sections: the forge's gear pages, plus the rework page the player holds a stone or an uncommon piece for. */
export type ForgeSection = ForgePageType | 'rework';

/** One emoji (and icon, for the weapons) per forge page. */
const RAIL_ICONS: Record<ForgePageType, { emoji: string; icon?: ImageSourcePropType }> = {
  weapons: { emoji: '🗡️', icon: require('../../assets/icons/scaled/menu-forge.png') },
  armour: { emoji: '🧥', icon: systemIcons['🧥'] },
  helmets: { emoji: '🪖', icon: require('../../assets/icons/rpg/helmet-steel-kettle.png') },
  offhands: { emoji: '🛡️', icon: systemIcons['🛡️'] },
  other: { emoji: '⚒️', icon: systemIcons['⚒️'] },
};

/** Whether the player holds an elemental stone or an Uncommon-or-better piece, which is what the rework page works on. */
const hasReworkMaterial = (save: SaveData) =>
  ELEMENTS.some((e) => (save.materials[stoneId(e)] ?? 0) > 0) || save.gear.some((piece) => piece.rarity !== 'common');

/** The page the player last swiped to, kept for this session only. */
let lastPage: ForgeSection | null = null;

/**
 * The forge's rail: its sections with craftable badges, and the section the
 * screen opens on. It also carries the page and tier lists it is built from,
 * so the station does not compute the forge list twice; the screen's ghost
 * shows the same rail on its first frame.
 */
export function useForgeRail() {
  const save = useGameStore((state) => state.save);
  const { pages, tiers } = forgeList(save);
  const otherVisible = pages.some(({ type }) => type === 'other');
  const sections: ForgeSection[] = otherVisible ? [...GEAR_SECTIONS, 'other'] : [...GEAR_SECTIONS];
  if (hasReworkMaterial(save)) sections.push('rework');
  const items: RailItem[] = sections.map((type) => {
    if (type === 'rework') {
      return { key: 'rework', label: t('screens.rework'), emoji: '💠', spaced: true };
    }
    const page = pages.find((one) => one.type === type);
    return {
      key: type,
      label: t(`crafting.pages.${type}`),
      ...RAIL_ICONS[type],
      badge: page && page.craftable > 0 ? page.craftable : undefined,
    };
  });
  // The tutorial's forge step must land on the sword's section, whatever was last used;
  // a last page that is no longer shown falls back to the weapons.
  const wanted = lastPage ?? 'weapons';
  const selected: ForgeSection = save.tutorial.step === 'forgeSword' || !sections.includes(wanted) ? 'weapons' : wanted;
  return { items, sections, selected, pages, tiers };
}

/** The forge: a rail of item types on the left, the chosen section's tiers of blueprints on the right. */
export function ForgeStation() {
  const save = useGameStore((state) => state.save);
  const craft = useGameStore((state) => state.craft);
  const forgeWithIngredient = useGameStore((state) => state.forgeWithIngredient);
  const restoreRelic = useGameStore((state) => state.restoreRelic);
  const [result, setResult] = useState<ForgeResult | null>(null);
  // Opened on a blueprint (the loot grid's "Forge"): its section, its confirmation open.
  const { recipe: openedOn } = useLocalSearchParams<{ recipe?: string }>();
  const openedType = openedOn && recipeById[openedOn] && save.knownRecipes.includes(openedOn) ? pageTypeOf(recipeById[openedOn]) : null;
  /** The forge or restore waiting for its confirmation, if any, and the slot it opened from. */
  const [pending, setPending] = useState<ForgePending | null>(() => (openedType ? { kind: 'forge', recipeId: openedOn!, ingredientId: null } : null));
  const [anchor, setAnchor] = useState<PopupAnchor | null>(null);
  const rail = useForgeRail();
  const [section, setSection] = useState<ForgeSection>(() => (openedType && rail.sections.includes(openedType) ? openedType : rail.selected));
  const [contentWidth, setContentWidth] = useState(0);
  const pager = useRef<PagerView>(null);
  const { items: railItems, sections, pages, tiers } = rail;

  const showSection = (next: ForgeSection) => {
    setSection(next);
    lastPage = next;
  };

  const confirmPending = () => {
    if (!pending) return;
    // A confirmed forge goes straight through; a cancel keeps everything as it is.
    if (pending.kind === 'restore') setResult(restoreRelic(pending.relicUid));
    else setResult(pending.ingredientId ? forgeWithIngredient(pending.recipeId, pending.ingredientId) : craft(pending.recipeId));
    setPending(null);
    setAnchor(null);
  };
  const closeDialog = () => {
    setPending(null);
    setAnchor(null);
  };

  const pagerPages = useLazyPages({
    keys: sections,
    active: section,
    variant: 'grid',
    render: (type) => (
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        onLayout={({ nativeEvent }) => setContentWidth(nativeEvent.layout.width - 24)}
      >
        <TutorialHint screen="forge" />
        {result && <ForgeBanner result={result} onClose={() => setResult(null)} />}
        {type === 'rework' ? (
          <ReworkStation />
        ) : pages.length === 0 ? (
          <Text style={styles.nothing}>{t('crafting.nothingKnown')}</Text>
        ) : type === 'other' ? (
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
            type={type}
            tiers={[...tiers].reverse()}
            contentWidth={contentWidth}
            pending={pending}
            onForge={(recipeId, slot) => {
              setAnchor(slot);
              setPending({ kind: 'forge', recipeId, ingredientId: null });
            }}
          />
        )}
      </ScrollView>
    ),
  });

  return (
    <View style={styles.screen}>
      <View style={styles.body}>
        <DiamondRail
          items={railItems}
          selected={section}
          onSelect={(key) => {
            pager.current?.setPage(sections.indexOf(key as ForgeSection));
            showSection(key as ForgeSection);
          }}
        />
        <PagerView
          ref={pager}
          style={styles.pager}
          initialPage={Math.max(0, sections.indexOf(section))}
          onPageSelected={({ nativeEvent }) => showSection(sections[nativeEvent.position])}
        >
          {pagerPages}
        </PagerView>
      </View>
      {pending && (
        <ForgeConfirmDialog
          save={save}
          pending={pending}
          anchor={anchor}
          onPickIngredient={(ingredientId) =>
            setPending((current) => (current && current.kind === 'forge' ? { ...current, ingredientId } : current))
          }
          onConfirm={confirmPending}
          onClose={closeDialog}
        />
      )}
    </View>
  );
}

/** One item type's blueprints: per tier newest first, its progress line and its slot grid. */
function GearSection({
  save,
  type,
  tiers,
  contentWidth,
  pending,
  onForge,
}: {
  save: SaveData;
  type: 'weapons' | 'armour' | 'helmets' | 'offhands';
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

/** One tier of one item type: the tier line and the blueprint grid. */
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
  type: 'weapons' | 'armour' | 'helmets' | 'offhands';
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
        families={gearFamilyTags(item)}
        accessibilityLabel={short ? `${tr(item.name)}, ${t('crafting.missing')}` : tr(item.name)}
        onPress={() =>
          wrapper.current?.measureInWindow((x, y, width, height) => onForge(recipeId, { x, y, width, height }))
        }
      />
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
                  <Text style={styles.subtitle}>{tr(output.description)}</Text>
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
            icon={relic.icon}
            legendary
            title={tr(relic.name)}
            subtitle={
              <View>
                <View style={styles.relicHead}>
                  <GearMarks tier={relic.tier} />
                  <Text style={styles.subtitle}>{tr(gearTypeNames[relic.gearType].name)}</Text>
                  <FamilyTags tags={gearFamilyTags(relic, relic.id)} />
                </View>
                <Text style={styles.subtitle}>✦ {tr(relic.effect)}</Text>
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
  pager: { flex: 1 },
  content: { flex: 1, backgroundColor: ui.woodDark },
  contentInner: { paddingVertical: 14, paddingHorizontal: 12, gap: 10 },
  nothing: { color: ui.onWoodMuted },
  tier: { gap: 8 },
  tierHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  tierName: { fontSize: 19, color: ui.brassLight },
  knownCount: { fontFamily: fonts.serif, fontSize: 13, color: ui.onWoodMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  subtitle: { fontSize: 16, color: colors.muted },
  family: { fontSize: 18, color: ui.onWood, marginTop: 8, marginBottom: 2 },
  relicHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
