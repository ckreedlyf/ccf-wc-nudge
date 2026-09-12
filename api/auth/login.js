const { json, method, setSessionCookies } = require('../_lib/http');
const { clients, profileFor, publicProfile } = require('../_lib/supabase');
const { appendAudit } = require('../_lib/google');

module.exports = async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) return json(res, 400, { error: 'Email and password are required.' });
    const { anon, admin } = clients();
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) return json(res, 401, { error: 'Invalid email or password.' });
    const profile = await profileFor(admin, data.user);
    setSessionCookies(res, data.session);
    let auditWarning = '';
    try {
      await appendAudit({ email: profile.email, action: 'Signed in', assignment: profile.imt_assignment || profile.role.toUpperCase(), details: `${profile.role} account` });
    } catch (auditError) {
      auditWarning = `Sign-in succeeded, but audit logging failed: ${auditError.message}`;
    }
    json(res, 200, { user: publicProfile(profile), auditWarning });
  } catch (error) {
    json(res, error.status || 500, { error: error.message || 'Unable to sign in.' });
  }
};
