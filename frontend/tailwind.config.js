/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        jost: ['Jost', 'sans-serif'],
        cormorant: ['"Cormorant Garamond"', 'serif'],
      },
      colors: {
        // Every token below is a passthrough to the CSS custom property of
        // the same name, defined in src/theme.css and (over)written at
        // runtime by ThemeContext from the deployment's DB-backed brand
        // theme (GET /api/theme). Values are NOT static hex here — they
        // already resolve differently under html[data-theme='dark'], so no
        // Tailwind dark: variants are needed for color utilities.
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        border: 'var(--border)',
        divider: 'var(--divider)',
        hover: 'var(--hover)',
        text: 'var(--text)',
        'text-muted': 'var(--text-muted)',
        'text-3': 'var(--text-3)',
        ink: 'var(--ink)',
        'ink-hover': 'var(--ink-hover)',
        danger: 'var(--danger)',
        'danger-soft': 'var(--danger-soft)',
        success: 'var(--success)',
        'success-soft': 'var(--success-soft)',
        warning: 'var(--warning)',
        'warning-soft': 'var(--warning-soft)',
        gold: 'var(--gold)',
        'gold-deep': 'var(--gold-deep)',
      },
    },
  },
  plugins: [],
};
