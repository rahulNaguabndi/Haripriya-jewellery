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

// Maps this deployment's DB-backed brand palette (from GET /api/theme) onto
// CSS custom property names. gold/goldDeep are deliberately excluded here —
// those remain owned by the per-user accent preset below, applied after
// this, so a staff member's personal accent choice always wins over the
// business default.
const BRAND_TOKEN_TO_CSS_VAR = {
  bg: '--bg',
  surface: '--surface',
  border: '--border',
  divider: '--divider',
  hover: '--hover',
  text: '--text',
  textMuted: '--text-muted',
  text3: '--text-3',
  ink: '--ink',
  inkHover: '--ink-hover',
  danger: '--danger',
  dangerSoft: '--danger-soft',
  success: '--success',
  successSoft: '--success-soft',
  warning: '--warning',
  warningSoft: '--warning-soft',
};

export function ThemeProvider({ children }) {
  const [state, setState] = useState(getInitialState);
  const [brandColors, setBrandColors] = useState(null);
  const hasSyncedFromServer = useRef(false);

  useEffect(() => {
    // Deployment-wide branding (this business's own palette) — fetched
    // once, unauthenticated, so it applies on the login page too.
    api
      .get('/theme')
      .then((res) => {
        if (res.data?.colors?.light && res.data?.colors?.dark) {
          setBrandColors(res.data.colors);
        }
      })
      .catch(() => {
        // Falls back to theme.css's hardcoded defaults.
      });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = state.mode;

    const root = document.documentElement.style;
    const brandPalette = brandColors?.[state.mode];
    if (brandPalette) {
      for (const [key, cssVar] of Object.entries(BRAND_TOKEN_TO_CSS_VAR)) {
        if (brandPalette[key]) root.setProperty(cssVar, brandPalette[key]);
      }
    }

    // Personal accent preset always applies last, so it overrides whatever
    // gold/goldDeep the business's brand palette may also define.
    const preset = ACCENT_PRESETS[state.accent] || ACCENT_PRESETS[DEFAULT_ACCENT];
    const accentColors = preset[state.mode];
    root.setProperty('--gold', accentColors.gold);
    root.setProperty('--gold-deep', accentColors.goldDeep);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, brandColors]);

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
    <ThemeContext.Provider
      value={{
        theme: state.mode,
        accent: state.accent,
        toggleTheme,
        setAccent,
        brandColors,
        // Called by Admin Settings' Branding editor after a successful save,
        // so the new palette applies immediately without a page reload.
        applyBrandColors: setBrandColors,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
