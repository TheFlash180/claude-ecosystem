#!/usr/bin/env node
// Builds every app in apps/ with the correct GitHub Pages base path,
// assembles them into dist/<app>/, and generates a launcher index.html
// listing all apps. Run locally with: npm run build
import { execSync } from 'node:child_process';
import { readdirSync, statSync, mkdirSync, cpSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const appsDir = join(root, 'apps');
const outDir = join(root, 'dist');

// Repo name for the Pages subpath. In CI, GITHUB_REPOSITORY is "owner/repo".
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'claude-ecosystem';

const apps = readdirSync(appsDir).filter((d) => statSync(join(appsDir, d)).isDirectory());

if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

for (const app of apps) {
  const base = `/${repo}/${app}/`;
  console.log(`\n=== Building ${app} (base: ${base}) ===`);
  execSync(`npm run build -w apps/${app}`, {
    stdio: 'inherit',
    env: { ...process.env, VITE_BASE: base },
  });
  cpSync(join(appsDir, app, 'dist'), join(outDir, app), { recursive: true });
}

// Launcher page at the site root.
const links = apps
  .map((a) => `<a class="app" href="./${a}/"><span class="dot"></span>${a}</a>`)
  .join('\n      ');

writeFileSync(
  join(outDir, 'index.html'),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Ecosystem</title>
    <style>
      body { margin:0; min-height:100vh; display:grid; place-content:center; gap:10px;
             background:#16181d; color:#e8e6e1; font-family:system-ui,sans-serif; }
      h1 { font-size:1rem; letter-spacing:0.15em; text-transform:uppercase; color:#9a9890;
           text-align:center; margin-bottom:12px; }
      .app { display:flex; align-items:center; gap:10px; padding:14px 22px; min-width:240px;
             background:#1f2229; border:1px solid #343945; border-radius:10px;
             color:#e8e6e1; text-decoration:none; font-weight:600; }
      .app:hover { border-color:#d40000; }
      .dot { width:8px; height:8px; border-radius:50%; background:#d40000; }
    </style>
  </head>
  <body>
    <h1>Ecosystem</h1>
      ${links}
  </body>
</html>
`
);

console.log(`\nSite assembled in dist/ with ${apps.length} app(s): ${apps.join(', ')}`);
