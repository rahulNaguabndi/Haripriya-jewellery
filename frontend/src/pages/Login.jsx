import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import ThemeToggle from '../components/common/ThemeToggle.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      const redirectTo = location.state?.from || '/dashboard';
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <aside className="login-brand" aria-hidden>
        <div className="shell-brand">
          <span className="shell-mark">H</span>
          <span className="shell-name">Haripriya Jewels</span>
        </div>
        <div>
          <div className="login-tagline">Every pledge, kept and counted.</div>
          <div className="login-sub">Loans, lockers, notices and accounts for the counter, in one place.</div>
        </div>
        <div className="login-foot">Staff access only</div>
      </aside>

      <main className="login-main">
        <ThemeToggle style={{ position: 'absolute', top: 20, right: 20 }} />
        <form onSubmit={handleSubmit} className="login-form">
          <div className="shell-brand login-mobile-brand">
            <span className="shell-mark">H</span>
            <span className="shell-name">Haripriya Jewels</span>
          </div>
          <h1 className="page-title" style={{ fontSize: 32 }}>Sign in</h1>
          <div className="page-subtitle" style={{ marginBottom: 26 }}>Use the staff email you were given.</div>

          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@haripriyajewels.com"
            />
          </div>
          <div className="field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          {error && (
            <div role="alert" style={{ fontSize: 13, color: 'var(--danger)', background: 'var(--danger-soft)', borderRadius: 8, padding: '9px 12px', marginBottom: 12 }}>
              {error}
            </div>
          )}
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', padding: 12, marginTop: 4 }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </main>
    </div>
  );
}
