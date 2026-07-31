import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import ThemeToggle from './ThemeToggle.jsx';

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/borrowers', label: 'Borrowers' },
  { to: '/loans', label: 'Loans' },
  { to: '/payments', label: 'Payments' },
  { to: '/notices', label: 'Notices' },
  { to: '/coverage', label: 'Coverage' },
  { to: '/storage', label: 'Storage' },
  { to: '/reports', label: 'Reports' },
  { to: '/admin/settings', label: 'Admin Settings' },
];

const navLinkStyle = ({ isActive }) => ({
  padding: '8px 14px',
  borderRadius: 8,
  fontSize: 13.5,
  fontWeight: isActive ? 600 : 500,
  textDecoration: 'none',
  color: isActive ? '#F3E9D2' : '#C9B89A',
  background: isActive ? 'rgba(203,164,92,0.16)' : 'transparent',
  boxShadow: isActive ? 'inset 0 -2px 0 var(--gold)' : 'inset 0 -2px 0 transparent',
  transition: 'color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease',
});

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);

  async function handleLogout() {
    setNavOpen(false);
    await logout();
    navigate('/login');
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          background: 'color-mix(in srgb, var(--ink) 88%, transparent)',
          backdropFilter: 'blur(10px)',
          color: '#C9B89A',
          display: 'flex',
          alignItems: 'center',
          gap: 28,
          padding: '0 20px',
          height: 62,
          position: 'sticky',
          top: 0,
          zIndex: 50,
          borderBottom: '1px solid rgba(203,164,92,0.18)',
          boxShadow: '0 1px 0 rgba(0,0,0,0.25)',
        }}
        className="md:px-8"
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

        <nav className="hidden md:flex" style={{ gap: 4, flex: 1 }}>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} style={navLinkStyle}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden md:flex" style={{ flex: 1 }} />

        <div className="hidden md:flex" style={{ alignItems: 'center', gap: 14 }}>
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

        <div className="flex md:hidden items-center gap-2 ml-auto">
          <ThemeToggle style={{ border: '1px solid #4a4030' }} />
          <button
            type="button"
            onClick={() => setNavOpen((v) => !v)}
            aria-label={navOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={navOpen}
            className="btn"
            style={{ background: 'transparent', color: '#C9B89A', border: '1px solid #4a4030', width: 34, height: 34, padding: 0, fontSize: 16 }}
          >
            {navOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {navOpen && (
        <div
          className="md:hidden flex flex-col"
          style={{ background: 'var(--ink)', borderTop: '1px solid #362E22', position: 'sticky', top: 62, zIndex: 49, padding: '10px 16px 16px' }}
        >
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} onClick={() => setNavOpen(false)} style={navLinkStyle}>
              {item.label}
            </NavLink>
          ))}
          <div style={{ borderTop: '1px solid #362E22', margin: '10px 0' }} />
          <div style={{ fontSize: 12.5, color: '#C9B89A', padding: '0 14px 10px' }}>{user?.email}</div>
          <button
            onClick={handleLogout}
            className="btn"
            style={{ background: 'transparent', color: '#C9B89A', border: '1px solid #4a4030', padding: '9px 12px', margin: '0 14px' }}
          >
            Sign out
          </button>
        </div>
      )}

      <div className="flex-1 px-4 py-6 md:px-8 md:py-7" style={{ maxWidth: 1280, width: '100%', margin: '0 auto' }}>
        {children}
      </div>
    </div>
  );
}
