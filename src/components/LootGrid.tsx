import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { gearRules } from '@/content/gear';
import { motion } from '@/content/motion';
import { gearName, itemById, materialById, recipeById, recipeOutput, relicById } from '@/content/lookup';
import { wornBy } from '@/game/forging/salvage';
import type { RewardTile } from '@/game/loot/tiles';
import type { SaveData } from '@/game/save';
import { isAway } from '@/game/team/team';
import type { GearDef } from '@/game/types';
import { useMotion } from '@/hooks/useMotion';
import { t, tr } from '@/i18n';
import { feel } from '@/services/feel';
import { navigate } from '@/services/navigation';
import { useGameStore } from '@/store/gameStore';
import { fonts, ui } from '@/theme';

import { GearCard } from './GearDetails';
import { formatPrice } from './Price';
import { RecipeInputs } from './RecipeInputs';
import { Text } from './Text';
import { AnchoredPopup, Chip, Deferred, ItemPopup, ItemSlot, WoodButton, type PopupAnchor } from './ui';
import { usedInChips } from './usedInChips';

const GAP = 6;
const { beat: BEAT_MS, pause: PAUSE_MS, best: BEST_MS } = motion.reveal;

/** Gear, maps and manuals wear their rarity; blueprints and relics have their own frame; the rest stay plain. */
function frameOf(tile: RewardTile): string | undefined {
  if (tile.kind === 'blueprint') return ui.brassLight;
  if (tile.kind === 'relic') return ui.emberLight;
  if (!tile.rarity || tile.rarity === 'common') return undefined;
  return gearRules.colors[tile.rarity];
}

/** Each tile's reveal value (0 hidden, 1 shown), the skip, and whether it is over. */
function useReveal(tiles: RewardTile[], reveal: boolean) {
  // The reveal pops and grows tiles, so only the Full level stages it.
  const { level } = useMotion();
  const staged = reveal && level === 'full';
  const [values] = useState(() => new Map(tiles.map((tile) => [tile.key, new Animated.Value(staged ? 0 : 1)])));
  const [done, setDone] = useState(!staged);
  const running = useRef<{ animation: Animated.CompositeAnimation; timers: ReturnType<typeof setTimeout>[] } | null>(null);

  const finish = () => {
    running.current?.animation.stop();
    running.current?.timers.forEach(clearTimeout);
    running.current = null;
    values.forEach((value) => value.setValue(1));
    setDone(true);
  };

  useEffect(() => {
    if (!staged) return;
    // The best find shows last.
    const best = tiles.filter((tile) => tile.best).reverse();
    const plain = tiles.filter((tile) => !tile.best);
    const pop = (key: string, duration: number) =>
      Animated.timing(values.get(key)!, { toValue: 1, duration, easing: Easing.out(Easing.back(2)), useNativeDriver: true });
    const animation = Animated.sequence([
      Animated.parallel(plain.map((tile) => pop(tile.key, BEAT_MS))),
      ...best.map((tile) => Animated.sequence([Animated.delay(PAUSE_MS), pop(tile.key, BEST_MS)])),
    ]);
    const timers = best.map((tile, i) =>
      setTimeout(() => feel('reward', { rarity: tile.rarity }), BEAT_MS + (i + 1) * PAUSE_MS + i * BEST_MS),
    );
    running.current = { animation, timers };
    animation.start(({ finished }) => finished && finish());
    return () => {
      running.current?.animation.stop();
      running.current?.timers.forEach(clearTimeout);
    };
    // The reveal plays once, when the grid opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { values, done, skip: finish };
}

type TileFaceProps = {
  emoji: string;
  icon?: ImageSourcePropType;
  label: string;
  size: number;
  frame?: string;
  isNew?: boolean;
  /** A reward preview: rolled later, so the tile is faded. */
  faded?: boolean;
  labelColor?: string;
  accessibilityLabel: string;
  onPress?: () => void;
};

/** One tile: the find's slot, a "New" ribbon on its corner, and its label underneath. */
export function TileFace({ emoji, icon, label, size, frame, isNew, faded, labelColor = ui.ink, accessibilityLabel, onPress }: TileFaceProps) {
  return (
    <View style={[styles.tile, { width: size + 4 }]}>
      <ItemSlot state="ready" size={size} emoji={emoji} icon={icon} frame={frame} faded={faded} accessibilityLabel={accessibilityLabel} onPress={onPress} />
      {isNew && (
        <View style={styles.ribbon} pointerEvents="none">
          <Text style={styles.ribbonText}>{t('tiles.new')}</Text>
        </View>
      )}
      <Text style={[styles.label, { color: labelColor, fontSize: size < 48 ? 11 : 12 }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** A tile with its reveal: plain tiles pop in, the best finds grow in slightly larger with a brass flourish. */
function RevealTile({ tile, size, value, reveal, labelColor, onPress }: { tile: RewardTile; size: number; value: Animated.Value; reveal: boolean; labelColor?: string; onPress?: (anchor: PopupAnchor) => void }) {
  const wrapper = useRef<ComponentRef<typeof View>>(null);
  const grown = reveal && tile.best;
  const scale = value.interpolate({ inputRange: [0, 1], outputRange: [grown ? 0.4 : 0.6, grown ? 1.08 : 1] });
  const glow = value.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 0] });
  const label = tile.kind === 'gold' ? formatPrice(tile.count) : tile.label;
  return (
    <Animated.View ref={wrapper} collapsable={false} style={{ opacity: value, transform: [{ scale }], zIndex: grown ? 1 : 0 }}>
      {grown && <Animated.View pointerEvents="none" style={[styles.glow, { width: size + 12, height: size + 12, opacity: glow }]} />}
      <TileFace
        emoji={tile.emoji}
        icon={tile.icon}
        label={label}
        size={size}
        frame={frameOf(tile)}
        isNew={tile.isNew}
        labelColor={labelColor}
        accessibilityLabel={label}
        onPress={onPress && (() => wrapper.current?.measureInWindow((x, y, width, height) => onPress({ x, y, width, height })))}
      />
    </Animated.View>
  );
}

type Props = {
  tiles: RewardTile[];
  /** Play the reveal when the grid opens (skipped by a tap, static below the Full animation level). */
  reveal?: boolean;
  /** A fixed tile size; by default four tiles fill the grid's width. */
  size?: number;
  /** Show at most this many tiles, then "+N" (the map's toasts). */
  max?: number;
  /** Tapping a tile opens its sheet; toasts leave it off. */
  interactive?: boolean;
  /** The labels' colour: ink on parchment, light on wood. */
  labelColor?: string;
};

/** A reward as a grid of tiles, four across; tap one to open its item's sheet. Its tiles mount a frame after the space they fill. */
export function LootGrid(props: Props) {
  const count = Math.min(props.tiles.length, props.max ?? Infinity);
  const rows = Math.ceil(count / 4);
  const ghost = <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ minHeight: rows * ((props.size ?? 64) + 22) }} />;
  return (
    <Deferred name="loot grid" ghost={ghost}>
      <GridContent {...props} />
    </Deferred>
  );
}

function GridContent({ tiles, reveal = false, size, max, interactive = true, labelColor }: Props) {
  const save = useGameStore((state) => state.save);
  const [width, setWidth] = useState(0);
  const [opened, setOpened] = useState<{ tile: RewardTile; anchor: PopupAnchor } | null>(null);
  const shown = max !== undefined ? tiles.slice(0, max) : tiles;
  const more = tiles.length - shown.length;
  const motion = useReveal(shown, reveal);
  // Each slot is wrapped in a 2 px ring, so its face is 4 px narrower than its cell.
  const cell = size ?? (width > 0 ? Math.floor((width - 3 * GAP) / 4) - 4 : 0);
  const open = (tile: RewardTile) => (anchor: PopupAnchor) => (motion.done ? setOpened({ tile, anchor }) : motion.skip());
  return (
    <Pressable disabled={motion.done} onPress={motion.skip} accessible={false}>
      <View style={styles.grid} onLayout={size === undefined ? ({ nativeEvent }) => setWidth(nativeEvent.layout.width) : undefined}>
        {cell > 0 &&
          shown.map((tile) => (
            <RevealTile
              key={tile.key}
              tile={tile}
              size={cell}
              value={motion.values.get(tile.key) ?? new Animated.Value(1)}
              reveal={reveal}
              labelColor={labelColor}
              onPress={interactive ? open(tile) : undefined}
            />
          ))}
        {more > 0 && <Text style={[styles.more, labelColor ? { color: labelColor } : null]}>{t('tiles.more', { count: more })}</Text>}
      </View>
      {opened && (
        <AnchoredPopup
          anchor={opened.anchor}
          onClose={() => setOpened(null)}
          render={(pointer) => <TileSheet tile={opened.tile} save={save} pointer={pointer} onClose={() => setOpened(null)} />}
        />
      )}
    </Pressable>
  );
}

/** A tile's sheet: the inventory's own card for that item, with what to do next. */
function TileSheet({ tile, save, pointer, onClose }: { tile: RewardTile; save: SaveData; pointer?: { side: 'top' | 'bottom'; x: number }; onClose: () => void }) {
  const equip = useGameStore((state) => state.equip);
  const ref = tile.itemRef;
  switch (ref.kind) {
    case 'gear': {
      const piece = ref.uid ? save.gear.find((g) => g.uid === ref.uid) : undefined;
      if (!piece) {
        return <ItemPopup pointer={pointer} title={gearName(ref)} emoji={tile.emoji} icon={tile.icon} legendary={ref.rarity === 'legendary' || undefined} note={ref.uid ? t('tiles.gone') : undefined} />;
      }
      const holder = wornBy(save, piece.uid);
      const slot = (itemById[piece.itemId] as GearDef).slot;
      const heroes = holder ? [] : save.heroes.filter((hero) => !isAway(save, hero.id));
      return (
        <GearCard gear={piece} pointer={pointer} note={holder ? t('common.equippedBy', { name: holder.name }) : undefined}>
          {heroes.length > 0 && (
            <View style={styles.buttons}>
              {heroes.map((hero) => (
                <WoodButton
                  key={hero.id}
                  compact
                  title={t('tiles.equipOn', { name: hero.name })}
                  onPress={() => {
                    equip(hero.id, slot, piece.uid);
                    onClose();
                  }}
                />
              ))}
            </View>
          )}
        </GearCard>
      );
    }
    case 'blueprint': {
      const recipe = recipeById[ref.recipeId];
      const output = recipeOutput(recipe);
      return (
        <ItemPopup
          pointer={pointer}
          title={tr(output.name)}
          subtitle={t('tiles.blueprint')}
          emoji={tile.emoji}
          icon={tile.icon}
          action={{
            title: t('tiles.forge'),
            onPress: () => {
              onClose();
              navigate({ pathname: '/forge', params: { recipe: ref.recipeId } });
            },
          }}
        >
          <View style={styles.inputs}>
            <RecipeInputs save={save} recipe={recipe} />
          </View>
        </ItemPopup>
      );
    }
    case 'material':
    case 'relic': {
      const relic = ref.kind === 'relic' ? relicById[ref.relicId] : undefined;
      const material = ref.kind === 'material' ? materialById[ref.id] : undefined;
      const chips = usedInChips(save, ref.kind === 'relic' ? { kind: 'relic', id: ref.relicId } : { kind: 'material', id: ref.id });
      return (
        <ItemPopup
          pointer={pointer}
          title={tr(relic?.name ?? material?.name ?? '')}
          subtitle={relic ? tr(relic.effect) : undefined}
          emoji={tile.emoji}
          icon={tile.icon}
          value={ref.kind === 'material' ? (save.materials[ref.id] ?? 0) : undefined}
        >
          {chips.length > 0 && (
            <View style={styles.chips}>
              {chips.map((chip) => (
                <Chip key={chip.key} tone={chip.tone} label={chip.label} />
              ))}
            </View>
          )}
        </ItemPopup>
      );
    }
    case 'consumable': {
      const item = itemById[ref.id];
      return (
        <ItemPopup
          pointer={pointer}
          title={tr(item.name)}
          subtitle={item.description ? tr(item.description) : undefined}
          emoji={tile.emoji}
          icon={tile.icon}
          value={save.consumables[ref.id] ?? 0}
        />
      );
    }
    case 'none':
      return <ItemPopup pointer={pointer} title={tile.label} emoji={tile.emoji} icon={tile.icon} />;
  }
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, alignItems: 'flex-start' },
  tile: { alignItems: 'center', gap: 2 },
  label: { fontFamily: fonts.serifBold, textAlign: 'center' },
  ribbon: {
    position: 'absolute',
    top: 0,
    left: 0,
    paddingHorizontal: 3,
    backgroundColor: ui.ember,
    borderWidth: 1,
    borderColor: ui.outline,
  },
  ribbonText: { fontFamily: fonts.serifBold, fontSize: 10, color: ui.onEmber },
  glow: { position: 'absolute', top: -4, left: -4, borderWidth: 3, borderColor: ui.brassLight, backgroundColor: 'rgba(246,217,142,0.25)' },
  more: { alignSelf: 'center', fontFamily: fonts.serifBold, fontSize: 14, color: ui.ink },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'center' },
  inputs: { gap: 4 },
});
