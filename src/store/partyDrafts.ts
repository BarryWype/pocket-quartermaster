import { prunedDraft, type PartyDraft } from '@/game/expeditions/party';

import { useGameStore } from './gameStore';

/**
 * The party dialog's unsent parties, one per place, so leaving the dialog to
 * forge or check a hero keeps the preparation. Kept for this session only.
 */
const drafts = new Map<string, PartyDraft>();

export const partyDraft = (key: string): PartyDraft | undefined => drafts.get(key);

export function keepDraft(key: string, draft: PartyDraft) {
  if (draft.heroIds.length === 0 && draft.swaps.length === 0) drafts.delete(key);
  else drafts.set(key, draft);
}

export const dropDraft = (key: string) => drafts.delete(key);

// A hero who leaves on another run, gets hurt or is dismissed leaves every draft: their slot is emptied.
useGameStore.subscribe(({ save }) => {
  const now = Date.now();
  for (const [key, draft] of drafts) keepDraft(key, prunedDraft(save, draft, now));
});
