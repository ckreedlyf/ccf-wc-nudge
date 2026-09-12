const { createClient } = require('@supabase/supabase-js');
const { ACCESS_COOKIE, REFRESH_COOKIE, parseCookies, setSessionCookies } = require('./http');

function clients() {
  const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Server configuration is incomplete: ${missing.join(', ')}`);
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  return {
    anon: createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, options),
    admin: createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, options),
  };
}

async function profileFor(admin, user) {
  const { data, error } = await admin.from('app_profiles').select('user_id,email,display_name,role,imt_assignment,must_change_password,active').eq('user_id', user.id).single();
  if (error || !data) throw new Error('This account is not configured for the CCF Nudge Tool.');
  if (!data.active) throw new Error('This account is disabled. Please contact the administrator.');
  return data;
}

async function requireSession(req, res) {
  const { anon, admin } = clients();
  const cookies = parseCookies(req);
  let accessToken = cookies[ACCESS_COOKIE];
  let result = accessToken ? await anon.auth.getUser(accessToken) : { data: {}, error: new Error('Missing session') };

  if ((result.error || !result.data.user) && cookies[REFRESH_COOKIE]) {
    const refreshed = await anon.auth.refreshSession({ refresh_token: cookies[REFRESH_COOKIE] });
    if (!refreshed.error && refreshed.data.session) {
      setSessionCookies(res, refreshed.data.session);
      accessToken = refreshed.data.session.access_token;
      result = { data: { user: refreshed.data.user }, error: null };
    }
  }

  if (result.error || !result.data.user) {
    const error = new Error('Your session has expired. Please sign in again.');
    error.status = 401;
    throw error;
  }

  const profile = await profileFor(admin, result.data.user);
  return { user: result.data.user, profile, accessToken, anon, admin };
}

function publicProfile(profile) {
  return {
    email: profile.email,
    displayName: profile.display_name || '',
    role: profile.role,
    imtAssignment: profile.imt_assignment || '',
    mustChangePassword: Boolean(profile.must_change_password),
  };
}

module.exports = { clients, requireSession, publicProfile, profileFor };
