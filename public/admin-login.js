const loginForm = document.getElementById('admin-login-form');
const loginStatus = document.getElementById('login-status');

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginStatus.textContent = 'Signing in...';

  const formData = new FormData(loginForm);
  const username = formData.get('username');
  const password = formData.get('password');

  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Login failed');
    }
    window.location.href = '/admin';
  } catch (error) {
    loginStatus.textContent = error.message;
  }
});
