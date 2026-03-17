const matchForm = document.getElementById('match-form');
const formStatus = document.getElementById('form-status');
const summary = document.getElementById('summary');
const results = document.getElementById('results');
const preferredUniversities = document.getElementById('preferred-universities');
const resultFileInput = document.getElementById('result-file');
const extractedSubjects = document.getElementById('extracted-subjects');

let universityOptions = [];

function renderExtractedSubjects(subjects = []) {
  extractedSubjects.innerHTML = '';
  if (!subjects.length) {
    extractedSubjects.innerHTML =
      '<div class="summary-placeholder">No STPM subjects extracted yet. Upload a result slip to see the parsed subjects.</div>';
    return;
  }

  subjects.forEach((subject) => {
    const card = document.createElement('article');
    card.className = 'result-card';
    card.innerHTML = `
      <h3>${subject.subject}</h3>
      <div class="result-meta">
        <span>Code ${subject.code}</span>
        <span>Grade ${subject.grade}</span>
        <span>Grade point ${subject.gradePoint.toFixed(2)}</span>
        <span>Matcher score ${subject.score.toFixed(2)}</span>
      </div>
    `;
    extractedSubjects.appendChild(card);
  });
}

function renderResults(payload) {
  const qwenCount = payload.matches.filter((course) => course.matchMode === 'qwen').length;
  summary.innerHTML = `
    <strong>Student:</strong> ${payload.input.student?.name || 'Unknown'}<br />
    <strong>PNGK:</strong> ${
      Number.isFinite(Number(payload.input.student?.pngk)) ? Number(payload.input.student.pngk).toFixed(2) : 'Not available'
    }<br />
    <strong>Average score:</strong> ${
      payload.input.averageScore === null ? 'Not available' : payload.input.averageScore.toFixed(2)
    }<br />
    <strong>Matches found:</strong> ${payload.matches.length}<br />
    <strong>AI-assisted matches:</strong> ${qwenCount}
  `;
  renderExtractedSubjects(payload.input.subjects || []);

  results.innerHTML = '';
  if (!payload.matches.length) {
    results.innerHTML = '<div class="summary-placeholder">No courses matched your current filters.</div>';
    return;
  }

  payload.matches.slice(0, 12).forEach((course) => {
    const modeLabel =
      course.matchMode === 'requirements'
        ? 'Structured requirements'
        : course.matchMode === 'qwen'
          ? `Qwen assessment${course.aiAssessment?.model ? ` (${course.aiAssessment.model})` : ''}`
          : 'Heuristic assessment';
    const card = document.createElement('article');
    card.className = 'result-card';
    card.innerHTML = `
      <div class="match-badge">Match score ${course.matchScore}</div>
      <h3>${course.name}</h3>
      <div class="result-meta">
        <span>${course.university?.name || 'Unknown university'}</span>
        <span>${course.faculty || 'Faculty not set'}</span>
        <span>${course.awardLevel}</span>
        <span>${modeLabel}</span>
      </div>
      <p>${course.description || 'No description available yet.'}</p>
      <div class="result-meta">
        ${(course.matchReasons || []).map((reason) => `<span>${reason}</span>`).join('')}
      </div>
    `;
    results.appendChild(card);
  });
}

async function fetchJson(url) {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }
  return payload;
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
  universityOptions = await fetchJson('/api/universities');
  renderUniversityOptions(universityOptions);
}

matchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!resultFileInput.files.length) {
    formStatus.textContent = 'Select an STPM PDF first';
    return;
  }

  formStatus.textContent = 'Uploading and parsing STPM result...';

  const formData = new FormData(matchForm);
  const requirements = {};
  const selectedUniversities = formData.getAll('preferredUniversities');
  if (selectedUniversities.length) {
    requirements.preferredUniversities = selectedUniversities;
  }
  if (formData.get('preferredFaculty')) {
    requirements.preferredFaculty = formData.get('preferredFaculty');
  }

  try {
    const payloadBody = new FormData();
    payloadBody.append('resultFile', resultFileInput.files[0]);
    payloadBody.append('requirements', JSON.stringify(requirements));

    const response = await fetch('/api/matches/stpm-upload', {
      method: 'POST',
      body: payloadBody,
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

renderExtractedSubjects([]);
loadUniversities().catch((error) => {
  formStatus.textContent = error.message;
});
