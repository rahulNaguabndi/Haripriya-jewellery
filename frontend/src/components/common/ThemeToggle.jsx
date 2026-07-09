import { useTheme } from '../../context/ThemeContext.jsx';

export default function ThemeToggle({ style }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="btn"
      style={{
        background: 'transparent',
        color: 'inherit',
        border: '1px solid var(--border)',
        width: 34,
        height: 34,
        padding: 0,
        borderRadius: 8,
        fontSize: 15,
        ...style,
      }}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
}
