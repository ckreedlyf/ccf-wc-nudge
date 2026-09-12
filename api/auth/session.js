const { json, method } = require('../_lib/http');
const { requireSession, publicProfile } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
  if (!method(req, res, ['GET'])) return;
  try {
    const { profile } = await requireSession(req, res);
    json(res, 200, { user: publicProfile(profile) });
  } catch (error) {
    json(res, error.status || 401, { error: error.message });
  }
};
