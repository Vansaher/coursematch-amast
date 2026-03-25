const universitySelect = document.getElementById('compare-university-select');
const compareSearch = document.getElementById('compare-search');
const compareStatus = document.getElementById('compare-status');
const compareSelectionStatus = document.getElementById('compare-selection-status');
const compareResults = document.getElementById('compare-results');
const comparePickedList = document.getElementById('compare-picked-list');
const compareDisplay = document.getElementById('compare-display');

let allCourses = [];
let selectedIds = [];

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalize(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function safeText(value = '', fallback = 'Not available') {
  const text = String(value || '').trim();
  return text || fallback;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }
  return payload;
}

function courseById(courseId) {
  return allCourses.find((course) => String(course.id) === String(courseId)) || null;
}

function getVisibleCourses() {
  const universityId = String(universitySelect.value || '');
  const query = normalize(compareSearch.value);

  return allCourses.filter((course) => {
    if (universityId && String(course.universityId || course.university?.id || '') !== universityId) {
      return false;
    }

    if (query) {
      const haystack = normalize(
        [course.name, course.faculty, course.code, course.university?.name].filter(Boolean).join(' ')
      );
      if (!haystack.includes(query)) {
        return false;
      }
    }

    return true;
  });
}

function toggleSelected(courseId) {
  const id = String(courseId);
  if (selectedIds.includes(id)) {
    selectedIds = selectedIds.filter((item) => item !== id);
  } else if (selectedIds.length < 3) {
    selectedIds = [...selectedIds, id];
  }

  renderPage();
}

function renderSelectionStatus(visibleCount) {
  compareSelectionStatus.textContent = `${selectedIds.length} selected, ${visibleCount} visible`;
}

function renderResults() {
  const visibleCourses = getVisibleCourses();
  compareStatus.textContent = `${visibleCourses.length} courses match the current filters`;
  renderSelectionStatus(visibleCourses.length);

  compareResults.innerHTML = visibleCourses.length
    ? visibleCourses
        .map((course) => {
          const selected = selectedIds.includes(String(course.id));
          return `
            <article class="result-card catalog-course-card compare-result-card">
              <div class="catalog-course-toolbar">
                <div>
                  <h3>${escapeHtml(course.name)}</h3>
                  <div class="result-meta">
                    <span>${escapeHtml(course.university?.name || 'Unknown university')}</span>
                    <span>${escapeHtml(safeText(course.faculty, 'Faculty not set'))}</span>
                    <span>${escapeHtml(safeText(course.durationText))}</span>
                  </div>
                </div>
                <button
                  type="button"
                  class="${selected ? 'primary-button' : 'secondary-button'} small-button"
                  data-compare-id="${escapeHtml(String(course.id))}"
                >
                  ${selected ? 'Remove' : 'Compare'}
                </button>
              </div>
              <p>${escapeHtml(safeText(course.description, 'No description available yet.'))}</p>
            </article>
          `;
        })
        .join('')
    : '<div class="summary-placeholder">No courses match the current filters.</div>';
}

function renderPickedList() {
  const selectedCourses = selectedIds.map(courseById).filter(Boolean);
  comparePickedList.innerHTML = selectedCourses.length
    ? selectedCourses
        .map(
          (course) => `
            <article class="catalog-mini-card">
              <strong>${escapeHtml(course.name)}</strong>
              <span>${escapeHtml(course.university?.name || 'Unknown university')}</span>
            </article>
          `
        )
        .join('')
    : '<div class="summary-placeholder">No courses selected yet.</div>';
}

function renderDisplay() {
  const selectedCourses = selectedIds.map(courseById).filter(Boolean);
  compareDisplay.innerHTML = selectedCourses.length
    ? selectedCourses
        .map(
          (course) => `
            <article class="catalog-compare-card">
              <h4>${escapeHtml(course.name)}</h4>
              <div class="result-meta">
                <span>${escapeHtml(course.university?.name || 'Unknown university')}</span>
                <span>${escapeHtml(safeText(course.awardLevel, 'other'))}</span>
              </div>
              <p><strong>Faculty:</strong> ${escapeHtml(safeText(course.faculty, 'Faculty not set'))}</p>
              <p><strong>Study mode:</strong> ${escapeHtml(safeText(course.studyMode))}</p>
              <p><strong>Duration:</strong> ${escapeHtml(safeText(course.durationText))}</p>
              <p><strong>Intake:</strong> ${escapeHtml(safeText(course.intakeText))}</p>
              <p><strong>Tuition:</strong> ${escapeHtml(safeText(course.tuitionText))}</p>
              <p>${escapeHtml(safeText(course.description, 'No description available yet.'))}</p>
            </article>
          `
        )
        .join('')
    : '<div class="summary-placeholder">Choose courses to compare them here.</div>';
}

function renderPage() {
  renderResults();
  renderPickedList();
  renderDisplay();
}

async function loadUniversities() {
  const universities = await fetchJson('/api/universities');
  universitySelect.innerHTML = '<option value="">All universities</option>';
  universities.forEach((university) => {
    const option = document.createElement('option');
    option.value = String(university.id);
    option.textContent = university.name;
    universitySelect.appendChild(option);
  });
}

async function loadCourses() {
  allCourses = await fetchJson('/api/courses');
  renderPage();
}

compareResults.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-compare-id]');
  if (!button) {
    return;
  }
  toggleSelected(button.getAttribute('data-compare-id'));
});

universitySelect.addEventListener('change', renderPage);
compareSearch.addEventListener('input', renderPage);

Promise.all([loadUniversities(), loadCourses()]).catch((error) => {
  compareStatus.textContent = error.message;
});
