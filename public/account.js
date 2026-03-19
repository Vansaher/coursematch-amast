const accountAuthForm = document.getElementById('account-auth-form');
const logoutButton = document.getElementById('logout-button');
const accountStatus = document.getElementById('account-status');
const accountDashboard = document.getElementById('account-dashboard');
const accountUserLine = document.getElementById('account-user-line');
const savedCoursesList = document.getElementById('account-saved-courses');
const comparisonsList = document.getElementById('account-comparisons');
const matchSessionsList = document.getElementById('account-match-sessions');
const alertsList = document.getElementById('account-alerts');
const draftsList = document.getElementById('account-drafts');
const plannerForm = document.getElementById('planner-form');
const plannerSubmit = document.getElementById('planner-submit');
const plannerList = document.getElementById('account-planner');
const careerInterest = document.getElementById('career-interest');
const careerSubmit = document.getElementById('career-submit');
const careerOutput = document.getElementById('career-output');
const authModeEyebrow = document.getElementById('auth-mode-eyebrow');
const authModeTitle = document.getElementById('auth-mode-title');
const authModeCopy = document.getElementById('auth-mode-copy');
const authSubmitButton = document.getElementById('auth-submit-button');
const authNameLabel = document.getElementById('auth-name-label');
const authNameInput = document.getElementById('auth-name-input');
const authEmailLabel = document.getElementById('auth-email-label');
const authEmailInput = document.getElementById('auth-email-input');
const authUsernameLabel = document.getElementById('auth-username-label');
const authUsernameInput = document.getElementById('auth-username-input');
const authPasswordInput = document.getElementById('auth-password-input');
const showRegisterModeButton = document.getElementById('show-register-mode');
const showAdminModeButton = document.getElementById('show-admin-mode');
const showLoginModeButton = document.getElementById('show-login-mode');

let authMode = 'login';

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }
  return payload;
}

function setAuthMode(mode) {
  authMode = mode;
  authNameLabel.hidden = mode !== 'register';
  authNameInput.required = mode === 'register';
  authEmailLabel.hidden = mode !== 'register';
  authEmailInput.required = mode === 'register';
  authUsernameLabel.hidden = false;
  authUsernameInput.required = true;

  if (mode === 'register') {
    authModeEyebrow.textContent = 'Create Account';
    authModeTitle.textContent = 'Create Account';
    authModeCopy.textContent = 'Create an optional account for saved shortlist, history, planner, drafts, and alerts.';
    authSubmitButton.textContent = 'Create account';
  } else if (mode === 'admin') {
    authModeEyebrow.textContent = 'Admin Access';
    authModeTitle.textContent = 'Admin Log In';
    authModeCopy.textContent = 'Use the same account page if you want to enter the admin dashboard.';
    authSubmitButton.textContent = 'Log in as admin';
  } else {
    authModeEyebrow.textContent = 'Account Login';
    authModeTitle.textContent = 'Log In';
    authModeCopy.textContent = 'Access saved shortlist, history, planner, drafts, and alerts.';
    authSubmitButton.textContent = 'Log in';
  }

  showRegisterModeButton.hidden = mode === 'register';
  showAdminModeButton.hidden = mode === 'admin';
  showLoginModeButton.hidden = mode === 'login';
  accountStatus.textContent = '';
}

function renderList(element, items, formatter) {
  element.innerHTML = items.length
    ? items.map(formatter).join('')
    : '<div class="summary-placeholder compact-placeholder">No data yet.</div>';
}

function renderGroupedSavedCourses(items) {
  if (!items.length) {
    savedCoursesList.innerHTML = '<div class="summary-placeholder compact-placeholder">No data yet.</div>';
    return;
  }

  const groups = items.reduce((accumulator, item) => {
    const university = item.course?.university?.name || 'Other universities';
    if (!accumulator[university]) {
      accumulator[university] = [];
    }
    accumulator[university].push(item);
    return accumulator;
  }, {});

  savedCoursesList.innerHTML = Object.entries(groups)
    .map(
      ([group, entries]) => `
        <div class="account-group">
          <strong>${escapeHtml(group)}</strong>
          ${entries.map((entry) => `<div class="account-item">${escapeHtml(entry.course?.name || 'Unknown course')}</div>`).join('')}
        </div>
      `
    )
    .join('');
}

async function loadDashboard() {
  const session = await fetchJson('/api/account/session');
  accountDashboard.hidden = false;
  accountUserLine.textContent = `${session.user.name} (${session.user.email})`;

  const [saved, comparisons, matches, alerts, planner, drafts] = await Promise.all([
    fetchJson('/api/account/saved-courses'),
    fetchJson('/api/account/comparisons'),
    fetchJson('/api/account/match-sessions'),
    fetchJson('/api/account/alerts'),
    fetchJson('/api/account/planner'),
    fetchJson('/api/account/drafts'),
  ]);

  renderGroupedSavedCourses(saved);
  renderList(comparisonsList, comparisons, (item) => `<div class="account-item">${escapeHtml(item.title)} (${(item.courseIds || []).length})</div>`);
  renderList(matchSessionsList, matches, (item) => `<div class="account-item">${escapeHtml(item.label)} - ${escapeHtml(item.sessionType)}</div>`);
  renderList(alertsList, alerts, (item) => `<div class="account-item"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.message)}</span></div>`);
  renderList(draftsList, drafts, (item) => `<div class="account-item"><strong>${escapeHtml(item.course?.name || 'Unknown course')}</strong><span>${escapeHtml((item.content || '').slice(0, 120))}</span></div>`);
  renderList(
    plannerList,
    planner,
    (item) => `<div class="account-item">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.status)}${item.dueDate ? ` • due ${escapeHtml(String(item.dueDate).slice(0, 10))}` : ''}</span>
      <button type="button" class="secondary-button small-button" data-planner-id="${item.id}" data-planner-status="${item.status}">Advance status</button>
    </div>`
  );
}

accountAuthForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    if (authMode === 'register') {
      await fetchJson('/api/account/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: authUsernameInput.value,
          name: authNameInput.value,
          email: authEmailInput.value,
          password: authPasswordInput.value,
        }),
      });
      accountStatus.textContent = 'Account created and logged in';
      setAuthMode('login');
      await loadDashboard();
      return;
    }

    if (authMode === 'admin') {
      await fetchJson('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: authUsernameInput.value,
          password: authPasswordInput.value,
        }),
      });
      accountStatus.textContent = 'Admin login successful. Redirecting...';
      window.location.href = '/admin';
      return;
    }

    await fetchJson('/api/account/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: authUsernameInput.value,
        password: authPasswordInput.value,
      }),
    });
    accountStatus.textContent = 'Logged in';
    await loadDashboard();
  } catch (error) {
    accountStatus.textContent = error.message;
  }
});

showRegisterModeButton.addEventListener('click', () => setAuthMode('register'));
showAdminModeButton.addEventListener('click', () => setAuthMode('admin'));
showLoginModeButton.addEventListener('click', () => setAuthMode('login'));

logoutButton.addEventListener('click', async () => {
  try {
    await fetchJson('/api/account/logout', { method: 'POST' });
    accountStatus.textContent = 'Logged out';
    accountDashboard.hidden = true;
    accountUserLine.textContent = 'Not logged in.';
  } catch (error) {
    accountStatus.textContent = error.message;
  }
});

plannerSubmit.addEventListener('click', async () => {
  try {
    const formData = new FormData(plannerForm);
    await fetchJson('/api/account/planner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });
    await loadDashboard();
  } catch (error) {
    accountStatus.textContent = error.message;
  }
});

plannerList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-planner-id]');
  if (!button) {
    return;
  }

  const statuses = ['planned', 'in_progress', 'done'];
  const current = button.getAttribute('data-planner-status') || 'planned';
  const next = statuses[(statuses.indexOf(current) + 1) % statuses.length];

  try {
    await fetchJson(`/api/account/planner/${button.getAttribute('data-planner-id')}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    await loadDashboard();
  } catch (error) {
    accountStatus.textContent = error.message;
  }
});

careerSubmit.addEventListener('click', async () => {
  try {
    const response = await fetchJson('/api/account/career-explorer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interest: careerInterest.value }),
    });
    careerOutput.textContent = response.answer || 'No answer returned.';
  } catch (error) {
    careerOutput.textContent = error.message;
  }
});

setAuthMode('login');
fetchJson('/api/account/session')
  .then(loadDashboard)
  .catch(() => {
    accountDashboard.hidden = true;
  });
