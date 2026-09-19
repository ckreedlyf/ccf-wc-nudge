const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { json, method } = require('./_lib/http');
const { requireSession } = require('./_lib/supabase');
const { appendAudit } = require('./_lib/google');

function cleanImt(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16);
}

function integrationConfig() {
  const baseUrl = String(process.env.MINER_INTEGRATION_URL || 'https://ccf-miner-integration.vercel.app').replace(/\/$/, '');
  const secret = process.env.MINER_INTEGRATION_SHARED_SECRET;
  if (!secret) throw new Error('Miner Integration is not configured.');
  return { baseUrl, secret };
}

async function integrationFetch(path, options = {}) {
  const { baseUrl, secret } = integrationConfig();
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
}

async function integrationJson(path, options = {}) {
  const response = await integrationFetch(path, options);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(result.error || 'Miner Integration rejected the request.'), { status: response.status });
  return result;
}

module.exports = async function handler(req, res) {
  if (!method(req, res, ['GET', 'POST'])) return;
  try {
    const { profile } = await requireSession(req, res);
    if (!['imt', 'admin'].includes(profile.role)) return json(res, 403, { error: 'IMT or Administrator access is required.' });
    if (profile.must_change_password) return json(res, 403, { error: 'Change your temporary password before reviewing Miner updates.' });

    const url = new URL(req.url, 'http://localhost');
    const requestedAssignment = cleanImt(url.searchParams.get('assignment') || req.body?.assignment);
    const assignment = profile.role === 'imt' ? cleanImt(profile.imt_assignment) : requestedAssignment;
    if (!assignment) return json(res, 400, { error: 'Select an IMT assignment first.' });
    const query = `assignment=${encodeURIComponent(assignment)}`;

    if (req.method === 'GET' && url.searchParams.get('action') === 'proof') {
      const id = String(url.searchParams.get('id') || '');
      if (!id) return json(res, 400, { error: 'Miner update ID is required.' });
      const response = await integrationFetch(`/api/integration?action=proof&${query}&id=${encodeURIComponent(id)}`);
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        return json(res, response.status, { error: result.error || 'Unable to open the attendance proof.' });
      }
      res.statusCode = 200;
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
      res.setHeader('Content-Disposition', 'inline; filename="attendance-proof"');
      await pipeline(Readable.fromWeb(response.body), res);
      return;
    }

    if (req.method === 'GET') {
      const result = await integrationJson(`/api/integration?action=pending&${query}`);
      return json(res, 200, result);
    }

    const decision = String(req.body?.decision || '');
    const note = String(req.body?.note || '').trim().slice(0, 1000);
    if (!['approve', 'return'].includes(decision)) return json(res, 400, { error: 'Choose Approve or Return to Miner.' });
    if (decision === 'return' && !note) return json(res, 400, { error: 'Add a correction note before returning the update.' });
    const result = await integrationJson(`/api/integration?action=review&${query}`, {
      method: 'POST',
      body: JSON.stringify({ id: req.body?.id, decision, note, reviewerEmail: profile.email }),
    });
    let auditWarning = '';
    try {
      const proposal = result.proposal || {};
      await appendAudit({
        email: profile.email,
        action: decision === 'approve' ? 'Miner update approved' : 'Miner update returned',
        assignment,
        targets: `${proposal.miner?.name || 'Miner'} / ${proposal.seeker?.id || ''} ${proposal.seeker?.name || 'Seeker'}`.trim(),
        rows: 1,
        tabs: proposal.seeker?.tab || 'Miner Integration',
        details: decision === 'approve' ? `${proposal.status || ''} ${proposal.statusLabel || ''}; ${result.harvest?.reason || 'approval recorded'}`.trim() : note,
      });
    } catch (error) {
      auditWarning = `Review saved, but audit logging failed: ${error.message}`;
    }
    json(res, 200, { ...result, auditWarning });
  } catch (error) {
    json(res, error.status || 500, { error: error.message || 'Unable to load Miner updates.' });
  }
};

module.exports._test = { cleanImt };
