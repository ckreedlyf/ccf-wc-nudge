const crypto = require('crypto');
const { json, method } = require('../_lib/http');
const { requireSession } = require('../_lib/supabase');
const { appendAudit } = require('../_lib/google');

function temporaryPassword() {
  return `Ccf!${crypto.randomBytes(9).toString('base64url')}9a`;
}

function cleanRole(value) {
  const role = String(value || '').trim().toLowerCase();
  if (!['admin', 'imt', 'confirmation'].includes(role)) throw new Error('Invalid role.');
  return role;
}

async function auditWarning(payload) {
  try {
    await appendAudit(payload);
    return '';
  } catch (error) {
    return `Account change succeeded, but audit logging failed: ${error.message}`;
  }
}

module.exports = async function handler(req, res) {
  if (!method(req, res, ['GET', 'POST', 'PATCH'])) return;
  try {
    const { profile, admin } = await requireSession(req, res);
    if (profile.role !== 'admin') return json(res, 403, { error: 'Administrator access is required.' });
    if (profile.must_change_password) return json(res, 403, { error: 'Change your temporary password before managing users.' });

    if (req.method === 'GET') {
      const { data, error } = await admin.from('app_profiles').select('user_id,email,display_name,role,imt_assignment,must_change_password,active,created_at,updated_at').order('email');
      if (error) throw error;
      return json(res, 200, { users: data || [] });
    }

    if (req.method === 'POST') {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const displayName = String(req.body?.displayName || '').trim();
      const role = cleanRole(req.body?.role);
      const imtAssignment = String(req.body?.imtAssignment || '').trim().toUpperCase() || null;
      if (!email.includes('@')) return json(res, 400, { error: 'Enter a valid email address.' });
      if (role === 'imt' && !imtAssignment) return json(res, 400, { error: 'An IMT assignment is required for an IMT user.' });
      const password = temporaryPassword();
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error) throw created.error;
      const row = {
        user_id: created.data.user.id,
        email,
        display_name: displayName,
        role,
        imt_assignment: imtAssignment,
        must_change_password: true,
        active: true,
      };
      const saved = await admin.from('app_profiles').insert(row);
      if (saved.error) {
        await admin.auth.admin.deleteUser(created.data.user.id);
        throw saved.error;
      }
      const warning = await auditWarning({ email: profile.email, action: 'User account created', assignment: imtAssignment || role.toUpperCase(), targets: email, details: `${role} account created; password change required` });
      return json(res, 201, { user: row, temporaryPassword: password, auditWarning: warning });
    }

    const userId = String(req.body?.userId || '');
    if (!userId) return json(res, 400, { error: 'User ID is required.' });
    if (userId === profile.user_id && (req.body?.active === false || (req.body?.role && req.body.role !== 'admin'))) {
      return json(res, 400, { error: 'You cannot remove your own administrator access.' });
    }
    if (req.body?.action === 'reset-password') {
      const password = temporaryPassword();
      const reset = await admin.auth.admin.updateUserById(userId, { password });
      if (reset.error) throw reset.error;
      const saved = await admin.from('app_profiles').update({ must_change_password: true, updated_at: new Date().toISOString() }).eq('user_id', userId);
      if (saved.error) throw saved.error;
      const target = await admin.from('app_profiles').select('email,imt_assignment').eq('user_id', userId).single();
      const warning = await auditWarning({ email: profile.email, action: 'Temporary password reset', assignment: target.data?.imt_assignment || '', targets: target.data?.email || userId, details: 'Password change required before Sheet access' });
      return json(res, 200, { temporaryPassword: password, auditWarning: warning });
    }

    const updates = { updated_at: new Date().toISOString() };
    if ('active' in (req.body || {})) updates.active = Boolean(req.body.active);
    if (req.body?.role) updates.role = cleanRole(req.body.role);
    if ('imtAssignment' in (req.body || {})) updates.imt_assignment = String(req.body.imtAssignment || '').trim().toUpperCase() || null;
    const saved = await admin.from('app_profiles').update(updates).eq('user_id', userId).select().single();
    if (saved.error) throw saved.error;
    const warning = await auditWarning({ email: profile.email, action: updates.active === false ? 'User account disabled' : updates.active === true ? 'User account enabled' : 'User access changed', assignment: saved.data.imt_assignment || '', targets: saved.data.email, details: `Role: ${saved.data.role}` });
    json(res, 200, { user: saved.data, auditWarning: warning });
  } catch (error) {
    json(res, error.status || 500, { error: error.message || 'Unable to manage users.' });
  }
};
