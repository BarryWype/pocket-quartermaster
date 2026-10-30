export const pocketRules = {
  /** Nearby places and secret places alert within this distance (m). */
  nearbyMeters: 150,
  /** At most one notification of each Pocket mode kind this often (minutes). */
  notifyEveryMinutes: 10,
};
export type NearbyKind = 'fightEvents' | 'ruins' | 'treasure';
export const nearbyKinds: NearbyKind[] = ['fightEvents', 'ruins', 'treasure'];
