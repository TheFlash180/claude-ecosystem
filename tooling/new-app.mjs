#!/usr/bin/env node
// Scaffolds a new app from the dashboard template.
// Usage: npm run new-app -- fintrack "FinTrack" "Personal finance dashboard"
import { cpSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [, , id, displayName, description = ''] = process.argv;

if (!id || !displayName) {
  console.error('Usage: npm run new-app -- <app-id> "<Display Name>" "[description]"');
  console.error('Example: npm run new-app -- fintrack "FinTrack" "Personal finance dashboard"');
  process.exit(1);
}

if (!/^[a-z0-9-]+$/.test(id)) {
  console.error('App id must be lowercase letters, numbers, and hyphens only (it becomes the URL path).');
  process.exit(1);
}

const src = join('apps', 'dashboard');
const dest = join('apps', id);

if (existsSync(dest)) {
  console.error(`apps/${id} already exists.`);
  process.exit(1);
}

cpSync(src, dest, {
  recursive: true,
  filter: (p) => !p.includes('node_modules') && !p.includes('dist'),
});

// Patch package.json
const pkgPath = join(dest, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.name = id;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// Patch manifest names in vite.config.ts
const vitePath = join(dest, 'vite.config.ts');
let vite = readFileSync(vitePath, 'utf8');
vite = vite
  .replace("name: 'Ecosystem Dashboard'", `name: '${displayName}'`)
  .replace("short_name: 'Dashboard'", `short_name: '${displayName}'`)
  .replace(
    "description: 'Unified front door for the personal automation ecosystem'",
    `description: '${description || displayName}'`
  );
writeFileSync(vitePath, vite);

// Patch index.html title
const htmlPath = join(dest, 'index.html');
writeFileSync(
  htmlPath,
  readFileSync(htmlPath, 'utf8').replace('<title>Ecosystem Dashboard</title>', `<title>${displayName}</title>`)
);

// Reset App.tsx to a minimal starter
writeFileSync(
  join(dest, 'src', 'App.tsx'),
  `import React from 'react';
import { AppShell } from '@ecosystem/shared';

export default function App() {
  return (
    <AppShell title="${displayName}" subtitle="${description}">
      <p>Ready to build.</p>
    </AppShell>
  );
}
`
);

console.log(`Created apps/${id}. Run: npm install && npm run dev -w apps/${id}`);
console.log('It will be included in the next deploy automatically.');
