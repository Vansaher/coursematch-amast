const {
  clearSession,
  clearSessionCookie,
  createSession,
  getAdminCredentials,
  getSessionFromRequest,
  setSessionCookie,
} = require('../utils/adminAuth');

exports.login = async (req, res) => {
  const { username, password } = req.body;
  const creds = getAdminCredentials();

  if (username !== creds.username || password !== creds.password) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = createSession(username);
  setSessionCookie(res, token);
  res.json({ ok: true, username });
};

exports.logout = async (req, res) => {
  const session = getSessionFromRequest(req);
  if (session) {
    clearSession(session.token);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
};

exports.session = async (req, res) => {
  const session = getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  res.json({ ok: true, username: session.username });
};
