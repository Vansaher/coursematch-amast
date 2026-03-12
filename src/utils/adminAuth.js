const crypto = require('crypto');

const SESSION_COOKIE = 'admin_session';
const sessions = new Map();

function getAdminCredentials() {
  return {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123',
  };
}

function parseCookies(cookieHeader = '') {
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf('=');
      if (index === -1) {
        return cookies;
      }
      const key = decodeURIComponent(part.slice(0, index));
      const value = decodeURIComponent(part.slice(index + 1));
      cookies[key] = value;
      return cookies;
    }, {});
}

function createSession(username) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, {
    username,
    createdAt: Date.now(),
  });
  return token;
}

function clearSession(token) {
  if (token) {
    sessions.delete(token);
  }
}

function getSessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[SESSION_COOKIE];
  if (!token) {
    return null;
  }

  const session = sessions.get(token);
  if (!session) {
    return null;
  }

  return { token, ...session };
}

function setSessionCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax`
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`
  );
}

function requireAdminApi(req, res, next) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: 'Admin login required' });
  }

  req.adminSession = session;
  next();
}

function requireAdminPage(req, res, next) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return res.redirect('/admin/login');
  }

  req.adminSession = session;
  next();
}

module.exports = {
  SESSION_COOKIE,
  clearSession,
  clearSessionCookie,
  createSession,
  getAdminCredentials,
  getSessionFromRequest,
  requireAdminApi,
  requireAdminPage,
  setSessionCookie,
};
