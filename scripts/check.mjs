import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('index.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
for (const script of scripts) new vm.Script(script);

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
  'supabase/migrations/202609120001_app_profiles.sql',
];
for (const file of expectedFiles) {
  if (!fs.existsSync(file)) throw new Error(`Missing required access-control file: ${file}`);
}

console.log('Role-access checks passed.');
