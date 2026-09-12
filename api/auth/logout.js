const { clearSessionCookies, json, method } = require('../_lib/http');
const { requireSession } = require('../_lib/supabase');
const { appendAudit } = require('../_lib/google');

module.exports = async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;
  try {
    const { profile } = await requireSession(req, res);
    await appendAudit({ email: profile.email, action: 'Signed out', assignment: profile.imt_assignment || profile.role.toUpperCase(), details: `${profile.role} account` });
  } catch {
    // Signing out must still succeed when the session or audit service is unavailable.
  }
  clearSessionCookies(res);
  json(res, 200, { ok: true });
};
