import React, { useEffect, useState } from 'react';
import { AppShell, supabaseConfigured, getSupabase } from '@ecosystem/shared';
import {
  Baby, Clapperboard, ChefHat, Trophy, Dumbbell, Wallet, Gift,
  LayoutGrid, ArrowUpRight, type LucideIcon,
} from 'lucide-react';
import { parseApps } from './lib/apps';
import { metaFor, greeting, type IconKey } from './lib/appMeta';

type CloudStatus = 'checking' | 'connected' | 'not-configured' | 'error';

// Injected by tooling/build-all.mjs: every app deployed alongside the hub.
function installedApps() {
  return parseApps(import.meta.env.VITE_APPS as string | undefined);
}

// Apps that live outside this repo but belong to the family. The slug is only
// used to look up its colour and icon; the href is absolute.
const EXTERNAL: { slug: string; name: string; url: string }[] = [
  { slug: 'fintrack-pro', name: 'FinTrack Pro', url: 'https://theflash180.github.io/fintrack-pro/' },
  { slug: 'baby-registry', name: 'Baby Registry', url: 'https://theflash180.github.io/baby-registry-pwa/' },
];

const ICONS: Record<IconKey, LucideIcon> = {
  baby: Baby,
  film: Clapperboard,
  chef: ChefHat,
  trophy: Trophy,
  dumbbell: Dumbbell,
  wallet: Wallet,
  gift: Gift,
  app: LayoutGrid,
};

export default function App() {
  const [cloud, setCloud] = useState<CloudStatus>('checking');
  const apps = installedApps();

  useEffect(() => {
    if (!supabaseConfigured()) {
      setCloud('not-configured');
      return;
    }
    getSupabase()
      .from('ping')
      .select('id')
      .limit(1)
      .then(({ error }) => setCloud(error ? 'error' : 'connected'));
  }, []);

  const now = new Date();
  const today = now.toLocaleDateString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return (
    <AppShell title="Ecosystem" subtitle="All apps, one home" headerRight={<CloudBadge status={cloud} />}>
      <style>{CSS}</style>

      <section className="hero">
        <h2 className="hero-greet">{greeting(now.getHours())}</h2>
        <p className="hero-date">{today}</p>
      </section>

      {apps.length > 0 && (
        <>
          <h3 className="section-label">Your apps</h3>
          <div className="grid">
            {apps.map((a) => (
              <Tile key={a.slug} slug={a.slug} name={a.name} href={`./${a.slug}/`} />
            ))}
          </div>
        </>
      )}

      <h3 className="section-label">Elsewhere</h3>
      <div className="grid">
        {EXTERNAL.map((a) => (
          <Tile key={a.slug} slug={a.slug} name={a.name} href={a.url} external />
        ))}
      </div>

      {apps.length === 0 && (
        <p className="empty">
          No bundled apps were found in this build — the tiles above still work.
        </p>
      )}
    </AppShell>
  );
}

function Tile({
  slug, name, href, external,
}: {
  slug: string; name: string; href: string; external?: boolean;
}) {
  const meta = metaFor(slug);
  const Icon = ICONS[meta.icon];
  return (
    <a
      className="tile"
      href={href}
      // Drives the per-app tint without a stylesheet entry per app.
      style={{ ['--tile' as string]: meta.color }}
      {...(external ? { rel: 'noreferrer' } : {})}
    >
      <span className="tile-icon" aria-hidden="true">
        <Icon size={20} strokeWidth={2} />
      </span>
      <span className="tile-body">
        <span className="tile-name">
          {name}
          {external && <ArrowUpRight className="tile-out" size={13} strokeWidth={2.5} />}
        </span>
        <span className="tile-note">{meta.note}</span>
      </span>
    </a>
  );
}

function CloudBadge({ status }: { status: CloudStatus }) {
  const map: Record<CloudStatus, { label: string; color: string }> = {
    checking: { label: 'Checking', color: 'var(--text-dim)' },
    connected: { label: 'Connected', color: 'var(--ok)' },
    'not-configured': { label: 'Local only', color: 'var(--warn)' },
    error: { label: 'Cloud error', color: 'var(--accent)' },
  };
  const { label, color } = map[status];
  return (
    <span className="cloud" style={{ ['--dot' as string]: color }}>
      <span className={`cloud-dot${status === 'checking' ? ' pulsing' : ''}`} />
      {label}
    </span>
  );
}

const CSS = `
.hero { margin: 4px 0 22px; }
.hero-greet {
  margin: 0; font-size: 1.6rem; font-weight: 700; letter-spacing: -0.02em;
  background: linear-gradient(120deg, var(--text) 30%, var(--text-dim));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.hero-date {
  margin: 3px 0 0; font-size: 0.82rem; color: var(--text-dim);
  font-family: var(--font-data);
}

.section-label {
  margin: 24px 0 10px; font-size: 0.68rem; font-weight: 700;
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-dim);
}
.section-label:first-of-type { margin-top: 0; }

/* 230px keeps three roomy columns at the 900px content width. Narrower and
   the longer notes ("fixtures & reminders") start truncating. */
.grid {
  display: grid; gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
}

.tile {
  position: relative; display: flex; align-items: center; gap: 13px;
  padding: 15px 16px; text-decoration: none; color: inherit;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); overflow: hidden;
  transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
}
/* A hairline of the app's own colour, so the grid reads as distinct apps. */
.tile::before {
  content: ''; position: absolute; inset: 0 auto 0 0; width: 3px;
  background: var(--tile); opacity: 0.85;
}
.tile:hover, .tile:focus-visible {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--tile) 55%, var(--border));
  box-shadow: 0 6px 20px -6px color-mix(in srgb, var(--tile) 40%, transparent);
}
.tile:focus-visible { outline: 2px solid var(--tile); outline-offset: 2px; }
.tile:active { transform: translateY(0); }

.tile-icon {
  flex-shrink: 0; width: 38px; height: 38px; border-radius: 10px;
  display: grid; place-items: center; color: var(--tile);
  background: color-mix(in srgb, var(--tile) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--tile) 28%, transparent);
}
.tile-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tile-name {
  font-weight: 600; font-size: 0.93rem; display: flex; align-items: center; gap: 4px;
  white-space: nowrap; overflow: hidden;
}
.tile-out { color: var(--text-dim); flex-shrink: 0; }
.tile-note {
  font-size: 0.75rem; color: var(--text-dim);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.cloud {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 0.72rem; font-family: var(--font-data); color: var(--text-dim);
  padding: 4px 10px; border-radius: 999px;
  background: var(--bg); border: 1px solid var(--border);
}
.cloud-dot {
  width: 6px; height: 6px; border-radius: 50%; background: var(--dot);
  box-shadow: 0 0 6px var(--dot); flex-shrink: 0;
}
.cloud-dot.pulsing { animation: cloud-pulse 1.4s ease-in-out infinite; }
@keyframes cloud-pulse { 50% { opacity: 0.25; } }

.empty {
  margin-top: 18px; font-size: 0.8rem; color: var(--text-dim); text-align: center;
}

/* Colour-mix is widely supported, but fall back to the plain border rather
   than rendering a transparent tile on older engines. */
@supports not (color: color-mix(in srgb, red 50%, blue)) {
  .tile-icon { background: var(--surface-raised); border-color: var(--border); }
  .tile:hover, .tile:focus-visible { border-color: var(--tile); }
}

@media (prefers-reduced-motion: reduce) {
  .tile { transition: none; }
  .tile:hover, .tile:focus-visible { transform: none; }
  .cloud-dot.pulsing { animation: none; }
}
`;
