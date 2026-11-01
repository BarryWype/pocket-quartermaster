import type { Href } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { healthRules } from '@/content/health';
import { isRevealed } from '@/game/reveal/reveal';
import { currentHp, maxHp } from '@/game/team/health';
import { tutorialTarget, type MenuTarget } from '@/game/tutorial/tutorial';
import { navigate } from '@/services/navigation';
import { t, type TextKey } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { fonts, ui } from '@/theme';

import { Text } from './Text';
import { DiamondButton } from './ui';

type MenuLink = { icon: ImageSourcePropType; label: TextKey; href: Href; target?: MenuTarget };

const CRAFT_LINKS: MenuLink[] = [
  { icon: require('../../assets/icons/scaled/menu-forge.png'), label: 'screens.forge', href: '/forge', target: 'forge' },
  { icon: require('../../assets/icons/scaled/menu-forge.png'), label: 'screens.infuse', href: '/infuse', target: 'infuse' },
  { icon: require('../../assets/icons/scaled/menu-alchemy.png'), label: 'screens.provisions', href: '/provisions', target: 'provisions' },
  { icon: require('../../assets/icons/scaled/menu-inventory.png'), label: 'screens.inventory', href: '/inventory' },
];

/** Each diamond's side; the bar fits its diagonal plus its padding. */
const DIAMOND_SIZE = 40;
/** Height of the plank bar above the safe area, so overlays can sit above it. */
export const ISLAND_HEIGHT = Math.ceil(DIAMOND_SIZE * 1.42) + 10;

/** The plank bar at the bottom of the map. */
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
    navigate(href);
  };

  return (
    <>
      {craftOpen && <Pressable style={StyleSheet.absoluteFill} onPress={() => setCraftOpen(false)} />}
      <View style={styles.wrapper} pointerEvents="box-none">
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
        {/* The planks run down through the home indicator or navigation bar; the buttons stay above it. */}
        <View style={[styles.bar, { height: ISLAND_HEIGHT + insets.bottom, paddingBottom: insets.bottom }]}>
          <View style={styles.seams} pointerEvents="none">
            {Array.from({ length: Math.ceil((ISLAND_HEIGHT + insets.bottom) / 16) }, (_, i) => (
              <View key={i} style={[styles.seam, { top: (i + 1) * 16 }]} />
            ))}
          </View>
          <View style={styles.brassLine} pointerEvents="none" />
          <DiamondButton
            label={craftOpen ? t('menu.craftOpen') : t('menu.craftClosed')}
            icon={require('../../assets/icons/scaled/menu-craft.png')}
            size={DIAMOND_SIZE}
            showLabel={false}
            selected={craftOpen || (!craftOpen && CRAFT_LINKS.some((link) => link.target === target))}
            onPress={() => setCraftOpen((open) => !open)}
          />
          <DiamondButton
            label={t('screens.team')}
            icon={require('../../assets/icons/scaled/menu-team.png')}
            badge={hurt || undefined}
            size={DIAMOND_SIZE}
            showLabel={false}
            selected={target === 'team'}
            onPress={() => go('/team')}
          />
          {guildShown && (
            <DiamondButton label={t('menu.guild')} emoji="🏛️" size={DIAMOND_SIZE} showLabel={false} onPress={() => go('/guild')} />
          )}
          {questsShown && (
            <DiamondButton
              label={t('menu.quests')}
              emoji="📜"
              badge={questNews || undefined}
              size={DIAMOND_SIZE}
              showLabel={false}
              onPress={() => go('/quests')}
            />
          )}
          <DiamondButton
            label={t('menu.expeditions')}
            icon={require('../../assets/icons/scaled/menu-expeditions.png')}
            badge={unseenReports || undefined}
            size={DIAMOND_SIZE}
            showLabel={false}
            selected={target === 'expeditions'}
            onPress={() => go('/expeditions')}
          />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 8,
    backgroundColor: ui.woodMid,
    borderTopWidth: 3,
    borderColor: ui.outline,
  },
  seams: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  seam: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: ui.woodSeam },
  brassLine: { position: 'absolute', top: 3, left: 0, right: 0, height: 3, backgroundColor: ui.brass },
  pressed: { opacity: 0.7 },
  // A parchment card: a 2 px outline and a 3 px solid drop strip below it.
  dropdown: {
    alignSelf: 'flex-start',
    marginLeft: 8,
    marginBottom: 8,
    minWidth: 170,
    padding: 6,
    borderWidth: 2,
    borderBottomWidth: 5,
    borderColor: ui.outline,
    backgroundColor: ui.parchment,
  },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  dropdownHighlight: { backgroundColor: ui.brass },
  dropdownIcon: { width: 28, height: 28 },
  dropdownLabel: { fontSize: 15, color: ui.ink, fontFamily: fonts.serifBold },
});
