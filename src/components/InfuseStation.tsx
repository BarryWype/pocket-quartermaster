import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { elementInfo, elementRules } from '@/content/elements';
import { salvageRules } from '@/content/forging';
import { gearName, itemById } from '@/content/lookup';
import { canInfuse } from '@/game/crafting/infusion';
import { ELEMENTS, shardId, stoneId, type Element } from '@/game/elements';
import { wornBy } from '@/game/forging/salvage';
import type { SaveData } from '@/game/save';
import type { GearInstance } from '@/game/types';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { fonts, ui } from '@/theme';

import { GameIcon } from './GameIcon';
import { Text } from './Text';
import { DiamondButton, EmberButton, ItemSlot, ParchmentCard } from './ui';

const elementName = (element: Element) => tr(elementInfo[element].name);
/** The element that beats this one, for the weak half of the effect line. */
const beaterOf = (element: Element) => ELEMENTS.find((one) => elementRules.beats[one] === element)!;

/** Infuse plain gear with an elemental stone. Unwanted gear is salvaged from the Inventory. */
export function InfuseStation() {
  const save = useGameStore((state) => state.save);
  const infuse = useGameStore((state) => state.infuse);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [element, setElement] = useState<Element | null>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const stonesOf = (e: Element) => save.materials[stoneId(e)] ?? 0;
  const anyStones = ELEMENTS.some((e) => stonesOf(e) > 0);
  // Weapons lead the grid; everything else keeps the order it was forged in.
  const gear = [...save.gear].sort(
    (a, b) => (itemById[a.itemId].slot === 'weapon' ? 0 : 1) - (itemById[b.itemId].slot === 'weapon' ? 0 : 1),
  );
  const selected = gear.find((one) => one.uid === selectedUid) ?? null;

  const selectGear = (uid: string) => {
    setSelectedUid(uid);
    setElement(ELEMENTS.find((one) => canInfuse(save, uid, one)) ?? null);
  };

  // Each slot is wrapped in a 2 px ring, so its face is 4 px narrower than its cell.
  const cell = contentWidth > 0 ? Math.floor((contentWidth - 4 * 6) / 5) - 4 : 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      onLayout={({ nativeEvent }) => setContentWidth(nativeEvent.layout.width - 24)}
    >
      <Text style={styles.sectionTitle}>{t('crafting.stonesTitle')}</Text>
      {cell > 0 && (
        <View style={styles.grid}>
          {ELEMENTS.map((one) => {
            const held = stonesOf(one);
            return (
              <View key={one} style={styles.stoneCell}>
                <ItemSlot
                  state="ready"
                  faded={held === 0}
                  emoji={elementInfo[one].emoji}
                  count={held}
                  size={cell}
                  accessibilityLabel={elementName(one)}
                />
                <Text style={[styles.stoneName, held === 0 && styles.stoneNameMuted]}>{elementName(one)}</Text>
                <Text style={styles.shards}>
                  {t('crafting.shards', { held: save.materials[shardId(one)] ?? 0, per: elementRules.shardsPerStone })}
                </Text>
              </View>
            );
          })}
        </View>
      )}
      <Text style={styles.hint}>
        {anyStones
          ? t('crafting.stonesHint', { per: elementRules.shardsPerStone })
          : t('crafting.noStones')}
      </Text>

      <Text style={styles.sectionTitle}>{t('crafting.gearTitle')}</Text>
      {save.gear.length === 0 ? (
        <Text style={styles.empty}>{t('crafting.noGear')}</Text>
      ) : (
        cell > 0 && (
          <View style={styles.grid}>
            {gear.map((one) => {
              const item = itemById[one.itemId];
              const holder = wornBy(save, one.uid);
              const label = [
                gearName(one),
                holder ? t('common.wornBy', { name: holder.name }) : null,
                one.element ? t('crafting.infusedWith', { element: elementName(one.element) }) : null,
              ]
                .filter(Boolean)
                .join(', ');
              return (
                <View key={one.uid} style={styles.cell}>
                  <ItemSlot
                    state={one.uid === selectedUid ? 'selected' : 'ready'}
                    emoji={item.emoji}
                    icon={item.icon}
                    size={cell}
                    equipped={!!holder}
                    accessibilityLabel={label}
                    onPress={() => selectGear(one.uid)}
                  />
                  {one.element && (
                    <View style={styles.infusedMark} pointerEvents="none">
                      <GameIcon emoji={elementInfo[one.element].emoji} size={13} />
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )
      )}

      {selected && cell >= 0 && (
        <SelectedGearCard
          save={save}
          gear={selected}
          element={element}
          onElement={(one) => canInfuse(save, selected.uid, one) && setElement(one)}
          onInfuse={() => {
            if (element && canInfuse(save, selected.uid, element)) infuse(selected.uid, element);
          }}
        />
      )}
    </ScrollView>
  );
}

/** The chosen piece: its wearer, the element choice (or its element), the effect line and Infuse. */
function SelectedGearCard({
  save,
  gear,
  element,
  onElement,
  onInfuse,
}: {
  save: SaveData;
  gear: GearInstance;
  element: Element | null;
  onElement: (element: Element) => void;
  onInfuse: () => void;
}) {
  const item = itemById[gear.itemId];
  const holder = wornBy(save, gear.uid);
  const chosen = gear.element ?? element;
  const infusedSub = gear.element
    ? t('crafting.infusedWith', { element: elementName(gear.element) })
    : t('crafting.notInfused');
  const stonesOf = (one: Element) => save.materials[stoneId(one)] ?? 0;
  return (
    <ParchmentCard
      title={gearName(gear)}
      titleEmoji={item.emoji}
      titleIcon={item.icon}
      titleSub={[holder ? t('common.wornBy', { name: holder.name }) : null, infusedSub].filter(Boolean).join(' · ')}
      style={styles.card}
    >
      {gear.element ? (
        <View style={styles.elementRow}>
          <GameIcon emoji={elementInfo[gear.element].emoji} size={20} />
          <Text style={styles.elementChosen}>{elementName(gear.element)}</Text>
        </View>
      ) : (
        <>
          <Text style={styles.chooseLabel}>{t('crafting.chooseElement')}</Text>
          <View style={styles.elementRow}>
            {ELEMENTS.map((one) => {
              const held = stonesOf(one) > 0;
              return (
                <DiamondButton
                  key={one}
                  label={elementName(one)}
                  emoji={elementInfo[one].emoji}
                  selected={element === one}
                  disabled={!held || !canInfuse(save, gear.uid, one)}
                  showLabel={false}
                  accessibilityLabel={held ? elementName(one) : `${elementName(one)}, ${t('crafting.noStone')}`}
                  onPress={() => onElement(one)}
                />
              );
            })}
          </View>
        </>
      )}
      {chosen && item.slot === 'weapon' && (
        <Text style={styles.effect}>
          <Text style={styles.effectElement}>{elementName(chosen)}</Text>
          {'\n'}
          <Text style={styles.effectGood}>
            {t('crafting.effectStrong', { mult: elementRules.strongMultiplier, target: elementName(elementRules.beats[chosen]) })}
          </Text>
          {' · '}
          <Text style={styles.effectBad}>
            {t('crafting.effectWeak', { mult: elementRules.weakMultiplier, target: elementName(beaterOf(chosen)) })}
          </Text>
        </Text>
      )}
      {chosen && item.slot === 'armor' && (
        <Text style={styles.effect}>
          <Text style={styles.effectElement}>{elementName(chosen)}</Text>
          {'\n'}
          <Text style={styles.effectGood}>
            {t('crafting.effectArmour', { mult: elementRules.armourMultiplier, target: elementName(chosen) })}
          </Text>
        </Text>
      )}
      <Text style={styles.salvageNote}>
        {t('crafting.salvageNote', { back: salvageRules.infusedShards, per: elementRules.shardsPerStone })}
      </Text>
      {!gear.element && (
        <EmberButton
          title={t('crafting.infuseStone', { element: element ? elementName(element) : '' })}
          disabled={!element || !canInfuse(save, gear.uid, element)}
          onPress={onInfuse}
        />
      )}
    </ParchmentCard>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.woodDark },
  content: { paddingVertical: 14, paddingHorizontal: 12, gap: 8 },
  sectionTitle: { fontSize: 20, fontFamily: fonts.body, color: ui.brassLight },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: { position: 'relative' },
  stoneCell: { alignItems: 'center', gap: 2 },
  stoneName: { fontFamily: fonts.serifBold, fontSize: 12, color: ui.brassLight },
  stoneNameMuted: { color: ui.onWoodMuted },
  shards: { fontFamily: fonts.serif, fontSize: 11, color: ui.onWoodMuted },
  hint: { fontFamily: fonts.serif, fontSize: 13, color: ui.onWoodMuted, paddingBottom: 4 },
  empty: { color: ui.onWoodMuted },
  card: { marginTop: 6 },
  infusedMark: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.woodDeep,
    borderWidth: 2,
    borderColor: ui.outline,
  },
  chooseLabel: { fontFamily: fonts.serifBold, fontSize: 14, color: ui.inkMuted },
  elementRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  elementChosen: { fontFamily: fonts.serifBold, fontSize: 16, color: ui.keyword },
  effect: { textAlign: 'center', fontFamily: fonts.serif, fontSize: 14, color: ui.ink, paddingVertical: 4 },
  effectElement: { fontFamily: fonts.serifBold, fontSize: 17, color: ui.keyword },
  effectGood: { fontFamily: fonts.serifBold, fontSize: 14, color: ui.good },
  effectBad: { fontFamily: fonts.serifBold, fontSize: 14, color: ui.bad },
  salvageNote: { textAlign: 'center', fontFamily: fonts.serif, fontSize: 13, color: ui.inkMuted, paddingBottom: 8 },
});
