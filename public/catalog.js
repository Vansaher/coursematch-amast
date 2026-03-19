const universitySelect = document.getElementById('catalog-university-select');
const catalogStatus = document.getElementById('catalog-status');
const catalogSelectionStatus = document.getElementById('catalog-selection-status');
const catalogGroups = document.getElementById('catalog-groups');
const catalogCompareList = document.getElementById('catalog-compare-list');
const catalogCompareGrid = document.getElementById('catalog-compare-grid');
const catalogSavedList = document.getElementById('catalog-saved-list');
const catalogChatCourse = document.getElementById('catalog-chat-course');
const catalogChatQuestion = document.getElementById('catalog-chat-question');
const catalogChatSubmit = document.getElementById('catalog-chat-submit');
const catalogChatAnswer = document.getElementById('catalog-chat-answer');
const catalogDraftContent = document.getElementById('catalog-draft-content');
const catalogDraftSave = document.getElementById('catalog-draft-save');
const exportSavedButton = document.getElementById('catalog-export-saved');
const clearSavedButton = document.getElementById('catalog-clear-saved');
const exportCompareButton = document.getElementById('catalog-export-compare');
const saveCompareButton = document.getElementById('catalog-save-compare');

const filterInputs = {
  search: document.getElementById('catalog-search'),
  awardLevel: document.getElementById('catalog-award-level'),
  studyMode: document.getElementById('catalog-study-mode'),
  duration: document.getElementById('catalog-duration'),
  intake: document.getElementById('catalog-intake'),
  tuition: document.getElementById('catalog-tuition'),
  state: document.getElementById('catalog-state'),
};

const SAVED_STORAGE_KEY = 'catalog-saved-courses-v1';

let allCourses = [];
let compareIds = [];
let savedIds = [];
let selectedChatCourseId = null;
let accountSession = null;

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeText(value = '', fallback = 'Not available') {
  const text = String(value || '').trim();
  return text || fallback;
}

function normalize(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function loadSavedIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch (error) {
    return [];
  }
}

function persistSavedIds() {
  localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(savedIds));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }
  return payload;
}

function groupByFaculty(courses) {
  return courses.reduce((groups, course) => {
    const faculty = course.faculty || 'Other Programmes';
    if (!groups[faculty]) {
      groups[faculty] = [];
    }
    groups[faculty].push(course);
    return groups;
  }, {});
}

function getVisibleCourses() {
  const filters = {
    search: normalize(filterInputs.search.value),
    awardLevel: normalize(filterInputs.awardLevel.value),
    studyMode: normalize(filterInputs.studyMode.value),
    duration: normalize(filterInputs.duration.value),
    intake: normalize(filterInputs.intake.value),
    tuition: normalize(filterInputs.tuition.value),
    state: normalize(filterInputs.state.value),
  };

  return allCourses.filter((course) => {
    const haystack = normalize([course.name, course.faculty, course.code, course.description].filter(Boolean).join(' '));
    if (filters.search && !haystack.includes(filters.search)) return false;
    if (filters.awardLevel && normalize(course.awardLevel) !== filters.awardLevel) return false;
    if (filters.studyMode && !normalize(course.studyMode).includes(filters.studyMode)) return false;
    if (filters.duration && !normalize(course.durationText).includes(filters.duration)) return false;
    if (filters.intake && !normalize(course.intakeText).includes(filters.intake)) return false;
    if (filters.tuition && !normalize(course.tuitionText).includes(filters.tuition)) return false;
    if (filters.state && !normalize(course.university?.state).includes(filters.state)) return false;
    return true;
  });
}

function toggleCompare(courseId) {
  const id = String(courseId);
  if (compareIds.includes(id)) {
    compareIds = compareIds.filter((item) => item !== id);
  } else if (compareIds.length < 3) {
    compareIds = [...compareIds, id];
  }
  renderCatalog();
}

function toggleSaved(courseId) {
  const id = String(courseId);
  if (savedIds.includes(id)) {
    savedIds = savedIds.filter((item) => item !== id);
  } else {
    savedIds = [...savedIds, id];
  }
  persistSavedIds();
  renderCatalog();
}

function selectChatCourse(courseId) {
  selectedChatCourseId = String(courseId);
  renderCatalog();
}

function courseById(courseId) {
  return allCourses.find((course) => String(course.id) === String(courseId)) || null;
}

function renderComparePanel() {
  const compareCourses = compareIds.map(courseById).filter(Boolean);
  catalogCompareList.innerHTML = compareCourses.length
    ? compareCourses
        .map(
          (course) => `
            <article class="catalog-mini-card">
              <strong>${escapeHtml(course.name)}</strong>
              <span>${escapeHtml(course.university?.name || 'Unknown university')}</span>
            </article>
          `
        )
        .join('')
    : '<div class="summary-placeholder">No courses selected for comparison.</div>';

  catalogCompareGrid.innerHTML = compareCourses.length
    ? compareCourses
        .map(
          (course) => `
            <article class="catalog-compare-card">
              <h4>${escapeHtml(course.name)}</h4>
              <div class="result-meta">
                <span>${escapeHtml(course.university?.name || 'Unknown university')}</span>
                <span>${escapeHtml(course.awardLevel || 'other')}</span>
              </div>
              <p><strong>Study mode:</strong> ${escapeHtml(safeText(course.studyMode))}</p>
              <p><strong>Duration:</strong> ${escapeHtml(safeText(course.durationText))}</p>
              <p><strong>Intake:</strong> ${escapeHtml(safeText(course.intakeText))}</p>
              <p><strong>Tuition:</strong> ${escapeHtml(safeText(course.tuitionText))}</p>
            </article>
          `
        )
        .join('')
    : '';
}

function renderSavedPanel() {
  const savedCourses = savedIds.map(courseById).filter(Boolean);
  catalogSavedList.innerHTML = savedCourses.length
    ? savedCourses
        .map(
          (course) => `
            <article class="catalog-mini-card">
              <strong>${escapeHtml(course.name)}</strong>
              <span>${escapeHtml(course.university?.name || 'Unknown university')}</span>
            </article>
          `
        )
        .join('')
    : '<div class="summary-placeholder">No saved courses yet.</div>';
}

function renderChatPanel() {
  const course = courseById(selectedChatCourseId);
  catalogChatCourse.innerHTML = course
    ? `<strong>${escapeHtml(course.name)}</strong><br />${escapeHtml(course.university?.name || 'Unknown university')}`
    : 'Select a course first to ask questions.';
  if (catalogDraftContent) {
    catalogDraftContent.disabled = !accountSession || !course;
  }
  if (catalogDraftSave) {
    catalogDraftSave.disabled = !accountSession || !course;
  }
}

function renderSelectionStatus(visibleCount) {
  catalogSelectionStatus.textContent = `${compareIds.length} selected for compare, ${savedIds.length} saved, ${visibleCount} visible`;
}

function renderCourseCard(course) {
  const isCompared = compareIds.includes(String(course.id));
  const isSaved = savedIds.includes(String(course.id));
  const isSelectedForChat = String(selectedChatCourseId) === String(course.id);
  return `
    <article class="result-card catalog-course-card${isSelectedForChat ? ' active-chat-course' : ''}">
      <div class="catalog-course-toolbar">
        <div class="catalog-course-actions">
          <button type="button" class="secondary-button small-button" data-action="compare" data-course-id="${course.id}">
            ${isCompared ? 'Remove compare' : 'Compare'}
          </button>
          <button type="button" class="secondary-button small-button" data-action="save" data-course-id="${course.id}">
            ${isSaved ? 'Saved' : 'Save'}
          </button>
          <button type="button" class="secondary-button small-button" data-action="chat" data-course-id="${course.id}">
            Ask
          </button>
        </div>
      </div>
      <h3>${escapeHtml(course.name)}</h3>
      <div class="result-meta">
        <span>${escapeHtml(course.university?.name || 'Unknown university')}</span>
        <span>${escapeHtml(course.awardLevel || 'other')}</span>
        <span>${escapeHtml(safeText(course.durationText, 'Duration unknown'))}</span>
        <span>${escapeHtml(safeText(course.studyMode))}</span>
      </div>
      <p>${escapeHtml(safeText(course.description, 'No description available yet.'))}</p>
      <div class="catalog-detail-grid">
        <div><strong>Intake / deadline</strong><span>${escapeHtml(safeText(course.intakeText))}</span></div>
        <div><strong>Tuition</strong><span>${escapeHtml(safeText(course.tuitionText))}</span></div>
        <div><strong>State</strong><span>${escapeHtml(safeText(course.university?.state))}</span></div>
        <div><strong>Source</strong><span>${course.sourceUrl ? `<a href="${escapeHtml(course.sourceUrl)}" target="_blank" rel="noreferrer">Open source</a>` : 'Not available'}</span></div>
      </div>
      <details class="catalog-course-more">
        <summary>More details</summary>
        <p><strong>Entry requirements:</strong> ${escapeHtml(safeText(course.entryRequirements))}</p>
        <p><strong>Career prospects:</strong> ${escapeHtml(safeText(course.careerProspects))}</p>
      </details>
    </article>
  `;
}

function renderGroupedCourses(courses) {
  catalogGroups.innerHTML = '';

  if (!courses.length) {
    catalogGroups.innerHTML =
      '<div class="summary-placeholder">No courses found for the selected university and filters.</div>';
    renderSelectionStatus(0);
    return;
  }

  const grouped = groupByFaculty(courses);
  Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([faculty, facultyCourses]) => {
      const details = document.createElement('details');
      details.className = 'catalog-group';
      details.open = true;

      const summary = document.createElement('summary');
      summary.className = 'catalog-group-summary';
      summary.innerHTML = `
        <span class="catalog-group-marker"></span>
        <span>${escapeHtml(faculty)}</span>
        <span class="catalog-group-count">${facultyCourses.length}</span>
      `;
      details.appendChild(summary);

      const list = document.createElement('div');
      list.className = 'catalog-course-list';
      list.innerHTML = facultyCourses
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((course) => renderCourseCard(course))
        .join('');

      details.appendChild(list);
      catalogGroups.appendChild(details);
    });

  renderSelectionStatus(courses.length);
}

function renderCatalog() {
  const visibleCourses = getVisibleCourses();
  renderGroupedCourses(visibleCourses);
  renderComparePanel();
  renderSavedPanel();
  renderChatPanel();
}

async function loadUniversities() {
  const universities = await fetchJson('/api/universities');
  universities
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((university) => {
      const option = document.createElement('option');
      option.value = university.id;
      option.textContent = `${university.abbreviation} - ${university.name}`;
      universitySelect.appendChild(option);
    });
}

async function loadCoursesForUniversity(universityId) {
  if (!universityId) {
    allCourses = [];
    renderCatalog();
    catalogGroups.innerHTML =
      '<div class="summary-placeholder">Select a university to view grouped courses.</div>';
    return;
  }

  catalogStatus.textContent = 'Loading courses...';
  try {
    allCourses = await fetchJson(`/api/courses?universityId=${encodeURIComponent(universityId)}`);
    compareIds = compareIds.filter((id) => courseById(id));
    if (selectedChatCourseId && !courseById(selectedChatCourseId)) {
      selectedChatCourseId = null;
    }
    renderCatalog();
    catalogStatus.textContent = `${allCourses.length} courses loaded`;
  } catch (error) {
    catalogStatus.textContent = error.message;
  }
}

async function loadAccountSession() {
  try {
    const session = await fetchJson('/api/account/session');
    accountSession = session.user;
    const saved = await fetchJson('/api/account/saved-courses');
    savedIds = saved.map((item) => String(item.courseId));
  } catch (error) {
    accountSession = null;
    savedIds = loadSavedIds();
  }
}

async function syncSavedCourse(courseId) {
  if (!accountSession) {
    toggleSaved(courseId);
    return;
  }

  const id = String(courseId);
  if (savedIds.includes(id)) {
    await fetchJson(`/api/account/saved-courses/${id}`, { method: 'DELETE' });
    savedIds = savedIds.filter((item) => item !== id);
  } else {
    await fetchJson('/api/account/saved-courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId: id }),
    });
    savedIds = [...savedIds, id];
  }
  renderCatalog();
}

async function saveComparisonHistory() {
  if (!accountSession) {
    catalogStatus.textContent = 'Log in to save comparison history';
    return;
  }
  if (!compareIds.length) {
    catalogStatus.textContent = 'Select courses first';
    return;
  }

  await fetchJson('/api/account/comparisons', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: `Comparison ${new Date().toLocaleString()}`,
      courseIds: compareIds,
    }),
  });
  catalogStatus.textContent = 'Comparison saved to your account history';
}

async function loadDraft(courseId) {
  if (!accountSession || !courseId) {
    if (catalogDraftContent) catalogDraftContent.value = '';
    return;
  }

  try {
    const draft = await fetchJson(`/api/account/drafts/${courseId}`);
    catalogDraftContent.value = draft.content || '';
  } catch (error) {
    catalogDraftContent.value = '';
  }
}

function exportCardsToPrint(title, courses) {
  if (!courses.length) {
    catalogStatus.textContent = 'Nothing selected to export';
    return;
  }

  const printWindow = window.open('', '_blank', 'width=1024,height=768');
  if (!printWindow) {
    catalogStatus.textContent = 'Popup blocked. Allow popups to export.';
    return;
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #1f2f47; }
          h1 { margin-bottom: 24px; }
          article { border: 1px solid #dfe6ef; border-radius: 16px; padding: 16px; margin-bottom: 16px; }
          .meta { color: #667488; margin-bottom: 8px; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        ${courses
          .map(
            (course) => `
              <article>
                <h2>${escapeHtml(course.name)}</h2>
                <div class="meta">${escapeHtml(course.university?.name || 'Unknown university')} | ${escapeHtml(
                  course.awardLevel || 'other'
                )} | ${escapeHtml(safeText(course.durationText))}</div>
                <p><strong>Study mode:</strong> ${escapeHtml(safeText(course.studyMode))}</p>
                <p><strong>Intake:</strong> ${escapeHtml(safeText(course.intakeText))}</p>
                <p><strong>Tuition:</strong> ${escapeHtml(safeText(course.tuitionText))}</p>
                <p>${escapeHtml(safeText(course.description))}</p>
              </article>
            `
          )
          .join('')}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

catalogGroups.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const courseId = button.getAttribute('data-course-id');
  const action = button.getAttribute('data-action');
  if (!courseId || !action) return;

  if (action === 'compare') {
    toggleCompare(courseId);
  }
  if (action === 'save') {
    syncSavedCourse(courseId).catch((error) => {
      catalogStatus.textContent = error.message;
    });
  }
  if (action === 'chat') {
    selectChatCourse(courseId);
    loadDraft(courseId).catch(() => {});
  }
});

universitySelect.addEventListener('change', async (event) => {
  await loadCoursesForUniversity(event.target.value);
});

Object.values(filterInputs).forEach((input) => {
  input?.addEventListener('input', renderCatalog);
  input?.addEventListener('change', renderCatalog);
});

catalogChatSubmit?.addEventListener('click', async () => {
  const course = courseById(selectedChatCourseId);
  if (!course) {
    catalogChatAnswer.textContent = 'Select a course first.';
    return;
  }
  if (!catalogChatQuestion.value.trim()) {
    catalogChatAnswer.textContent = 'Enter a question first.';
    return;
  }

  catalogChatAnswer.textContent = 'Thinking...';
  try {
    const answer = await fetchJson(`/api/courses/${course.id}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question: catalogChatQuestion.value.trim(),
      }),
    });
    catalogChatAnswer.textContent = answer.answer || 'No answer returned.';
  } catch (error) {
    catalogChatAnswer.textContent = error.message;
  }
});

exportSavedButton?.addEventListener('click', () => {
  exportCardsToPrint(
    'Saved Course Shortlist',
    savedIds.map(courseById).filter(Boolean)
  );
});

clearSavedButton?.addEventListener('click', () => {
  const clear = async () => {
    if (accountSession) {
      await Promise.all(savedIds.map((id) => fetchJson(`/api/account/saved-courses/${id}`, { method: 'DELETE' })));
    }
    savedIds = [];
    persistSavedIds();
    renderCatalog();
  };

  clear().catch((error) => {
    catalogStatus.textContent = error.message;
  });
});

exportCompareButton?.addEventListener('click', () => {
  exportCardsToPrint(
    'Course Comparison',
    compareIds.map(courseById).filter(Boolean)
  );
});

saveCompareButton?.addEventListener('click', () => {
  saveComparisonHistory().catch((error) => {
    catalogStatus.textContent = error.message;
  });
});

catalogDraftSave?.addEventListener('click', async () => {
  if (!accountSession || !selectedChatCourseId) {
    catalogStatus.textContent = 'Log in and select a course first';
    return;
  }

  try {
    await fetchJson(`/api/account/drafts/${selectedChatCourseId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: catalogDraftContent.value }),
    });
    catalogStatus.textContent = 'Draft saved to your account';
  } catch (error) {
    catalogStatus.textContent = error.message;
  }
});

savedIds = loadSavedIds();
Promise.all([loadAccountSession(), loadUniversities()])
  .then(() => {
    catalogGroups.innerHTML =
      '<div class="summary-placeholder">Select a university to view grouped courses.</div>';
    renderSavedPanel();
    renderComparePanel();
    renderChatPanel();
    renderSelectionStatus(0);
  })
  .catch((error) => {
    catalogStatus.textContent = error.message;
  });
