/** Map services: chapels, apothecaries and libraries. The numbers are placeholders: tune later. */
export const serviceRules = {
  /** Apothecary care, by highest unlocked tier. */
  apothecary: { healPrice: [10, 15, 22, 34, 50], restPrice: [10, 15, 22, 34, 50] },
  /** Library training, by highest unlocked tier. */
  library: { trainXp: [60, 120, 240, 480, 960], trainPrice: [15, 30, 60, 120, 240] },
  /** A chapel's blessing: party damage added to the next expedition. */
  chapel: { blessingDamage: 0.05 },
};
