import { Asset } from 'expo-asset';
import type { ImageSourcePropType } from 'react-native';

import { items } from '@/content/items';
import { materials } from '@/content/materials';
import { resources } from '@/content/resources';
import { preloadRules } from '@/content/preload';

/**
 * The first-time costs that aren't computation (issue 17): the drawn images
 * (gear and item icons, materials, resources) are decoded the first time
 * they're drawn, and a route module is evaluated the first time it's opened —
 * Expeditions' pulls in most of the game layer. Both are paid here instead,
 * `preloadRules.delayMs` after the map is shown, so the first opening of
 * Expeditions or the forge neither decodes nor evaluates anything.
 */

/** Every drawn image the content carries: one Asset per distinct icon module. */
function drawnImages(): number[] {
  const seen = new Set<number>();
  const modules: number[] = [];
  const add = (icon: ImageSourcePropType | undefined) => {
    if (typeof icon !== 'number' || seen.has(icon)) return;
    seen.add(icon);
    modules.push(icon);
  };
  for (const item of items) add(item.icon);
  for (const material of materials) add(material.icon);
  for (const resource of resources) add(resource.icon);
  return modules;
}

/** Whether the preload has been armed (once per app run). */
let preloadStarted = false;

/** Decodes the drawn images and evaluates the Expeditions route module, off the map's first frames. */
export function preloadAfterMapShown(): void {
  if (preloadStarted) return;
  preloadStarted = true;
  setTimeout(() => {
    void Asset.loadAsync(drawnImages()).catch(() => {});
    // Evaluating the route module is all of it: its imports, the whole graph it pulls in.
    void import('@/app/expeditions');
  }, preloadRules.delayMs);
}
