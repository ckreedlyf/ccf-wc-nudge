const { json, method } = require('../_lib/http');
const { requireSession, publicProfile } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;
  try {
    const password = String(req.body?.password || '');
    if (password.length < 12) return json(res, 400, { error: 'Use at least 12 characters for the new password.' });
    const { user, profile, admin } = await requireSession(req, res);
    const changed = await admin.auth.admin.updateUserById(user.id, { password });
    if (changed.error) throw changed.error;
    const updated = await admin.from('app_profiles').update({ must_change_password: false, updated_at: new Date().toISOString() }).eq('user_id', user.id);
    if (updated.error) throw updated.error;
    json(res, 200, { ok: true, user: publicProfile({ ...profile, must_change_password: false }) });
  } catch (error) {
    json(res, error.status || 500, { error: error.message || 'Unable to change password.' });
  }
};
