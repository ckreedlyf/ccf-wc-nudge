const crypto = require('crypto');

let cachedToken = null;

function serviceAccount() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not configured.');
  try {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  }
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

async function googleAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const account = serviceAccount();
  if (!account.client_email || !account.private_key) throw new Error('The Google service account credentials are incomplete.');
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), account.private_key).toString('base64url');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new Error(result.error_description || 'Unable to authorize the Google service account.');
  cachedToken = { value: result.access_token, expiresAt: Date.now() + (result.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

async function googleFetch(url, options = {}) {
  const token = await googleAccessToken();
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body) headers.set('Content-Type', 'application/json');
  return fetch(url, { ...options, headers });
}

async function appendAudit({ email, action, assignment = '', targets = '', rows = 0, tabs = 'User Access', details = '' }) {
  const sheetId = process.env.CCF_SHEET_ID || '1TI_bslfoK96fhM4PJ45TlYlmMLTCEq2svVgqXFBdfWY';
  const range = encodeURIComponent("'Audit Log'!A:H");
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const response = await googleFetch(url, {
    method: 'POST',
    body: JSON.stringify({ values: [[new Date().toISOString(), email, action, assignment, targets, rows, tabs, details]] }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'Unable to record the admin action.');
  return result;
}

module.exports = { googleFetch, appendAudit };
