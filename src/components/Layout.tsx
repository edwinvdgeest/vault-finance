import { NavLink } from 'react-router-dom';

const NAV = [
  { to: '/', label: 'Dashboard', exact: true },
  { to: '/transactions', label: 'Transacties' },
  { to: '/import', label: 'Import' },
  { to: '/settings', label: 'Instellingen' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top nav */}
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
            padding: '0 1.5rem',
            display: 'flex',
            alignItems: 'center',
            height: 60,
            gap: '2rem',
          }}
        >
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '1rem' }}>
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

          {/* Nav links */}
          <nav style={{ display: 'flex', gap: '0.25rem' }}>
            {NAV.map(({ to, label, exact }) => (
              <NavLink
                key={to}
                to={to}
                end={exact}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main style={{ flex: 1, maxWidth: 1280, margin: '0 auto', width: '100%', padding: '1.5rem' }}>
        {children}
      </main>
    </div>
  );
}
