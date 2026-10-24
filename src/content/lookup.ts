import { dungeons } from './dungeons';
import { items } from './items';
import { materials } from './materials';
import { recipes } from './recipes';
import { resources } from './resources';

export const materialById = Object.fromEntries(materials.map((m) => [m.id, m]));
export const resourceById = Object.fromEntries(resources.map((r) => [r.id, r]));
export const itemById = Object.fromEntries(items.map((i) => [i.id, i]));
export const recipeById = Object.fromEntries(recipes.map((r) => [r.id, r]));
export const dungeonById = Object.fromEntries(dungeons.map((d) => [d.id, d]));
