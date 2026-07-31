import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';

// Recharts wants concrete color strings, but the app's palette lives in CSS
// custom properties (and shifts with theme mode + accent). This hook reads
// the resolved values off :root and recomputes only when mode/accent change,
// so charts stay in lockstep with the rest of the UI in both light and dark.
export function useChartColors() {
  const { theme, accent } = useTheme();
  return useMemo(() => {
    const s = getComputedStyle(document.documentElement);
    const v = (name, fallback) => s.getPropertyValue(name).trim() || fallback;
    return {
      gold: v('--gold', '#CBA45C'),
      goldDeep: v('--gold-deep', '#B78C3C'),
      text: v('--text', '#20160F'),
      muted: v('--text-muted', '#8A7B5E'),
      grid: v('--divider', '#EFE3C9'),
      surface: v('--surface', '#FFFCF5'),
      border: v('--border', '#E6D8BC'),
      success: v('--success', '#3f7d4f'),
      warning: v('--warning', '#8a6512'),
      danger: v('--danger', '#b3413a'),
    };
    // theme + accent are the inputs that change the resolved CSS vars.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, accent]);
}

// "2026-03" -> "Mar" (with year appended each January for orientation).
export function formatMonthLabel(key) {
  const [y, m] = String(key).split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  const mon = d.toLocaleDateString('en-IN', { month: 'short' });
  return m === '01' ? `${mon} '${y.slice(2)}` : mon;
}
