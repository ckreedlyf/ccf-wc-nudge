const { json, method } = require('./_lib/http');
const { requireSession } = require('./_lib/supabase');
const { appendAudit } = require('./_lib/google');
const { getReportOptions, getReport } = require('./_lib/reporting');
const { renderReportPdfBuffer } = require('./_lib/report-pdf');

function filtersFrom(body = {}) {
  const cleanImt = String(body.imt || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16);
  const reportType = ['executive', 'detailed'].includes(body.reportType) ? body.reportType : 'executive';
  const period = ['current', 'last3', 'last6', 'ytd', 'custom'].includes(body.period) ? body.period : 'last3';
  const imtScope = body.imtScope === 'specific' ? 'specific' : 'all';
  if (imtScope === 'specific' && !cleanImt) throw Object.assign(new Error('Select an IMT assignment.'), { status: 400 });
  return {
    reportType, period, imtScope, imt: cleanImt,
    fromMonth: String(body.fromMonth || '').slice(0, 32), toMonth: String(body.toMonth || '').slice(0, 32),
    statusScope: ['all', 'active', 'placed', 'repost', 'custom'].includes(body.statusScope) ? body.statusScope : 'all',
    customStatuses: Array.isArray(body.customStatuses) ? body.customStatuses.map((value) => String(value).toLowerCase()).slice(0, 11) : [],
  };
}

function requireAdmin(profile) {
  if (profile?.role !== 'admin') throw Object.assign(new Error('You are not authorized to access reports.'), { status: 403 });
  return profile;
}

function assertSameOrigin(req) {
  if (req.headers['sec-fetch-site'] === 'cross-site') throw Object.assign(new Error('Request origin not allowed.'), { status: 403 });
  if (!req.headers.origin) return;
  let origin;
  try { origin = new URL(req.headers.origin); } catch { throw Object.assign(new Error('Request origin not allowed.'), { status: 403 }); }
  if (origin.host !== req.headers.host) throw Object.assign(new Error('Request origin not allowed.'), { status: 403 });
}

module.exports = async function handler(req, res) {
  if (!method(req, res, ['GET', 'POST'])) return;
  try {
    const { profile } = await requireSession(req, res);
    requireAdmin(profile);
    if (req.method === 'GET') return json(res, 200, await getReportOptions());
    assertSameOrigin(req);
    const filters = filtersFrom(req.body);
    const report = await getReport(filters, profile.email);
    if (!report.hasData) return json(res, 422, { error: 'No report data available for the selected period.' });
    if (req.query?.format !== 'pdf') return json(res, 200, { report });

    try {
      await appendAudit({
        email: profile.email, actorUserId: profile.user_id, actorRole: profile.role,
        action: 'Admin report generated', assignment: report.scope, rows: report.metrics.total,
        tabs: report.period, details: `${filters.reportType} report; ${filters.statusScope} status scope`,
        targetType: 'report', targetId: `${filters.reportType}:${report.period}`,
      });
    } catch (auditError) {
      console.error('Report audit logging failed:', auditError.message);
    }
    const filename = `ccf-miner-nudge-${filters.reportType}-${new Date().toISOString().slice(0, 10)}.pdf`;
    const pdf = await renderReportPdfBuffer(report);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.statusCode = 200;
    res.end(pdf);
  } catch (error) {
    console.error(`Reports endpoint failed: ${error?.stack || error?.message || String(error)}`);
    if (res.headersSent) return res.destroy(error);
    const status = Number(error?.status);
    const safeStatus = status >= 400 && status < 500 ? status : 500;
    json(res, safeStatus, { error: safeStatus === 500 ? 'Unable to generate the report.' : error.message });
  }
};

module.exports._test = { filtersFrom, requireAdmin, assertSameOrigin };
