import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { familyById } from '@/content/families';
import { gearName } from '@/content/lookup';
import { forgeChoices, gearChoices, shortFamilies, type ForgeChoice, type GearSlot, type SocketGroup } from '@/game/expeditions/party';
import { gearFamilyTags } from '@/game/families/families';
import { gearIconOf } from '@/game/gear/gearIcon';
import type { SaveData } from '@/game/save';
import { useOdds, type OddsJob } from '@/hooks/useOdds';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { fonts, ui } from '@/theme';

import { GearCard } from './GearDetails';
import { ForgeConfirmDialog, ingredientsOf, ROMAN, type ForgePending, type PopupAnchor } from './ForgeConfirmDialog';
import { GameIcon } from './GameIcon';
import { Overlay } from './Overlay';
import { OddsChange } from './PartyOdds';
import { lightsLine, stillNeeded } from './partyText';
import { Text } from './Text';
import { EmberButton, ItemSlot } from './ui';

type Props = {
  save: SaveData;
  party: string[];
  heroId: string;
  slot: GearSlot;
  groups: SocketGroup[];
  oddsOf: (save: SaveData, heroIds: string[]) => OddsJob;
  /** The party's odds now, for "before → after". */
  chance: number | null | undefined;
  /** Equips the piece: for good, taking it from another hero if needed. */
  onPick: (gearUid: string) => void;
  onClose: () => void;
};

const COLUMNS = 5;
const GAP = 10;

/** One blueprint in the Forge section: the piece with its gems and ▲, its tier, and each material held against needed. */
function ForgeRow({ choice, save, selected, onOpen }: { choice: ForgeChoice; save: SaveData; selected: boolean; onOpen: (anchor: PopupAnchor) => void }) {
  const wrapper = useRef<ComponentRef<typeof View>>(null);
  const name = tr(choice.item.name);
  const tier = t('crafting.tierShort', { tier: ROMAN[choice.tier - 1] });
  const ingredients = ingredientsOf(choice.cost, save);
  const short = ingredients.filter((i) => i.have < i.need);
  const label = [name, tier, choice.lights.length > 0 ? t('partyDialog.coversNeed') : null, short.length > 0 ? t('crafting.missing') : null]
    .filter(Boolean)
    .join(', ');
  return (
    <View ref={wrapper} collapsable={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => wrapper.current?.measureInWindow((x, y, width, height) => onOpen({ x, y, width, height }))}
        style={[styles.forgeRow, choice.unfit && styles.dim]}
      >
        <ItemSlot
          state={selected ? 'selected' : choice.craftable ? 'ready' : 'short'}
          emoji={choice.item.emoji}
          icon={choice.item.icon}
          mark={choice.lights.length > 0 ? 'up' : undefined}
          families={gearFamilyTags(choice.item)}
          size={56}
          accessibilityLabel={name}
        />
        <View style={styles.forgeText}>
          <View style={styles.forgeHead}>
            <Text style={styles.forgeName} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.forgeTier}>{tier}</Text>
          </View>
          <View style={styles.forgeCost}>
            {ingredients.map((ingredient) => (
              <ItemSlot
                key={ingredient.key}
                state={ingredient.have >= ingredient.need ? 'ready' : 'short'}
                emoji={ingredient.emoji}
                icon={ingredient.icon}
                count={`${ingredient.have}/${ingredient.need}`}
                size={44}
                accessibilityLabel={`${ingredient.label} ${ingredient.have}/${ingredient.need}`}
              />
            ))}
          </View>
          {short.length > 0 && (
            <Text style={styles.forgeShort}>
              {t('partyDialog.forgeShort', { list: short.map((i) => `${i.need - i.have} ${i.label}`).join(', ') })}
            </Text>
          )}
        </View>
      </Pressable>
    </View>
  );
}

/**
 * The gear picker for one hero's slot: the owned pieces as a grid (▲ lights a
 * need, "worn" on the current one, another hero's piece dimmed with their
 * name), then the picked piece's card: what it lights, stat and family
 * changes, and the odds before → after. Below them, the Forge section: the
 * blueprints for the slot, forged through the forge's own confirmation and
 * put straight on the hero.
 */
export function GearPicker({ save, party, heroId, slot, groups, oddsOf, chance, onPick, onClose }: Props) {
  const hero = save.heroes.find((h) => h.id === heroId)!;
  const short = useMemo(() => shortFamilies(groups), [groups]);
  const choices = useMemo(() => gearChoices(save, party, heroId, slot, short), [save, party, heroId, slot, short]);
  const forgeable = useMemo(() => forgeChoices(save, party, heroId, slot, short), [save, party, heroId, slot, short]);
  const craft = useGameStore((state) => state.craft);
  const forgeWithIngredient = useGameStore((state) => state.forgeWithIngredient);
  const [forging, setForging] = useState<{ pending: ForgePending & { kind: 'forge' }; anchor: PopupAnchor } | null>(null);
  const [selected, setSelected] = useState<string | null>(() => (choices.find((c) => !c.worn && !c.blocked) ?? choices[0])?.gear.uid ?? null);
  const choice = choices.find((c) => c.gear.uid === selected) ?? null;
  const job = useMemo(() => (choice?.after ? oddsOf(choice.after, party) : null), [choice, oddsOf, party]);
  const after = useOdds(job);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const size = Math.floor((width - 28 - GAP * (COLUMNS - 1)) / COLUMNS) - 4;
  const worn = choices.find((c) => c.worn);
  const sub = stillNeeded(groups);
  const lights = choice ? lightsLine(choice, groups) : '';
  const forge = () => {
    if (!forging) return;
    const { recipeId, ingredientId } = forging.pending;
    const result = ingredientId ? forgeWithIngredient(recipeId, ingredientId) : craft(recipeId);
    setForging(null);
    if (result) onPick(result.gear.uid);
  };

  return (
    <Overlay onClose={onClose} position="bottom">
      <View style={[styles.sheet, { height: height - insets.top - 96, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            {worn && <GameIcon emoji={worn.item.emoji} icon={gearIconOf(worn.gear)} size={34} />}
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>{`${hero.name} · ${t(`hero.slots.${slot}`)}`}</Text>
            {sub && <Text style={styles.sub}>{sub}</Text>}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
          <Text style={styles.cap}>{t(`partyDialog.yours.${slot}`)}</Text>
          {choices.length === 0 && <Text style={styles.empty}>{t('equip.empty')}</Text>}
          <View style={styles.grid}>
            {choices.map((c) => {
              const tag = c.worn ? t('partyDialog.worn') : c.holder ? c.holder.name : null;
              const label = [
                gearName(c.gear),
                ...gearFamilyTags(c.item, c.gear.relicId).map((f) => tr(familyById[f.family].name)),
                c.lights.length > 0 ? t('partyDialog.coversNeed') : null,
                c.worn ? t('partyDialog.wornNow') : c.holder ? t('partyDialog.wornBy', { name: c.holder.name }) : null,
                selected === c.gear.uid ? t('partyDialog.selected') : null,
              ]
                .filter(Boolean)
                .join(', ');
              return (
                <View key={c.gear.uid} style={(c.holder || c.unfit) && !c.worn ? styles.dim : undefined}>
                  <ItemSlot
                    state={selected === c.gear.uid ? 'selected' : 'ready'}
                    emoji={c.item.emoji}
                    icon={gearIconOf(c.gear)}
                    legendary={c.gear.rarity === 'legendary'}
                    mark={c.lights.length > 0 ? 'up' : undefined}
                    families={gearFamilyTags(c.item, c.gear.relicId)}
                    size={size}
                    onPress={() => setSelected(c.gear.uid)}
                    accessibilityLabel={label}
                    style={c.worn ? styles.worn : undefined}
                  />
                  {tag && (
                    <Text style={styles.tagline} numberOfLines={1} pointerEvents="none">
                      {tag}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
          {short.length > 0 && <Text style={styles.footnote}>{t('partyDialog.legend')}</Text>}
          {choice && (
            <GearCard
              gear={choice.gear}
              compare={{ save, heroId, slot }}
              lines={choice.blocked ? [{ tone: 'bad', text: t('partyDialog.cannot', { name: hero.name }) }] : undefined}
            >
              {lights !== '' && (
                <View style={styles.lightsRow}>
                  {choice.lights[0] && (
                    <View style={styles.lightsIcon}>
                      <GameIcon emoji={familyById[choice.lights[0]].emoji} icon={familyById[choice.lights[0]].icon} size={20} />
                    </View>
                  )}
                  <Text style={[styles.lights, choice.lights.length > 0 && styles.good]}>{lights}</Text>
                </View>
              )}
              {choice.holder && !choice.worn && <Text style={styles.line}>{t('partyDialog.takesFrom', { name: choice.holder.name })}</Text>}
              {!choice.worn && !choice.blocked && <OddsChange before={chance} after={after} />}
            </GearCard>
          )}
          {forgeable.length > 0 && (
            <>
              <Text style={styles.cap}>{t('partyDialog.forge')}</Text>
              {forgeable.map((f) => (
                <ForgeRow
                  key={f.recipeId}
                  choice={f}
                  save={save}
                  selected={forging?.pending.recipeId === f.recipeId}
                  onOpen={(anchor) => setForging({ pending: { kind: 'forge', recipeId: f.recipeId, ingredientId: null }, anchor })}
                />
              ))}
            </>
          )}
        </ScrollView>
        <View style={styles.footer}>
          <EmberButton
            title={choice?.worn ? t('partyDialog.wornNow') : t('partyDialog.equipOn', { name: hero.name })}
            disabled={!choice || choice.worn || choice.blocked}
            onPress={() => choice && onPick(choice.gear.uid)}
          />
        </View>
      </View>
      {forging && (
        <ForgeConfirmDialog
          save={save}
          pending={forging.pending}
          anchor={forging.anchor}
          onPickIngredient={(ingredientId) => setForging((current) => current && { ...current, pending: { ...current.pending, ingredientId } })}
          onConfirm={forge}
          onClose={() => setForging(null)}
        />
      )}
    </Overlay>
  );
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: ui.woodDark, borderTopWidth: 3, borderTopColor: ui.outline },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: ui.woodMid,
    borderBottomWidth: 3,
    borderBottomColor: ui.outline,
  },
  headerIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: ui.woodDeep, borderWidth: 2, borderColor: ui.brass },
  headerText: { flex: 1 },
  title: { fontFamily: fonts.body, fontSize: 23, lineHeight: 25, color: ui.brassLight },
  sub: { fontFamily: fonts.serif, fontSize: 14, color: ui.onWoodMuted },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 20, color: ui.brassLight },
  scroll: { flex: 1 },
  body: { padding: 14, gap: 12 },
  cap: { fontFamily: fonts.body, fontSize: 17, letterSpacing: 1, color: ui.onWoodMuted },
  empty: { fontFamily: fonts.serif, fontSize: 14, color: ui.onWoodMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  dim: { opacity: 0.55 },
  worn: { borderColor: ui.brass },
  tagline: {
    position: 'absolute',
    top: 5,
    left: 2,
    right: 2,
    textAlign: 'center',
    fontFamily: fonts.body,
    fontSize: 12,
    color: ui.brassLight,
    textShadowColor: ui.outline,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
  footnote: { fontFamily: fonts.serif, fontSize: 14, color: ui.onWoodMuted },
  lightsRow: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 8 },
  lightsIcon: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: ui.woodDeep, borderWidth: 2, borderColor: ui.brass },
  lights: { flex: 1, fontFamily: fonts.serifBold, fontSize: 15, color: ui.inkMuted },
  good: { color: ui.good },
  line: { fontFamily: fonts.serif, fontSize: 15, color: ui.inkMuted },
  forgeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 8, backgroundColor: ui.woodMid, borderWidth: 2, borderColor: ui.outline },
  forgeText: { flex: 1, gap: 6 },
  forgeHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  forgeName: { flexShrink: 1, fontFamily: fonts.body, fontSize: 18, color: ui.brassLight },
  forgeTier: { fontFamily: fonts.serif, fontSize: 13, color: ui.onWoodMuted },
  forgeCost: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  forgeShort: { fontFamily: fonts.serif, fontSize: 13, color: ui.emberLight },
  footer: { padding: 12, backgroundColor: ui.woodMid, borderTopWidth: 3, borderTopColor: ui.outline },
});
