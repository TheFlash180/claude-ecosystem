#!/usr/bin/env node
// Builds every app in apps/ for GitHub Pages. The dashboard is the hub: it
// builds at the site ROOT (so its installed PWA scope covers every app) and
// receives the list of sub-apps via VITE_APPS to render launch tiles.
// Sub-apps land at /<repo>/<app>/. Run locally with: npm run build
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, mkdirSync, cpSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const appsDir = join(root, 'apps');
const outDir = join(root, 'dist');

// Repo name for the Pages subpath. In CI, GITHUB_REPOSITORY is "owner/repo".
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'claude-ecosystem';

const apps = readdirSync(appsDir).filter((d) => statSync(join(appsDir, d)).isDirectory());
const subApps = apps.filter((a) => a !== 'dashboard');

// App display names come from each app's <title>.
const appMeta = subApps.map((slug) => {
  let name = slug;
  try {
    const html = readFileSync(join(appsDir, slug, 'index.html'), 'utf8');
    const m = html.match(/<title>([^<]+)<\/title>/i);
    if (m) name = m[1].trim();
  } catch { /* fall back to slug */ }
  return { slug, name };
});

if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

for (const app of subApps) {
  const base = `/${repo}/${app}/`;
  console.log(`\n=== Building ${app} (base: ${base}) ===`);
  execSync(`npm run build -w apps/${app}`, {
    stdio: 'inherit',
    env: { ...process.env, VITE_BASE: base },
  });
  cpSync(join(appsDir, app, 'dist'), join(outDir, app), { recursive: true });
}

// Dashboard last, at the root, aware of the other apps.
const rootBase = `/${repo}/`;
console.log(`\n=== Building dashboard (base: ${rootBase}, hub) ===`);
execSync('npm run build -w apps/dashboard', {
  stdio: 'inherit',
  env: { ...process.env, VITE_BASE: rootBase, VITE_APPS: JSON.stringify(appMeta) },
});
cpSync(join(appsDir, 'dashboard', 'dist'), outDir, { recursive: true });

// The dashboard used to live at /dashboard/. Leave a redirect for old links
// and a self-destructing service worker so previously installed PWAs pointing
// there clean themselves up and land on the hub.
const legacyDir = join(outDir, 'dashboard');
mkdirSync(legacyDir, { recursive: true });
writeFileSync(
  join(legacyDir, 'index.html'),
  `<!doctype html><meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=${rootBase}">
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
  }
  location.replace('${rootBase}');
</script>
<a href="${rootBase}">The dashboard moved to the ecosystem root - tap here.</a>
`,
);
writeFileSync(
  join(legacyDir, 'sw.js'),
  `// Kill-switch: replaces the old dashboard service worker, clears its caches,
// unregisters itself, and reloads clients so they pick up the redirect.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate('${rootBase}');
  })());
});
`,
);

console.log(`\nSite assembled in dist/: hub at root + ${subApps.length} app(s): ${subApps.join(', ')}`);
