import { jobById } from '@/content/jobs';
import { workToolRules } from '@/content/workTools';

import { createRng, type Rng } from '../generation/rng';
import { jobChoices, wornWorkTool, type WornWorkTool } from '../jobs/jobs';
import type { SaveData } from '../save';
import type { MaterialStack } from '../types';

export type { WornWorkTool } from '../jobs/jobs';

/**
 * The material one scavenged unit of the tool's job is: a fixed material as
 * is, a weighted roll with the job's weights, or the job's chosen material
 * (the miner's pick, else its highest unlocked ore, else stone). Drawn from
 * `rng`, so the same seed always scavenges the same.
 */
export function scavengeMaterial(jobId: string, rng: Rng, ctx: { jobChoice: string | null | undefined; choices: string[] }): string {
  const produces = jobById[jobId].produces;
  if (typeof produces === 'string') return produces;
  if ('weights' in produces) {
    return rng.weighted(Object.keys(produces.weights), (material) => produces.weights[material]);
  }
  if ('nodes' in produces) throw new Error(`Job ${jobId} gathers no unit material`);
  if (ctx.jobChoice !== null && ctx.jobChoice !== undefined) return ctx.jobChoice;
  return ctx.choices.length > 0 ? ctx.choices[ctx.choices.length - 1] : 'stone';
}

/** What a work tool scavenges from one won fight: the job's material on a successful chance roll, else nothing. */
export function scavengeStack(tool: WornWorkTool | null, seed: string, ctx: { jobChoice: string | null | undefined; choices: string[] }): MaterialStack[] {
  if (!tool) return [];
  const rng = createRng(seed);
  if (!rng.chance(workToolRules.scavenge.chance)) return [];
  return [{ materialId: scavengeMaterial(tool.job, rng, ctx), amount: workToolRules.scavenge.amount }];
}

/** What a hero's worn work tool scavenges from one won fight of a run (seeded by the run id, hero and fight). */
export function scavengeLoot(save: SaveData, heroId: string, fightIndex: number, seedKey: string): MaterialStack[] {
  const hero = save.heroes.find((h) => h.id === heroId);
  const tool = hero ? wornWorkTool(save, hero) : null;
  if (!tool) return [];
  return scavengeStack(tool, `${seedKey}|scavenge|${heroId}|${fightIndex}`, { jobChoice: save.jobChoice[tool.job], choices: jobChoices(save, tool.job) });
}
