const registerForm = document.getElementById('register-form');
const loginForm = document.getElementById('login-form');
const logoutButton = document.getElementById('logout-button');
const accountStatus = document.getElementById('account-status');
const accountDashboard = document.getElementById('account-dashboard');
const accountUserLine = document.getElementById('account-user-line');
const savedCoursesList = document.getElementById('account-saved-courses');
const comparisonsList = document.getElementById('account-comparisons');
const matchSessionsList = document.getElementById('account-match-sessions');
const alertsList = document.getElementById('account-alerts');
const plannerForm = document.getElementById('planner-form');
const plannerSubmit = document.getElementById('planner-submit');
const plannerList = document.getElementById('account-planner');
const careerInterest = document.getElementById('career-interest');
const careerSubmit = document.getElementById('career-submit');
const careerOutput = document.getElementById('career-output');

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

function renderList(element, items, formatter) {
  element.innerHTML = items.length ? items.map(formatter).join('') : '<div class="summary-placeholder compact-placeholder">No data yet.</div>';
}

async function loadDashboard() {
  const session = await fetchJson('/api/account/session');
  accountDashboard.hidden = false;
  accountUserLine.textContent = `${session.user.name} (${session.user.email})`;

  const [saved, comparisons, matches, alerts, planner] = await Promise.all([
    fetchJson('/api/account/saved-courses'),
    fetchJson('/api/account/comparisons'),
    fetchJson('/api/account/match-sessions'),
    fetchJson('/api/account/alerts'),
    fetchJson('/api/account/planner'),
  ]);

  renderList(savedCoursesList, saved, (item) => `<div class="account-item">${escapeHtml(item.course?.name || 'Unknown course')}</div>`);
  renderList(comparisonsList, comparisons, (item) => `<div class="account-item">${escapeHtml(item.title)} (${(item.courseIds || []).length})</div>`);
  renderList(matchSessionsList, matches, (item) => `<div class="account-item">${escapeHtml(item.label)} - ${escapeHtml(item.sessionType)}</div>`);
  renderList(alertsList, alerts, (item) => `<div class="account-item"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.message)}</span></div>`);
  renderList(
    plannerList,
    planner,
    (item) => `<div class="account-item"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.status)}${item.dueDate ? ` • due ${escapeHtml(String(item.dueDate).slice(0, 10))}` : ''}</span></div>`
  );
}

registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const formData = new FormData(registerForm);
    await fetchJson('/api/account/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });
    accountStatus.textContent = 'Account created and logged in';
    await loadDashboard();
  } catch (error) {
    accountStatus.textContent = error.message;
  }
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const formData = new FormData(loginForm);
    await fetchJson('/api/account/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });
    accountStatus.textContent = 'Logged in';
    await loadDashboard();
  } catch (error) {
    accountStatus.textContent = error.message;
  }
});

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

fetchJson('/api/account/session')
  .then(loadDashboard)
  .catch(() => {
    accountDashboard.hidden = true;
  });
