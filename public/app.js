const subjectTemplate = document.getElementById('subject-template');
const subjectsContainer = document.getElementById('subjects');
const addSubjectButton = document.getElementById('add-subject');
const matchForm = document.getElementById('match-form');
const formStatus = document.getElementById('form-status');
const summary = document.getElementById('summary');
const results = document.getElementById('results');
const preferredUniversities = document.getElementById('preferred-universities');

let universityOptions = [];

function addSubjectRow(subject = '', score = '') {
  const fragment = subjectTemplate.content.cloneNode(true);
  const row = fragment.querySelector('.subject-row');
  row.querySelector('input[name="subject"]').value = subject;
  row.querySelector('input[name="score"]').value = score;
  row.querySelector('.remove-subject').addEventListener('click', () => row.remove());
  subjectsContainer.appendChild(row);
}

function renderResults(payload) {
  summary.innerHTML = `
    <strong>Average score:</strong> ${
      payload.input.averageScore === null ? 'Not available' : payload.input.averageScore.toFixed(2)
    }<br />
    <strong>Matches found:</strong> ${payload.matches.length}
  `;

  results.innerHTML = '';
  if (!payload.matches.length) {
    results.innerHTML = '<div class="summary-placeholder">No courses matched your current filters.</div>';
    return;
  }

  payload.matches.slice(0, 12).forEach((course) => {
    const card = document.createElement('article');
    card.className = 'result-card';
    card.innerHTML = `
      <div class="match-badge">Match score ${course.matchScore}</div>
      <h3>${course.name}</h3>
      <div class="result-meta">
        <span>${course.university?.name || 'Unknown university'}</span>
        <span>${course.faculty || 'Faculty not set'}</span>
        <span>${course.awardLevel}</span>
      </div>
      <p>${course.description || 'No description available yet.'}</p>
      <div class="result-meta">
        ${(course.matchReasons || []).map((reason) => `<span>${reason}</span>`).join('')}
      </div>
    `;
    results.appendChild(card);
  });
}

function renderUniversityOptions(universities) {
  preferredUniversities.innerHTML = '';

  universities.forEach((university) => {
    const label = document.createElement('label');
    label.className = 'university-option';
    label.innerHTML = `
      <input type="checkbox" name="preferredUniversities" value="${university.abbreviation}" />
      <span>${university.abbreviation}</span>
    `;
    preferredUniversities.appendChild(label);
  });
}

async function loadUniversities() {
  const response = await fetch('/api/universities');
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to load universities');
  }

  universityOptions = payload;
  renderUniversityOptions(universityOptions);
}

addSubjectButton.addEventListener('click', () => addSubjectRow());

matchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  formStatus.textContent = 'Matching...';

  const formData = new FormData(matchForm);
  const scores = {};
  subjectsContainer.querySelectorAll('.subject-row').forEach((row) => {
    const subject = row.querySelector('input[name="subject"]').value.trim();
    const score = row.querySelector('input[name="score"]').value.trim();
    if (subject && score) {
      scores[subject] = Number(score);
    }
  });

  const requirements = {};
  const selectedUniversities = formData.getAll('preferredUniversities');
  if (selectedUniversities.length) {
    requirements.preferredUniversities = selectedUniversities;
  }
  if (formData.get('preferredFaculty')) {
    requirements.preferredFaculty = formData.get('preferredFaculty');
  }

  try {
    const response = await fetch('/api/matches/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scores, requirements }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Match request failed');
    }
    renderResults(payload);
    formStatus.textContent = 'Done';
  } catch (error) {
    formStatus.textContent = error.message;
  }
});

addSubjectRow('Mathematics', 85);
addSubjectRow('English', 78);
addSubjectRow('Science', 82);
loadUniversities().catch((error) => {
  formStatus.textContent = error.message;
});
