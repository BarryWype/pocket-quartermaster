import { useEffect, useState } from 'react';

import { navigationPending, onNavigationChange } from '@/services/navigation';

/**
 * Whether a navigation is still waiting for its screen to land on the real
 * stack. Menu buttons disable while it holds, so a laggy tap can't pile up.
 */
export function useNavigationPending() {
  const [pending, setPending] = useState(navigationPending);
  useEffect(() => onNavigationChange(() => setPending(navigationPending())), []);
  return pending;
}
