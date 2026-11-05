import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { affixById } from '@/content/affixes';
import { elementInfo } from '@/content/elements';
import { gearRules, rarityNames } from '@/content/gear';
import { gearName, itemById, materialById } from '@/content/lookup';
import { canApplyStone, stonePreview } from '@/game/crafting/infusion';
import { ELEMENTS, type Element } from '@/game/elements';
import { hasMaterials } from '@/game/inventory';
import { canReroll, rerollCost } from '@/game/forging/reroll';
import { wornBy } from '@/game/forging/salvage';
import { isAway } from '@/game/team/team';
import type { SaveData } from '@/game/save';
import type { GearDef, GearInstance } from '@/game/types';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors, fonts, ui } from '@/theme';

import { affixLine, affixName, affixRangeLine } from './affixText';
import { Button } from './Button';
import { Overlay } from './Overlay';
import { Panel } from './Panel';
import { Price } from './Price';
import { Text } from './Text';
import { DiamondButton, EmberButton, ItemSlot, ParchmentCard } from './ui';

const elementName = (element: Element) => tr(elementInfo[element].name);

/** The affix a stone of `element` adds to a piece like this: Infused on weapons, Warding elsewhere. */
function stoneAffixId(item: GearDef, element: Element): string {
  return `${item.slot === 'weapon' ? 'infused' : 'warding'}${element[0].toUpperCase()}${element.slice(1)}`;
}

/** The affix line as the stone promises it: at its rolled range, or fixed without a value. */
function stoneAffixLine(item: GearDef, element: Element): string {
  const id = stoneAffixId(item, element);
  const range = affixById[id]?.range;
  return range ? affixRangeLine(id, range.min, range.max) : affixLine({ id, value: 0 });
}

/** The hero away on an expedition wearing this piece, which is why the rework blocks. */
function awayHolder(save: SaveData, gearUid: string) {
  const holder = wornBy(save, gearUid);
  return holder && isAway(save, holder.id) ? holder : null;
}

/** Why the reroll is blocked right now, shown beside the hint that all affixes change. */
function rerollBlockedReason(save: SaveData, gear: GearInstance): string | null {
  if (canReroll(save, gear.uid)) return null;
  if (awayHolder(save, gear.uid)) return t('crafting.rework.away');
  if (!hasMaterials(save.materials, rerollCost(gear).materials)) return t('crafting.rework.noMaterials');
  return t('crafting.rework.noGold');
}

/** The forge's Rework page: stones restyle a plain piece's element, rerolls reforge its affixes. */
export function ReworkStation() {
  const save = useGameStore((state) => state.save);
  const applyStone = useGameStore((state) => state.applyStone);
  const rerollPiece = useGameStore((state) => state.reroll);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [element, setElement] = useState<Element | null>(null);
  const [confirming, setConfirming] = useState<null | 'stone' | 'reroll'>(null);
  const [contentWidth, setContentWidth] = useState(0);
  // Weapons lead the grid; everything else keeps the order it was forged in.
  const gear = [...save.gear].sort(
    (a, b) => (itemById[a.itemId].slot === 'weapon' ? 0 : 1) - (itemById[b.itemId].slot === 'weapon' ? 0 : 1),
  );
  const selected = gear.find((one) => one.uid === selectedUid) ?? null;

  const selectGear = (uid: string) => {
    setSelectedUid(uid);
    setConfirming(null);
    setElement(ELEMENTS.find((one) => canApplyStone(save, uid, one)) ?? null);
  };

  // Each slot is wrapped in a 2 px ring, so its face is 4 px narrower than its cell.
  const cell = contentWidth > 0 ? Math.floor((contentWidth - 4 * 6) / 5) - 4 : 0;

  return (
    <View style={styles.content} onLayout={({ nativeEvent }) => setContentWidth(nativeEvent.layout.width)}>
      <Text style={styles.sectionTitle}>{t('crafting.gearTitle')}</Text>
      {save.gear.length === 0 || cell <= 0 ? (
        <Text style={styles.empty}>{t('crafting.noGear')}</Text>
      ) : (
        <View style={styles.grid}>
          {gear.map((one) => {
            const item = itemById[one.itemId];
            const holder = wornBy(save, one.uid);
            return (
              <View key={one.uid} style={styles.cell}>
                <ItemSlot
                  state={one.uid === selectedUid ? 'selected' : 'ready'}
                  emoji={item.emoji}
                  icon={item.icon}
                  size={cell}
                  equipped={!!holder}
                  accessibilityLabel={holder ? `${gearName(one)}, ${t('common.wornBy', { name: holder.name })}` : gearName(one)}
                  onPress={() => selectGear(one.uid)}
                />
              </View>
            );
          })}
        </View>
      )}

      {selected && cell > 0 && (
        <ReworkCard
          save={save}
          gear={selected}
          element={element}
          onElement={(one) => canApplyStone(save, selected.uid, one) && setElement(one)}
          onStone={() => setConfirming('stone')}
          onReroll={() => setConfirming('reroll')}
        />
      )}

      {selected && confirming === 'stone' && (
        <ConfirmOverlay
          title={t('crafting.rework.applyTitle')}
          actionTitle={t('crafting.rework.apply')}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            if (element && canApplyStone(save, selected.uid, element)) applyStone(selected.uid, element);
            setConfirming(null);
          }}
        />
      )}
      {selected && confirming === 'reroll' && (
        <ConfirmOverlay
          title={t('crafting.rework.rerollTitle')}
          detail={t('crafting.rework.rerollAll')}
          actionTitle={t('crafting.rework.reroll')}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            rerollPiece(selected.uid);
            setConfirming(null);
          }}
        />
      )}
    </View>
  );
}

/** The chosen piece: its rarity and affixes, with a stone's element and a reroll of everything. */
function ReworkCard({
  save,
  gear,
  element,
  onElement,
  onStone,
  onReroll,
}: {
  save: SaveData;
  gear: GearInstance;
  element: Element | null;
  onElement: (element: Element) => void;
  onStone: () => void;
  onReroll: () => void;
}) {
  const item = itemById[gear.itemId] as GearDef;
  const holder = wornBy(save, gear.uid);
  const takesStone = item.slot !== 'trinket';
  const preview = takesStone && element ? stonePreview(save, gear.uid, element) : null;
  const cost = rerollCost(gear);
  const blocked = rerollBlockedReason(save, gear);
  return (
    <ParchmentCard
      title={gearName(gear)}
      titleEmoji={item.emoji}
      titleIcon={item.icon}
      titleSub={holder ? t('common.wornBy', { name: holder.name }) : undefined}
      style={styles.card}
    >
      <>
        <Text style={[styles.rarity, { color: gearRules.colors[gear.rarity] }]}>{tr(rarityNames[gear.rarity])}</Text>
        {gear.affixes.map((affix) => (
          <Text key={affix.id} style={styles.affix}>
            {affixLine(affix)}
          </Text>
        ))}

        {takesStone && (
          <>
            <Text style={styles.blockTitle}>{t('crafting.stonesTitle')}</Text>
            <View style={styles.elementRow}>
              {ELEMENTS.map((one) => (
                <DiamondButton
                  key={one}
                  label={elementName(one)}
                  emoji={elementInfo[one].emoji}
                  selected={element === one}
                  disabled={!canApplyStone(save, gear.uid, one)}
                  showLabel={false}
                  accessibilityLabel={elementName(one)}
                  onPress={() => onElement(one)}
                />
              ))}
            </View>
            {element && preview?.kind === 'add' && (
              <Text style={styles.detail}>{t('crafting.rework.stoneAdds', { affix: stoneAffixLine(item, element) })}</Text>
            )}
            {element && preview?.kind === 'replace' && (
              <>
                <Text style={styles.detail}>{t('crafting.rework.stoneReplaces')}</Text>
                <Text style={styles.detail}>{preview.candidates.map(affixName).join(' · ')}</Text>
              </>
            )}
            <EmberButton
              title={t('crafting.rework.applyStone', { element: element ? elementName(element) : '' })}
              disabled={!element || !canApplyStone(save, gear.uid, element)}
              onPress={onStone}
            />
          </>
        )}

        <Text style={styles.blockTitle}>{t('crafting.rework.reroll')}</Text>
        {gear.rarity === 'common' ? (
          <Text style={styles.hint}>{t('crafting.rework.rerollOnly')}</Text>
        ) : (
          <>
            {cost.materials.map(({ materialId, amount }) => (
              <Text key={materialId} style={styles.detail}>
                {t('crafting.confirmLine', {
                  name: tr(materialById[materialId].name),
                  needed: amount,
                  held: save.materials[materialId] ?? 0,
                  remaining: Math.max(0, (save.materials[materialId] ?? 0) - amount),
                })}
              </Text>
            ))}
            <Price amount={cost.gold} short={save.gold < cost.gold} />
            <Text style={styles.hint}>{t('crafting.rework.rerollAll')}</Text>
            {gear.rerolls > 0 && <Text style={styles.hint}>{t('crafting.rework.rerollCount', { count: gear.rerolls })}</Text>}
            {blocked && <Text style={styles.reason}>{blocked}</Text>}
            <EmberButton title={t('crafting.rework.reroll')} disabled={!canReroll(save, gear.uid)} onPress={onReroll} />
          </>
        )}
      </>
    </ParchmentCard>
  );
}

/** The last ask before a stone is applied or a reroll happens: Cancel does nothing, the action goes through. */
function ConfirmOverlay({ title, detail, actionTitle, onCancel, onConfirm }: { title: string; detail?: string; actionTitle: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Overlay onClose={onCancel}>
      <Panel style={styles.dialog}>
        <Text style={styles.dialogTitle}>{title}</Text>
        {detail ? <Text>{detail}</Text> : null}
        <View style={styles.dialogActions}>
          <Button title={t('common.cancel')} color={colors.muted} onPress={onCancel} />
          <Button title={actionTitle} onPress={onConfirm} />
        </View>
      </Panel>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  content: { gap: 8 },
  sectionTitle: { fontSize: 20, fontFamily: fonts.body, color: ui.brassLight },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: { position: 'relative' },
  empty: { color: ui.onWoodMuted },
  card: { marginTop: 6, alignItems: 'stretch', gap: 4 },
  rarity: { fontSize: 16, textTransform: 'uppercase', textAlign: 'center' },
  affix: { fontFamily: fonts.serif, fontSize: 14, color: ui.ink, textAlign: 'center' },
  blockTitle: { fontFamily: fonts.serifBold, fontSize: 14, color: ui.inkMuted, marginTop: 4, textAlign: 'center' },
  elementRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 6 },
  detail: { fontFamily: fonts.serif, fontSize: 14, color: ui.ink, textAlign: 'center' },
  hint: { fontFamily: fonts.serif, fontSize: 13, color: ui.inkMuted, textAlign: 'center' },
  reason: { fontFamily: fonts.serif, fontSize: 13, color: ui.bad, textAlign: 'center' },
  dialog: { gap: 10, padding: 14 },
  dialogTitle: { fontSize: 20, textAlign: 'center' },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
});
