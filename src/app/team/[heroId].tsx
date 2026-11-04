import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';

import { DELTA_KEYS, EquipPicker } from '@/components/EquipPicker';
import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { statIcons } from '@/components/GearRow';
import { GameIcon } from '@/components/GameIcon';
import { IconLabel } from '@/components/IconLabel';
import { HpBar } from '@/components/HpBar';
import { PixelBar } from '@/components/PixelBar';
import { Text } from '@/components/Text';
import { Tip } from '@/components/Tip';
import { TutorialHint } from '@/components/TutorialHint';
import { AnchoredPopup, Chip, Deferred, GhostScreen, ItemPopup, ItemSlot, ScreenHeader, SwipeTabs, WoodButton, WoodPanel, type PopupAnchor, type PopupLine } from '@/components/ui';
import { abilityText } from '@/content/abilities';
import { clockConfig } from '@/content/clockConfig';
import { elementInfo } from '@/content/elements';
import { expeditionRules } from '@/content/dungeons';
import { approachRules } from '@/content/threats';
import { slotProblem } from '@/game/equipment/slots';
import { gearApproachBonus, approachScore, pendingApproachPicks } from '@/game/team/stats';
import { heroClasses, xpRules, xpToNextLevel } from '@/content/heroes';
import { lootConfig } from '@/content/loot/config';
import { traitById } from '@/content/traits';
import { systemIcons } from '@/content/systemIcons';
import { items } from '@/content/items';
import { gearName, itemById } from '@/content/lookup';
import { answersMemberOf, prepareParty } from '@/game/expeditions/simulate';
import { highestUnlockedTier } from '@/game/dungeons/unlock';
import { careProblem, drinkProblem } from '@/game/team/health';
import { affinityOf, canDismiss, equip, equipPreview, gearKeywordsOf, hasPotionSlot, healingPotion, heroDamageStat, heroStats, isOnExpedition, statSources, upgradeMark } from '@/game/team/team';
import { ClassSummary } from '@/components/ClassSummary';
import { SpecialLabel } from '@/components/SpecialLabel';
import { APPROACHES, heroAnswers } from '@/game/threats/answers';
import type { Approach, EquipmentSlot, GearDef, GearInstance, HeroState, Stats } from '@/game/types';
import type { SaveData } from '@/game/save';
import { useLanguage } from '@/hooks/useLanguage';
import { useNow } from '@/hooks/useNow';
import { t, tr, type Vars } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { fonts, ui } from '@/theme';
import { timed } from '@/components/timed';

const GEAR_SLOTS = ['weapon', 'armor', 'offhand', 'trinket'] as const;

/** Localized threat names for each approach's tip, by the threats it answers. */
const approachTipVars = (approach: Approach): Vars =>
  ({
    might: { rubble: tr('Rubble'), locked: tr('Locked'), locals: tr('Locals') },
    finesse: { traps: tr('Traps'), locked: tr('Locked'), thieves: tr('Thieves') },
    wits: { puzzle: tr('Puzzle'), maze: tr('Maze'), underwater: tr('Underwater') },
    faith: { desecrated: tr('Desecrated ground'), casters: tr('Casters') },
    presence: { locals: tr('Locals') },
  })[approach];

/**
 * The stack header with the hero's name and the prev/next arrows. Rendered
 * beside the ghost too, outside the deferred content, so the header is right
 * on the first frame.
 */
function HeroHeader({ heroId }: { heroId: string }) {
  const save = useGameStore((state) => state.save);
  const hero = save.heroes.find((h) => h.id === heroId);
  const index = save.heroes.findIndex((h) => h.id === heroId);
  const gotoHero = (delta: number) => {
    const target = save.heroes[(index + delta + save.heroes.length) % save.heroes.length];
    router.setParams({ heroId: target.id });
  };
  return (
    <Stack.Screen
      options={{
        header: () => (
          <ScreenHeader
            title={hero?.name ?? ''}
            right={
              save.heroes.length > 1 ? (
                <View style={styles.navRow}>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('hero.previous')} onPress={() => gotoHero(-1)} style={styles.navButton}>
                    <View style={styles.navRim} pointerEvents="none" />
                    <Text style={styles.navGlyph}>‹</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('hero.next')} onPress={() => gotoHero(1)} style={styles.navButton}>
                    <View style={styles.navRim} pointerEvents="none" />
                    <Text style={styles.navGlyph}>›</Text>
                  </Pressable>
                </View>
              ) : undefined
            }
          />
        ),
      }}
    />
  );
}

/** A stat tile: the name, the value, and a tap that shows where the value comes from. */
function StatTile({ stat, value, text, small }: { stat: keyof Stats; value: number; text: string; small?: boolean }) {
  return (
    <Tip title={t(`hero.statNames.${stat}`)} text={text} style={small ? styles.smallStat : styles.stat}>
      <GameIcon emoji={statIcons[stat]} icon={systemIcons[statIcons[stat]]} size={small ? 16 : 22} />
      <View style={small ? styles.smallStatBody : undefined}>
        <Text style={small ? styles.smallStatName : styles.statName} numberOfLines={small ? 1 : undefined} adjustsFontSizeToFit={small}>
          {t(`hero.statNames.${stat}`)}
        </Text>
        <Text style={small ? styles.smallStatValue : styles.statValue}>{value}</Text>
      </View>
    </Tip>
  );
}

function CharacterSheetScreen() {
  const { heroId } = useLocalSearchParams<{ heroId: string }>();
  return (
    <>
      <HeroHeader heroId={heroId} />
      <Deferred name="hero" ghost={<GhostScreen variant="hero" />}>
        <CharacterSheetContent heroId={heroId} />
      </Deferred>
    </>
  );
}

function CharacterSheetContent({ heroId }: { heroId: string }) {
  useLanguage();
  const save = useGameStore((state) => state.save);
  const equipAction = useGameStore((state) => state.equip);
  const dismiss = useGameStore((state) => state.dismissHero);
  const drinkPotion = useGameStore((state) => state.drinkPotion);
  const giveHomeCare = useGameStore((state) => state.giveHomeCare);
  const pickApproach = useGameStore((state) => state.pickApproach);
  // Button enablement (potions, home care) turns on time, so the clock is coarse.
  const now = useNow(clockConfig.minutesMs);
  const [picking, setPicking] = useState<EquipmentSlot | null>(null);
  /** The storeroom piece being compared, and where its slot sits on screen. */
  /** The storeroom's folded slot sections, kept while the screen is open. */
  const [collapsed, setCollapsed] = useState<(typeof GEAR_SLOTS)[number][]>([]);
  const [compare, setCompare] = useState<{ gear: GearInstance; slot: (typeof GEAR_SLOTS)[number]; anchor: PopupAnchor } | null>(null);
  const [contentWidth, setContentWidth] = useState(0);

  const hero = save.heroes.find((h) => h.id === heroId);
  if (!hero) return <PlaceholderScreen title={t('hero.unknown')} description={t('hero.unknownHint')} />;

  const heroClass = heroClasses[hero.classId];
  const stats = heroStats(save, hero);
  const damageStat = heroDamageStat(save, hero);
  const away = isOnExpedition(save, hero.id);
  const escort = save.escort?.heroId === hero.id;
  const onPatrol = save.patrolFights.some((fight) => fight.heroIds.includes(hero.id));
  const pending = pendingApproachPicks(hero);
  const largeStats = ['hp', damageStat, 'armour', 'speed'] as const;
  const potionsHeld = items
    .filter((item) => healingPotion(item.id))
    .map((item) => ({ item, count: (save.consumables[item.id] ?? 0) + (hero.equipment.consumable === item.id ? 1 : 0) }))
    .filter(({ count }) => count > 0);
  const smallStats = ['resistance', 'evasion', 'crit', 'luck'] as const;
  const trait = traitById[hero.trait];
  // The hero as equipped, seen through the threats rules; the kit keyword is
  // left out here because it only counts on the threats the kit covers.
  const member = prepareParty(save, [hero.id], now)[0];
  const answers = member ? heroAnswers(answersMemberOf(member), null) : null;
  const keywords = (answers?.keywords ?? []).filter((k) => k.source !== 'kit');
  const element = heroClass.element ? elementInfo[heroClass.element] : null;
  const next = xpToNextLevel(hero.level);
  /** The hero's progress to the next level, 1 when there is none left to gain. */
  const xpShare = next ? hero.xp / next : 1;
  const aboveBand = hero.level >= lootConfig.manuals.topLevelByTier[highestUnlockedTier(save) - 1] + xpRules.aboveBandMargin;
  const confirmDismiss = () =>
    Alert.alert(t('hero.dismissTitle', { name: hero.name }), t('hero.dismissBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('hero.dismiss'),
        style: 'destructive',
        onPress: () => {
          router.back();
          dismiss(hero.id);
        },
      },
    ]);

  /** One gear piece that fits this hero's gear slots, if another hero does not have it out. */
  const storeroomPieces = save.gear.flatMap((gear) => {
    const item = itemById[gear.itemId] as GearDef;
    if (!GEAR_SLOTS.includes(item.slot as (typeof GEAR_SLOTS)[number])) return [];
    if (GEAR_SLOTS.some((slot) => hero.equipment[slot] === gear.uid)) return [];
    const holder = save.heroes.find((h) => h.id !== hero.id && GEAR_SLOTS.some((slot) => h.equipment[slot] === gear.uid));
    if (holder && save.expeditions.some((e) => e.heroIds.includes(holder.id))) return [];
    return [{ gear, item, equipped: !!holder }];
  });

  const weaponGear = hero.equipment.weapon ? save.gear.find((g) => g.uid === hero.equipment.weapon) : undefined;
  const offhandLocked = !!weaponGear && (itemById[weaponGear.itemId] as GearDef).twoHanded;

  /** What a doll slot holds: ready with the item, empty, or locked under a two-handed weapon. */
  const dollSlot = (slot: EquipmentSlot) => {
    const id = hero.equipment[slot];
    const locked = slot === 'offhand' && offhandLocked;
    if (slot === 'consumable' || slot === 'potion') {
      const item = id ? itemById[id] : undefined;
      return {
        state: locked ? ('locked' as const) : id ? ('ready' as const) : ('empty' as const),
        emoji: item?.emoji,
        icon: item?.icon,
        mark: undefined,
        label: `${t(`hero.slots.${slot}`)}${item ? `: ${tr(item.name)}` : ''}`,
      };
    }
    const gear = id ? save.gear.find((g) => g.uid === id) : undefined;
    const item = gear ? (itemById[gear.itemId] as GearDef) : undefined;
    const affinity = item ? affinityOf(hero.classId, item.gearType) : 'usable';
    return {
      state: locked ? ('locked' as const) : gear ? ('ready' as const) : ('empty' as const),
      emoji: item?.emoji,
      icon: item?.icon,
      mark: affinity === 'favoured' ? ('up' as const) : affinity === 'unfit' ? ('down' as const) : undefined,
      label: `${t(`hero.slots.${slot}`)}${gear ? `: ${gearName(gear)}` : ''}`,
    };
  };

  const summaryPage = (
    <ScrollView contentContainerStyle={styles.page}>
      <TutorialHint screen="hero" />
      <View style={styles.identity}>
        <View style={styles.portrait}>
          <View style={styles.portraitSeams} pointerEvents="none">
            {Array.from({ length: 6 }, (_, i) => (
              <View key={i} style={[styles.portraitSeam, { top: (i + 1) * 10 }]} />
            ))}
          </View>
          <View style={styles.portraitBrass} pointerEvents="none" />
          <GameIcon emoji={heroClass.emoji} icon={heroClass.icon} size={46} />
          <View style={styles.levelDiamond}>
            <View style={styles.levelDiamondFace}>
              <Text style={styles.levelText}>{hero.level}</Text>
            </View>
          </View>
        </View>
        <View style={styles.identityText}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{hero.name}</Text>
            {(away || escort || onPatrol) && (
              <Text style={styles.nameStatus}>
                {away ? t('common.onExpedition') : ''}
                {escort ? t('common.escort') : ''}
                {onPatrol ? t('common.patrol') : ''}
              </Text>
            )}
          </View>
          <View style={styles.classNameRow}>
            <Text style={styles.className}>{tr(heroClass.name)}</Text>
            {element && <IconLabel emoji={element.emoji} label={tr(element.name)} size={14} labelStyle={styles.className} />}
          </View>
          <View style={styles.traitRow}>
            {trait && (
              <Tip title={tr(trait.name)} text={tr(trait.description)} accessibilityLabel={tr(trait.name)}>
                <Chip tone={trait.positive ? 'good' : 'bad'} label={tr(trait.name)} />
              </Tip>
            )}
            <SpecialLabel classId={hero.classId} special={hero.special} />
          </View>
        </View>
      </View>
      <View style={styles.hpGap}>
        <HpBar save={save} hero={hero} inBar />
      </View>
      <Tip text={t('hero.xp', { xp: hero.xp, next })} accessibilityLabel={t('hero.xp', { xp: hero.xp, next })}>
        <PixelBar value={xpShare} overlay={`${Math.round(xpShare * 100)}%`} />
      </Tip>
      {aboveBand ? <Text style={styles.note}>{t('hero.xpAboveBand')}</Text> : null}
      {!away && (
        <View style={styles.drink}>
          {potionsHeld.length === 0 && <WoodButton title={t('health.drink', { count: 0 })} disabled onPress={() => {}} />}
          {potionsHeld.map(({ item, count }) => (
            <WoodButton
              key={item.id}
              emoji={item.emoji}
              icon={item.icon}
              title={t('health.use', { item: tr(item.name), count })}
              disabled={drinkProblem(save, hero.id, now, item.id) !== null}
              onPress={() => drinkPotion(hero.id, item.id)}
            />
          ))}
          <Text style={styles.note}>{t('health.drinkHint')}</Text>
          {items
            .filter((item) => item.slot === 'utility' && item.homeCare && (save.consumables[item.id] ?? 0) > 0)
            .map((item) => (
              <WoodButton
                key={item.id}
                emoji={item.emoji}
                icon={item.icon}
                title={t('health.use', { item: tr(item.name), count: save.consumables[item.id] })}
                disabled={careProblem(save, hero.id, item.id, now) !== null}
                onPress={() => giveHomeCare(hero.id, item.id)}
              />
            ))}
        </View>
      )}
      <ClassSummary classId={hero.classId} />
      {keywords.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.heading}>{t('hero.keywords')}</Text>
          <View style={styles.keywords}>
            {keywords.map(({ keyword }) => (
              <Tip key={keyword} title={t(`threats.keyword.${keyword}`)} text={t(`threats.keywordTip.${keyword}`)}>
                <Chip tone="keyword" label={t(`threats.keyword.${keyword}`)} />
              </Tip>
            ))}
          </View>
        </View>
      )}
      <View style={styles.section}>
        <Text style={styles.heading}>{t('hero.skills')}</Text>
        {heroClass.abilities
          .map(abilityText)
          .filter(Boolean)
          .map((text, i) => (
            <Text key={i} style={styles.ability}>
              ◆ {text}
            </Text>
          ))}
      </View>
      <View style={styles.dismiss}>
        <WoodButton title={t('hero.dismiss')} disabled={!canDismiss(save, hero.id)} onPress={confirmDismiss} />
        {!canDismiss(save, hero.id) && <Text style={styles.note}>{away ? t('hero.cantDismissAway') : t('hero.cantDismissLast')}</Text>}
      </View>
    </ScrollView>
  );

  const pipsOf = (value: number) =>
    Array.from({ length: approachRules.max }, (_, i) => <View key={i} style={[styles.pip, i < value && styles.pipOn]} />);
  /** The value's origin, signed: '+6' for the gain, '−2' (U+2212) for a loss. */
  const sign = (value: number) => `${value < 0 ? '−' : '+'}${Math.abs(value)}`;
  const tipOf = (stat: keyof Stats) => {
    const { base, levels, gear, total } = statSources(save, hero, stat);
    const capped = stat === 'evasion' && stats.evasion >= expeditionRules.evasionCap;
    return `${t(`hero.statTips.${stat}`)}\n${t('hero.statFrom', { base, levels: sign(levels), gear: sign(gear), total })}${capped ? ` (${t('hero.capped')})` : ''}`;
  };
  const statsPage = (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.stats}>
        {largeStats.map((stat) => (
          <StatTile key={stat} stat={stat} value={stats[stat]} text={tipOf(stat)} />
        ))}
      </View>
      <View style={styles.smallStats}>
        {smallStats.map((stat) => (
          <StatTile key={stat} stat={stat} value={stats[stat]} text={tipOf(stat)} small />
        ))}
      </View>
      <View style={styles.section}>
        <View style={styles.headRow}>
          <Text style={styles.heading}>{t('hero.approaches')}</Text>
          {hero.gamble && <IconLabel emoji="🎲" label={t('classes.rolledToday')} size={14} labelStyle={styles.note} />}
          {pending > 0 && <Text style={styles.note}>{t('hero.pendingPicks', { count: pending })}</Text>}
        </View>
        {APPROACHES.map((approach) => {
          const value = approachScore(hero, approach, gearApproachBonus(save, hero));
          const name = t(`threats.approach.${approach}`);
          return (
            <Tip
              key={approach}
              title={name}
              text={t(`hero.approachTips.${approach}`, approachTipVars(approach))}
              style={styles.approach}
              accessibilityLabel={t('hero.approachInfo', { approach: name })}
            >
              <Text style={styles.approachName}>{name}</Text>
              <View style={styles.pipRow}>{pipsOf(value)}</View>
            </Tip>
          );
        })}
      </View>
      {pending > 0 && (
        <View style={styles.section}>
          <Text style={styles.note}>{t('hero.pickApproach')}</Text>
          {APPROACHES.map((approach) => {
            const value = approachScore(hero, approach, gearApproachBonus(save, hero));
            const disabled = value >= approachRules.max;
            return (
              <Pressable
                key={approach}
                accessibilityRole="button"
                accessibilityLabel={t(`threats.approach.${approach}`)}
                disabled={disabled}
                onPress={() => pickApproach(hero.id, approach)}
                style={({ pressed }) => [styles.pickRow, pressed && styles.pressed, disabled && styles.pickDisabled]}
              >
                <Text style={[styles.approachName, disabled && styles.pickDisabled]}>{t(`threats.approach.${approach}`)}</Text>
                <View style={styles.pipRow}>{pipsOf(value)}</View>
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );

  /** The doll slot, absolutely placed, with its slot label under it. */
  const dollSlotView = (slot: EquipmentSlot, position: ViewStyle) => {
    const content = dollSlot(slot);
    return (
      <View key={slot} style={[styles.dollSlot, position]}>
        <ItemSlot
          state={content.state}
          emoji={content.emoji}
          icon={content.icon}
          mark={content.mark}
          size={64}
          accessibilityLabel={content.label}
          onPress={away || content.state === 'locked' ? undefined : () => setPicking(slot)}
        />
        <Text style={styles.slotLabel}>{t(`hero.slots.${slot}`)}</Text>
      </View>
    );
  };
  const equipmentPage = (
    <ScrollView
      contentContainerStyle={styles.page}
      onLayout={({ nativeEvent }) => setContentWidth(nativeEvent.layout.width - 24)}
    >
      <WoodPanel rim style={styles.doll}>
        <View style={styles.dollArea}>
          {dollSlotView('weapon', styles.dollWeapon)}
          {dollSlotView('armor', styles.dollArmor)}
          {dollSlotView('offhand', styles.dollOffhand)}
          {dollSlotView('trinket', styles.dollTrinket)}
          {hasPotionSlot(hero) && dollSlotView('potion', styles.dollPotion)}
          {dollSlotView('consumable', styles.dollConsumable)}
        </View>
      </WoodPanel>
      <Text style={styles.note}>{away ? t('hero.awayHint') : t('hero.tapSlot')}</Text>
      <View style={styles.section}>
        <View style={styles.headRow}>
          <Text style={styles.heading}>{t('hero.storeroom')}</Text>
          <Text style={styles.note}>{t('hero.storeroomHint')}</Text>
        </View>
        {GEAR_SLOTS.map((slot) => {
          const pieces = storeroomPieces.filter(({ item }) => item.slot === slot);
          if (pieces.length === 0) return null;
          const open = !collapsed.includes(slot);
          return (
            <View key={slot} style={styles.section}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                onPress={() => setCollapsed(open ? [...collapsed, slot] : collapsed.filter((s) => s !== slot))}
                style={styles.headRow}
              >
                <Text style={styles.slotHeading}>{`${t(`hero.slots.${slot}`)} (${pieces.length})`}</Text>
                <Text style={styles.note}>{open ? '▲' : '▼'}</Text>
              </Pressable>
              {open && (
                <View style={styles.grid}>
                  {pieces.map(({ gear, item, equipped }) => (
                    <StoreroomSlot
                      key={gear.uid}
                      save={save}
                      hero={hero}
                      gear={gear}
                      item={item}
                      equipped={equipped}
                      size={Math.floor((contentWidth - 3 * 6) / 4) - 4}
                      onOpen={(slot, anchor) => setCompare({ gear, slot, anchor })}
                    />
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );

  return (
    <View style={styles.screen}>
      <HeroHeader heroId={heroId} />
      <SwipeTabs
        tabs={[
          { key: 'summary', label: t('hero.summary') },
          { key: 'stats', label: t('hero.stats') },
          { key: 'equipment', label: t('hero.equipment') },
        ]}
        variant="hero"
      >
        {summaryPage}
        {statsPage}
        {equipmentPage}
      </SwipeTabs>

      {picking && (
        <EquipPicker
          save={save}
          heroId={hero.id}
          slot={picking}
          onClose={() => setPicking(null)}
          onPick={(id) => {
            equipAction(hero.id, picking, id);
            setPicking(null);
          }}
        />
      )}
      {compare && (
        <AnchoredPopup
          anchor={compare.anchor}
          onClose={() => setCompare(null)}
          render={(pointer) => (
            <ComparePopup save={save} hero={hero} gear={compare.gear} slot={compare.slot} pointer={pointer} onEquip={() => {
              equipAction(hero.id, compare.slot, compare.gear.uid);
              setCompare(null);
            }} />
          )}
        />
      )}
    </View>
  );
}

/** One storeroom piece as a slot, ▲ or ▼ when it is better or worse for the hero's class (see upgradeMark). */
function StoreroomSlot({
  save,
  hero,
  gear,
  item,
  equipped,
  size,
  onOpen,
}: {
  save: SaveData;
  hero: HeroState;
  gear: GearInstance;
  item: GearDef;
  equipped: boolean;
  size: number;
  onOpen: (slot: (typeof GEAR_SLOTS)[number], anchor: PopupAnchor) => void;
}) {
  const wrapper = useRef<ComponentRef<typeof View>>(null);
  const preview = equipPreview(save, hero.id, item.slot, gear.uid);
  if (size <= 0) return null;
  return (
    <View ref={wrapper} collapsable={false}>
      <ItemSlot
        state="ready"
        emoji={item.emoji}
        icon={item.icon}
        mark={upgradeMark(hero, preview)}
        size={size}
        equipped={equipped}
        accessibilityLabel={gearName(gear)}
        onPress={() =>
          wrapper.current?.measureInWindow((x, y, width, height) =>
            onOpen(item.slot as (typeof GEAR_SLOTS)[number], { x, y, width, height }),
          )
        }
      />
    </View>
  );
}

/** What one storeroom piece would change, with the Equip action; the problem line when it cannot go in. */
function ComparePopup({
  save,
  hero,
  gear,
  slot,
  pointer,
  onEquip,
}: {
  save: SaveData;
  hero: HeroState;
  gear: GearInstance;
  slot: (typeof GEAR_SLOTS)[number];
  pointer: { side: 'top' | 'bottom'; x: number } | undefined;
  onEquip: () => void;
}) {
  const item = itemById[gear.itemId] as GearDef;
  const problem = slot !== 'weapon' ? slotProblem(save, hero, slot, gear) : null;
  const preview = equipPreview(save, hero.id, slot, gear.uid);
  const wornUid = hero.equipment[slot];
  const worn = wornUid ? save.gear.find((g) => g.uid === wornUid) : undefined;
  const lines: PopupLine[] = [];
  // What the worn piece and this one each add to the hero, against the slot left empty.
  const bare = heroStats(save, { ...hero, equipment: { ...hero.equipment, [slot]: null } });
  const rows = preview
    ? DELTA_KEYS.map((key) => ({ key, worn: preview.before[key] - bare[key], next: preview.after[key] - bare[key] })).filter(
        (row) => row.worn !== 0 || row.next !== 0,
      )
    : [];
  if (preview) {
    const keywords = keywordChange(save, hero, slot, gear);
    for (const { keyword, gained } of keywords) {
      lines.push(
        gained
          ? { tone: 'keyword', text: t('hero.gainsKeyword', { keyword: t(`threats.keyword.${keyword}`) }) }
          : { tone: 'bad', text: t('hero.losesKeyword', { keyword: t(`threats.keyword.${keyword}`) }) },
      );
    }
  } else if (problem) {
    lines.push({ tone: 'muted', text: t(`equip.problem.${problem}`) });
  }
  return (
    <ItemPopup
      title={gearName(gear)}
      subtitle={t('hero.insteadOf', { item: worn ? gearName(worn) : t('hero.empty') })}
      emoji={item.emoji}
      icon={item.icon}
      lines={lines}
      action={{ title: t('hero.equip'), onPress: onEquip, disabled: !preview || isOnExpedition(save, hero.id) }}
      pointer={pointer}
    >
      {rows.length > 0 && (
        <View style={styles.compare}>
          {rows.map(({ key, worn: wornValue, next }) => (
            <View key={key} style={styles.compareRow}>
              <Text style={styles.compareName}>{t(`hero.statNames.${key}`)}</Text>
              <Text style={styles.compareValue}>{`${wornValue} → ${next}`}</Text>
              <Text style={[styles.compareMark, next > wornValue ? styles.compareUp : styles.compareDown]}>
                {next > wornValue ? '▲' : next < wornValue ? '▼' : ''}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ItemPopup>
  );
}

/** The keywords equipping the piece would add or take away, versus the hero as equipped. */
function keywordChange(save: SaveData, hero: HeroState, slot: (typeof GEAR_SLOTS)[number], gear: GearInstance) {
  try {
    const next = equip(save, hero.id, slot, gear.uid);
    const nextHero = next.heroes.find((h) => h.id === hero.id)!;
    const before = new Set(gearKeywordsOf(save, hero).map((entry) => entry.keyword));
    const after = new Set(gearKeywordsOf(next, nextHero).map((entry) => entry.keyword));
    return [...after]
      .filter((keyword) => !before.has(keyword))
      .map((keyword) => ({ keyword, gained: true }))
      .concat([...before].filter((keyword) => !after.has(keyword)).map((keyword) => ({ keyword, gained: false })));
  } catch {
    return [];
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.woodDark },
  compare: { alignSelf: 'stretch', gap: 2 },
  compareRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  compareName: { flex: 1, fontFamily: fonts.serif, fontSize: 15, color: ui.ink },
  compareValue: { fontFamily: fonts.serif, fontSize: 15, color: ui.ink },
  compareMark: { width: 14, fontFamily: fonts.serif, fontSize: 15 },
  compareUp: { color: ui.good },
  compareDown: { color: ui.bad },
  page: { padding: 12, gap: 10 },
  navRow: { flexDirection: 'row', gap: 6 },
  navButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.woodDark,
    borderWidth: 2,
    borderColor: ui.outline,
  },
  navRim: { position: 'absolute', top: 3, left: 3, bottom: 3, right: 3, borderWidth: 2, borderColor: ui.brass },
  navGlyph: { fontSize: 28, color: ui.brassLight, lineHeight: 30 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  portrait: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.woodMid,
    borderWidth: 3,
    borderColor: ui.outline,
  },
  portraitSeams: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  portraitSeam: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: ui.woodSeam },
  portraitBrass: { position: 'absolute', top: 4, left: 4, right: 4, bottom: 4, borderWidth: 2, borderColor: ui.brass },
  levelDiamond: {
    position: 'absolute',
    left: -9,
    bottom: -9,
    width: 28,
    height: 28,
    transform: [{ rotate: '45deg' }],
    backgroundColor: ui.ember,
    borderWidth: 2,
    borderColor: ui.outline,
  },
  levelDiamondFace: { flex: 1, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-45deg' }] },
  levelText: { fontFamily: fonts.body, fontSize: 16, color: ui.onEmber },
  identityText: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.body, fontSize: 26, color: ui.ink },
  nameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' },
  /** The page's gap is 10, so this doubles the space between the two bars. */
  hpGap: { marginBottom: 10 },
  nameStatus: { fontFamily: fonts.serif, fontSize: 13, color: ui.inkMuted },
  classNameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  className: { fontFamily: fonts.serif, fontSize: 14, color: ui.inkMuted },
  traitRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  note: { fontFamily: fonts.serif, fontSize: 13, color: ui.inkMuted },
  drink: { alignItems: 'stretch', gap: 6 },
  section: { gap: 6 },
  heading: { fontFamily: fonts.body, fontSize: 18, color: ui.ink },
  slotHeading: { fontFamily: fonts.body, fontSize: 15, color: ui.ink },
  headRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  keywords: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ability: { fontFamily: fonts.serif, fontSize: 14, color: ui.ink, paddingVertical: 2 },
  dismiss: { marginTop: 8, alignItems: 'stretch', gap: 4 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: {
    width: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderWidth: 2,
    borderColor: ui.outline,
    backgroundColor: ui.parchmentShade,
  },
  statName: { fontFamily: fonts.serif, fontSize: 13, color: ui.inkMuted, textTransform: 'uppercase' },
  statValue: { fontFamily: fonts.serifBold, fontSize: 22, color: ui.ink },
  smallStats: { flexDirection: 'row', gap: 8 },
  smallStat: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: ui.outline,
    backgroundColor: ui.parchmentShade,
  },
  smallStatBody: { alignSelf: 'stretch', alignItems: 'center' },
  smallStatName: { fontFamily: fonts.serif, fontSize: 11, color: ui.inkMuted, textTransform: 'uppercase' },
  smallStatValue: { fontFamily: fonts.serifBold, fontSize: 17, color: ui.ink },
  approach: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: 8,
    borderWidth: 2,
    borderColor: ui.outline,
    backgroundColor: ui.parchmentShade,
  },
  approachName: { fontFamily: fonts.serif, fontSize: 15, color: ui.ink, flexShrink: 1 },
  pipRow: { flexDirection: 'row', gap: 6 },
  pip: { width: 12, height: 12, borderWidth: 2, borderColor: ui.outline, backgroundColor: ui.parchmentShade },
  pipOn: { backgroundColor: ui.brass },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: 8,
    borderWidth: 2,
    borderColor: ui.brass,
    backgroundColor: ui.parchmentShade,
  },
  pickDisabled: { opacity: 0.4 },
  pressed: { opacity: 0.6 },
  doll: { height: 270 },
  dollArea: { height: 270 },
  dollSlot: { position: 'absolute', alignItems: 'center', gap: 3 },
  dollWeapon: { left: 14, top: 90 },
  dollArmor: { left: '50%', marginLeft: -32, top: 8 },
  dollOffhand: { right: 14, top: 90 },
  dollTrinket: { left: 14, top: 8 },
  dollPotion: { right: 14, bottom: 6 },
  dollConsumable: { left: '50%', marginLeft: -32, bottom: 6 },
  slotLabel: { fontFamily: fonts.body, fontSize: 13, color: ui.brassLight },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});

export default timed('screen: hero', CharacterSheetScreen);
