import { useState } from 'react';

/**
 * The rows of a list that were new the first time this list showed them: those
 * new when it mounted, and those that arrive while it is open and are new. A
 * row stays fresh for as long as the list is mounted, so wrapping it in
 * `Appear` never changes under it (the flag that made it new, such as a
 * quest's `seen`, may flip a moment later).
 */
export function useFreshRows(ids: readonly string[], isNew: (id: string) => boolean): ReadonlySet<string> {
  const [rows, setRows] = useState(() => ({ known: new Set(ids), fresh: new Set(ids.filter(isNew)) }));
  const arrivals = ids.filter((id) => !rows.known.has(id));
  if (arrivals.length > 0) {
    // Stored during render, React's way of following a changed list: the render restarts with it at once.
    setRows({ known: new Set([...rows.known, ...arrivals]), fresh: new Set([...rows.fresh, ...arrivals.filter(isNew)]) });
  }
  return rows.fresh;
}
