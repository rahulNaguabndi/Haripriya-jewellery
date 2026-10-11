import { useEffect } from 'react';

export const SHORTCUTS = [
  { keys: ['/'], alt: ['Ctrl', 'K'], label: 'Search anything' },
  { keys: ['N'], label: 'New loan' },
  { keys: ['B'], label: 'New borrower' },
  { keys: ['P'], label: 'Payments' },
  { keys: ['D'], label: 'Day book (today’s cash)' },
  { keys: ['H'], label: 'Dashboard (home)' },
  { keys: ['?'], label: 'Show these shortcuts' },
];

function isTyping(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

// Single-key shortcuts for the counter. Ignored while typing in a field or
// while a dialog is open, so they never hijack normal data entry.
// handlers: { search, newLoan, newBorrower, payments, dayBook, home, help }
export function useShortcuts(handlers) {
  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        handlers.search();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('.modal-overlay')) return;

      const map = {
        '/': handlers.search,
        n: handlers.newLoan,
        b: handlers.newBorrower,
        p: handlers.payments,
        d: handlers.dayBook,
        h: handlers.home,
        '?': handlers.help,
      };
      const fn = map[e.key.length === 1 ? e.key.toLowerCase() : e.key] || map[e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handlers]);
}
