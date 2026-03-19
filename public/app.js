const matchForm = document.getElementById('match-form');
const formStatus = document.getElementById('form-status');
const summary = document.getElementById('summary');
const results = document.getElementById('results');
const preferredUniversities = document.getElementById('preferred-universities');
const resultFileInput = document.getElementById('result-file');
const extractedSubjects = document.getElementById('extracted-subjects');
const rerunButton = document.getElementById('rerun-button');

let universityOptions = [];
let latestParsedSnapshot = null;
let accountSession = null;

function setRerunVisibility(isVisible) {
  if (!rerunButton) {
    return;
  }

  rerunButton.hidden = !isVisible;
}

const UNIVERSITY_VISUALS = {
  UM: {
    background:
      'https://images.unsplash.com/photo-1498243691581-b145c3f54a5a?auto=format&fit=crop&w=1600&q=80',
  },
  UPM: {
    background:
      'https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=1600&q=80',
  },
  UKM: {
    background:
      'https://commons.wikimedia.org/wiki/Special:FilePath/Langkawi%20Malaysia%20Universiti-Kebangsaan-Malaysia-01.jpg',
  },
  USM: {
    background:
      'https://commons.wikimedia.org/wiki/Special:FilePath/Main%20gate%20at%20the%20Universiti%20Sains%20Malaysia.jpg',
  },
  UTM: {
    background:
      'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=1600&q=80',
  },
  UUM: {
    background:
      'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=1600&q=80',
  },
};

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveUniversityAbbreviation(course) {
  const name = String(course?.university?.name || '').toLowerCase();
  const preferred = universityOptions.find(
    (university) =>
      String(university.id) === String(course?.universityId) ||
      String(university.name || '').toLowerCase() === name
  );
  if (preferred?.abbreviation) return preferred.abbreviation;
  if (name.includes('malaya')) return 'UM';
  if (name.includes('putra')) return 'UPM';
  if (name.includes('kebangsaan')) return 'UKM';
  if (name.includes('sains')) return 'USM';
  if (name.includes('teknologi')) return 'UTM';
  if (name.includes('utara')) return 'UUM';
  return 'UNI';
}

function resolveUniversityLogoUrl(course) {
  const websiteUrl = course?.university?.websiteUrl;
  if (!websiteUrl) return null;

  try {
    const domain = new URL(websiteUrl).hostname.replace(/^www\./, '');
    return `https://logo.clearbit.com/${domain}`;
  } catch (error) {
    return null;
  }
}

function resolveUniversityBackground(course) {
  const abbreviation = resolveUniversityAbbreviation(course);
  return UNIVERSITY_VISUALS[abbreviation]?.background || UNIVERSITY_VISUALS.UUM.background;
}

function buildModeLabel(course) {
  if (course.matchMode === 'requirements') return 'Structured requirements';
  if (course.matchMode === 'qwen') {
    return `Qwen assessment${course.aiAssessment?.model ? ` (${escapeHtml(course.aiAssessment.model)})` : ''}`;
  }
  return 'Heuristic assessment';
}

function buildRequirementsFromForm() {
  const formData = new FormData(matchForm);
  const requirements = {};
  const selectedUniversities = formData.getAll('preferredUniversities');
  if (selectedUniversities.length) {
    requirements.preferredUniversities = selectedUniversities;
  }
  if (formData.get('preferredFaculty')) {
    requirements.preferredFaculty = formData.get('preferredFaculty');
  }
  if (formData.get('interestStatement')) {
    requirements.interestStatement = formData.get('interestStatement');
  }
  return requirements;
}

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
      <h3>${escapeHtml(subject.subject)}</h3>
      <div class="result-meta">
        <span>Code ${escapeHtml(subject.code)}</span>
        <span>Grade ${escapeHtml(subject.grade)}</span>
        <span>Grade point ${subject.gradePoint.toFixed(2)}</span>
        <span>Matcher score ${subject.score.toFixed(2)}</span>
      </div>
    `;
    extractedSubjects.appendChild(card);
  });
}

function renderSummary(payload) {
  const qwenCount = payload.matches.filter((course) => course.matchMode === 'qwen').length;
  const translatedInterest = Array.isArray(payload.input.interestProfile?.preferredCourseAreas)
    ? payload.input.interestProfile.preferredCourseAreas.join(', ')
    : '';

  summary.innerHTML = `
    <strong>Student:</strong> ${escapeHtml(payload.input.student?.name || 'Unknown')}<br />
    <strong>PNGK:</strong> ${
      Number.isFinite(Number(payload.input.student?.pngk)) ? Number(payload.input.student.pngk).toFixed(2) : 'Not available'
    }<br />
    <strong>Average score:</strong> ${
      payload.input.averageScore === null ? 'Not available' : payload.input.averageScore.toFixed(2)
    }<br />
    <strong>Matches found:</strong> ${payload.matches.length}<br />
    <strong>AI-assisted matches:</strong> ${qwenCount}<br />
    <strong>Interest note:</strong> ${escapeHtml(payload.input.interestStatement || 'Not provided')}<br />
    <strong>Interest translated into:</strong> ${escapeHtml(translatedInterest || 'No specific course areas inferred')}
  `;
}

function buildReasonListMarkup(items = []) {
  if (!items.length) {
    return '<div class="summary-placeholder compact-placeholder">No signals recorded for this section.</div>';
  }

  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function buildGapMarkup(gaps = []) {
  if (!gaps.length) {
    return '<div class="summary-placeholder compact-placeholder">No major subject gaps were detected.</div>';
  }

  return `<ul>${gaps.map((gap) => `<li>${escapeHtml(gap.message || gap.subject || 'Gap detected')}</li>`).join('')}</ul>`;
}

function buildAlternativesMarkup(items = []) {
  if (!items.length) {
    return '<div class="summary-placeholder compact-placeholder">No nearby alternative pathways were suggested.</div>';
  }

  return `<div class="chip-list">${items.map((item) => `<span class="chip static-chip">${escapeHtml(item)}</span>`).join('')}</div>`;
}

function buildExplanationMarkup(course, openByDefault = false) {
  const explanation = course.explanation || {};
  const confidence = explanation.confidence || null;

  return `
    <details class="match-explainer collapsed-match-explainer"${openByDefault ? ' open' : ''}>
      <summary>Why this suits you</summary>
      <div class="explanation-grid">
        <section class="explanation-section">
          <strong>Score fit</strong>
          ${buildReasonListMarkup(explanation.scoreFit || [])}
        </section>
        <section class="explanation-section">
          <strong>Interest fit</strong>
          ${buildReasonListMarkup(explanation.interestFit || [])}
        </section>
        <section class="explanation-section">
          <strong>Preference fit</strong>
          ${buildReasonListMarkup(explanation.preferenceFit || [])}
        </section>
        <section class="explanation-section">
          <strong>Match confidence</strong>
          ${
            confidence
              ? `<div class="confidence-panel">
                   <span class="confidence-label">${escapeHtml(confidence.label)}</span>
                   <span class="confidence-score">${escapeHtml(confidence.score)}</span>
                 </div>
                 <p>${escapeHtml(confidence.summary || '')}</p>`
              : '<div class="summary-placeholder compact-placeholder">No confidence explanation generated.</div>'
          }
        </section>
        <section class="explanation-section">
          <strong>Subject gap detector</strong>
          ${buildGapMarkup(explanation.subjectGaps || [])}
        </section>
        <section class="explanation-section">
          <strong>Alternative pathways</strong>
          ${buildAlternativesMarkup(explanation.alternativeSuggestions || [])}
        </section>
      </div>
    </details>
  `;
}

function buildEligibilityBadge(course) {
  const label = course.eligibility?.label || 'Review';
  const tone = course.eligibility?.tone || 'borderline';
  return `<span class="eligibility-badge eligibility-${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
}

function renderFeaturedResult(course) {
  const article = document.createElement('article');
  const backgroundUrl = resolveUniversityBackground(course);
  const logoUrl = resolveUniversityLogoUrl(course);
  const universityName = course.university?.name || 'Unknown university';
  const abbreviation = resolveUniversityAbbreviation(course);

  article.className = 'featured-result-card';
  article.innerHTML = `
    <div class="featured-result-backdrop" style="background-image: url('${backgroundUrl}')"></div>
    <div class="featured-result-overlay"></div>
    <div class="featured-result-content">
      <div class="featured-result-head">
        <span class="featured-result-kicker">Top recommendation</span>
        <div class="featured-result-badges">
          ${buildEligibilityBadge(course)}
          <div class="match-badge featured-match-badge">Match score ${course.matchScore}</div>
        </div>
      </div>
      <div class="featured-result-brand">
        ${
          logoUrl
            ? `<img class="featured-result-logo" src="${logoUrl}" alt="${escapeHtml(universityName)} logo" />`
            : `<div class="featured-result-logo-fallback">${escapeHtml(abbreviation)}</div>`
        }
        <div class="featured-result-brand-copy">
          <span>${escapeHtml(universityName)}</span>
          <strong>${escapeHtml(course.name)}</strong>
        </div>
      </div>
      <div class="result-meta featured-result-meta">
        <span>${escapeHtml(course.faculty || 'Faculty not set')}</span>
        <span>${escapeHtml(course.awardLevel || 'other')}</span>
        <span>${buildModeLabel(course)}</span>
      </div>
      <p class="featured-result-description">${escapeHtml(course.description || 'No description available yet.')}</p>
      <div class="featured-result-confidence">
        <strong>${escapeHtml(course.explanation?.confidence?.label || 'Confidence')}</strong>
        <span>${escapeHtml(course.explanation?.confidence?.summary || 'No confidence explanation available.')}</span>
      </div>
      <div class="featured-result-eligibility-note">
        ${escapeHtml(course.eligibility?.summary || 'Review the explanation for more detail.')}
      </div>
      ${buildExplanationMarkup(course, true)}
    </div>
  `;
  results.appendChild(article);
}

function renderStandardResult(course, index) {
  const article = document.createElement('article');
  article.className = 'result-card recommendation-card';
  article.innerHTML = `
    <div class="recommendation-card-header">
      <div>
        <span class="recommendation-rank">Recommendation ${index + 1}</span>
        <h3>${escapeHtml(course.name)}</h3>
      </div>
      <div class="recommendation-badges">
        ${buildEligibilityBadge(course)}
        <div class="match-badge">Match score ${course.matchScore}</div>
      </div>
    </div>
    <div class="result-meta">
      <span>${escapeHtml(course.university?.name || 'Unknown university')}</span>
      <span>${escapeHtml(course.faculty || 'Faculty not set')}</span>
      <span>${escapeHtml(course.awardLevel || 'other')}</span>
      <span>${buildModeLabel(course)}</span>
    </div>
    <p>${escapeHtml(course.description || 'No description available yet.')}</p>
    <div class="recommendation-confidence-line">
      <strong>${escapeHtml(course.explanation?.confidence?.label || 'Confidence')}</strong>
      <span>${escapeHtml(course.eligibility?.summary || 'Review the explanation for detail.')}</span>
    </div>
    ${buildExplanationMarkup(course, false)}
  `;
  results.appendChild(article);
}

function renderResults(payload) {
  renderSummary(payload);
  renderExtractedSubjects(payload.input.subjects || []);

  results.innerHTML = '';
  if (!payload.matches.length) {
    results.innerHTML = '<div class="summary-placeholder">No courses matched your current filters.</div>';
    return;
  }

  const [topMatch, ...otherMatches] = payload.matches.slice(0, 12);
  renderFeaturedResult(topMatch);
  otherMatches.forEach((course, index) => renderStandardResult(course, index + 1));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }
  return payload;
}

async function loadAccountSession() {
  try {
    const payload = await fetchJson('/api/account/session');
    accountSession = payload.user;
  } catch (error) {
    accountSession = null;
  }
}

async function persistMatchSession(sessionType, payload) {
  if (!accountSession) {
    return;
  }

  await fetchJson('/api/account/match-sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      label: `${sessionType === 'what_if' ? 'What-if' : 'STPM upload'} ${new Date().toLocaleString()}`,
      sessionType,
      inputSnapshot: payload.input,
      resultsSnapshot: payload.matches.slice(0, 8).map((course) => ({
        id: course.id,
        name: course.name,
        university: course.university?.name || null,
        matchScore: course.matchScore,
        eligibility: course.eligibility || null,
      })),
    }),
  });
}

function renderUniversityOptions(universities) {
  preferredUniversities.innerHTML = '';

  universities.forEach((university) => {
    const label = document.createElement('label');
    label.className = 'university-option';
    label.innerHTML = `
      <input type="checkbox" name="preferredUniversities" value="${escapeHtml(university.abbreviation)}" />
      <span>${escapeHtml(university.abbreviation)}</span>
    `;
    preferredUniversities.appendChild(label);
  });
}

async function loadUniversities() {
  universityOptions = await fetchJson('/api/universities');
  renderUniversityOptions(universityOptions);
}

async function submitPdfMatch() {
  if (!resultFileInput.files.length) {
    formStatus.textContent = 'Select an STPM PDF first';
    return;
  }

  formStatus.textContent = 'Uploading and parsing STPM result...';
  const requirements = buildRequirementsFromForm();

  const payloadBody = new FormData();
  payloadBody.append('resultFile', resultFileInput.files[0]);
  payloadBody.append('requirements', JSON.stringify(requirements));

  const payload = await fetchJson('/api/matches/stpm-upload', {
    method: 'POST',
    body: payloadBody,
  });

  latestParsedSnapshot = {
    student: payload.input.student,
    scores: payload.input.scores,
    subjects: payload.input.subjects,
  };
  setRerunVisibility(true);
  renderResults(payload);
  await persistMatchSession('upload', payload);
  formStatus.textContent = 'Done';
}

async function rerunWhatIf() {
  if (!latestParsedSnapshot?.scores) {
    formStatus.textContent = 'Upload an STPM PDF first before running a what-if simulation';
    return;
  }

  formStatus.textContent = 'Running what-if simulation with the uploaded scores...';
  const requirements = buildRequirementsFromForm();
  const payload = await fetchJson('/api/matches/manual', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      scores: latestParsedSnapshot.scores,
      requirements,
    }),
  });

  const mergedPayload = {
    input: {
      ...payload.input,
      student: latestParsedSnapshot.student,
      subjects: latestParsedSnapshot.subjects,
    },
    matches: payload.matches,
  };
  renderResults(mergedPayload);
  await persistMatchSession('what_if', mergedPayload);
  formStatus.textContent = 'What-if results updated';
}

matchForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    await submitPdfMatch();
  } catch (error) {
    formStatus.textContent = error.message;
  }
});

rerunButton?.addEventListener('click', async () => {
  try {
    await rerunWhatIf();
  } catch (error) {
    formStatus.textContent = error.message;
  }
});

setRerunVisibility(false);
renderExtractedSubjects([]);
Promise.all([loadAccountSession(), loadUniversities()]).catch((error) => {
  formStatus.textContent = error.message;
});
