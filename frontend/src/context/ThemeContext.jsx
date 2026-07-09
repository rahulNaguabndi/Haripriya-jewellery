import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabaseClient.js';
import { api } from '../services/api.js';
import { ACCENT_PRESETS, DEFAULT_ACCENT } from '../theme/accents.js';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'haripriya-theme';

function getInitialState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (stored?.mode && stored?.accent) return stored;
  } catch {
    // ignore malformed localStorage value
  }
  const mode = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return { mode, accent: DEFAULT_ACCENT };
}

export function ThemeProvider({ children }) {
  const [state, setState] = useState(getInitialState);
  const hasSyncedFromServer = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.theme = state.mode;
    const preset = ACCENT_PRESETS[state.accent] || ACCENT_PRESETS[DEFAULT_ACCENT];
    const colors = preset[state.mode];
    document.documentElement.style.setProperty('--gold', colors.gold);
    document.documentElement.style.setProperty('--gold-deep', colors.goldDeep);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    // On first load, a signed-in user's DB-saved preference takes priority
    // over whatever was in localStorage/system default.
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session || hasSyncedFromServer.current) return;
      hasSyncedFromServer.current = true;
      api
        .get('/auth/me')
        .then((res) => {
          const pref = res.data.adminProfile?.theme_preference;
          if (pref?.mode && pref?.accent && ACCENT_PRESETS[pref.accent]) {
            setState({ mode: pref.mode, accent: pref.accent });
          }
        })
        .catch(() => {});
    });
  }, []);

  function persistToServer(next) {
    // Best-effort: silently ignored when logged out (e.g. toggling on the
    // login page) or if the DB migration adding theme_preference hasn't run.
    api.patch('/admin/me/theme', next).catch(() => {});
  }

  function toggleTheme() {
    setState((s) => {
      const next = { ...s, mode: s.mode === 'dark' ? 'light' : 'dark' };
      persistToServer(next);
      return next;
    });
  }

  function setAccent(accent) {
    setState((s) => {
      const next = { ...s, accent };
      persistToServer(next);
      return next;
    });
  }

  return (
    <ThemeContext.Provider value={{ theme: state.mode, accent: state.accent, toggleTheme, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
