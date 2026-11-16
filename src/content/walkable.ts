// Where spawns may appear, read from OpenFreeMap's OpenMapTiles data.
// Spawns snap to the nearest walkable way, or stay put inside a public area;
// anything with neither within `maxSnapMeters` is dropped.
export const walkableRules = {
  /** One fixed zoom so every device snaps against the same geometry. */
  mapZoom: 14,
  maxSnapMeters: 60,

  /**
   * `transportation` line classes people can walk along. Motorway, trunk and
   * primary roads are left out: the data doesn't say whether they have a footpath.
   */
  wayClasses: ['path', 'track', 'minor', 'service', 'tertiary', 'secondary', 'pier'],
  /** Excluded even within those classes: indoor and railway platforms, private service roads. */
  excludedSubclasses: ['corridor', 'platform'],
  excludedServices: ['driveway', 'parking_aisle'],
  /** `access` / `foot` values that make a way off limits. */
  forbiddenAccess: ['no', 'private'],

  /** Public areas: pedestrian squares and piers, parks, playgrounds, reserves. */
  areaTransportClasses: ['path', 'pier'],
  landcoverSubclasses: ['park', 'recreation_ground', 'village_green'],
  landuseClasses: ['playground'],
  parkClasses: ['nature_reserve', 'national_park'],

  /** `landcover` polygon classes that count as green (see supply terrain). */
  greenLandcoverClasses: ['wood', 'grass', 'wetland', 'farmland'],
  /** Green landcover subclasses left out: private gardens. */
  greenExcludedSubclasses: ['garden'],
  /** `landuse` polygon classes that count as green. */
  greenLanduseClasses: ['cemetery', 'playground'],
};

export type WalkableRules = typeof walkableRules;
