import crypto from 'node:crypto';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);

const users = [
  { email: 'megsrafols@gmail.com', display_name: 'Megs Rafols', role: 'imt', imt_assignment: 'MR' },
  { email: 'valeriezandueta@gmail.com', display_name: 'Valerie Zandueta', role: 'imt', imt_assignment: 'VZ' },
  { email: 'juminagayo@gmail.com', display_name: 'Jumi Nagayo', role: 'admin', imt_assignment: 'JG' },
  { email: 'jeccatorres02@gmail.com', display_name: 'Jecca Torres', role: 'imt', imt_assignment: 'JT' },
  { email: 'gamboarmell@gmail.com', display_name: 'Gambo Armell', role: 'confirmation', imt_assignment: 'RG' },
];

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const credentials = [];

for (const profile of users) {
  const password = `Ccf!${crypto.randomBytes(9).toString('base64url')}9a`;
  const created = await supabase.auth.admin.createUser({ email: profile.email, password, email_confirm: true });
  if (created.error) {
    console.error(`${profile.email}: ${created.error.message}`);
    continue;
  }
  const saved = await supabase.from('app_profiles').insert({
    user_id: created.data.user.id,
    ...profile,
    must_change_password: true,
    active: true,
  });
  if (saved.error) {
    await supabase.auth.admin.deleteUser(created.data.user.id);
    console.error(`${profile.email}: ${saved.error.message}`);
    continue;
  }
  credentials.push({ email: profile.email, temporaryPassword: password });
}

const credentialsPath = new URL('../initial-credentials.private.json', import.meta.url);
fs.writeFileSync(credentialsPath, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
console.log(`Created ${credentials.length} account(s). Temporary credentials were saved to initial-credentials.private.json.`);
