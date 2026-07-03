import React from 'react';

interface AppShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
}

/**
 * Consistent chrome for every ecosystem app: header bar, safe-area
 * padding for phone installs, and a max-width content column.
 */
export function AppShell({ title, subtitle, children, headerRight }: AppShellProps) {
  return (
    <div style={styles.root}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>{title}</h1>
          {subtitle && <p style={styles.subtitle}>{subtitle}</p>}
        </div>
        {headerRight && <div>{headerRight}</div>}
      </header>
      <main style={styles.main}>{children}</main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    paddingTop: 'env(safe-area-inset-top)',
    paddingBottom: 'env(safe-area-inset-bottom)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--surface)',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  title: {
    margin: 0,
    fontSize: '1.15rem',
    fontWeight: 700,
    letterSpacing: '-0.01em',
  },
  subtitle: {
    margin: '2px 0 0',
    fontSize: '0.8rem',
    color: 'var(--text-dim)',
  },
  main: {
    maxWidth: 900,
    margin: '0 auto',
    padding: '20px',
  },
};
