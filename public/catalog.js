const universitySelect = document.getElementById('catalog-university-select');
const catalogStatus = document.getElementById('catalog-status');
const catalogGroups = document.getElementById('catalog-groups');

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
        <span>${faculty}</span>
        <span class="catalog-group-count">${facultyCourses.length}</span>
      `;
      details.appendChild(summary);

      const list = document.createElement('div');
      list.className = 'catalog-course-list';

      facultyCourses
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((course) => {
          const card = document.createElement('article');
          card.className = 'result-card catalog-course-card';
          card.innerHTML = `
            <h3>${course.name}</h3>
            <div class="result-meta">
              <span>${course.university?.name || 'Unknown university'}</span>
              <span>${course.awardLevel || 'other'}</span>
              <span>${course.durationText || 'Duration unknown'}</span>
            </div>
            <p>${course.description || 'No description available yet.'}</p>
          `;
          list.appendChild(card);
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
