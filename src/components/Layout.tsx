import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import WorkspaceSwitcher from './WorkspaceSwitcher';

function IconGrid() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function IconList() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" />
      <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconUpload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function IconTrendUp() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

function IconReceipt() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2v20l2-1.5L8 22l2-1.5L12 22l2-1.5L16 22l2-1.5L20 22V2l-2 1.5L16 2l-2 1.5L12 2l-2 1.5L8 2 6 3.5 4 2z" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="12" y2="16" />
    </svg>
  );
}

function IconRepeat() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function IconLeaf() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

type NavItem = { to: string; label: string; shortLabel: string; exact?: boolean; Icon: () => JSX.Element };
type NavGroup = { group: string; items: NavItem[] };
type NavEntry = NavItem | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'group' in entry;
}

const NAV: NavEntry[] = [
  { to: '/', label: 'Dashboard', shortLabel: 'Dashboard', exact: true, Icon: IconGrid },
  {
    group: 'Geld',
    items: [
      { to: '/transactions', label: 'Transacties', shortLabel: 'Transacties', Icon: IconList },
      { to: '/vaste-lasten', label: 'Vaste lasten', shortLabel: 'Vast', Icon: IconRepeat },
      { to: '/calendar', label: 'Kalender', shortLabel: 'Kalender', Icon: IconCalendar },
    ],
  },
  {
    group: 'Planning',
    items: [
      { to: '/projections', label: 'Projecties', shortLabel: 'Projecties', Icon: IconTrendUp },
      { to: '/taxes', label: 'Belasting', shortLabel: 'Belasting', Icon: IconReceipt },
      { to: '/sustainability', label: 'Duurzaam', shortLabel: 'Duurzaam', Icon: IconLeaf },
    ],
  },
  {
    group: 'Beheer',
    items: [
      { to: '/import', label: 'Import', shortLabel: 'Import', Icon: IconUpload },
      { to: '/settings', label: 'Instellingen', shortLabel: 'Stel in', Icon: IconSettings },
    ],
  },
];

// Routes with their own bottom-nav tab; every other route lives behind "Meer" on mobile.
const MOBILE_PRIMARY = ['/', '/transactions', '/projections'];

function isPathActive(pathname: string, to: string, exact?: boolean) {
  if (exact) return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

function NavGroupDropdown({ group }: { group: NavGroup }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const active = group.items.some(item => isPathActive(location.pathname, item.to));

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`nav-link nav-group-trigger${active ? ' active' : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {group.group}
        <span style={{ display: 'inline-flex', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }}>
          <IconChevronDown />
        </span>
      </button>
      {open && (
        <div className="nav-group-menu" role="menu">
          {group.items.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              role="menuitem"
              className={({ isActive }) => `nav-group-menu-item${isActive ? ' active' : ''}`}
            >
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMoreOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [moreOpen]);

  const groups = NAV.filter(isGroup);
  const moreActive = groups.some(g => g.items.some(item => isPathActive(location.pathname, item.to)));

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top header */}
      <header
        style={{
          background: 'rgba(10, 10, 26, 0.8)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: '0 auto',
            padding: '0 1rem',
            display: 'flex',
            alignItems: 'center',
            height: 56,
            gap: '2rem',
          }}
        >
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '0.5rem',
                background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              V
            </div>
            <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'white' }}>Vault Finance</span>
          </div>

          {/* Nav links — hidden on mobile via CSS */}
          <nav className="top-nav-links" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {NAV.map(entry =>
              isGroup(entry) ? (
                <NavGroupDropdown key={entry.group} group={entry} />
              ) : (
                <NavLink
                  key={entry.to}
                  to={entry.to}
                  end={entry.exact}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                  {entry.label}
                </NavLink>
              )
            )}
          </nav>

          {/* Workspace switcher — pushed to the right */}
          <div style={{ marginLeft: 'auto' }}>
            <WorkspaceSwitcher />
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="main-content" style={{ flex: 1, maxWidth: 1280, margin: '0 auto', width: '100%', padding: '1.25rem 1rem' }}>
        {children}
      </main>

      {/* Bottom nav — mobile only, shown via CSS */}
      <nav className="bottom-nav" aria-label="Navigatie">
        <div className="bottom-nav-inner">
          <NavLink to="/" end className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}>
            <IconGrid />
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/transactions" className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}>
            <IconList />
            <span>Transacties</span>
          </NavLink>
          <NavLink to="/projections" className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}>
            <IconTrendUp />
            <span>Projecties</span>
          </NavLink>
          <button
            type="button"
            className={`bottom-nav-item${moreActive ? ' active' : ''}`}
            onClick={() => setMoreOpen(o => !o)}
            aria-haspopup="true"
            aria-expanded={moreOpen}
          >
            <IconMore />
            <span>Meer</span>
          </button>
        </div>
      </nav>

      {/* "Meer" sheet — mobile only */}
      {moreOpen && (
        <div className="mobile-more-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="mobile-more-sheet" onClick={e => e.stopPropagation()}>
            <div className="mobile-more-handle" />
            {groups.map(group => {
              const items = group.items.filter(item => !MOBILE_PRIMARY.includes(item.to));
              if (items.length === 0) return null;
              return (
                <div key={group.group} className="mobile-more-group">
                  <div className="mobile-more-group-title">{group.group}</div>
                  {items.map(({ to, label, Icon }) => (
                    <NavLink
                      key={to}
                      to={to}
                      className={({ isActive }) => `mobile-more-item${isActive ? ' active' : ''}`}
                    >
                      <Icon />
                      <span>{label}</span>
                    </NavLink>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
