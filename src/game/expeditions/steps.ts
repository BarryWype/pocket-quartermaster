// The journey strip's steps: the run's encounters kept on the report, without
// the prose's random flavour. The strip (components/JourneyStrip.tsx) draws
// them; the log keeps its sentences. Reports from before the strip have none,
// and the card shows the log alone.

import type { ReportStep } from '../types';
import type { EncounterResult, RunResult } from './simulate';

/** The effect keys worth a badge on the strip, in the order the strip shows them. */
export const stepEffectKeys = [
  'firebomb',
  'revive',
  'smokeBomb',
  'crit',
  'duel',
  'rage',
  'buff',
  'protect',
  'partyHeal',
  'fightHeal',
  'secondPotion',
  'poison',
  'exposed',
  'trapReduce',
  'calmBeast',
  'raise',
  'allies',
  'relic',
  'special',
  'parley',
  'cacheOpen',
  'stew',
  'weakness',
  'family',
  'tagBonus',
] as const;

/** What the badges and the strip agree on: a step's noteworthy keys. */
export type EffectBadgeKey = (typeof stepEffectKeys)[number];

const badgesOf = (encounter: EncounterResult) => stepEffectKeys.filter((key) => encounter.effects.some((e) => e.key === key));

/** A damage map with the zeroes left out, rounded whole; nothing when nobody bled. */
const blowsOf = (record: Record<string, number>) => {
  const kept = Object.entries(record).filter(([, amount]) => Math.round(amount) > 0);
  return kept.length > 0 ? Object.fromEntries(kept.map(([id, amount]) => [id, Math.round(amount)])) : undefined;
};

const stepOf = (encounter: EncounterResult): ReportStep => {
  const badges = badgesOf(encounter);
  // A revival undid the knockout: the prose says the hero rose, so they stayed up here too.
  const revived = new Set(encounter.effects.filter((e) => e.key === 'revive').flatMap((e) => (e.heroId ? [e.heroId] : [])));
  const knockedOut = encounter.knockedOut.filter((id) => !revived.has(id));
  return {
    kind: encounter.kind,
    name: encounter.name,
    mobs: encounter.mobs.map(({ mobId, count }) => ({ mobId, count })),
    cleared: encounter.cleared,
    trapTriggered: encounter.trapTriggered,
    dealt: blowsOf(encounter.dealt),
    taken: blowsOf(encounter.taken),
    ...(knockedOut.length > 0 ? { knockedOut } : {}),
    ...(badges.length > 0 ? { effects: badges } : {}),
  };
};

/** A quiet step speaks only when something woke it, as the log has it. */
const spokeQuiet = (encounter: EncounterResult) =>
  encounter.effects.some((e) => e.key === 'cacheOpen' || e.key === 'parley' || e.key === 'family');

/** The run's encounters as the report's journey strip keeps them. */
export function reportSteps(run: RunResult): ReportStep[] {
  return run.encounters.flatMap((encounter): ReportStep[] => {
    if (encounter.kind === 'quiet' && !spokeQuiet(encounter)) return [];
    return [stepOf(encounter)];
  });
}
