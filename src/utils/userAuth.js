const crypto = require('crypto');
const { UserAccount } = require('../models');

const USER_SESSION_COOKIE = 'user_session';
const userSessions = new Map();

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

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, hash, salt) {
  const candidate = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
}

function createUserSession(user) {
  const token = crypto.randomBytes(24).toString('hex');
  userSessions.set(token, {
    userId: user.id,
    email: user.email,
    name: user.name,
    createdAt: Date.now(),
  });
  return token;
}

function setUserSessionCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    `${USER_SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax`
  );
}

function clearUserSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${USER_SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`
  );
}

function clearUserSession(token) {
  if (token) {
    userSessions.delete(token);
  }
}

function getUserSessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[USER_SESSION_COOKIE];
  if (!token) {
    return null;
  }

  const session = userSessions.get(token);
  if (!session) {
    return null;
  }

  return { token, ...session };
}

async function attachOptionalUser(req, _res, next) {
  const session = getUserSessionFromRequest(req);
  if (!session) {
    req.userAccount = null;
    return next();
  }

  const user = await UserAccount.findByPk(session.userId);
  req.userAccount = user || null;
  req.userSession = session;
  next();
}

async function requireUserApi(req, res, next) {
  const session = getUserSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: 'User login required' });
  }

  const user = await UserAccount.findByPk(session.userId);
  if (!user) {
    clearUserSession(session.token);
    clearUserSessionCookie(res);
    return res.status(401).json({ error: 'User login required' });
  }

  req.userAccount = user;
  req.userSession = session;
  next();
}

module.exports = {
  USER_SESSION_COOKIE,
  attachOptionalUser,
  clearUserSession,
  clearUserSessionCookie,
  createUserSession,
  getUserSessionFromRequest,
  hashPassword,
  requireUserApi,
  setUserSessionCookie,
  verifyPassword,
};
