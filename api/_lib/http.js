const ACCESS_COOKIE = 'ccf_access_token';
const REFRESH_COOKIE = 'ccf_refresh_token';

function parseCookies(req) {
  return String(req.headers.cookie || '').split(';').reduce((cookies, part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return cookies;
    cookies[part.slice(0, separator).trim()] = decodeURIComponent(part.slice(separator + 1).trim());
    return cookies;
  }, {});
}

function cookie(name, value, maxAge) {
  const secure = process.env.VERCEL || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=${maxAge}`;
}

function setSessionCookies(res, session) {
  res.setHeader('Set-Cookie', [
    cookie(ACCESS_COOKIE, session.access_token, Math.max(60, session.expires_in || 3600)),
    cookie(REFRESH_COOKIE, session.refresh_token, 60 * 60 * 24 * 30),
  ]);
}

function clearSessionCookies(res) {
  res.setHeader('Set-Cookie', [cookie(ACCESS_COOKIE, '', 0), cookie(REFRESH_COOKIE, '', 0)]);
}

function json(res, status, body) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(body);
}

function method(req, res, allowed) {
  if (allowed.includes(req.method)) return true;
  res.setHeader('Allow', allowed.join(', '));
  json(res, 405, { error: 'Method not allowed.' });
  return false;
}

module.exports = { ACCESS_COOKIE, REFRESH_COOKIE, parseCookies, setSessionCookies, clearSessionCookies, json, method };
