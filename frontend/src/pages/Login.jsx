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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        padding: 16,
        background:
          'radial-gradient(60% 55% at 50% 0%, var(--gold-soft) 0%, transparent 60%), var(--bg)',
      }}
    >
      <ThemeToggle style={{ position: 'absolute', top: 24, right: 24 }} />
      <form
        onSubmit={handleSubmit}
        className="card w-[380px] max-w-[92vw] px-6 py-8 sm:px-9 sm:py-10"
        style={{ boxShadow: 'var(--shadow-lg)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'var(--ink)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div className="font-serif" style={{ fontSize: 15, color: '#F3E9D2' }}>H</div>
          </div>
          <div className="font-serif" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>
            Haripriya Jewels
          </div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 28 }}>Lending management — staff sign in</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@haripriyajewels.com"
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          {error && (
            <div style={{ fontSize: 12, color: 'var(--danger)', background: 'var(--danger-soft)', borderRadius: 6, padding: '8px 10px' }}>
              {error}
            </div>
          )}
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: 6, padding: 11 }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  );
}
