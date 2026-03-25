require('dotenv').config();
const express = require('express');
const path = require('path');
const studentRoutes = require('./routes/studentRoutes');
const courseRoutes = require('./routes/courseRoutes');
const matchRoutes = require('./routes/matchRoutes');
const universityRoutes = require('./routes/universityRoutes');
const adminRoutes = require('./routes/adminRoutes');
const userAccountRoutes = require('./routes/userAccountRoutes');
const { getSessionFromRequest, requireAdminPage } = require('./utils/adminAuth');

const app = express();
const port = process.env.PORT || 3000;

// middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// routes
app.use('/api/students', studentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/universities', universityRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/account', userAccountRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/user', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'user.html'));
});

app.get('/account', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'account.html'));
});

app.get('/catalog', (req, res) => {
  res.redirect('/user/catalog');
});

app.get('/user/catalog', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'catalog.html'));
});

app.get('/user/compare', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'compare.html'));
});

app.get('/admin/catalog', requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin-catalog.html'));
});

app.get('/admin', requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

app.get('/admin/imports', requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin-imports.html'));
});

app.get('/admin/login', (req, res) => {
  const session = getSessionFromRequest(req);
  if (session) {
    return res.redirect('/admin');
  }
  return res.redirect('/account');
});

// connect to database using Sequelize
const { sequelize } = require('./models');
const syncOptions = process.env.DB_SYNC_ALTER === 'true' ? { alter: true } : {};

if (process.env.DB_SYNC_ALTER === 'true') {
  console.warn(
    'DB_SYNC_ALTER=true is enabled. On MySQL, repeated Sequelize alter syncs can create duplicate indexes.'
  );
}

sequelize
  .authenticate()
  .then(() => {
    console.log('Database connection established');
    return sequelize.sync(syncOptions);
  })
  .then(() => {
    app.listen(port, () => console.log(`Server started at http://localhost:${port}`));
  })
  .catch((err) => {
    console.error('Failed to connect to database', err);
  });
