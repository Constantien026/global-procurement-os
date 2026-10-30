/* ==========================================================================
   Landing page behaviour
   ========================================================================== */
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (sel, scope = document) => scope.querySelector(sel);
  const $$ = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));

  /* ------------------------------------------------------------- toast */
  const toastEl = $('#toast');
  const toastText = $('.toast-text', toastEl);
  let toastTimer;

  function showToast(message, duration = 4000) {
    if (!toastEl) return;
    toastText.textContent = message;
    toastEl.hidden = false;
    requestAnimationFrame(() => toastEl.classList.add('is-visible'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('is-visible');
      setTimeout(() => { toastEl.hidden = true; }, 260);
    }, duration);
  }

  /* --------------------------------------------------------- header/nav */
  const header = $('#top');
  const menuToggle = $('.menu-toggle');
  const nav = $('#main-nav');

  function setHeaderState() {
    header.classList.toggle('is-scrolled', window.scrollY > 8);
  }
  setHeaderState();
  window.addEventListener('scroll', setHeaderState, { passive: true });

  function closeMenu() {
    document.body.classList.remove('nav-open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Open menu');
  }

  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      const open = document.body.classList.toggle('nav-open');
      menuToggle.setAttribute('aria-expanded', String(open));
      menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMenu();
      closeLang();
    }
  });

  // Close the drawer when a nav link is chosen or the window grows to desktop.
  $$('.nav-link', nav).forEach((link) => link.addEventListener('click', closeMenu));
  window.addEventListener('resize', () => { if (window.innerWidth > 960) closeMenu(); });

  /* ------------------------------------------------------- language menu
     The menu itself (open/close, selection, translation) is owned by
     js/i18n.js — main.js only mirrors the close state for the Escape key. */
  const langMenu = $('.lang-menu');

  function closeLang() {
    if (!langMenu || langMenu.hidden) return;
    langMenu.hidden = true;
    $('.lang-btn')?.setAttribute('aria-expanded', 'false');
  }

  /* -------------------------------------------------- placeholder links */
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-demo]');
    if (!link) return;
    e.preventDefault();
    showToast('Placeholder link — that screen is outside the scope of this landing-page redesign.');
  });

  /* --------------------------------------------------- reveal on scroll */
  const revealables = $$('.reveal');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealables.forEach((el) => el.classList.add('is-visible'));
  } else {
    const revealObserver = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    revealables.forEach((el) => revealObserver.observe(el));
  }

  /* ------------------------------------------------------ stat counters */
  const stats = $$('.stat-value[data-count]');

  function formatStat(value, decimals) {
    return Number(value).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function animateStat(el) {
    const target = parseFloat(el.dataset.count);
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    const suffix = el.dataset.suffix || '';
    const duration = 1400;
    const start = performance.now();

    function frame(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = formatStat(target * eased, decimals) + suffix;
      if (p < 1) requestAnimationFrame(frame);
      else el.textContent = formatStat(target, decimals) + suffix;
    }
    requestAnimationFrame(frame);
  }

  if (!reduceMotion && 'IntersectionObserver' in window) {
    const statObserver = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animateStat(entry.target);
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.5 });
    stats.forEach((el) => statObserver.observe(el));
  }

  /* -------------------------------------------------------- scroll spy */
  const sections = ['products', 'workflow', 'cases', 'suppliers']
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  const navLinks = $$('.nav-link');

  function updateSpy() {
    let current = null;
    const marker = window.scrollY + 140;
    sections.forEach((sec) => {
      if (sec.offsetTop <= marker) current = sec.id;
    });
    navLinks.forEach((link) => {
      link.classList.toggle('is-active', link.getAttribute('href') === `#${current}`);
    });
  }
  updateSpy();
  window.addEventListener('scroll', updateSpy, { passive: true });

  /* -------------------------------------------- signed-in header button */
  const headerCta = $('#header-cta');
  if (headerCta && location.protocol.startsWith('http')) {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || !data.user) return;
        headerCta.textContent = 'Open Dashboard';
        headerCta.href = '/dashboard';
        const mobileCta = $('.nav-mobile-actions .btn-primary');
        if (mobileCta) {
          mobileCta.textContent = 'Open Dashboard';
          mobileCta.href = '/dashboard';
          mobileCta.removeAttribute('data-demo');
        }
      })
      .catch(() => { /* server not running — keep the static demo links */ });
  }

  /* ----------------------------------------------- supplier application */
  const form = $('#supplier-form');
  if (form) {
    const success = $('#form-success');
    const resetBtn = $('#form-reset');
    const alertHost = $('.supplier-form');

    function setError(input, message) {
      const error = document.querySelector(`[data-error-for="${input.id}"]`);
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
      if (error) {
        error.textContent = message;
        error.hidden = !message;
      }
      return !message;
    }

    function validate() {
      const name = $('#supplier-name');
      const email = $('#supplier-email');
      const message = $('#supplier-message');

      const okName = setError(name, name.value.trim().length >= 2 ? '' : 'Please enter your name.');
      const okEmail = setError(email, /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim()) ? '' : 'Please enter a valid email address.');
      const okMessage = setError(message, message.value.trim().length >= 10 ? '' : 'Tell us a little more — at least 10 characters.');

      const firstInvalid = [name, email, message].find((el) => el.getAttribute('aria-invalid') === 'true');
      if (firstInvalid) firstInvalid.focus();
      return okName && okEmail && okMessage;
    }

    ['supplier-name', 'supplier-email', 'supplier-message'].forEach((id) => {
      const input = document.getElementById(id);
      input.addEventListener('input', () => {
        if (input.getAttribute('aria-invalid') === 'true') validate();
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validate()) return;

      const submit = form.querySelector('button[type="submit"]');
      const originalLabel = submit.textContent;
      submit.disabled = true;
      submit.innerHTML = '<span class="spinner" aria-hidden="true"></span> Sending…';

      try {
        const res = await fetch('/api/applications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contact_name: $('#supplier-name').value.trim(),
            email: $('#supplier-email').value.trim(),
            company: $('#supplier-company').value.trim(),
            message: $('#supplier-message').value.trim(),
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Could not submit your application.');
        }

        form.hidden = true;
        success.hidden = false;
        success.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      } catch (err) {
        showToast(err.message || 'Could not reach the server. Start it with: npm start');
      } finally {
        submit.disabled = false;
        submit.textContent = originalLabel;
      }
    });

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        form.reset();
        form.hidden = false;
        success.hidden = true;
        $('#supplier-name').focus();
      });
    }

    // Avoid an unused-reference lint in strict tooling.
    void alertHost;
  }
})();
