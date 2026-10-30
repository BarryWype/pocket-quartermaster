import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { healthRules } from '@/content/health';
import { isRevealed } from '@/game/reveal/reveal';
import { currentHp, maxHp } from '@/game/team/health';
import { tutorialTarget, type MenuTarget } from '@/game/tutorial/tutorial';
import { t, type TextKey } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

import { Text } from './Text';

type MenuLink = { icon: ImageSourcePropType; label: TextKey; href: Href; target?: MenuTarget };

const CRAFT_LINKS: MenuLink[] = [
  { icon: require('../../assets/icons/scaled/menu-forge.png'), label: 'screens.forge', href: '/forge', target: 'forge' },
  { icon: require('../../assets/icons/scaled/menu-alchemy.png'), label: 'screens.provisions', href: '/provisions', target: 'provisions' },
  { icon: require('../../assets/icons/scaled/menu-inventory.png'), label: 'screens.inventory', href: '/inventory' },
];

/** Height of the island above the safe area, so overlays can sit above it. */
export const ISLAND_HEIGHT = 84;

/** The floating menu at the bottom of the map. */
export function IslandMenu() {
  const insets = useSafeAreaInsets();
  const [craftOpen, setCraftOpen] = useState(false);
  // Unread reports and teams back with loot to collect, as of the last change to the save.
  const unseenReports = useGameStore(
    ({ save }) => save.reports.filter((r) => !r.seen).length + save.expeditions.filter((e) => e.endsAt <= Date.now()).length,
  );
  // The tutorial points at the button its current step is waiting for.
  const target = useGameStore((state) => tutorialTarget(state.save));
  // The Guild Hall and quests appear with the gradual reveal.
  const guildShown = useGameStore((state) => isRevealed(state.save, 'guildHall'));
  const questsShown = useGameStore((state) => isRevealed(state.save, 'quests'));
  // Quests new since the list was last open, and finished ones waiting to be claimed.
  const questNews = useGameStore(({ save }) => save.quests.list.filter((quest) => !quest.seen || quest.doneAt !== null).length);
  // Badly hurt heroes, as of the last change to the save.
  const hurt = useGameStore(
    ({ save }) => save.heroes.filter((h) => currentHp(save, h, Date.now()) < healthRules.hurtShare * maxHp(save, h)).length,
  );

  const go = (href: Href) => {
    setCraftOpen(false);
    router.push(href);
  };

  return (
    <>
      {craftOpen && <Pressable style={StyleSheet.absoluteFill} onPress={() => setCraftOpen(false)} />}
      <View style={[styles.wrapper, { bottom: insets.bottom + 12 }]} pointerEvents="box-none">
        {craftOpen && (
          <View style={styles.dropdown}>
            {CRAFT_LINKS.map((link) => (
              <Pressable
                key={link.label}
                onPress={() => go(link.href)}
                style={({ pressed }) => [
                  styles.dropdownItem,
                  link.target === target && styles.dropdownHighlight,
                  pressed && styles.pressed,
                ]}
              >
                <Image source={link.icon} style={styles.dropdownIcon} />
                <Text style={styles.dropdownLabel}>{t(link.label)}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <View style={styles.island}>
          <MenuButton
            icon={require('../../assets/icons/scaled/menu-craft.png')}
            label={craftOpen ? t('menu.craftOpen') : t('menu.craftClosed')}
            active={craftOpen}
            highlight={!craftOpen && CRAFT_LINKS.some((link) => link.target === target)}
            onPress={() => setCraftOpen((open) => !open)}
          />
          <MenuButton
            icon={require('../../assets/icons/scaled/menu-team.png')}
            label={t('screens.team')}
            badge={hurt}
            highlight={target === 'team'}
            onPress={() => go('/team')}
          />
          {guildShown && <MenuButton emoji="🏛️" label={t('menu.guild')} onPress={() => go('/guild')} />}
          {questsShown && <MenuButton emoji="📜" label={t('menu.quests')} compact badge={questNews} onPress={() => go('/quests')} />}
          <MenuButton
            icon={require('../../assets/icons/scaled/menu-expeditions.png')}
            label={t('menu.expeditions')}
            badge={unseenReports}
            highlight={target === 'expeditions'}
            onPress={() => go('/expeditions')}
          />
        </View>
      </View>
    </>
  );
}

type MenuButtonProps = {
  /** An image icon, or an emoji until the button has one. */
  icon?: ImageSourcePropType;
  emoji?: string;
  label: string;
  onPress: () => void;
  active?: boolean;
  /** Draws attention to the button, e.g. for the tutorial. */
  highlight?: boolean;
  badge?: number;
  /** Icon only: the label is read out but not shown. */
  compact?: boolean;
};

function MenuButton({ icon, emoji, label, onPress, active, highlight, badge, compact }: MenuButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compact,
        active && styles.buttonActive,
        highlight && styles.buttonHighlight,
        pressed && styles.pressed,
      ]}
    >
      {icon ? <Image source={icon} style={styles.buttonIcon} /> : <Text style={styles.buttonEmoji}>{emoji}</Text>}
      {!compact && <Text style={styles.buttonLabel}>{label}</Text>}
      {badge ? (
        <View style={[styles.badge, compact && styles.compactBadge]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  island: {
    flexDirection: 'row',
    height: ISLAND_HEIGHT - 12,
    alignSelf: 'stretch',
    padding: 6,
    gap: 6,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: colors.woodDark,
    backgroundColor: colors.wood,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  button: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 26 },
  compact: { flex: 0, width: 56 },
  buttonActive: { backgroundColor: colors.woodLight },
  buttonHighlight: { backgroundColor: colors.woodLight, borderWidth: 3, borderColor: colors.highlight },
  pressed: { opacity: 0.7 },
  buttonIcon: { width: 32, height: 32 },
  buttonEmoji: { fontSize: 24, lineHeight: 32 },
  buttonLabel: { color: colors.parchment, fontSize: 18 },
  badge: {
    position: 'absolute',
    top: 2,
    right: 12,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 5,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
  },
  badgeText: { color: '#fff', fontSize: 16 },
  compactBadge: { right: 0 },
  dropdown: {
    alignSelf: 'flex-start',
    minWidth: 170,
    marginBottom: 8,
    padding: 6,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: colors.woodDark,
    backgroundColor: colors.parchment,
    elevation: 8,
  },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14 },
  dropdownHighlight: { backgroundColor: colors.highlight },
  dropdownIcon: { width: 28, height: 28 },
  dropdownLabel: { fontSize: 21 },
});
