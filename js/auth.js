/* ==========================================================================
   Sign in / create account
   ========================================================================== */
(function () {
  'use strict';

  const $ = (sel, scope = document) => scope.querySelector(sel);
  const $$ = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));

  const alertBox = $('#auth-alert');
  const tabs = $$('.auth-tab');
  const panes = { signin: $('#signin-pane'), signup: $('#signup-pane') };
  const params = new URLSearchParams(location.search);

  /* ----------------------------------------------------------- tab state */
  function currentTab() {
    return tabs.find((t) => t.classList.contains('is-active'))?.dataset.tab || 'signin';
  }

  function showTab(name) {
    tabs.forEach((tab) => {
      const active = tab.dataset.tab === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    Object.entries(panes).forEach(([key, pane]) => { pane.hidden = key !== name; });
    hideAlert();
    history.replaceState(null, '', `${location.pathname}${location.hash}`);
  }

  tabs.forEach((tab) => tab.addEventListener('click', () => showTab(tab.dataset.tab)));

  // Route hints: /auth/sign-up and /supplier/apply open the sign-up form.
  const wantsSignup =
    params.get('tab') === 'signup' ||
    location.pathname.includes('sign-up') ||
    location.pathname.includes('apply');
  if (wantsSignup) showTab('signup');

  if (params.get('role') === 'supplier') {
    const supplierRadio = $('input[name="role"][value="supplier"]');
    if (supplierRadio) supplierRadio.checked = true;
  }

  /* --------------------------------------------------------------- alerts */
  function showAlert(message, kind = 'error') {
    alertBox.textContent = message;
    alertBox.classList.toggle('is-success', kind === 'success');
    alertBox.hidden = false;
  }
  function hideAlert() {
    alertBox.hidden = true;
    alertBox.classList.remove('is-success');
  }

  function setError(input, message) {
    const error = document.querySelector(`[data-error-for="${input.id}"]`);
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (error) {
      error.textContent = message;
      error.hidden = !message;
    }
    return !message;
  }

  function focusFirstInvalid(inputs) {
    const bad = inputs.find((el) => el.getAttribute('aria-invalid') === 'true');
    if (bad) bad.focus();
  }

  /* --------------------------------------------------------------- submit */
  function withBusy(button, label, work) {
    const original = button.textContent;
    button.disabled = true;
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span> ' + label;
    return Promise.resolve()
      .then(work)
      .finally(() => {
        button.disabled = false;
        button.textContent = original;
      });
  }

  function safeNext() {
    const next = params.get('next');
    if (next && next.startsWith('/') && !next.startsWith('//')) return next;
    return '/dashboard';
  }

  async function post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong, please try again.');
    return data;
  }

  /* Sign in */
  const signinForm = $('#signin-form');
  signinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    hideAlert();

    const email = $('#signin-email');
    const password = $('#signin-password');
    const okEmail = setError(email, /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim()) ? '' : 'Enter a valid email address.');
    const okPass = setError(password, password.value ? '' : 'Enter your password.');
    if (!okEmail || !okPass) return focusFirstInvalid([email, password]);

    withBusy(signinForm.querySelector('button[type="submit"]'), 'Signing in…', async () => {
      try {
        await post('/api/auth/login', { email: email.value.trim(), password: password.value });
        location.href = safeNext();
      } catch (err) {
        showAlert(err.message);
      }
    });
  });

  /* Create account */
  const signupForm = $('#signup-form');
  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    hideAlert();

    const name = $('#signup-name');
    const email = $('#signup-email');
    const password = $('#signup-password');
    const company = $('#signup-company');
    const role = $('input[name="role"]:checked')?.value || 'buyer';

    const inputs = [name, email, password];
    const okName = setError(name, name.value.trim().length >= 2 ? '' : 'Enter your full name.');
    const okEmail = setError(email, /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim()) ? '' : 'Enter a valid email address.');
    const okPass = setError(password, password.value.length >= 8 ? '' : 'Password must be at least 8 characters.');
    if (!okName || !okEmail || !okPass) return focusFirstInvalid(inputs);

    withBusy(signupForm.querySelector('button[type="submit"]'), 'Creating account…', async () => {
      try {
        await post('/api/auth/register', {
          name: name.value.trim(),
          email: email.value.trim(),
          password: password.value,
          role,
          company: company.value.trim(),
        });
        location.href = safeNext();
      } catch (err) {
        showAlert(err.message);
      }
    });
  });

  /* Clear inline errors as the visitor types. */
  $$('.auth-form input').forEach((input) => {
    input.addEventListener('input', () => {
      if (input.getAttribute('aria-invalid') === 'true') setError(input, '');
    });
  });

  /* Already signed in? Send people to the workspace. */
  if (currentTab() === 'signin') {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data && data.user) location.replace(safeNext()); })
      .catch(() => { /* not running behind the API — show the forms */ });
  }
})();
