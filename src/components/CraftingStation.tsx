import { useRef, useState, type ComponentRef } from 'react';
import { ScrollView, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { itemById, materialById, recipeOutput, valuableById } from '@/content/lookup';
import { recipes } from '@/content/recipes';
import { canCraft, isKnown, ownsTool, type ForgeResult } from '@/game/crafting/crafting';
import { ELEMENTS, shardId } from '@/game/elements';
import type { SaveData } from '@/game/save';
import type { RecipeDef } from '@/game/types';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { fonts, ui } from '@/theme';

import { ForgeBanner } from './ForgeBanner';
import { RewardLabel } from './IconLabel';
import { Text } from './Text';
import { TutorialHint } from './TutorialHint';
import { AnchoredPopup, DiamondRail, ItemPopup, ItemSlot, SwipeTabs, type PopupAnchor, type PopupIngredient, type PopupLine, type RailItem } from './ui';

type Props = {
  station: RecipeDef['station'];
  /** Label of the craft button, e.g. "Brew". */
  action: string;
};

type Tab = NonNullable<RecipeDef['tab']>;
type Family = 'meals' | 'supply' | 'kits' | 'hero' | 'walking' | 'homeCare';
/** Provisions rows are grouped by family, in this order within each tab. */
const FAMILIES: Family[] = ['meals', 'supply', 'kits', 'hero', 'walking', 'homeCare'];

const RAIL_ICONS: Record<Tab, { emoji: string; icon?: ImageSourcePropType }> = {
  kitchen: { emoji: '🍲' },
  alchemy: { emoji: '⚗️', icon: require('../../assets/icons/scaled/menu-alchemy.png') },
};

/** One recipe group: every known recipe of the station that makes the same item. */
type Group = RecipeDef[];

/** The kitchen/alchemy tabs as rail items, with craftable badges, and the tab the station opens on; the screen's ghost shows the same rail. */
export function useCraftingRail(station: Props['station']): { items: RailItem[]; selected: Tab } | undefined {
  const save = useGameStore((state) => state.save);
  if (station !== 'provisions') return undefined;
  const items = (['kitchen', 'alchemy'] as Tab[]).map((key) => {
    const rows = recipes.filter((recipe) => recipe.station === station && recipe.tab === key).filter((recipe) => isKnown(save, recipe));
    const craftable = new Set(rows.filter((recipe) => canCraft(save, recipe)).map((recipe) => recipeOutput(recipe).id)).size;
    return { key, label: t(`crafting.tabs.${key}`), ...RAIL_ICONS[key], badge: craftable > 0 ? craftable : undefined };
  });
  return { items, selected: 'kitchen' };
}

function familyOf(recipe: RecipeDef): Family {
  if (!('itemId' in recipe.output)) return 'hero';
  const item = itemById[recipe.output.itemId];
  if (item?.slot === 'provision') return item.meal ? 'meals' : 'supply';
  if (item?.slot === 'utility') return item.walk ? 'walking' : 'homeCare';
  if (item?.slot === 'consumable' && (item.kit || item.protectsAgainst)) return 'kits';
  return 'hero';
}

/** The known recipes of one crafting station; locked ones stay hidden. The forge has its own screen. */
export function CraftingStation({ station, action }: Props) {
  const save = useGameStore((state) => state.save);
  const craft = useGameStore((state) => state.craft);
  const [result, setResult] = useState<ForgeResult | null>(null);
  const [tab, setTab] = useState<Tab>('kitchen');
  /** The recipe picked for an item that has two, by item id. */
  const [picked, setPicked] = useState<Record<string, string>>({});
  /** The recipe group whose pop-up is open, and the slot it opened from. */
  const [pending, setPending] = useState<{ group: Group; anchor: PopupAnchor } | null>(null);
  const tabbed = station === 'provisions';
  const rail = useCraftingRail(station);

  const known = recipes.filter((recipe) => recipe.station === station && (!tabbed || recipe.tab === tab)).filter((recipe) => isKnown(save, recipe));
  const groupsOf = (rows: RecipeDef[]): Group[] =>
    [...new Set(rows.map((recipe) => recipeOutput(recipe).id))].map((id) => rows.filter((recipe) => recipeOutput(recipe).id === id));

  /** One family's recipes of the current tab, grouped per item. */
  const familyGroups = (family: Family): Group[] => groupsOf(known.filter((recipe) => familyOf(recipe) === family));
  const openGroup = (group: Group, anchor: PopupAnchor) => setPending({ group, anchor });

  return (
    <View style={styles.screen}>
      <View style={styles.body}>
        {rail && <DiamondRail items={rail.items} selected={tab} onSelect={(key) => setTab(key as Tab)} />}
        <View style={styles.content}>
          <TutorialHint screen={station} />
          {result && <ForgeBanner result={result} onClose={() => setResult(null)} />}
          {!tabbed ? (
            <ScrollView contentContainerStyle={styles.page}>
              {FAMILIES.map((family) => (
                <FamilySection key={family} save={save} family={family} groups={familyGroups(family)} onParchment={false} pending={pending} onOpen={openGroup} />
              ))}
            </ScrollView>
          ) : tab === 'kitchen' ? (
            <View style={styles.tabArea}>
              <SwipeTabs
                tabs={[
                  { key: 'meals', label: t('crafting.families.meals') },
                  { key: 'supplies', label: t('crafting.supplies') },
                ]}
              >
                {[FAMILIES.filter((family) => family === 'meals'), FAMILIES.filter((family) => family !== 'meals')].map((families, page) => (
                  <ScrollView key={page} contentContainerStyle={styles.page}>
                    {families.map((family) => (
                      <FamilySection key={family} save={save} family={family} groups={familyGroups(family)} onParchment pending={pending} onOpen={openGroup} />
                    ))}
                  </ScrollView>
                ))}
              </SwipeTabs>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.page}>
              {FAMILIES.map((family) => (
                <FamilySection key={family} save={save} family={family} groups={familyGroups(family)} onParchment={false} pending={pending} onOpen={openGroup} />
              ))}
            </ScrollView>
          )}
        </View>
      </View>
      {pending && (
        <RecipePopup
          save={save}
          group={pending.group}
          anchor={pending.anchor}
          picked={picked[recipeOutput(pending.group[0]).id]}
          kitchen={tab === 'kitchen'}
          action={action}
          onClose={() => setPending(null)}
          onPick={(recipeId) => setPicked({ ...picked, [recipeOutput(pending.group[0]).id]: recipeId })}
          onCraft={(recipeId) => setResult(craft(recipeId))}
        />
      )}
    </View>
  );
}

/** One family's header and its slot grid (one slot per item, whichever recipes make it). */
function FamilySection({
  save,
  family,
  groups,
  onParchment,
  pending,
  onOpen,
}: {
  save: SaveData;
  family: Family;
  groups: Group[];
  onParchment: boolean;
  pending: { group: Group; anchor: PopupAnchor } | null;
  onOpen: (group: Group, anchor: PopupAnchor) => void;
}) {
  const [width, setWidth] = useState(0);
  if (groups.length === 0) return null;
  // Each slot is wrapped in a 2 px ring, so its face is 4 px narrower than its cell.
  const cell = Math.floor((width - 3 * 6) / 4) - 4;
  return (
    <View style={styles.family} onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}>
      <Text style={onParchment ? styles.familyNameParchment : styles.familyName}>{t(`crafting.families.${family}`)}</Text>
      {cell > 0 && (
        <View style={styles.grid}>
          {groups.map((group) => (
            <GroupSlot
              key={recipeOutput(group[0]).id}
              save={save}
              group={group}
              size={cell}
              selected={pending !== null && recipeOutput(pending.group[0]).id === recipeOutput(group[0]).id}
              onOpen={onOpen}
            />
          ))}
        </View>
      )}
    </View>
  );
}

/** One item group as a slot: ready when any of its recipes can be crafted, red-marked when short, selected while its pop-up is open. */
function GroupSlot({
  save,
  group,
  size,
  selected,
  onOpen,
}: {
  save: SaveData;
  group: Group;
  size: number;
  selected: boolean;
  onOpen: (group: Group, anchor: PopupAnchor) => void;
}) {
  const wrapper = useRef<ComponentRef<typeof View>>(null);
  const output = recipeOutput(group[0]);
  const owned = group.some((recipe) => ownsTool(save, recipe));
  const ready = group.some((recipe) => canCraft(save, recipe));
  const state = selected ? 'selected' : ready || owned ? 'ready' : 'short';
  return (
    <View ref={wrapper} collapsable={false}>
      <ItemSlot
        state={state}
        size={size}
        emoji={output.emoji}
        icon={output.icon}
        count={owned ? undefined : (save.consumables[output.id] ?? 0)}
        accessibilityLabel={state === 'short' ? `${tr(output.name)}, ${t('crafting.missing')}` : tr(output.name)}
        onPress={() => wrapper.current?.measureInWindow((x, y, width, height) => onOpen(group, { x, y, width, height }))}
      />
    </View>
  );
}

/**
 * One item group's pop-up: its description, stock and the chosen recipe's full
 * cost, with the craft action. Cooking goes straight through and the pop-up
 * stays open for another round — the counts update live from the store.
 */
function RecipePopup({
  save,
  group,
  anchor,
  picked,
  kitchen,
  action,
  onClose,
  onPick,
  onCraft,
}: {
  save: SaveData;
  group: Group;
  anchor: PopupAnchor;
  picked: string | undefined;
  kitchen: boolean;
  action: string;
  onClose: () => void;
  onPick: (recipeId: string) => void;
  onCraft: (recipeId: string) => void;
}) {
  const output = recipeOutput(group[0]);
  // The recipe the player can afford, or their pick when both are.
  const affordable = group.filter((recipe) => canCraft(save, recipe));
  const recipe = affordable.find((r) => r.id === picked) ?? affordable[0] ?? group[0];
  const owned = ownsTool(save, recipe);
  const description = 'itemId' in recipe.output ? itemById[recipe.output.itemId].description : undefined;
  const count = save.consumables[output.id] ?? 0;
  const heldValuable = (valuableId: string) =>
    Object.entries(save.valuables).reduce((sum, [key, n]) => (key.startsWith(`${valuableId}:`) ? sum + n : sum), 0);
  const shards = Math.max(...ELEMENTS.map((element) => save.materials[shardId(element)] ?? 0));
  const ingredients: PopupIngredient[] = [
    ...recipe.inputs.map(({ materialId, amount }) => ({
      key: materialId,
      label: tr(materialById[materialId].name),
      emoji: materialById[materialId].emoji,
      icon: materialById[materialId].icon,
      have: save.materials[materialId] ?? 0,
      need: amount,
    })),
    ...(recipe.valuables ?? []).map(({ valuableId, amount }) => ({
      key: valuableId,
      label: tr(valuableById[valuableId].name),
      emoji: valuableById[valuableId].emoji,
      have: heldValuable(valuableId),
      need: amount,
    })),
  ];
  const lines: PopupLine[] = [{ tone: 'muted', text: t('equip.inStock', { count }) }];
  const other = group.find((variant) => variant.id !== recipe.id);
  return (
    <AnchoredPopup
      anchor={anchor}
      onClose={onClose}
      render={(pointer) => (
        <ItemPopup
          pointer={pointer}
          title={tr(output.name)}
          emoji={output.emoji}
          icon={output.icon}
          subtitle={t(`crafting.families.${familyOf(recipe)}`)}
          note={description ? tr(description) : undefined}
          lines={lines}
          ingredients={ingredients}
          secondary={other ? { title: t('crafting.otherRecipe'), onPress: () => onPick(other.id) } : undefined}
          action={{
            title: owned ? t('crafting.owned') : kitchen ? t('crafting.cook') : action,
            disabled: owned || !canCraft(save, recipe),
            onPress: () => onCraft(recipe.id),
          }}
        >
          {recipe.anyShards ? (
            <RewardLabel text={t('crafting.anyShards', { held: shards, amount: recipe.anyShards })} size={15} labelStyle={styles.shardLine} />
          ) : undefined}
        </ItemPopup>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, flexDirection: 'row' },
  content: { flex: 1, backgroundColor: ui.woodDark, paddingVertical: 14, paddingHorizontal: 12, gap: 10 },
  tabArea: { flex: 1 },
  page: { padding: 12, gap: 12 },
  family: { gap: 8 },
  familyName: { fontSize: 18, color: ui.brassLight },
  familyNameParchment: { fontSize: 18, color: ui.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  shardLine: { fontFamily: fonts.serif, fontSize: 15, color: ui.inkMuted },
});
