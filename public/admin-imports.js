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

let currentPreview = null;
let activeJobPoll = null;

const PREVIEW_FIELDS = [
  ['name', 'Name'],
  ['faculty', 'Faculty'],
  ['description', 'Description'],
  ['studyMode', 'Study mode'],
  ['durationText', 'Duration'],
  ['entryRequirements', 'Entry requirements'],
  ['detailUrl', 'Detail URL'],
];

function buildImportFormData() {
  const formData = new FormData(importsForm);
  const useDefault = Boolean(useQwenDefaultSwitch?.checked);

  formData.delete('qwenEnrich');
  if (!useDefault) {
    formData.set('qwenEnrich', 'false');
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

function selectedOperations() {
  return [...importsChangeList.querySelectorAll('.import-change-card')].flatMap((card) => {
    const id = card.dataset.changeId;
    const courseSelected = card.querySelector('.import-course-select')?.checked;
    const deleteSelected = card.querySelector('.import-delete-toggle')?.dataset.deleteSelected === 'true';
    const fields = [...card.querySelectorAll('.import-field-select input:checked')].map((input) => input.value);

    if (deleteSelected && courseSelected) {
      return [{ id, delete: true, fields: [] }];
    }

    if (courseSelected || fields.length) {
      return [{ id, delete: false, fields }];
    }

    return [];
  });
}

function refreshApplyButtonState() {
  applySelectedImportsButton.disabled = selectedOperations().length === 0;
}

function syncCardState(card) {
  const courseCheckbox = card.querySelector('.import-course-select');
  const deleteButton = card.querySelector('.import-delete-toggle');
  const fieldInputs = [...card.querySelectorAll('.import-field-select input')];
  const deleteSelected = deleteButton?.dataset.deleteSelected === 'true';

  fieldInputs.forEach((input) => {
    input.disabled = deleteSelected;
  });

  if (deleteSelected && courseCheckbox) {
    courseCheckbox.checked = true;
  }

  if (!deleteSelected && courseCheckbox && !fieldInputs.some((input) => input.checked)) {
    courseCheckbox.checked = false;
  }

  if (!deleteSelected && courseCheckbox && fieldInputs.some((input) => input.checked)) {
    courseCheckbox.checked = true;
  }

  if (deleteButton) {
    deleteButton.textContent = deleteSelected ? 'Undo delete' : 'Delete entry';
    deleteButton.classList.toggle('danger-button', !deleteSelected);
    deleteButton.classList.toggle('secondary-button', deleteSelected);
  }

  card.classList.toggle('marked-delete', deleteSelected);
  refreshApplyButtonState();
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

function fieldMarkup(change, field, label) {
  const oldValue = change.oldCourse?.[field] || '-';
  const newValue = change.newCourse?.[field] || '-';
  const changed = change.action === 'create' || (change.changedFields || []).includes(field);
  const checked = change.action === 'create' ? true : changed;

  return `
    <div class="import-diff-field ${changed ? 'changed' : ''}">
      <div class="import-diff-field-head">
        <strong>${escapeHtml(label)}</strong>
        <label class="import-field-select">
          <input
            type="checkbox"
            value="${escapeHtml(field)}"
            ${checked ? 'checked' : ''}
          />
          <span>Apply</span>
        </label>
      </div>
      <div class="import-diff-field-grid">
        <div class="import-diff-field-column">
          <span class="import-field-pane-label">Current</span>
          <pre>${escapeHtml(oldValue)}</pre>
        </div>
        <div class="import-diff-field-column">
          <span class="import-field-pane-label">Incoming</span>
          <pre>${escapeHtml(newValue)}</pre>
        </div>
      </div>
    </div>
  `;
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
    .map((change) => {
      const deleteButton = change.deletable
        ? `<button type="button" class="import-delete-toggle danger-button" data-delete-selected="false">Delete entry</button>`
        : '';

      return `
        <details class="import-change-card ${escapeHtml(change.action)}" data-change-id="${escapeHtml(change.id)}" open>
          <summary class="import-change-summary">
            <label class="import-change-select">
              <input
                type="checkbox"
                class="import-course-select"
                ${change.selectedByDefault ? 'checked' : ''}
              />
              <span>${escapeHtml(change.displayName)}</span>
            </label>
            <div class="result-meta">
              <span>${escapeHtml(change.universityName || 'Unknown university')}</span>
              <span>${escapeHtml(change.action.toUpperCase())}</span>
              <span>${escapeHtml((change.changedFields || []).join(', ') || 'No field changes')}</span>
            </div>
          </summary>
          <div class="import-change-body">
            <div class="import-change-toolbar">
              <div class="import-change-toolbar-copy">
                <strong>Choose fields to apply</strong>
                <span>Use the tick boxes beside each field. Delete removes the existing database record.</span>
              </div>
              <div class="import-change-toolbar-actions">
                ${deleteButton}
              </div>
            </div>
            <div class="import-field-list">
              ${PREVIEW_FIELDS.map(([field, label]) => fieldMarkup(change, field, label)).join('')}
            </div>
          </div>
        </details>
      `;
    })
    .join('');

  importsChangeList.querySelectorAll('.import-change-card').forEach((card) => {
    const courseCheckbox = card.querySelector('.import-course-select');
    const fieldInputs = [...card.querySelectorAll('.import-field-select input')];
    const deleteButton = card.querySelector('.import-delete-toggle');

    courseCheckbox?.addEventListener('change', () => {
      const checked = courseCheckbox.checked;
      if (deleteButton?.dataset.deleteSelected === 'true' && !checked) {
        deleteButton.dataset.deleteSelected = 'false';
      }
      fieldInputs.forEach((input) => {
        if (!input.disabled) {
          input.checked = checked;
        }
      });
      syncCardState(card);
    });

    fieldInputs.forEach((input) => {
      input.addEventListener('change', () => syncCardState(card));
    });

    deleteButton?.addEventListener('click', () => {
      const nextState = deleteButton.dataset.deleteSelected !== 'true';
      deleteButton.dataset.deleteSelected = String(nextState);
      if (nextState) {
        fieldInputs.forEach((input) => {
          input.checked = false;
        });
      }
      syncCardState(card);
    });

    syncCardState(card);
  });
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
  importsChangeList.querySelectorAll('.import-change-card').forEach((card) => {
    const deleteButton = card.querySelector('.import-delete-toggle');
    if (deleteButton) {
      deleteButton.dataset.deleteSelected = 'false';
    }
    card.querySelector('.import-course-select').checked = true;
    card.querySelectorAll('.import-field-select input').forEach((input) => {
      input.checked = true;
    });
    syncCardState(card);
  });
});

clearAllImportsButton.addEventListener('click', () => {
  importsChangeList.querySelectorAll('.import-change-card').forEach((card) => {
    const deleteButton = card.querySelector('.import-delete-toggle');
    if (deleteButton) {
      deleteButton.dataset.deleteSelected = 'false';
    }
    card.querySelector('.import-course-select').checked = false;
    card.querySelectorAll('.import-field-select input').forEach((input) => {
      input.checked = false;
    });
    syncCardState(card);
  });
});

applySelectedImportsButton.addEventListener('click', async () => {
  const operations = selectedOperations();
  if (!operations.length) {
    return;
  }

  importsStatus.textContent = 'Starting apply job...';
  setProgress(5, 'Starting apply');

  const formData = buildImportFormData();
  operations.forEach((operation) => {
    formData.append('selectedCourseOperations', JSON.stringify(operation));
    formData.append('selectedCourseSourceUrls', operation.id);
  });

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
