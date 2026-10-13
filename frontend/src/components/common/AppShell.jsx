import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { useBranch } from '../../context/BranchContext.jsx';
import { useMyRole, isAdminRole } from '../../hooks/useMyRole.js';
import { useShortcuts, SHORTCUTS } from '../../hooks/useShortcuts.js';
import GlobalSearch from './GlobalSearch.jsx';
import Modal from './Modal.jsx';
import { Kbd } from './Kbd.jsx';

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/borrowers', label: 'Borrowers' },
  { to: '/loans', label: 'Loans' },
  { to: '/payments', label: 'Payments' },
  { to: '/day-book', label: 'Day Book' },
  { to: '/notices', label: 'Notices' },
  { to: '/coverage', label: 'Coverage' },
  { to: '/storage', label: 'Storage' },
  { to: '/accounts', label: 'Accounts' },
  { to: '/reports', label: 'Reports' },
];

// Email, theme, settings and sign-out live in one account menu so the bar
// only carries page links (it used to wrap "Admin Settings"/"Sign out").
function AccountMenu({ email, isAdmin, onLogout, onShortcuts }) {
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initial = (email || '?').trim()[0]?.toUpperCase();
  const goTo = (path) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <div className="account" ref={ref}>
      <button type="button" className="account-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="account-avatar" aria-hidden>{initial}</span>
        <span className="sr-only">Account menu</span>
      </button>
      {open && (
        <div className="account-menu" role="menu">
          <div className="account-email" title={email}>{email}</div>
          <button role="menuitem" type="button" onClick={() => goTo('/admin/settings')}>Settings</button>
          {isAdmin && <button role="menuitem" type="button" onClick={() => goTo('/activity')}>Activity log</button>}
          <button role="menuitem" type="button" onClick={() => { setOpen(false); onShortcuts(); }}>Keyboard shortcuts</button>
          <button role="menuitem" type="button" onClick={toggleTheme}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>
          <div className="account-sep" />
          <button role="menuitem" type="button" onClick={onLogout}>Sign out</button>
        </div>
      )}
    </div>
  );
}

// Shown only once there is more than one branch. Staff tied to a branch
// just see its name; everyone else can switch, or view all branches.
function BranchSwitcher() {
  const { multiBranch, activeBranches, branchId, selectBranch, pinnedBranchId, currentBranch, canViewAll } = useBranch();
  if (!multiBranch && !pinnedBranchId) return null;
  if (pinnedBranchId) {
    return <span className="shell-branch-pill" title="Your branch">{currentBranch?.name || 'My branch'}</span>;
  }
  return (
    <select className="shell-branch" value={branchId} onChange={(e) => selectBranch(e.target.value)} aria-label="Branch">
      {canViewAll && <option value="all">All branches</option>}
      {activeBranches.map((b) => (
        <option key={b.id} value={b.id}>{b.name}</option>
      ))}
    </select>
  );
}

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const { branchId } = useBranch();
  const role = useMyRole();
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
    setSearchOpen(false);
  }, [location.pathname]);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const handlers = useMemo(
    () => ({
      // On the dashboard the big inline search box takes focus instead.
      search: () => {
        const inline = document.getElementById('dashboard-search');
        if (inline) inline.focus();
        else setSearchOpen(true);
      },
      newLoan: () => navigate('/loans?new=1'),
      newBorrower: () => navigate('/borrowers?new=1'),
      payments: () => navigate('/payments'),
      dayBook: () => navigate('/day-book'),
      home: () => navigate('/dashboard'),
      help: () => setHelpOpen(true),
    }),
    [navigate]
  );
  useShortcuts(handlers);

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="shell-bar">
        <NavLink to="/dashboard" className="shell-brand" aria-label="Haripriya home">
          <span className="shell-mark" aria-hidden>H</span>
          <span className="shell-name">Haripriya</span>
        </NavLink>

        <nav className="shell-nav hidden xl:flex" aria-label="Main">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className="nav-link">
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <BranchSwitcher />
          <button type="button" className="shell-search" onClick={handlers.search} aria-label="Search (press /)" title="Search  ( / or Ctrl+K )">
            <span aria-hidden>⌕</span>
            <span className="shell-search-label">Search</span>
            <Kbd>/</Kbd>
          </button>
          <AccountMenu email={user?.email} isAdmin={isAdminRole(role)} onLogout={handleLogout} onShortcuts={() => setHelpOpen(true)} />
          <button
            type="button"
            className="shell-burger xl:hidden"
            onClick={() => setNavOpen((v) => !v)}
            aria-label={navOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={navOpen}
          >
            {navOpen ? '✕' : '☰'}
          </button>
        </div>
      </header>

      {navOpen && (
        <nav className="shell-drawer flex flex-col xl:hidden" aria-label="Main">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className="nav-link">
              {item.label}
            </NavLink>
          ))}
          {isAdminRole(role) && <NavLink to="/activity" className="nav-link">Activity log</NavLink>}
          <NavLink to="/admin/settings" className="nav-link">Settings</NavLink>
        </nav>
      )}

      {/* Keyed on the branch so switching remounts the page and it refetches. */}
      <main key={branchId} id="main" className="flex-1 px-4 py-6 md:px-8 md:py-8" style={{ maxWidth: 1280, width: '100%', margin: '0 auto' }}>
        {children}
      </main>

      {searchOpen && (
        <div className="modal-overlay search-overlay" onClick={() => setSearchOpen(false)}>
          <div className="modal-panel search-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Search">
            <GlobalSearch autoFocus onDone={() => setSearchOpen(false)} />
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> move</span>
              <span><Kbd>Enter</Kbd> open</span>
              <span><Kbd>Esc</Kbd> close</span>
            </div>
          </div>
        </div>
      )}

      {helpOpen && (
        <Modal title="Keyboard shortcuts" onClose={() => setHelpOpen(false)}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0 }}>
            Press these anywhere except while typing in a box.
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {SHORTCUTS.map((s) => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, fontSize: 14 }}>
                <span>{s.label}</span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {s.keys.map((k) => <Kbd key={k}>{k}</Kbd>)}
                  {s.alt && (
                    <>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>or</span>
                      {s.alt.map((k) => <Kbd key={k}>{k}</Kbd>)}
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
