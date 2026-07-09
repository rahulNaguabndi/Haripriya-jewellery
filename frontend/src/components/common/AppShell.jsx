import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import ThemeToggle from './ThemeToggle.jsx';

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/borrowers', label: 'Borrowers' },
  { to: '/loans', label: 'Loans' },
  { to: '/payments', label: 'Payments' },
  { to: '/reports', label: 'Reports' },
  { to: '/admin/settings', label: 'Admin Settings' },
];

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          background: 'var(--ink)',
          color: '#C9B89A',
          display: 'flex',
          alignItems: 'center',
          gap: 28,
          padding: '0 32px',
          height: 62,
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              border: '1px solid var(--gold)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <div className="font-serif" style={{ fontSize: 17, color: 'var(--gold)' }}>H</div>
          </div>
          <div className="font-serif" style={{ fontSize: 19, fontWeight: 600, color: '#F3E9D2', letterSpacing: '0.01em' }}>
            Haripriya
          </div>
        </div>

        <nav style={{ display: 'flex', gap: 4, flex: 1 }}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                padding: '8px 14px',
                borderRadius: 7,
                fontSize: 13.5,
                fontWeight: 500,
                textDecoration: 'none',
                color: isActive ? '#F3E9D2' : '#C9B89A',
                background: isActive ? 'rgba(203,164,92,0.15)' : 'transparent',
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ fontSize: 12.5, color: '#C9B89A' }}>{user?.email}</div>
          <ThemeToggle style={{ border: '1px solid #4a4030' }} />
          <button
            onClick={handleLogout}
            className="btn"
            style={{ background: 'transparent', color: '#C9B89A', border: '1px solid #4a4030', padding: '7px 12px' }}
          >
            Sign out
          </button>
        </div>
      </div>

      <div style={{ flex: 1, padding: '28px 32px', maxWidth: 1280, width: '100%', margin: '0 auto' }}>{children}</div>
    </div>
  );
}
