const { json, method } = require('./_lib/http');
const { requireSession } = require('./_lib/supabase');
const { googleFetch } = require('./_lib/google');

const SHEET_ID = process.env.CCF_SHEET_ID || '1TI_bslfoK96fhM4PJ45TlYlmMLTCEq2svVgqXFBdfWY';
const BASE = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;
const CONFIRMATION_TAB = 'For confirmation';
const AUDIT_TAB = 'Audit Log';

function tabFromRange(range) {
  const raw = String(range || '').split('!')[0].trim();
  return raw.startsWith("'") && raw.endsWith("'") ? raw.slice(1, -1).replace(/''/g, "'") : raw;
}

function cellFromRange(range) {
  return String(range || '').split('!').slice(1).join('!').toUpperCase();
}

function isMonthly(tab) {
  return /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:UARY|RUARY|CH|IL|E|Y|UST|TEMBER|OBER|EMBER)?\s*\d{2,4}$/i.test(String(tab || '').replace(/\s+/g, ' ').trim());
}

function columnLetters(index) {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function normalized(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function rangesFrom(url) {
  const parsed = new URL(url);
  const batchRanges = parsed.searchParams.getAll('ranges');
  if (batchRanges.length) return batchRanges;
  const marker = `/spreadsheets/${SHEET_ID}/values/`;
  if (!parsed.pathname.includes(marker)) return [];
  const encoded = parsed.pathname.split(marker)[1].replace(/:(append|clear)$/, '');
  return [decodeURIComponent(encoded)];
}

function assertReadAllowed(profile, targetUrl) {
  if (profile.role === 'admin') return;
  const ranges = rangesFrom(targetUrl);
  if (!ranges.length) return;
  for (const range of ranges) {
    const tab = tabFromRange(range);
    if (tab === AUDIT_TAB && cellFromRange(range) === 'A1:H1') continue;
    if (profile.role === 'confirmation' && tab !== CONFIRMATION_TAB) throw Object.assign(new Error('For Confirmation users cannot access this Sheet tab.'), { status: 403 });
    if (profile.role === 'imt' && !isMonthly(tab)) throw Object.assign(new Error('IMT users can access monthly nudge tabs only.'), { status: 403 });
  }
}

function blankOtherAssignments(result, assignment) {
  if (!Array.isArray(result.valueRanges)) return result;
  result.valueRanges.forEach((valueRange) => {
    const range = String(valueRange.range || '');
    if (!isMonthly(tabFromRange(range)) || !Array.isArray(valueRange.values)) return;
    const cells = cellFromRange(range);
    const beginsAtRowOne = /^[A-Z]+(?::[A-Z]+)?$/.test(cells) || /^[A-Z]+1(?::|$)/.test(cells);
    valueRange.values = valueRange.values.map((row, index) => {
      if ((index === 0 && beginsAtRowOne) || String(row?.[0] || '').trim().toUpperCase() === 'IMT ASSIGNMENT') return row;
      return String(row?.[0] || '').trim().toUpperCase() === assignment ? row : [];
    });
  });
  return result;
}

async function assertWriteAllowed(profile, body) {
  if (profile.role === 'admin') return;
  const data = Array.isArray(body?.data) ? body.data : [];
  if (!data.length) throw Object.assign(new Error('No Sheet updates were supplied.'), { status: 400 });

  if (profile.role === 'confirmation') {
    if (data.some((entry) => tabFromRange(entry.range) !== CONFIRMATION_TAB)) throw Object.assign(new Error('For Confirmation users can update the For confirmation tab only.'), { status: 403 });
    const headerRange = `'${CONFIRMATION_TAB}'!A1:AZ3`;
    const headerResponse = await googleFetch(`${BASE}/values/${encodeURIComponent(headerRange)}`);
    const headerResult = await headerResponse.json();
    if (!headerResponse.ok) throw new Error(headerResult.error?.message || 'Unable to verify For confirmation columns.');
    const rows = headerResult.values || [];
    let header = rows[0] || [];
    for (const row of rows) {
      const keys = row.map(normalized);
      if (keys.some((key) => ['placementstatus', 'status'].includes(key))) { header = row; break; }
    }
    const allowedColumns = new Set();
    header.forEach((value, index) => {
      if (['placementstatus', 'status', 'datelasttouch', 'datelasttouched', 'lasttouchdate'].includes(normalized(value))) allowedColumns.add(columnLetters(index));
    });
    if (!allowedColumns.size) throw new Error('Unable to identify the Placement Status and Date Last Touched columns.');
    if (data.some((entry) => {
      const match = cellFromRange(entry.range).match(/^([A-Z]+)\d+$/);
      return !match || !allowedColumns.has(match[1]);
    })) throw Object.assign(new Error('For Confirmation users may update only Placement Status and Date Last Touched.'), { status: 403 });
    return;
  }

  for (const entry of data) {
    const tab = tabFromRange(entry.range);
    const cell = cellFromRange(entry.range);
    const match = cell.match(/^N(\d+)$/);
    if (!isMonthly(tab) || !match) throw Object.assign(new Error('IMT users may update only Date Last Touched in monthly tabs.'), { status: 403 });
    const verifyRange = `${tab.includes(' ') ? `'${tab.replace(/'/g, "''")}'` : tab}!A${match[1]}`;
    const verifyUrl = `${BASE}/values/${encodeURIComponent(verifyRange)}`;
    const response = await googleFetch(verifyUrl);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || 'Unable to verify the current IMT assignment.');
    if (String(result.values?.[0]?.[0] || '').trim().toUpperCase() !== profile.imt_assignment) {
      throw Object.assign(new Error(`A selected row is no longer assigned to ${profile.imt_assignment}. Refresh before updating.`), { status: 409 });
    }
  }
}

async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;
  try {
    const { user, profile } = await requireSession(req, res);
    if (profile.must_change_password) return json(res, 403, { error: 'Change your temporary password before opening the queue.' });
    const targetUrl = String(req.body?.targetUrl || '');
    const targetMethod = String(req.body?.method || 'GET').toUpperCase();
    const parsed = new URL(targetUrl);
    const basePath = `/v4/spreadsheets/${SHEET_ID}`;
    const exactSpreadsheet = parsed.pathname === basePath || parsed.pathname.startsWith(`${basePath}/`) || parsed.pathname === `${basePath}:batchUpdate`;
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'sheets.googleapis.com' || !exactSpreadsheet || !['GET', 'POST', 'PUT'].includes(targetMethod)) {
      return json(res, 400, { error: 'Invalid Google Sheets request.' });
    }
    parsed.searchParams.delete('key');

    const isAuditAppend = targetMethod === 'POST' && parsed.pathname.endsWith(':append') && rangesFrom(parsed.toString()).some((range) => tabFromRange(range) === AUDIT_TAB);
    if (isAuditAppend) {
      const auditBody = req.body?.body || {};
      for (const row of auditBody.values || []) {
        row[0] = new Date().toISOString();
        row[1] = user.email;
        if (profile.role !== 'admin') row[3] = profile.imt_assignment || profile.role.toUpperCase();
      }
      req.body.body = auditBody;
    } else if (targetMethod === 'GET') {
      assertReadAllowed(profile, parsed.toString());
      if (profile.role !== 'admin' && rangesFrom(parsed.toString()).some((range) => tabFromRange(range) === AUDIT_TAB && cellFromRange(range) !== 'A1:H1')) {
        return json(res, 403, { error: 'Only administrators can view the Audit Trail.' });
      }
    } else if (parsed.pathname.endsWith('/values:batchUpdate')) {
      await assertWriteAllowed(profile, req.body?.body || {});
    } else if (profile.role !== 'admin') {
      return json(res, 403, { error: 'Only administrators can perform this Sheet operation.' });
    }

    const response = await googleFetch(parsed.toString(), {
      method: targetMethod,
      body: req.body?.body ? JSON.stringify(req.body.body) : undefined,
    });
    let result = await response.json();
    if (response.ok && targetMethod === 'GET' && profile.role === 'imt') result = blankOtherAssignments(result, profile.imt_assignment);
    json(res, response.status, result);
  } catch (error) {
    json(res, error.status || 500, { error: error.message || 'Unable to access the centralized Sheet.' });
  }
}

module.exports = handler;
module.exports._test = { assertReadAllowed, blankOtherAssignments, cellFromRange, isMonthly, rangesFrom, tabFromRange };
