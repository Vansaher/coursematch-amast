const importForm = document.getElementById('import-form');
const importStatus = document.getElementById('import-status');
const importOutput = document.getElementById('import-output');
const universityList = document.getElementById('university-list');
const courseList = document.getElementById('course-list');
const courseFilterForm = document.getElementById('course-filter-form');

let activeUniversityId = '';

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }
  return payload;
}

function renderCourses(courses) {
  courseList.innerHTML = '';
  if (!courses.length) {
    courseList.innerHTML = '<div class="summary-placeholder">No courses found for this filter.</div>';
    return;
  }

  courses.slice(0, 80).forEach((course) => {
    const card = document.createElement('article');
    card.className = 'result-card';
    card.innerHTML = `
      <h3>${course.name}</h3>
      <div class="result-meta">
        <span>${course.university?.name || 'Unknown university'}</span>
        <span>${course.faculty || 'Faculty not set'}</span>
        <span>${course.durationText || 'Duration unknown'}</span>
      </div>
      <p>${course.description || 'No description available yet.'}</p>
    `;
    courseList.appendChild(card);
  });
}

async function loadCourses() {
  const faculty = new FormData(courseFilterForm).get('faculty') || '';
  const query = new URLSearchParams();
  if (activeUniversityId) {
    query.set('universityId', activeUniversityId);
  }
  if (faculty) {
    query.set('faculty', faculty);
  }
  const courses = await fetchJson(`/api/courses?${query.toString()}`);
  renderCourses(courses);
}

async function loadUniversities() {
  const universities = await fetchJson('/api/universities');
  universityList.innerHTML = '';

  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.className = `chip ${activeUniversityId ? '' : 'active'}`;
  allChip.textContent = 'All universities';
  allChip.addEventListener('click', async () => {
    activeUniversityId = '';
    await loadUniversities();
    await loadCourses();
  });
  universityList.appendChild(allChip);

  universities.forEach((university) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip ${String(university.id) === String(activeUniversityId) ? 'active' : ''}`;
    chip.textContent = `${university.name} (${(university.courses || []).length})`;
    chip.addEventListener('click', async () => {
      activeUniversityId = university.id;
      await loadUniversities();
      await loadCourses();
    });
    universityList.appendChild(chip);
  });
}

importForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  importStatus.textContent = 'Running import...';

  const formData = new FormData(importForm);
  const scraperKey = formData.get('scraperKey');
  const limit = formData.get('limit');

  try {
    const payload = await fetchJson('/api/admin/imports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scraperKey,
        limit: limit ? Number(limit) : undefined,
      }),
    });
    importOutput.textContent = JSON.stringify(payload, null, 2);
    importStatus.textContent = 'Import finished';
    await loadUniversities();
    await loadCourses();
  } catch (error) {
    importStatus.textContent = error.message;
  }
});

courseFilterForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await loadCourses();
});

Promise.all([loadUniversities(), loadCourses()]).catch((error) => {
  importStatus.textContent = error.message;
});
