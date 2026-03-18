const logoutButton = document.getElementById('logout-button');
const universitySelect = document.getElementById('catalog-university-select');
const catalogStatus = document.getElementById('catalog-status');
const catalogGroups = document.getElementById('catalog-groups');
const adminUserMenu = document.querySelector('.admin-user-menu');
const adminToolbarUser = document.querySelector('.admin-toolbar-user');

function escapeHtml(value) {
  return String(value ?? '')
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

adminToolbarUser?.addEventListener('click', (event) => {
  event.stopPropagation();
  adminUserMenu?.classList.toggle('open');
});

document.addEventListener('click', (event) => {
  if (adminUserMenu && !adminUserMenu.contains(event.target)) {
    adminUserMenu.classList.remove('open');
  }
});

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

function editButtonMarkup(courseId) {
  return `
    <button type="button" class="catalog-edit-button" data-course-id="${escapeHtml(courseId)}" aria-label="Edit course">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 17.25V20h2.75L17.8 8.94l-2.75-2.75L4 17.25zm15.71-9.04a1 1 0 0 0 0-1.41l-2.5-2.5a1 1 0 0 0-1.41 0l-1.29 1.29 3.91 3.91 1.29-1.29z"/>
      </svg>
    </button>
  `;
}

function editorMarkup(course) {
  return `
    <form class="catalog-edit-form" data-course-id="${escapeHtml(course.id)}">
      <div class="form-row">
        <label>
          Name
          <input name="name" value="${escapeHtml(course.name || '')}" />
        </label>
        <label>
          Faculty
          <input name="faculty" value="${escapeHtml(course.faculty || '')}" />
        </label>
      </div>
      <div class="form-row">
        <label>
          Study mode
          <input name="studyMode" value="${escapeHtml(course.studyMode || '')}" />
        </label>
        <label>
          Duration
          <input name="durationText" value="${escapeHtml(course.durationText || '')}" />
        </label>
      </div>
      <label>
        Description
        <textarea name="description" rows="5">${escapeHtml(course.description || '')}</textarea>
      </label>
      <label>
        Entry requirements
        <textarea name="entryRequirements" rows="5">${escapeHtml(course.entryRequirements || '')}</textarea>
      </label>
      <div class="catalog-edit-actions">
        <button type="submit" class="primary-button">Save</button>
        <button type="button" class="danger-button catalog-delete-button" data-course-id="${escapeHtml(course.id)}">Delete</button>
      </div>
    </form>
  `;
}

function attachCardEvents(card) {
  const editButton = card.querySelector('.catalog-edit-button');
  const editor = card.querySelector('.catalog-edit-shell');
  const form = card.querySelector('.catalog-edit-form');
  const deleteButton = card.querySelector('.catalog-delete-button');

  editButton?.addEventListener('click', () => {
    editor.hidden = !editor.hidden;
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
      catalogStatus.textContent = `Saving ${payload.name || 'course'}...`;
      await fetchJson(`/api/courses/${encodeURIComponent(form.dataset.courseId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      catalogStatus.textContent = 'Course updated';
      await loadCoursesForUniversity(universitySelect.value);
    } catch (error) {
      catalogStatus.textContent = error.message;
    }
  });

  deleteButton?.addEventListener('click', async () => {
    if (!window.confirm('Delete this course entry?')) {
      return;
    }

    try {
      catalogStatus.textContent = 'Deleting course...';
      await fetchJson(`/api/courses/${encodeURIComponent(deleteButton.dataset.courseId)}`, {
        method: 'DELETE',
      });
      catalogStatus.textContent = 'Course deleted';
      await loadCoursesForUniversity(universitySelect.value);
    } catch (error) {
      catalogStatus.textContent = error.message;
    }
  });
}

function renderGroupedCourses(courses) {
  catalogGroups.innerHTML = '';

  if (!courses.length) {
    catalogGroups.innerHTML =
      '<div class="summary-placeholder">No courses found for the selected university.</div>';
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
      list.className = 'catalog-course-list admin-catalog-course-list';

      facultyCourses
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((course) => {
          const card = document.createElement('article');
          card.className = 'result-card catalog-course-card admin-catalog-card';
          card.innerHTML = `
            ${editButtonMarkup(course.id)}
            <h3>${escapeHtml(course.name)}</h3>
            <div class="result-meta">
              <span>${escapeHtml(course.university?.name || 'Unknown university')}</span>
              <span>${escapeHtml(course.awardLevel || 'other')}</span>
              <span>${escapeHtml(course.durationText || 'Duration unknown')}</span>
            </div>
            <p>${escapeHtml(course.description || 'No description available yet.')}</p>
            <div class="catalog-edit-shell" hidden>
              ${editorMarkup(course)}
            </div>
          `;
          list.appendChild(card);
          attachCardEvents(card);
        });

      details.appendChild(list);
      catalogGroups.appendChild(details);
    });
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
    catalogGroups.innerHTML =
      '<div class="summary-placeholder">Select a university to view grouped courses.</div>';
    return;
  }

  catalogStatus.textContent = 'Loading courses...';
  try {
    const courses = await fetchJson(`/api/courses?universityId=${encodeURIComponent(universityId)}`);
    renderGroupedCourses(courses);
    catalogStatus.textContent = `${courses.length} courses loaded`;
  } catch (error) {
    catalogStatus.textContent = error.message;
  }
}

logoutButton?.addEventListener('click', async () => {
  try {
    await fetchJson('/api/admin/logout', { method: 'POST' });
  } finally {
    window.location.href = '/admin/login';
  }
});

universitySelect.addEventListener('change', async (event) => {
  await loadCoursesForUniversity(event.target.value);
});

loadUniversities()
  .then(() => {
    catalogGroups.innerHTML =
      '<div class="summary-placeholder">Select a university to view grouped courses.</div>';
  })
  .catch((error) => {
    catalogStatus.textContent = error.message;
  });
