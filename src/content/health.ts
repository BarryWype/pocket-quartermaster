/** Hero HP between runs: heroes come back hurt and heal at home. */
export const healthRules = {
  /** Share of max HP regained per minute at home: 0 → full in 60 minutes. */
  healPerMinute: 1 / 60,
  /** A hero who comes back at 0 HP is exhausted this long: no healing. */
  exhaustionMinutes: 20,
  /** Share of max HP a healing potion restores, in the dungeon or at home. */
  potionHeal: 0.3,
  /** Share of max HP a herbal poultice restores at home. */
  poulticeHeal: 0.25,
  /** Below this share of max HP a hero shows as badly hurt. */
  hurtShare: 0.3,
};
