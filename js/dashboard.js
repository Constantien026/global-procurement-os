/* ==========================================================================
   Workspace — dashboard behaviour
   ========================================================================== */
(function () {
  'use strict';

  const $ = (sel, scope = document) => scope.querySelector(sel);
  const $$ = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));

  const state = {
    user: null,
    stats: {},
    rfqs: [],
    rfqScope: 'mine',
    suppliers: [],
    products: [],
    applications: [],
    ownedSuppliers: [],
    openDemand: [],
    /* marketplace */
    mkQuery: '',
    mkCategory: 'all',
    mkVerifiedOnly: false,
    mkSort: 'popular',
    mkTab: 'all',
    mkLimit: 12,
    /* inbox */
    conversations: [],
    activeConv: null,
    convLoaded: false,
  };

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const money = (n) => Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const money2 = (n) => Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const PAGE = 12; // listings per "See more" click in the marketplace

  function fmtDate(sql) {
    if (!sql) return '—';
    const iso = String(sql).includes('T') ? sql : `${sql.replace(' ', 'T')}Z`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? sql : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function fmtTime(sql) {
    if (!sql) return '';
    const iso = String(sql).includes('T') ? sql : `${sql.replace(' ', 'T')}Z`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  function timeAgo(sql) {
    if (!sql) return '';
    const iso = String(sql).includes('T') ? sql : `${sql.replace(' ', 'T')}Z`;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const mins = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h`;
    if (mins < 10080) return `${Math.floor(mins / 1440)}d`;
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  }

  const initials = (name) => String(name || '?').split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

  const COUNTRY_CODE = {
    'China': 'CN', 'India': 'IN', 'Türkiye': 'TR', 'Turkey': 'TR', 'Vietnam': 'VN',
    'United Arab Emirates': 'AE', 'Nigeria': 'NG', 'Ghana': 'GH', 'Kenya': 'KE',
    'Singapore': 'SG', 'Indonesia': 'ID', 'Malaysia': 'MY', 'Thailand': 'TH',
    'Philippines': 'PH', 'United States': 'US', 'United Kingdom': 'GB', 'Germany': 'DE',
    'France': 'FR', 'Italy': 'IT', 'Spain': 'ES', 'Portugal': 'PT', 'Brazil': 'BR',
    'Mexico': 'MX', 'Pakistan': 'PK', 'Bangladesh': 'BD', 'Egypt': 'EG',
    'South Africa': 'ZA', 'Morocco': 'MA', 'Japan': 'JP', 'South Korea': 'KR',
  };
  const countryCode = (name) => {
    const key = String(name || '').trim();
    if (COUNTRY_CODE[key]) return COUNTRY_CODE[key];
    return key ? key.slice(0, 2).toUpperCase() : '—';
  };

  /* ------------------------------------------------- marketplace helpers */
  const CATEGORY_META = {
    'Solar & Energy': { emoji: '☀️', grad: 'g1' },
    'Lighting': { emoji: '💡', grad: 'g2' },
    'Consumer Electronics': { emoji: '🎧', grad: 'g3' },
    'Textiles & Apparel': { emoji: '👕', grad: 'g4' },
    'Agriculture Equipment': { emoji: '🌾', grad: 'g5' },
    'Medical & Lab': { emoji: '🧪', grad: 'g6' },
    'Industrial Components': { emoji: '⚙️', grad: 'g7' },
    'Other': { emoji: '📦', grad: 'g8' },
  };
  const catMeta = (cat) => CATEGORY_META[cat] || CATEGORY_META.Other;

  /* Deterministic merchandising numbers so every card looks "listed". */
  const discountOf = (p) => 15 + ((Number(p.id) * 7) % 36);          // 15–50 %
  const soldOf = (p) => 60 + ((Number(p.id) * 137) % 3400);          // 60–3459 units
  const unitFor = (cat) => (cat === 'Textiles & Apparel' ? 'm' : 'pcs');

  function compact(n) {
    return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
  }

  /* --------------------------------------------------------------- toast */
  const toastEl = $('#toast');
  const toastText = $('.toast-text', toastEl);
  let toastTimer;

  function showToast(message, duration = 4000) {
    toastText.textContent = message;
    toastEl.hidden = false;
    requestAnimationFrame(() => toastEl.classList.add('is-visible'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('is-visible');
      setTimeout(() => { toastEl.hidden = true; }, 260);
    }, duration);
  }

  /* ----------------------------------------------------------------- api */
  async function api(url, opts = {}) {
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    if (res.status === 401) {
      const next = encodeURIComponent(location.pathname);
      location.replace(`/auth/sign-in?next=${next}`);
      throw new Error('Not signed in');
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'The request could not be completed');
    return data;
  }

  function withBusy(button, label, work) {
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span> ' + label;
    return Promise.resolve()
      .then(work)
      .finally(() => { button.disabled = false; button.innerHTML = original; });
  }

  /* --------------------------------------------------------- shared bits */
  const ICONS = {
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17 9 11l4 4 8-8"/><path d="M21 7v5h-5"/></svg>',
    factory: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V9l6 4V9l6 4V4a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v17z"/><path d="M3 21h18"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/></svg>',
    clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M9 11h6M9 15h4"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 5.2a3.5 3.5 0 0 1 0 6.6M17.5 14.5a6.5 6.5 0 0 1 4 5.5"/></svg>',
    inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h5l2 3h4l2-3h5"/><path d="M5.5 5h13l2.5 7v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z"/></svg>',
  };

  function emptyState(title, body, actionHtml = '') {
    return `<div class="empty">
      <span class="empty-icon">${ICONS.inbox}</span>
      <h3>${esc(title)}</h3>
      <p>${esc(body)}</p>
      ${actionHtml}
    </div>`;
  }

  function pill(status) {
    return `<span class="pill pill-${esc(status)}">${esc(status)}</span>`;
  }

  function setError(input, message) {
    const error = document.querySelector(`[data-error-for="${input.id}"]`);
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (error) { error.textContent = message; error.hidden = !message; }
    return !message;
  }

  /* ------------------------------------------------------------- routing */
  const VIEWS = {
    overview: ['Overview', 'Your procurement workspace at a glance'],
    rfqs: ['Procurement requests', 'Post requests and review the quotes you receive'],
    suppliers: ['Suppliers', 'Browse verified manufacturers across the network'],
    products: ['Marketplace', 'Browse listings from suppliers in the network'],
    applications: ['Applications', 'Track your supplier network applications'],
    inbox: ['Inbox', 'Chat with buyers and suppliers in real time'],
    account: ['Account', 'Profile, security and session settings'],
  };

  const RFQ_VIEWS = {
    buyer: ['My requests', 'Every request you have posted'],
    supplier: ['Buyer demand board', 'Open requests you can respond to with a quote'],
    admin: ['All requests', 'Procurement requests across the platform'],
  };

  function showView(name) {
    if (!VIEWS[name]) return;
    $$('.side-link').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.view === name));
    $$('.dash-view').forEach((view) => view.classList.toggle('is-active', view.dataset.view === name));
    $('#view-title').textContent = VIEWS[name][0];
    $('#view-sub').textContent = VIEWS[name][1];
    document.body.classList.remove('nav-open');
    $('#side-toggle').setAttribute('aria-expanded', 'false');
    $('#quotes-panel').hidden = true;
    if (name === 'inbox') ensureInbox();
    else $('#conv-picker').hidden = true;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function bindNav() {
    $$('.side-nav .side-link').forEach((btn) => btn.addEventListener('click', () => showView(btn.dataset.view)));
    document.addEventListener('click', (e) => {
      const goto = e.target.closest('[data-goto]');
      if (goto) { showView(goto.dataset.goto); return; }

      const chat = e.target.closest('[data-chat]');
      if (chat && !chat.disabled) { startChat(Number(chat.dataset.chat)); return; }

      const quote = e.target.closest('[data-rfq]');
      if (quote) { prefillRfq(Number(quote.dataset.rfq)); return; }

      const mk = e.target.closest('[data-mk-filter]');
      if (mk) applyMarketplaceFilter(mk.dataset.mkFilter);
    });

    const toggle = $('#side-toggle');
    toggle.addEventListener('click', () => {
      const open = document.body.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.body.classList.remove('nav-open');
        $('#quotes-panel').hidden = true;
      }
    });

    bindSidebarTools();
  }

  /* Sidebar tools: collapse rail, menu search, appearance (light/dark) */
  function bindSidebarTools() {
    const store = {
      get(k) { try { return localStorage.getItem(k); } catch { return null; } },
      set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
    };

    /* --- collapse / expand --- */
    const collapseBtn = $('#side-collapse');
    const setCollapsed = (on) => {
      document.body.classList.toggle('side-collapsed', on);
      collapseBtn.setAttribute('aria-pressed', String(on));
      collapseBtn.title = on ? 'Expand sidebar' : 'Collapse sidebar';
      collapseBtn.setAttribute('aria-label', collapseBtn.title);
      store.set('gpos-sidebar', on ? 'collapsed' : 'open');
    };
    setCollapsed(store.get('gpos-sidebar') === 'collapsed');
    collapseBtn.addEventListener('click', () => {
      setCollapsed(!document.body.classList.contains('side-collapsed'));
    });

    /* --- appearance toggle --- */
    const themeBtn = $('#theme-toggle');
    const syncTheme = () => {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      themeBtn.setAttribute('aria-checked', String(dark));
    };
    themeBtn.addEventListener('click', () => {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (dark) document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', 'dark');
      store.set('gpos-theme', dark ? 'light' : 'dark');
      syncTheme();
    });
    syncTheme();

    /* --- quick nav search --- */
    const search = $('#side-search');
    const empty = $('#side-empty');
    const items = $$('.side-nav .side-link');
    const labels = $$('.side-nav .side-label');

    const filterNav = () => {
      const q = search.value.trim().toLowerCase();
      let hits = 0;
      items.forEach((btn) => {
        const match = !q || btn.textContent.toLowerCase().includes(q);
        btn.hidden = !match;
        if (match) hits += 1;
      });
      labels.forEach((lbl) => {
        let visible = 0;
        let el = lbl.nextElementSibling;
        while (el && !el.classList.contains('side-label')) {
          if (el.classList.contains('side-link') && !el.hidden) visible += 1;
          el = el.nextElementSibling;
        }
        lbl.dataset.hidden = String(Boolean(q) && visible === 0);
      });
      empty.hidden = hits > 0;
    };

    search.addEventListener('input', filterNav);
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { search.value = ''; filterNav(); }
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = items.find((btn) => !btn.hidden);
        if (first) { first.click(); search.value = ''; filterNav(); search.blur(); }
      }
    });
    filterNav();
  }

  /* --------------------------------------------------------------- user */
  function renderUser() {
    const user = state.user;
    const initials = user.name.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
    $('#user-initials').textContent = initials;
    $('#user-name').textContent = user.name;
    $('#user-role').textContent = user.role;
    $('#role-pill').textContent = user.role;
    $('#role-pill').hidden = false;

    const [title, sub] = RFQ_VIEWS[user.role] || RFQ_VIEWS.buyer;
    $('#rfq-list-title').textContent = title;
    $('#rfq-list-sub').textContent = sub;

    const [appTitle, appSub] = user.role === 'admin'
      ? ['All applications', 'Supplier applications across the platform']
      : ['My applications', 'Applications you have submitted'];
    $('#app-list-title').textContent = appTitle;
    $('#app-list-sub').textContent = appSub;
  }

  /* ------------------------------------------------------------ overview */
  function renderOverview() {
    const s = state.stats;
    const role = state.user.role;
    let cards;

    if (role === 'supplier') {
      cards = [
        { label: 'Open buyer requests', value: state.openDemand.length, meta: 'Requests you can quote on', icon: ICONS.file, tone: '' },
        { label: 'My applications', value: s.applications || 0, meta: 'Submitted to the network', icon: ICONS.clipboard, tone: 'is-amber' },
        { label: 'Suppliers in network', value: s.suppliers || 0, meta: 'Manufacturers listed', icon: ICONS.factory, tone: 'is-green' },
        { label: 'Products listed', value: s.products || 0, meta: 'Across all suppliers', icon: ICONS.box, tone: 'is-violet' },
      ];
    } else if (role === 'admin') {
      cards = [
        { label: 'Total requests', value: s.rfqs || 0, meta: 'Across the platform', icon: ICONS.file, tone: '' },
        { label: 'Applications', value: s.applications || 0, meta: 'Awaiting review', icon: ICONS.clipboard, tone: 'is-amber' },
        { label: 'Suppliers', value: s.suppliers || 0, meta: 'In the network', icon: ICONS.factory, tone: 'is-green' },
        { label: 'Registered users', value: s.users || 0, meta: 'Buyers and suppliers', icon: ICONS.users, tone: 'is-violet' },
      ];
    } else {
      cards = [
        { label: 'My requests', value: s.rfqs || 0, meta: 'Posted to the network', icon: ICONS.file, tone: '' },
        { label: 'Open requests', value: s.openRfqs || 0, meta: 'Accepting quotes', icon: ICONS.chart, tone: 'is-green' },
        { label: 'Quotes received', value: s.quotes || 0, meta: 'Across your requests', icon: ICONS.inbox, tone: 'is-amber' },
        { label: 'Suppliers', value: s.suppliers || 0, meta: 'In the network', icon: ICONS.factory, tone: 'is-violet' },
      ];
    }

    $('#overview-stats').innerHTML = cards.map((c) => `
      <div class="stat-card">
        <div class="stat-card-top">
          <span class="stat-card-label">${esc(c.label)}</span>
          <span class="stat-card-icon ${c.tone}">${c.icon}</span>
        </div>
        <span class="stat-card-value">${c.value.toLocaleString('en-US')}</span>
        <span class="stat-card-meta">${esc(c.meta)}</span>
      </div>`).join('');

    // Recent requests panel
    const recent = state.rfqs.slice(0, 4);
    const host = $('#recent-rfqs');
    if (!recent.length) {
      host.innerHTML = emptyState(
        'No requests yet',
        'Post your first procurement request to start receiving quotes.',
        '<button class="btn btn-primary btn-sm" type="button" data-goto="rfqs">Post a request</button>'
      );
      return;
    }
    host.innerHTML = `<div class="table-wrap"><table class="data-table" style="min-width:420px">
      <thead><tr><th>Request</th><th>Status</th><th>Quotes</th></tr></thead>
      <tbody>${recent.map((r) => `
        <tr>
          <td><span class="cell-title">${esc(r.title)}</span><span class="cell-sub">${esc(r.category)} · ${fmtDate(r.created_at)}</span></td>
          <td>${pill(r.status)}</td>
          <td class="cell-num">${r.quote_count}</td>
        </tr>`).join('')}
      </tbody></table></div>`;
  }

  /* ---------------------------------------------------------------- RFQs */
  function isOwner(rfq) {
    return state.user.role === 'admin' || rfq.buyer_id === state.user.id;
  }

  function renderRfqs() {
    const host = $('#rfq-table');
    const rows = state.rfqs;
    const role = state.user.role;

    if (!rows.length) {
      host.innerHTML = role === 'supplier'
        ? emptyState('No open requests', 'When buyers post requests in your categories, they appear here.')
        : emptyState(
            'No requests yet',
            'Describe what you need above and matched suppliers can respond with quotes.',
            '<button class="btn btn-primary btn-sm" type="button" data-goto="rfqs">Post a request</button>'
          );
      return;
    }

    const showBuyer = role === 'admin' || role === 'supplier';
    const head = `<tr>
      <th>Request</th>
      <th>Quantity</th>
      ${showBuyer ? '<th>Buyer</th>' : ''}
      <th>Status</th>
      <th>Quotes</th>
      <th class="cell-actions">Actions</th>
    </tr>`;

    const body = rows.map((r) => {
      let actions;
      if (role === 'supplier') {
        actions = r.my_quote_count > 0
          ? '<span class="verified">Quote sent</span>'
          : `<button class="btn btn-primary btn-sm" type="button" data-quote="${r.id}">Send quote</button>`;
      } else {
        actions = `
          <button class="btn btn-secondary btn-sm" type="button" data-quotes="${r.id}">Quotes (${r.quote_count})</button>
          <button class="btn btn-ghost btn-sm" type="button" data-toggle-status="${r.id}">${r.status === 'closed' ? 'Reopen' : 'Close'}</button>
          <button class="btn btn-danger btn-sm" type="button" data-delete="${r.id}">Delete</button>`;
      }

      return `<tr>
        <td><span class="cell-title">${esc(r.title)}</span><span class="cell-sub">${esc(r.category)} · ${esc(r.destination || 'Destination TBC')}</span></td>
        <td class="cell-num">${Number(r.quantity).toLocaleString('en-US')} ${esc(r.unit)}</td>
        ${showBuyer ? `<td>${esc(r.buyer_name)}</td>` : ''}
        <td>${pill(r.status)}</td>
        <td class="cell-num">${r.quote_count}</td>
        <td class="cell-actions">${actions}</td>
      </tr>`;
    }).join('');

    host.innerHTML = `<div class="table-wrap"><table class="data-table">
      <thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }

  async function loadRfqs() {
    const scope = state.user.role === 'supplier' ? 'scope=open' : '';
    const data = await api(`/api/rfqs${scope ? `?${scope}` : ''}`);
    state.rfqs = data.rfqs;
    state.rfqScope = data.scope;
    if (state.user.role === 'supplier') state.openDemand = data.rfqs;
    renderRfqs();
    renderOverview();
    setCount('count-rfqs', data.rfqs.length);
  }

  function setCount(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value;
    el.hidden = value === 0;
  }

  /* ----------------------------------------------- quotes (buyer view) */
  async function openQuotes(rfqId) {
    const panel = $('#quotes-panel');
    const host = $('#quotes-table');
    const rfq = state.rfqs.find((r) => r.id === rfqId);
    panel.hidden = false;
    $('#quotes-sub').textContent = rfq ? `Quotes for “${rfq.title}”` : 'Quotes received for this request';
    host.innerHTML = '<div class="empty"><div class="skeleton" style="width:50%;margin:14px auto"></div></div>';
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    try {
      const data = await api(`/api/rfqs/${rfqId}/quotes`);
      if (!data.quotes.length) {
        host.innerHTML = emptyState('No quotes yet', 'Supplier quotes will appear here as manufacturers respond to this request.');
        return;
      }
      host.innerHTML = `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>Supplier</th><th>Country</th><th>Rating</th><th>Quote</th><th>Lead time</th><th>Status</th></tr></thead>
        <tbody>${data.quotes.map((q) => `
          <tr>
            <td><span class="cell-title">${esc(q.supplier_name)}</span>${q.verified ? ' <span class="verified">Verified</span>' : ''}</td>
            <td>${esc(q.supplier_country)}</td>
            <td class="cell-num">${Number(q.rating).toFixed(1)} <span style="color:#f59e0b">★</span></td>
            <td class="cell-num">${money(q.amount)}</td>
            <td class="cell-num">${q.lead_time_days} days</td>
            <td>${pill(q.status === 'received' ? 'new' : q.status)}</td>
          </tr>`).join('')}
        </tbody></table></div>`;
    } catch (err) {
      showToast(err.message);
    }
  }

  /* --------------------------------------------- quote form (supplier) */
  function openQuoteForm(rfqId) {
    const panel = $('#quotes-panel');
    const host = $('#quotes-table');
    const rfq = state.rfqs.find((r) => r.id === rfqId);
    panel.hidden = false;
    $('#quotes-sub').textContent = rfq ? `Quoting on “${rfq.title}”` : 'Send your quote';
    host.innerHTML = `
      <div class="panel-body">
        <form id="quote-form" class="form-grid" novalidate>
          <div class="field">
            <label for="quote-amount">Total amount (USD)</label>
            <input id="quote-amount" type="number" min="1" step="0.01" placeholder="182400" required>
            <p class="field-error" data-error-for="quote-amount" hidden>Amount must be greater than zero.</p>
          </div>
          <div class="field">
            <label for="quote-lead">Lead time (days)</label>
            <input id="quote-lead" type="number" min="0" step="1" placeholder="30" required>
            <p class="field-error" data-error-for="quote-lead" hidden>Enter the production lead time.</p>
          </div>
        </form>
        <div class="form-actions">
          <button class="btn btn-secondary" type="button" id="quote-cancel">Cancel</button>
          <button class="btn btn-primary" type="submit" form="quote-form">Send quote</button>
        </div>
      </div>`;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    $('#quote-cancel').addEventListener('click', () => { panel.hidden = true; });
    $('#quote-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = $('#quote-amount');
      const lead = $('#quote-lead');
      const okAmount = setError(amount, Number(amount.value) > 0 ? '' : 'Amount must be greater than zero.');
      const okLead = setError(lead, Number(lead.value) >= 0 && lead.value !== '' ? '' : 'Enter the production lead time.');
      if (!okAmount || !okLead) return;

      await withBusy(e.submitter || $('button[form="quote-form"]'), 'Sending…', async () => {
        try {
          await api(`/api/rfqs/${rfqId}/quotes`, {
            method: 'POST',
            body: { amount: Number(amount.value), lead_time_days: Number(lead.value) },
          });
          panel.hidden = true;
          showToast('Quote sent to the buyer.');
          await loadRfqs();
          await loadStats();
        } catch (err) {
          showToast(err.message);
        }
      });
    });
  }

  /* ---------------------------------------------------------- suppliers */
  function renderSuppliers(list) {
    const host = $('#supplier-grid');
    $('#supplier-count').textContent = `${list.length} manufacturer${list.length === 1 ? '' : 's'} in the network`;

    if (!list.length) {
      host.innerHTML = emptyState('No suppliers found', 'Try a different search term, or list your own company to get started.');
      host.style.display = 'block';
      return;
    }
    host.style.display = '';
    host.innerHTML = list.map((s) => {
      const initials = s.name.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
      return `<article class="supplier-card">
        <div class="supplier-card-top">
          <span class="avatar" aria-hidden="true">${esc(initials)}</span>
          <div>
            <h3>${esc(s.name)}</h3>
            <p class="loc">${esc(s.country)} · ${esc(s.category)}</p>
          </div>
        </div>
        <p class="desc">${esc(s.description)}</p>
        <div class="supplier-card-foot">
          <span class="rating"><span>★</span> ${Number(s.rating).toFixed(1)}</span>
          <span>${esc(s.lead_time || 'Lead time on request')}</span>
          ${Number(s.verified) ? '<span class="verified">Verified</span>' : '<span class="pill pill-neutral">Unverified</span>'}
        </div>
      </article>`;
    }).join('');
  }

  async function loadSuppliers(query = '') {
    const data = await api(`/api/suppliers${query ? `?q=${encodeURIComponent(query)}` : ''}`);
    state.suppliers = data.suppliers;
    renderSuppliers(data.suppliers);
    setCount('count-suppliers', data.suppliers.length);

    const mine = await api('/api/suppliers?mine=1');
    state.ownedSuppliers = mine.suppliers;
    const canList = ['supplier', 'admin'].includes(state.user.role);
    $('#supplier-create').hidden = !canList;

    const select = $('#prod-supplier');
    if (mine.suppliers.length) {
      $('#product-create').hidden = false;
      select.innerHTML = mine.suppliers.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
      select.closest('.field').hidden = mine.suppliers.length === 1;
    } else {
      $('#product-create').hidden = true;
    }
  }

  /* --------------------------------------------------------- marketplace */
  function starRow(rating) {
    const full = Math.round(Number(rating) || 0);
    let out = '';
    for (let i = 1; i <= 5; i += 1) out += `<i class="${i <= full ? 'on' : ''}">★</i>`;
    return `<span class="mk-stars" aria-hidden="true">${out}</span>`;
  }

  /* deterministic "how much of the flash batch is gone" — 35–92 % */
  const flashPct = (p) => 35 + ((Number(p.id) * 13) % 58);

  function productCard(p, opts = {}) {
    const meta = catMeta(p.category);
    const d = discountOf(p);
    const was = Number(p.unit_price) / (1 - d / 100);
    const rating = Number(p.supplier_rating || 0);
    const canChat = Boolean(p.supplier_owner_id);
    const name = esc(p.name);
    const verified = Number(p.supplier_verified);

    const progress = opts.flash ? `
        <div class="mk-progress">
          <div class="mk-progress-top"><span>Sold ${compact(soldOf(p))}</span><span>${flashPct(p)}%</span></div>
          <div class="mk-progress-track"><div class="mk-progress-fill" style="width:${flashPct(p)}%"></div></div>
        </div>` : '';

    return `<article class="mk-card">
      <div class="mk-thumb grad-${meta.grad}">
        <span class="mk-discount">-${d}%</span>
        ${verified ? '<span class="mk-mall">MALL</span>' : ''}
        <span class="mk-ship">Free shipping</span>
        <span class="mk-emoji" aria-hidden="true">${meta.emoji}</span>
      </div>
      <div class="mk-body">
        <h3 class="mk-name" title="${name}">${name}</h3>
        <p class="mk-blurb">${esc(p.blurb || '')}</p>
        <div class="mk-price-row">
          <span class="mk-price">${money2(p.unit_price)}</span>
          <span class="mk-was">${money2(was)}</span>
        </div>
        <div class="mk-meta">
          <span class="mk-rating">${starRow(rating)} ${rating ? rating.toFixed(1) : 'New'}</span>
          <span class="mk-sold">${compact(soldOf(p))} sold</span>
        </div>
        ${progress}
        <div class="mk-tags">
          <span class="mk-tag">MOQ ${Number(p.moq).toLocaleString('en-US')} ${unitFor(p.category)}</span>
          <span class="mk-tag is-lead">${Number(p.lead_time_days)} days</span>
        </div>
        <div class="mk-shop">
          <span class="mk-shop-name">${esc(p.supplier_name)}</span>
          ${verified ? '<span class="mk-check" title="Verified supplier">✓</span>' : ''}
          <span class="mk-flag">${esc(countryCode(p.supplier_country))}</span>
        </div>
        <div class="mk-actions">
          <button class="mk-chat" type="button" data-chat="${p.id}"${canChat ? '' : ' disabled title="No linked account yet — send an RFQ instead"'}>💬 Chat</button>
          <button class="mk-buy" type="button" data-rfq="${p.id}">Request quote</button>
        </div>
      </div>
    </article>`;
  }

  function renderCats() {
    const host = $('#mk-cats');
    const counts = {};
    state.products.forEach((p) => { counts[p.category] = (counts[p.category] || 0) + 1; });

    const tiles = [
      { key: 'all', label: 'All', emoji: '🛒', grad: 'g0', n: state.products.length },
      ...Object.keys(counts)
        .sort((a, b) => counts[b] - counts[a])
        .map((c) => ({ key: c, label: c, ...catMeta(c), n: counts[c] })),
    ];

    host.innerHTML = tiles.map((t) => `
      <button class="mk-cat${state.mkCategory === t.key ? ' is-active' : ''}" type="button" data-cat="${esc(t.key)}" title="${esc(t.label)}">
        <span class="mk-cat-ico grad-${t.grad}">${t.emoji}</span>
        <span class="mk-cat-label">${esc(t.label)}</span>
        <span class="mk-cat-n">${t.n}</span>
      </button>`).join('');
  }

  function marketplaceList() {
    const q = state.mkQuery.trim().toLowerCase();
    const list = state.products.filter((p) => {
      if (state.mkCategory !== 'all' && p.category !== state.mkCategory) return false;
      if (state.mkVerifiedOnly && !Number(p.supplier_verified)) return false;
      if (!q) return true;
      return `${p.name} ${p.category} ${p.supplier_name} ${p.blurb || ''}`.toLowerCase().includes(q);
    });

    const sorters = {
      popular: (a, b) => soldOf(b) - soldOf(a),
      discount: (a, b) => discountOf(b) - discountOf(a),
      'price-asc': (a, b) => a.unit_price - b.unit_price,
      'price-desc': (a, b) => b.unit_price - a.unit_price,
      newest: (a, b) => b.id - a.id,
    };
    return list.sort(sorters[state.mkSort] || sorters.popular);
  }

  function renderMarketplace() {
    renderCats();
    syncMkQuick();
    const list = marketplaceList();
    const grid = $('#product-grid');
    const emptyHost = $('#mk-empty');
    const more = $('#mk-more');

    const filters = [];
    if (state.mkQuery) filters.push(`“${state.mkQuery}”`);
    if (state.mkCategory !== 'all') filters.push(state.mkCategory);
    if (state.mkVerifiedOnly) filters.push('verified only');

    $('#product-count').textContent =
      `${list.length} listing${list.length === 1 ? '' : 's'}${filters.length ? ` · ${filters.join(' · ')}` : ' from suppliers in the network'}`;

    if (!list.length) {
      grid.innerHTML = '';
      more.hidden = true;
      emptyHost.innerHTML = emptyState(
        'No products found',
        'Try another search term, or clear the filters to see the whole marketplace.',
        '<button class="btn btn-primary btn-sm" type="button" data-mk-filter="all">Clear filters</button>'
      );
      return;
    }
    emptyHost.innerHTML = '';

    const shown = list.slice(0, state.mkLimit);
    grid.innerHTML = shown.map((p) => productCard(p)).join('');

    const rest = list.length - shown.length;
    more.hidden = rest <= 0;
    if (rest > 0) $('#mk-more-btn').textContent = `See more (${rest} left)`;
  }

  function renderFlash() {
    const list = [...state.products].sort((a, b) => discountOf(b) - discountOf(a)).slice(0, 6);
    $('#mk-flash-grid').innerHTML = list.map((p) => productCard(p, { flash: true })).join('');
  }

  /* Header quick tabs: All / Flash Sale / Mall / New / Best sellers. */
  function syncMkQuick() {
    $$('#mk-quick .mk-quick-btn').forEach((btn) => {
      const kind = btn.dataset.mkFilter;
      if (!kind) return;
      btn.classList.toggle('is-active', kind === state.mkTab);
    });
  }

  /* Banner, tab and empty-state shortcuts. */
  function applyMarketplaceFilter(kind) {
    if (kind === 'deals') {
      state.mkSort = 'discount';
      state.mkVerifiedOnly = false;
      state.mkTab = 'deals';
    } else if (kind === 'verified') {
      state.mkVerifiedOnly = true;
      state.mkSort = 'popular';
      state.mkTab = 'verified';
    } else if (kind === 'newest') {
      state.mkSort = 'newest';
      state.mkVerifiedOnly = false;
      state.mkTab = 'newest';
    } else if (kind === 'popular') {
      state.mkSort = 'popular';
      state.mkVerifiedOnly = false;
      state.mkTab = 'popular';
    } else {
      // 'all' / 'reset'
      state.mkSort = 'popular';
      state.mkVerifiedOnly = false;
      state.mkTab = 'all';
    }
    // a banner or tab is a fresh start — drop the previous query and category
    state.mkQuery = '';
    state.mkCategory = 'all';
    state.mkLimit = PAGE;
    $('#product-search').value = '';
    $('#mk-sort').value = state.mkSort;
    showView('products');
    renderMarketplace();
    $('#product-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* Auto-rotating hero banners (Shopee / Lazada style slider). */
  function initSlider() {
    const root = $('#mk-slider');
    const slides = $$('#mk-slides > *');
    const dotsHost = $('#mk-dots');
    if (!root || slides.length < 2) return;

    let index = 0;
    let timer = null;

    dotsHost.innerHTML = slides.map((_, i) =>
      `<button class="mk-dot${i === 0 ? ' is-active' : ''}" type="button" role="tab" aria-label="Banner ${i + 1}" aria-selected="${i === 0}"></button>`
    ).join('');
    const dots = $$('.mk-dot', dotsHost);

    function go(next) {
      index = (next + slides.length) % slides.length;
      slides.forEach((s, i) => s.classList.toggle('is-active', i === index));
      dots.forEach((d, i) => {
        d.classList.toggle('is-active', i === index);
        d.setAttribute('aria-selected', String(i === index));
      });
    }

    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const start = () => {
      stop();
      timer = setInterval(() => go(index + 1), 4500);
    };

    $('#mk-prev').addEventListener('click', () => { go(index - 1); start(); });
    $('#mk-next').addEventListener('click', () => { go(index + 1); start(); });
    dotsHost.addEventListener('click', (e) => {
      const dot = e.target.closest('.mk-dot');
      if (!dot) return;
      go(dots.indexOf(dot));
      start();
    });

    root.addEventListener('mouseenter', stop);
    root.addEventListener('mouseleave', start);
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduced) start();
  }

  function tickFlashTimer() {
    const now = new Date();
    const end = new Date(now);
    end.setHours(24, 0, 0, 0);
    const s = Math.max(0, Math.floor((end - now) / 1000));
    const pad = (n) => String(n).padStart(2, '0');
    $('#mk-timer-h').textContent = pad(Math.floor(s / 3600));
    $('#mk-timer-m').textContent = pad(Math.floor((s % 3600) / 60));
    $('#mk-timer-s').textContent = pad(s % 60);
  }

  /* Turn a listing into a draft procurement request. */
  function prefillRfq(productId) {
    const p = state.products.find((x) => x.id === productId);
    if (!p) return;

    const catSelect = $('#rfq-category');
    if (!Array.from(catSelect.options).some((o) => o.value === p.category)) {
      catSelect.add(new Option(p.category, p.category));
    }
    $('#rfq-title').value = `${p.name} — ${p.supplier_name}`;
    catSelect.value = p.category;
    $('#rfq-quantity').value = Number(p.moq) || 1;
    $('#rfq-unit').value = unitFor(p.category);
    showView('rfqs');
    $('#rfq-title').focus();
    showToast(`Request drafted from “${p.name}”.`);
  }

  /* Chat with the factory behind a listing. */
  async function startChat(productId) {
    try {
      const data = await api('/api/conversations', { method: 'POST', body: { product_id: productId } });
      upsertConversation(data.conversation);
      updateInboxBadges();
      showView('inbox');
      await openConversation(data.conversation.id);
      $('#thread-input').focus();
    } catch (err) {
      showToast(err.message);
    }
  }

  async function loadProducts() {
    const data = await api('/api/products');
    state.products = data.products;
    renderMarketplace();
    renderFlash();
    setCount('count-products', data.products.length);
  }

  /* --------------------------------------------------------------- inbox */
  function counterpartOf(c) {
    const me = state.user.id;
    if (c.user_a_id === me) return { id: c.user_b_id, name: c.user_b_name, role: c.user_b_role, company: c.user_b_company };
    if (c.user_b_id === me) return { id: c.user_a_id, name: c.user_a_name, role: c.user_a_role, company: c.user_a_company };
    // admin preview of a thread they are not part of
    return { id: null, name: `${c.user_a_name} ↔ ${c.user_b_name}`, role: 'thread', company: c.user_a_company || c.user_b_company };
  }

  function upsertConversation(c) {
    const i = state.conversations.findIndex((x) => x.id === c.id);
    if (i > -1) state.conversations[i] = c;
    else state.conversations.push(c);
    state.conversations.sort((a, b) => String(b.last_at || b.created_at).localeCompare(String(a.last_at || a.created_at)));
  }

  function updateInboxBadges() {
    const n = state.conversations.reduce((total, c) => total + (Number(c.unread) || 0), 0);
    setCount('count-inbox', n);
    const dot = $('#topbar-dot');
    if (dot) dot.hidden = n === 0;
  }

  function convItemHtml(c) {
    const other = counterpartOf(c);
    const unread = Number(c.unread) || 0;
    const context = c.product_name || c.subject || (c.supplier_name ? `${c.supplier_name} · supplier` : 'Direct message');

    return `<button class="conv-item${state.activeConv === c.id ? ' is-active' : ''}${unread ? ' has-unread' : ''}" type="button" data-conv="${c.id}">
      <span class="avatar conv-avatar">${esc(initials(other.name))}</span>
      <span class="conv-main">
        <span class="conv-top">
          <span class="conv-name">${esc(other.name)}</span>
          <span class="conv-time">${timeAgo(c.last_at || c.created_at)}</span>
        </span>
        <span class="conv-ctx">${esc(context)}</span>
        <span class="conv-last">${esc(c.last_body || 'No messages yet')}</span>
      </span>
      ${unread ? `<span class="conv-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
    </button>`;
  }

  function renderConvList() {
    const host = $('#conv-list');
    const q = ($('#conv-search').value || '').trim().toLowerCase();
    const list = state.conversations.filter((c) => {
      if (!q) return true;
      const other = counterpartOf(c);
      return `${other.name} ${c.subject || ''} ${c.product_name || ''} ${c.last_body || ''}`.toLowerCase().includes(q);
    });

    if (!list.length) {
      host.innerHTML = emptyState(
        q ? 'No matches' : 'No conversations yet',
        q ? 'Try another name or keyword.'
          : 'Start a chat from any product card, or message a supplier directly.',
        q ? '' : '<button class="btn btn-primary btn-sm" type="button" data-conv-new>New chat</button>'
      );
      return;
    }
    host.innerHTML = list.map(convItemHtml).join('');
  }

  async function loadConversations() {
    try {
      const data = await api('/api/conversations');
      state.conversations = data.conversations;
      updateInboxBadges();
      renderConvList();
    } catch (err) {
      if (err.message !== 'Not signed in') showToast(err.message);
    }
  }

  function ensureInbox() {
    if (state.convLoaded) { renderConvList(); return; }
    state.convLoaded = true;
    loadConversations().then(() => {
      if (!state.activeConv && state.conversations.length) openConversation(state.conversations[0].id);
    });
  }

  function msgHtml(m, me) {
    const mine = m.sender_id === me;
    return `<div class="msg${mine ? ' is-mine' : ''}">
      ${mine ? '' : `<span class="avatar msg-avatar">${esc(initials(m.sender_name))}</span>`}
      <div class="msg-col">
        <div class="msg-bubble"><p>${esc(m.body)}</p></div>
        <span class="msg-meta">${mine ? 'You' : esc(m.sender_name)} · ${fmtTime(m.created_at)}</span>
      </div>
    </div>`;
  }

  function renderThread(conversation, messages, { scroll = true } = {}) {
    const other = counterpartOf(conversation);
    const roleTag = ['buyer', 'supplier', 'admin'].includes(other.role)
      ? `<span class="thread-role is-${other.role}">${other.role}</span>` : '';

    $('#thread-identity').innerHTML = `
      <span class="avatar">${esc(initials(other.name))}</span>
      <div>
        <h3>${esc(other.name)} ${roleTag}</h3>
        <p>${esc(conversation.product_name
          ? `${conversation.product_name}${conversation.supplier_name ? ` · ${conversation.supplier_name}` : ''}`
          : (conversation.subject || other.company || 'Direct message'))}</p>
      </div>`;

    const host = $('#thread-msgs');
    if (!messages.length) {
      host.innerHTML = emptyState('Say hello', `Send the first message to ${other.name}.`);
      return;
    }
    host.innerHTML = messages.map((m) => msgHtml(m, state.user.id)).join('');
    if (scroll) scrollThread();
  }

  function scrollThread() {
    const host = $('#thread-msgs');
    host.scrollTop = host.scrollHeight;
  }

  async function openConversation(id) {
    state.activeConv = id;
    $('#inbox').classList.add('is-open');
    renderConvList();

    const host = $('#thread-msgs');
    host.innerHTML = '<div class="empty"><div class="skeleton" style="width:55%;margin:14px auto"></div><div class="skeleton" style="width:35%;margin:14px auto"></div></div>';

    try {
      const data = await api(`/api/conversations/${id}/messages`);
      if (state.activeConv !== id) return;
      upsertConversation(data.conversation);
      renderThread(data.conversation, data.messages);
      updateInboxBadges();
      renderConvList();
    } catch (err) {
      showToast(err.message);
    }
  }

  async function refreshThread() {
    if (!state.activeConv) return;
    const host = $('#thread-msgs');
    const nearBottom = host.scrollHeight - host.scrollTop - host.clientHeight < 90;
    try {
      const data = await api(`/api/conversations/${state.activeConv}/messages`);
      if (state.activeConv !== data.conversation.id) return;
      upsertConversation(data.conversation);
      renderThread(data.conversation, data.messages, { scroll: nearBottom });
      updateInboxBadges();
      renderConvList();
    } catch { /* transient poll failure */ }
  }

  async function sendMessage() {
    const input = $('#thread-input');
    const body = input.value.trim();
    if (!body || !state.activeConv) return;

    const btn = $('#thread-send');
    btn.disabled = true;
    try {
      const data = await api(`/api/conversations/${state.activeConv}/messages`, { method: 'POST', body: { body } });
      input.value = '';
      autoSize(input);
      $('#thread-msgs').querySelector('.empty')?.remove();
      $('#thread-msgs').insertAdjacentHTML('beforeend', msgHtml(data.message, state.user.id));
      scrollThread();
      upsertConversation(data.conversation);
      updateInboxBadges();
      renderConvList();
    } catch (err) {
      showToast(err.message);
    } finally {
      btn.disabled = false;
      input.focus();
    }
  }

  function renderPicker() {
    const host = $('#conv-picker-list');
    const rows = state.suppliers.filter((s) => s.owner_user_id);
    if (!rows.length) {
      host.innerHTML = '<p class="inbox-picker-empty">No supplier accounts are linked yet — start a chat from a product card instead.</p>';
      return;
    }
    host.innerHTML = rows.map((s) => `
      <button class="picker-item" type="button" data-supplier="${s.id}">
        <span class="avatar">${esc(initials(s.name))}</span>
        <span class="picker-text">
          <strong>${esc(s.name)}</strong>
          <small>${esc(s.category)} · ${esc(s.country)}${Number(s.verified) ? ' · Verified' : ''}</small>
        </span>
      </button>`).join('');
  }

  async function startSupplierChat(supplierId) {
    try {
      const data = await api('/api/conversations', { method: 'POST', body: { supplier_id: supplierId } });
      $('#conv-picker').hidden = true;
      upsertConversation(data.conversation);
      updateInboxBadges();
      await openConversation(data.conversation.id);
      $('#thread-input').focus();
    } catch (err) {
      showToast(err.message);
    }
  }

  function autoSize(el) {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }

  function bindInbox() {
    $('#conv-search').addEventListener('input', renderConvList);

    $('#conv-new').addEventListener('click', () => {
      const picker = $('#conv-picker');
      picker.hidden = !picker.hidden;
      if (!picker.hidden) renderPicker();
    });
    $('#conv-picker-close').addEventListener('click', () => { $('#conv-picker').hidden = true; });
    $('#conv-picker-list').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-supplier]');
      if (btn) startSupplierChat(Number(btn.dataset.supplier));
    });

    $('#conv-list').addEventListener('click', (e) => {
      if (e.target.closest('[data-conv-new]')) {
        $('#conv-picker').hidden = false;
        renderPicker();
        return;
      }
      const item = e.target.closest('[data-conv]');
      if (item) openConversation(Number(item.dataset.conv));
    });

    $('#thread-back').addEventListener('click', () => $('#inbox').classList.remove('is-open'));

    const input = $('#thread-input');
    input.addEventListener('input', () => autoSize(input));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        $('#thread-form').requestSubmit();
      }
    });
    $('#thread-form').addEventListener('submit', (e) => { e.preventDefault(); sendMessage(); });

    // keep the badge and the open thread fresh
    setInterval(() => {
      if (document.hidden) return;
      loadConversations();
      if (state.activeConv && $('#view-inbox').classList.contains('is-active')) refreshThread();
    }, 15000);
  }

  /* ------------------------------------------------------- applications */
  function renderApplications() {
    const host = $('#application-table');
    const rows = state.applications;
    const isAdmin = state.user.role === 'admin';
    const isSupplier = state.user.role === 'supplier';

    if (!rows.length) {
      host.innerHTML = isSupplier || isAdmin
        ? emptyState('No applications yet', 'Submitted applications will be listed here with their review status.')
        : emptyState(
            'Applications are for suppliers',
            'Supplier applications let manufacturers join the verified network. Switch to a supplier account to apply.',
            '<a class="btn btn-primary btn-sm" href="/auth/sign-in?tab=signup&role=supplier&next=/dashboard">Create a supplier account</a>'
          );
      return;
    }

    host.innerHTML = `<div class="table-wrap"><table class="data-table">
      <thead><tr>
        <th>Contact</th>
        <th>Company</th>
        <th>Message</th>
        <th>Submitted</th>
        <th class="cell-actions">Status</th>
      </tr></thead>
      <tbody>${rows.map((a) => `
        <tr>
          <td><span class="cell-title">${esc(a.contact_name)}</span><span class="cell-sub">${esc(a.email)}</span></td>
          <td>${esc(a.company || '—')}</td>
          <td style="max-width:320px">${esc(a.message).slice(0, 110)}${a.message.length > 110 ? '…' : ''}</td>
          <td class="cell-num">${fmtDate(a.created_at)}</td>
          <td class="cell-actions">${
            isAdmin
              ? `<select class="app-status" data-id="${a.id}" aria-label="Application status" style="padding:7px 10px;border:1px solid var(--border-strong);border-radius:8px;font-size:13px;background:#fff">
                   ${['new', 'reviewing', 'approved', 'rejected'].map((s) => `<option value="${s}" ${a.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                 </select>`
              : pill(a.status)
          }</td>
        </tr>`).join('')}
      </tbody></table></div>`;
  }

  async function loadApplications() {
    if (state.user.role === 'buyer') {
      $('#application-create').hidden = true;
      $('#application-table').innerHTML = emptyState(
        'Applications are for suppliers',
        'Supplier applications let manufacturers join the verified network. Switch to a supplier account to apply.',
        '<a class="btn btn-primary btn-sm" href="/auth/sign-in?tab=signup&role=supplier&next=/dashboard">Create a supplier account</a>'
      );
      setCount('count-applications', 0);
      return;
    }

    $('#application-create').hidden = state.user.role === 'admin';
    const data = await api('/api/applications');
    state.applications = data.applications;
    renderApplications();
    setCount('count-applications', data.applications.length);
  }

  /* ------------------------------------------------------------- account */
  function renderAccount() {
    const u = state.user;
    const rows = [
      ['Full name', u.name],
      ['Email', u.email],
      ['Account type', u.role],
      ['Company', u.company || '—'],
      ['Country', u.country || '—'],
      ['Member since', fmtDate(u.created_at)],
    ];
    $('#profile-list').innerHTML = rows
      .map(([k, v]) => `<div class="info-row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
      .join('');
  }

  /* --------------------------------------------------------------- stats */
  async function loadStats() {
    state.stats = await api('/api/stats');
    renderOverview();
  }

  /* ---------------------------------------------------------------- data */
  async function loadAll() {
    const jobs = [loadStats(), loadSuppliers(), loadProducts(), loadApplications(), loadConversations()];
    const rfqJob = loadRfqs();
    const results = await Promise.allSettled([...jobs, rfqJob]);
    results.forEach((r) => { if (r.status === 'rejected' && r.reason?.message !== 'Not signed in') showToast(r.reason?.message); });
    renderOverview();
  }

  /* --------------------------------------------------------------- forms */
  function bindForms() {
    /* --- create RFQ --- */
    const rfqForm = $('#rfq-form');
    if (state.user.role !== 'buyer' && state.user.role !== 'admin') {
      $('#rfq-create-panel').hidden = true;
    }

    rfqForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = $('#rfq-title');
      const category = $('#rfq-category');
      const quantity = $('#rfq-quantity');

      const okTitle = setError(title, title.value.trim().length >= 4 ? '' : 'Give the request a clear title (at least 4 characters).');
      const okCat = setError(category, category.value ? '' : 'Choose a category.');
      const okQty = setError(quantity, Number(quantity.value) > 0 ? '' : 'Quantity must be greater than zero.');
      if (!okTitle || !okCat || !okQty) return;

      await withBusy($('button[form="rfq-form"]'), 'Posting…', async () => {
        try {
          await api('/api/rfqs', {
            method: 'POST',
            body: {
              title: title.value.trim(),
              category: category.value,
              quantity: Number(quantity.value),
              unit: $('#rfq-unit').value,
              destination: $('#rfq-destination').value.trim(),
              budget: $('#rfq-budget').value.trim(),
              specs: $('#rfq-specs').value.trim(),
            },
          });
          rfqForm.reset();
          showToast('Request posted — matched suppliers can now respond.');
          await loadRfqs();
          await loadStats();
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    $('#rfq-reset').addEventListener('click', () => {
      rfqForm.reset();
      $$('.field-error', rfqForm).forEach((el) => { el.hidden = true; });
      $$('.field input, .field select, .field textarea', rfqForm).forEach((el) => el.removeAttribute('aria-invalid'));
    });

    /* --- create supplier profile --- */
    const supplierForm = $('#supplier-form');
    supplierForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('#sup-name');
      const country = $('#sup-country');
      const category = $('#sup-category');

      const okName = setError(name, name.value.trim().length >= 2 ? '' : 'Enter your company name.');
      const okCountry = setError(country, country.value.trim() ? '' : 'Enter the country of origin.');
      const okCat = setError(category, category.value.trim() ? '' : 'Enter a product category.');
      if (!okName || !okCountry || !okCat) return;

      await withBusy($('button[form="supplier-form"]'), 'Creating…', async () => {
        try {
          await api('/api/suppliers', {
            method: 'POST',
            body: {
              name: name.value.trim(),
              country: country.value.trim(),
              category: category.value.trim(),
              description: $('#sup-desc').value.trim(),
              lead_time: $('#sup-lead').value.trim(),
            },
          });
          supplierForm.reset();
          showToast('Supplier profile created.');
          await loadSuppliers();
          await loadStats();
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    /* --- add product --- */
    const productForm = $('#product-form');
    productForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('#prod-name');
      const category = $('#prod-category');
      const price = $('#prod-price');

      const okName = setError(name, name.value.trim().length >= 3 ? '' : 'Enter a product name.');
      const okCat = setError(category, category.value.trim() ? '' : 'Enter a category.');
      const okPrice = setError(price, Number(price.value) > 0 ? '' : 'Unit price must be greater than zero.');
      if (!okName || !okCat || !okPrice) return;

      await withBusy($('button[form="product-form"]'), 'Adding…', async () => {
        try {
          await api('/api/products', {
            method: 'POST',
            body: {
              supplier_id: Number($('#prod-supplier').value),
              name: name.value.trim(),
              category: category.value.trim(),
              blurb: $('#prod-blurb').value.trim(),
              unit_price: Number(price.value),
              moq: Number($('#prod-moq').value || 0),
              lead_time_days: Number($('#prod-lead').value || 0),
            },
          });
          productForm.reset();
          showToast('Product added to your catalog.');
          await loadProducts();
          await loadStats();
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    /* --- application --- */
    const appForm = $('#application-form');
    appForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('#app-name');
      const email = $('#app-email');
      const message = $('#app-message');

      const okName = setError(name, name.value.trim().length >= 2 ? '' : 'Enter a contact name.');
      const okEmail = setError(email, /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim()) ? '' : 'Enter a valid email address.');
      const okMsg = setError(message, message.value.trim().length >= 10 ? '' : 'Tell us a little more — at least 10 characters.');
      if (!okName || !okEmail || !okMsg) return;

      await withBusy($('button[form="application-form"]'), 'Submitting…', async () => {
        try {
          await api('/api/applications', {
            method: 'POST',
            body: {
              contact_name: name.value.trim(),
              email: email.value.trim(),
              company: $('#app-company').value.trim(),
              message: message.value.trim(),
            },
          });
          appForm.reset();
          showToast('Application submitted — we reply within 2 business days.');
          await loadApplications();
          await loadStats();
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    /* --- change password --- */
    const pwForm = $('#password-form');
    pwForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const current = $('#pw-current');
      const next = $('#pw-next');
      const confirm = $('#pw-confirm');

      const okCurrent = setError(current, current.value ? '' : 'Enter your current password.');
      const okNext = setError(next, next.value.length >= 8 ? '' : 'New password must be at least 8 characters.');
      const okConfirm = setError(confirm, next.value === confirm.value ? '' : 'Passwords do not match.');
      if (!okCurrent || !okNext || !okConfirm) return;

      await withBusy($('button[type="submit"]', pwForm), 'Updating…', async () => {
        try {
          await api('/api/auth/password', { method: 'PATCH', body: { current: current.value, next: next.value } });
          pwForm.reset();
          showToast('Password updated.');
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    /* --- logout --- */
    async function logout() {
      try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* already signed out */ }
      location.href = '/';
    }
    $('#side-logout').addEventListener('click', logout);
    $('#account-logout').addEventListener('click', logout);

    /* --- RFQ row actions --- */
    $('#rfq-table').addEventListener('click', async (e) => {
      const quotesBtn = e.target.closest('[data-quotes]');
      const toggleBtn = e.target.closest('[data-toggle-status]');
      const deleteBtn = e.target.closest('[data-delete]');
      const quoteBtn = e.target.closest('[data-quote]');

      if (quotesBtn) return openQuotes(Number(quotesBtn.dataset.quotes));
      if (quoteBtn) return openQuoteForm(Number(quoteBtn.dataset.quote));

      if (toggleBtn) {
        const id = Number(toggleBtn.dataset.toggleStatus);
        const rfq = state.rfqs.find((r) => r.id === id);
        if (!rfq) return;
        const nextStatus = rfq.status === 'closed' ? 'open' : 'closed';
        toggleBtn.disabled = true;
        try {
          await api(`/api/rfqs/${id}`, { method: 'PATCH', body: { status: nextStatus } });
          showToast(nextStatus === 'closed' ? 'Request closed.' : 'Request reopened.');
          await loadRfqs();
          await loadStats();
        } catch (err) { showToast(err.message); } finally { toggleBtn.disabled = false; }
      }

      if (deleteBtn) {
        const id = Number(deleteBtn.dataset.delete);
        if (!window.confirm('Delete this request? This cannot be undone.')) return;
        deleteBtn.disabled = true;
        try {
          await api(`/api/rfqs/${id}`, { method: 'DELETE' });
          showToast('Request deleted.');
          $('#quotes-panel').hidden = true;
          await loadRfqs();
          await loadStats();
        } catch (err) { showToast(err.message); } finally { deleteBtn.disabled = false; }
      }
    });

    $('#quotes-close').addEventListener('click', () => { $('#quotes-panel').hidden = true; });

    /* --- admin: application status --- */
    $('#application-table').addEventListener('change', async (e) => {
      const select = e.target.closest('.app-status');
      if (!select) return;
      try {
        await api(`/api/applications/${select.dataset.id}`, { method: 'PATCH', body: { status: select.value } });
        showToast(`Application marked as ${select.value}.`);
        await loadApplications();
        await loadStats();
      } catch (err) {
        showToast(err.message);
        await loadApplications();
      }
    });

    /* --- search --- */
    let supplierTimer;
    $('#supplier-search').addEventListener('input', (e) => {
      clearTimeout(supplierTimer);
      const q = e.target.value.trim();
      supplierTimer = setTimeout(() => loadSuppliers(q).catch((err) => showToast(err.message)), 280);
    });

    /* --- marketplace: search, sort, categories, tabs --- */
    let productTimer;
    $('#product-search').addEventListener('input', (e) => {
      clearTimeout(productTimer);
      productTimer = setTimeout(() => {
        state.mkQuery = e.target.value.trim();
        state.mkTab = 'all';
        state.mkLimit = PAGE;
        renderMarketplace();
      }, 160);
    });

    $('#mk-search-form').addEventListener('submit', (e) => {
      e.preventDefault();
      state.mkQuery = $('#product-search').value.trim();
      state.mkTab = 'all';
      state.mkLimit = PAGE;
      renderMarketplace();
      $('#product-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    $('#mk-sort').addEventListener('change', (e) => {
      state.mkSort = e.target.value;
      state.mkTab = { discount: 'deals', newest: 'newest', popular: 'popular' }[state.mkSort] || 'all';
      state.mkLimit = PAGE;
      renderMarketplace();
    });

    $('#mk-cats').addEventListener('click', (e) => {
      const tile = e.target.closest('[data-cat]');
      if (!tile) return;
      state.mkCategory = tile.dataset.cat;
      state.mkVerifiedOnly = false;
      state.mkTab = 'all';
      state.mkLimit = PAGE;
      renderMarketplace();
    });

    /* trending search chips inside the orange header */
    $('#mk-top').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-mk-term]');
      if (!chip) return;
      const term = chip.dataset.mkTerm;
      $('#product-search').value = term;
      state.mkQuery = term;
      state.mkTab = 'all';
      state.mkCategory = 'all';
      state.mkLimit = PAGE;
      renderMarketplace();
      $('#product-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    /* Shopee-style "See more" pagination */
    $('#mk-more-btn').addEventListener('click', () => {
      state.mkLimit += PAGE;
      renderMarketplace();
      const cards = $$('#product-grid .mk-card');
      const next = cards[state.mkLimit - PAGE];
      if (next) next.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    /* --- clear inline errors while typing --- */
    document.addEventListener('input', (e) => {
      const input = e.target;
      if (input.matches && input.matches('.field input, .field textarea') && input.getAttribute('aria-invalid') === 'true') {
        setError(input, '');
      }
    });

    /* --- inbox --- */
    bindInbox();
  }

  /* ---------------------------------------------------------------- init */
  async function init() {
    try {
      const data = await api('/api/auth/me');
      state.user = data.user;
    } catch (err) {
      if (err.message !== 'Not signed in') console.error(err);
      return;
    }

    renderUser();
    renderAccount();
    bindNav();
    bindForms();
    initSlider();
    tickFlashTimer();
    setInterval(tickFlashTimer, 1000);
    await loadAll();
  }

  init();
})();
