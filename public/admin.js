const universityList = document.getElementById('university-list');
const courseList = document.getElementById('course-list');
const courseFilterForm = document.getElementById('course-filter-form');
const logoutButton = document.getElementById('logout-button');
const statUniversities = document.getElementById('stat-universities');
const statCourses = document.getElementById('stat-courses');
const statFiltered = document.getElementById('stat-filtered');
const statMatching = document.getElementById('stat-matching');
const adminUserMenu = document.querySelector('.admin-user-menu');
const adminToolbarUser = document.querySelector('.admin-toolbar-user');

let activeUniversityId = '';

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

logoutButton.addEventListener('click', async () => {
  try {
    await fetchJson('/api/admin/logout', {
      method: 'POST',
    });
  } finally {
    window.location.href = '/account';
  }
});

function renderCourses(courses) {
  courseList.innerHTML = '';
  statFiltered.textContent = String(courses.length);
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
  if (!activeUniversityId && !faculty) {
    statCourses.textContent = String(courses.length);
  }
  renderCourses(courses);
}

async function loadUniversities() {
  const universities = await fetchJson('/api/universities');
  statUniversities.textContent = String(universities.length);
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

courseFilterForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await loadCourses();
});

Promise.all([loadUniversities(), loadCourses()]).catch((error) => {
  if (statMatching) {
    statMatching.textContent = 'Error';
  }
  console.error(error);
});
