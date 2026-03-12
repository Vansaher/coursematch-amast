const logoutButton = document.getElementById('logout-button');
const importsForm = document.getElementById('imports-page-form');
const importsStatus = document.getElementById('imports-page-status');
const importsOutput = document.getElementById('imports-page-output');

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

importsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  importsStatus.textContent = 'Running import...';

  const formData = new FormData(importsForm);

  try {
    const response = await fetch('/api/admin/imports', {
      method: 'POST',
      body: formData,
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Import request failed');
    }
    importsOutput.textContent = JSON.stringify(payload, null, 2);
    importsStatus.textContent = 'Import finished';
  } catch (error) {
    importsStatus.textContent = error.message;
  }
});
