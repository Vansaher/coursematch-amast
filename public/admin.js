const logoutButton = document.getElementById('logout-button');
const adminUserMenu = document.querySelector('.admin-user-menu');
const adminToolbarUser = document.querySelector('.admin-toolbar-user');

const statUniversities = document.getElementById('stat-universities');
const statCourses = document.getElementById('stat-courses');
const statIncomplete = document.getElementById('stat-incomplete');
const statLastImport = document.getElementById('stat-last-import');

const lastImportCopy = document.getElementById('last-import-copy');
const healthCounts = document.getElementById('health-counts');
const duplicateWarnings = document.getElementById('duplicate-warnings');
const parsingFailures = document.getElementById('parsing-failures');
const reviewQueue = document.getElementById('review-queue');
const coverageRows = document.getElementById('coverage-rows');
const analyticsSummary = document.getElementById('analytics-summary');
const analyticsThemes = document.getElementById('analytics-themes');
const analyticsShortlist = document.getElementById('analytics-shortlist');

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

function formatRelativeDays(staleDays) {
  if (staleDays === null || staleDays === undefined) {
    return 'No update recorded';
  }
  if (staleDays === 0) {
    return 'Updated today';
  }
  if (staleDays === 1) {
    return 'Updated 1 day ago';
  }
  return `Updated ${staleDays} days ago`;
}

function renderHealthCounts(missingCounts) {
  const entries = [
    ['Missing entry requirements', missingCounts.entryRequirements],
    ['Missing descriptions', missingCounts.descriptions],
    ['Missing intake', missingCounts.intake],
    ['Missing tuition', missingCounts.tuition],
    ['Missing faculty', missingCounts.faculty],
    ['Missing duration', missingCounts.duration],
  ];

  healthCounts.innerHTML = entries
    .map(
      ([label, count]) => `
        <article class="summary-placeholder admin-mini-stat">
          <strong>${escapeHtml(label)}</strong>
          <span>${escapeHtml(String(count))}</span>
        </article>
      `
    )
    .join('');
}

function renderDuplicateWarnings(items) {
  if (!items.length) {
    duplicateWarnings.innerHTML = '<div class="summary-placeholder compact-placeholder">No duplicate warnings found.</div>';
    return;
  }

  duplicateWarnings.innerHTML = items
    .map(
      (item) => `
        <article class="result-card admin-note-card">
          <h3>${escapeHtml(item.courseName)}</h3>
          <p>${escapeHtml(item.universityName)} has ${escapeHtml(String(item.count))} records with the same normalized name.</p>
        </article>
      `
    )
    .join('');
}

function renderParsingFailures(parsing) {
  parsingFailures.innerHTML = `
    <article class="summary-placeholder admin-mini-stat">
      <strong>Failed import jobs</strong>
      <span>${escapeHtml(String(parsing.failedJobs))}</span>
    </article>
    <article class="summary-placeholder admin-mini-stat">
      <strong>Failed course URLs</strong>
      <span>${escapeHtml(String(parsing.failedUrls))}</span>
    </article>
    <article class="summary-placeholder admin-mini-stat admin-mini-stat-wide">
      <strong>Latest failure message</strong>
      <span>${escapeHtml(parsing.lastFailureMessage || 'No recent parsing failure recorded in this server session.')}</span>
    </article>
  `;
}

function renderReviewQueue(items) {
  reviewQueue.innerHTML = items
    .map(
      (item) => `
        <article class="result-card admin-note-card">
          <div class="admin-note-row">
            <div>
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(String(item.count))} items currently need attention.</p>
            </div>
            <a class="secondary-button small-button" href="${escapeHtml(item.actionHref)}">${escapeHtml(item.actionLabel)}</a>
          </div>
        </article>
      `
    )
    .join('');
}

function renderCoverage(items) {
  if (!items.length) {
    coverageRows.innerHTML = '<div class="summary-placeholder">No university coverage data yet.</div>';
    return;
  }

  coverageRows.innerHTML = items
    .map(
      (item) => `
        <article class="result-card admin-coverage-card">
          <div class="admin-coverage-head">
            <h3>${escapeHtml(item.name)}</h3>
            <span class="result-chip">${escapeHtml(String(item.totalCourses))} courses</span>
          </div>
          <div class="result-meta">
            <span>${escapeHtml(formatRelativeDays(item.staleDays))}</span>
            <span>${escapeHtml(String(item.missingRequirements))} missing requirements</span>
            <span>${escapeHtml(String(item.missingDescriptions))} missing descriptions</span>
          </div>
        </article>
      `
    )
    .join('');
}

function renderAnalytics(analytics) {
  analyticsSummary.innerHTML = `
    <article class="summary-placeholder admin-mini-stat">
      <strong>Total users</strong>
      <span>${escapeHtml(String(analytics.totalUsers))}</span>
    </article>
    <article class="summary-placeholder admin-mini-stat">
      <strong>Match runs</strong>
      <span>${escapeHtml(String(analytics.totalMatchRuns))}</span>
    </article>
    <article class="summary-placeholder admin-mini-stat">
      <strong>Saved shortlist items</strong>
      <span>${escapeHtml(String(analytics.totalSavedCourses))}</span>
    </article>
    <article class="summary-placeholder admin-mini-stat">
      <strong>What-if reruns</strong>
      <span>${escapeHtml(String(analytics.whatIfRuns))}</span>
    </article>
  `;

  analyticsThemes.innerHTML = analytics.interestThemes.length
    ? analytics.interestThemes
        .map(
          (item) => `
            <article class="summary-placeholder admin-mini-stat">
              <strong>${escapeHtml(item.label)}</strong>
              <span>${escapeHtml(String(item.count))} sessions</span>
            </article>
          `
        )
        .join('')
    : '<div class="summary-placeholder compact-placeholder">No interest trends yet.</div>';

  analyticsShortlist.innerHTML = analytics.topShortlistedUniversities.length
    ? analytics.topShortlistedUniversities
        .map(
          (item) => `
            <article class="summary-placeholder admin-mini-stat">
              <strong>${escapeHtml(item.name)}</strong>
              <span>${escapeHtml(String(item.count))} shortlist saves</span>
            </article>
          `
        )
        .join('')
    : '<div class="summary-placeholder compact-placeholder">No shortlist activity yet.</div>';
}

async function loadDashboard() {
  const data = await fetchJson('/api/admin/dashboard');

  statUniversities.textContent = String(data.kpis.universities);
  statCourses.textContent = String(data.kpis.totalCourses);
  statIncomplete.textContent = String(data.kpis.incompleteCourses);
  statLastImport.textContent = data.kpis.lastImportLabel;
  lastImportCopy.textContent = data.kpis.lastImportAt
    ? `${data.kpis.lastImportMessage} • ${new Date(data.kpis.lastImportAt).toLocaleString()}`
    : data.kpis.lastImportMessage;

  renderHealthCounts(data.health.missingCounts);
  renderDuplicateWarnings(data.health.duplicateWarnings);
  renderParsingFailures(data.health.parsingFailures);
  renderReviewQueue(data.health.reviewQueue);
  renderCoverage(data.coverage);
  renderAnalytics(data.analytics);
}

adminToolbarUser?.addEventListener('click', (event) => {
  event.stopPropagation();
  adminUserMenu?.classList.toggle('open');
});

document.addEventListener('click', (event) => {
  if (adminUserMenu && !adminUserMenu.contains(event.target)) {
    adminUserMenu.classList.remove('open');
  }
});

logoutButton.addEventListener('click', async () => {
  try {
    await fetchJson('/api/admin/logout', {
      method: 'POST',
    });
  } finally {
    window.location.href = '/account';
  }
});

loadDashboard().catch((error) => {
  lastImportCopy.textContent = error.message;
});
