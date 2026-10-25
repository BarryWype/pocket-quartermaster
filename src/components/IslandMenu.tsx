import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

import { Text } from './Text';

type MenuLink = { emoji: string; label: string; href: Href };

// Add a station here (e.g. cooking) to list it under Craft.
const CRAFT_LINKS: MenuLink[] = [
  { emoji: '⚒️', label: 'Forge', href: '/forge' },
  { emoji: '⚗️', label: 'Alchemy', href: '/alchemy' },
  { emoji: '🎒', label: 'Inventory', href: '/inventory' },
];

/** Height of the island above the safe area, so overlays can sit above it. */
export const ISLAND_HEIGHT = 84;

/** The floating menu at the bottom of the map. */
export function IslandMenu() {
  const insets = useSafeAreaInsets();
  const [craftOpen, setCraftOpen] = useState(false);
  const unseenReports = useGameStore((state) => state.save.reports.filter((r) => !r.seen).length);

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
                style={({ pressed }) => [styles.dropdownItem, pressed && styles.pressed]}
              >
                <Text style={styles.dropdownEmoji}>{link.emoji}</Text>
                <Text style={styles.dropdownLabel}>{link.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <View style={styles.island}>
          <MenuButton
            emoji="🔨"
            label={craftOpen ? 'Craft ▾' : 'Craft ▴'}
            active={craftOpen}
            onPress={() => setCraftOpen((open) => !open)}
          />
          <MenuButton emoji="🛡️" label="Team" onPress={() => go('/team')} />
          <MenuButton
            emoji="🧭"
            label="Expeditions"
            badge={unseenReports}
            onPress={() => go('/expeditions')}
          />
        </View>
      </View>
    </>
  );
}

type MenuButtonProps = {
  emoji: string;
  label: string;
  onPress: () => void;
  active?: boolean;
  badge?: number;
};

function MenuButton({ emoji, label, onPress, active, badge }: MenuButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.button, active && styles.buttonActive, pressed && styles.pressed]}
    >
      <Text style={styles.buttonEmoji}>{emoji}</Text>
      <Text style={styles.buttonLabel}>{label}</Text>
      {badge ? (
        <View style={styles.badge}>
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
  buttonActive: { backgroundColor: colors.woodLight },
  pressed: { opacity: 0.7 },
  buttonEmoji: { fontSize: 22 },
  buttonLabel: { color: colors.parchment, fontSize: 14 },
  badge: {
    position: 'absolute',
    top: 2,
    right: 12,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
  },
  badgeText: { color: '#fff', fontSize: 12 },
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
  dropdownEmoji: { fontSize: 20 },
  dropdownLabel: { fontSize: 17 },
});
