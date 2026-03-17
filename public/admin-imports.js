const logoutButton = document.getElementById('logout-button');
const importsForm = document.getElementById('imports-page-form');
const importsStatus = document.getElementById('imports-page-status');
const importsOutput = document.getElementById('imports-page-output');
const importsProgressText = document.getElementById('imports-progress-text');
const importsProgressBar = document.getElementById('imports-progress-bar');
const importsPreviewSummary = document.getElementById('imports-preview-summary');
const importsChangeList = document.getElementById('imports-change-list');
const selectAllImportsButton = document.getElementById('select-all-imports');
const clearAllImportsButton = document.getElementById('clear-all-imports');
const applySelectedImportsButton = document.getElementById('apply-selected-imports');
const useQwenDefaultSwitch = document.getElementById('use-qwen-default');
const qwenEnrichSwitch = document.getElementById('qwen-enrich-switch');

let currentPreview = null;
let activeJobPoll = null;

function syncQwenSwitchState() {
  const useDefault = Boolean(useQwenDefaultSwitch?.checked);
  if (qwenEnrichSwitch) {
    qwenEnrichSwitch.disabled = useDefault;
  }
}

function buildImportFormData() {
  const formData = new FormData(importsForm);
  const useDefault = Boolean(useQwenDefaultSwitch?.checked);

  formData.delete('qwenEnrich');
  if (!useDefault) {
    formData.set('qwenEnrich', qwenEnrichSwitch?.checked ? 'true' : 'false');
  }

  return formData;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }
  return payload;
}

logoutButton.addEventListener('click', async () => {
  try {
    await fetchJson('/api/admin/logout', { method: 'POST' });
  } finally {
    window.location.href = '/admin/login';
  }
});

function setProgress(value, label) {
  importsProgressBar.style.width = `${Math.max(0, Math.min(100, value))}%`;
  importsProgressText.textContent = label;
}

function progressFromJob(job) {
  if (typeof job.progress === 'number') {
    return job.progress;
  }

  const total = Number(job.counters?.totalUrls || 0);
  const processed = Number(job.counters?.processedUrls || 0);
  if (total > 0) {
    return Math.min(95, 5 + Math.round((processed / total) * 85));
  }

  return job.status === 'completed' ? 100 : 10;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCoursePane(course) {
  if (!course) {
    return '<div class="import-diff-empty">No existing record</div>';
  }

  const fields = [
    ['Name', course.name],
    ['Faculty', course.faculty],
    ['Description', course.description],
    ['Duration', course.durationText],
    ['Entry requirements', course.entryRequirements],
    ['Detail URL', course.detailUrl],
  ];

  return fields
    .map(
      ([label, value]) => `
        <div class="import-diff-field">
          <strong>${escapeHtml(label)}</strong>
          <pre>${escapeHtml(value || '-')}</pre>
        </div>
      `
    )
    .join('');
}

function selectedPreviewIds() {
  return [...importsChangeList.querySelectorAll('input[name="selectedImportChanges"]:checked')].map(
    (input) => input.value
  );
}

function refreshApplyButtonState() {
  applySelectedImportsButton.disabled = selectedPreviewIds().length === 0;
}

async function pollJob(jobId, onComplete) {
  if (activeJobPoll) {
    clearInterval(activeJobPoll);
  }

  let finished = false;

  async function tick() {
    try {
      const job = await fetchJson(`/api/admin/imports/jobs/${encodeURIComponent(jobId)}`);
      setProgress(progressFromJob(job), job.message || job.stage || job.status);

      if (job.status === 'completed') {
        clearInterval(activeJobPoll);
        activeJobPoll = null;
        finished = true;
        await onComplete(job.result);
        return;
      }

      if (job.status === 'failed') {
        clearInterval(activeJobPoll);
        activeJobPoll = null;
        finished = true;
        importsStatus.textContent = job.error?.message || 'Job failed';
        setProgress(100, job.error?.message || 'Job failed');
      }
    } catch (error) {
      clearInterval(activeJobPoll);
      activeJobPoll = null;
      finished = true;
      importsStatus.textContent = error.message;
      setProgress(100, 'Tracking failed');
    }
  }

  await tick();
  if (!finished) {
    activeJobPoll = setInterval(tick, 1500);
  }
}

function renderPreview(preview) {
  currentPreview = preview;
  importsPreviewSummary.textContent =
    `${preview.summary.create} new, ${preview.summary.update} updated, ${preview.summary.unchanged} unchanged` +
    (preview.failed.length ? `, ${preview.failed.length} failed` : '');

  if (!preview.changes.length) {
    importsChangeList.innerHTML = '<div class="summary-placeholder">No changes found in the preview.</div>';
    refreshApplyButtonState();
    return;
  }

  importsChangeList.innerHTML = preview.changes
    .map(
      (change) => `
        <article class="import-change-card ${change.action}">
          <div class="import-change-header">
            <label class="import-change-select">
              <input
                type="checkbox"
                name="selectedImportChanges"
                value="${escapeHtml(change.id)}"
                ${change.selectedByDefault ? 'checked' : ''}
              />
              <span>${escapeHtml(change.displayName)}</span>
            </label>
            <div class="result-meta">
              <span>${escapeHtml(change.universityName || 'Unknown university')}</span>
              <span>${escapeHtml(change.action.toUpperCase())}</span>
              <span>${escapeHtml((change.changedFields || []).join(', ') || 'No field changes')}</span>
            </div>
          </div>
          <div class="import-diff-grid">
            <section class="import-diff-pane">
              <h4>Current</h4>
              ${formatCoursePane(change.oldCourse)}
            </section>
            <section class="import-diff-pane">
              <h4>Incoming</h4>
              ${formatCoursePane(change.newCourse)}
            </section>
          </div>
        </article>
      `
    )
    .join('');

  importsChangeList.querySelectorAll('input[name="selectedImportChanges"]').forEach((input) => {
    input.addEventListener('change', refreshApplyButtonState);
  });
  refreshApplyButtonState();
}

importsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  importsStatus.textContent = 'Starting preview...';
  setProgress(5, 'Starting preview');

  const formData = buildImportFormData();

  try {
    const payload = await fetchJson('/api/admin/imports/preview', {
      method: 'POST',
      body: formData,
    });
    importsStatus.textContent = 'Preview job running...';
    await pollJob(payload.jobId, async (result) => {
      renderPreview(result);
      importsOutput.textContent = JSON.stringify(result, null, 2);
      importsStatus.textContent = 'Preview ready';
      setProgress(100, 'Preview ready');
    });
  } catch (error) {
    importsStatus.textContent = error.message;
    setProgress(100, 'Preview failed');
  }
});

selectAllImportsButton.addEventListener('click', () => {
  importsChangeList.querySelectorAll('input[name="selectedImportChanges"]').forEach((input) => {
    input.checked = true;
  });
  refreshApplyButtonState();
});

clearAllImportsButton.addEventListener('click', () => {
  importsChangeList.querySelectorAll('input[name="selectedImportChanges"]').forEach((input) => {
    input.checked = false;
  });
  refreshApplyButtonState();
});

applySelectedImportsButton.addEventListener('click', async () => {
  const selectedIds = selectedPreviewIds();
  if (!selectedIds.length) {
    return;
  }

  importsStatus.textContent = 'Starting apply job...';
  setProgress(5, 'Starting apply');

  const formData = buildImportFormData();
  selectedIds.forEach((id) => formData.append('selectedCourseSourceUrls', id));

  try {
    const payload = await fetchJson('/api/admin/imports/apply', {
      method: 'POST',
      body: formData,
    });
    importsStatus.textContent = 'Apply job running...';
    await pollJob(payload.jobId, async (result) => {
      importsOutput.textContent = JSON.stringify(result, null, 2);
      importsStatus.textContent = `Applied ${result.imported} selected changes`;
      setProgress(100, 'Apply complete');
    });
  } catch (error) {
    importsStatus.textContent = error.message;
    setProgress(100, 'Apply failed');
  }
});

useQwenDefaultSwitch?.addEventListener('change', syncQwenSwitchState);
syncQwenSwitchState();
