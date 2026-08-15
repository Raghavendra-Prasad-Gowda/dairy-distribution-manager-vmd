import { useState, useCallback } from 'react';

/**
 * Boolean open/close state for modals, drawers, menus. Replaces the dozens of
 * ad-hoc `const [showX, setShowX] = useState(false)` pairs (SalesmanPricesSetup
 * alone had ~10). Handlers are stable (useCallback) so they don't re-render rows.
 *
 * @param {boolean} [initial=false]
 * @returns {{ isOpen, open, close, toggle, setIsOpen }}
 */
export function useDisclosure(initial = false) {
  const [isOpen, setIsOpen] = useState(initial);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  return { isOpen, open, close, toggle, setIsOpen };
}
