import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('index.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
for (const script of scripts) new vm.Script(script);

// Catch stale DOM references after dashboard markup changes.
const markup = html.replace(/<script>[\s\S]*?<\/script>/g, '');
const elementIds = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
for (const script of scripts) {
  for (const [, id] of script.matchAll(/\$\(['"]([^'"]+)['"]\)/g)) {
    if (!elementIds.has(id)) throw new Error(`Missing UI element referenced by script: ${id}`);
  }
}

const forbidden = ['GOCSPX-', 'AIzaSy', '.apps.googleusercontent.com'];
for (const marker of forbidden) {
  if (html.includes(marker)) throw new Error(`Browser source still contains a retired credential marker: ${marker}`);
}

const expectedFiles = [
  'api/auth/login.js',
  'api/auth/session.js',
  'api/auth/logout.js',
  'api/auth/change-password.js',
  'api/admin/users.js',
  'api/sheets.js',
  'api/miner-updates.js',
  'supabase/migrations/202609120001_app_profiles.sql',
];
for (const file of expectedFiles) {
  if (!fs.existsSync(file)) throw new Error(`Missing required access-control file: ${file}`);
}

console.log('Role-access checks passed.');
