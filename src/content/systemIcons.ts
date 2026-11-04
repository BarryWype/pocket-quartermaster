import type { ImageSourcePropType } from 'react-native';

/**
 * Pixel icons for the game's system emojis: gold, stats, loot categories and
 * screen tabs. Only the sites that show these symbols look them up, so a hero
 * class or a place that shares an emoji keeps its emoji.
 */
export const systemIcons: Partial<Record<string, ImageSourcePropType>> = {
  '🪙': require('../../assets/icons/tavern/coins-gold.png'),
  '⚔️': require('../../assets/icons/rpg/dual-steel-swords.png'),
  '🛡️': require('../../assets/icons/rpg/shield-iron-heater.png'),
  '✨': require('../../assets/icons/magic/charm-sun-crystal.png'),
  '❤️': require('../../assets/icons/rpg/amulet-ruby-heart.png'),
  '🔰': require('../../assets/icons/magic/charm-shield.png'),
  '💨': require('../../assets/icons/magic/part-blue-feather.png'),
  '👟': require('../../assets/icons/rpg/boots-leather.png'),
  '🎯': require('../../assets/icons/rpg/dagger-stiletto.png'),
  '🍀': require('../../assets/icons/rpg/herb-four-leaf-clover.png'),
  '🪵': require('../../assets/icons/scaled/wood.png'),
  '🔮': require('../../assets/icons/rpg/gem-purple.png'),
  '📜': require('../../assets/icons/magic/scroll-rune-blue-1.png'),
  '💍': require('../../assets/icons/rpg/ring-gold-band.png'),
  '🧩': require('../../assets/icons/relics/grappling-hook-iron.png'),
  '🏺': require('../../assets/icons/relics/urn-blue-gold.png'),
  '🦴': require('../../assets/icons/magic/part-bone.png'),
  '💎': require('../../assets/icons/rpg/gem-blue-brilliant.png'),
  '🧪': require('../../assets/icons/rpg/potion-green-flask.png'),
  '🗺️': require('../../assets/icons/relics/scroll-tube-brown.png'),
  '📖': require('../../assets/icons/magic/book-open-red.png'),
  '🧥': require('../../assets/icons/rpg/armor-leather-vest.png'),
  '⚒️': require('../../assets/icons/rpg/tool-hammer.png'),
  '🍲': require('../../assets/icons/meals/stew-hearty.png'),
};
