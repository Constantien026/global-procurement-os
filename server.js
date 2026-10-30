'use strict';

/**
 * Global Procurement OS — demo backend
 * Express 5 + SQLite (node:sqlite) + bcrypt password hashing + DB-backed sessions.
 *
 *   npm start        → http://localhost:3000
 */

const express = require('express');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

const { db, seedIfEmpty } = require('./db');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;
const COOKIE_NAME = 'gpos_session';
const SESSION_DAYS = 7;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '128kb' }));

const seeded = seedIfEmpty();
if (seeded) {
  console.log(`  seeded: ${seeded.users} users, ${seeded.suppliers} suppliers, ${seeded.products} products, ${seeded.rfqs} rfqs`);
}

/* ------------------------------------------------------------------ utils */

const fail = (res, status, error) => res.status(status).json({ error });

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return header.split(';').reduce((acc, part) => {
    const idx = part.indexOf('=');
    if (idx > -1) acc[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    return acc;
  }, {});
}

function setSessionCookie(res, token) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  res.append('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`);
}

function clearSessionCookie(res) {
  res.append('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function publicUser(row) {
  if (!row) return null;
  const { id, name, email, role, company, country, created_at } = row;
  return { id, name, email, role, company, country, created_at };
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)').run(token, userId, expires);
  return token;
}

function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function count(sql, ...params) {
  return db.prepare(sql).get(...params).n;
}

/* ----------------------------------------------------------------- middleware */

function requireAuth(req, res, next) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return fail(res, 401, 'Not signed in');

  const row = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.company, u.country, u.created_at, s.expires_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
     WHERE s.token = ?
  `).get(token);

  if (!row) return fail(res, 401, 'Session expired, please sign in again');
  if (row.expires_at <= new Date().toISOString()) {
    destroySession(token);
    return fail(res, 401, 'Session expired, please sign in again');
  }

  req.user = publicUser(row);
  req.token = token;
  next();
}

/* Naive per-IP throttle for the public form endpoint. */
const hits = new Map();
function throttle(limit, windowMs) {
  return (req, res, next) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const entry = hits.get(ip) || { count: 0, start: now };
    if (now - entry.start > windowMs) { entry.count = 0; entry.start = now; }
    entry.count += 1;
    hits.set(ip, entry);
    if (entry.count > limit) return fail(res, 429, 'Too many submissions, please try again later');
    next();
  };
}

/* ------------------------------------------------------------------- auth */

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.post('/api/auth/register', (req, res) => {
  const { name, email, password, role = 'buyer', company = '', country = '' } = req.body || {};

  if (!name || String(name).trim().length < 2) return fail(res, 400, 'Please enter your full name');
  if (!email || !EMAIL_RE.test(String(email))) return fail(res, 400, 'Please enter a valid email address');
  if (!password || String(password).length < 8) return fail(res, 400, 'Password must be at least 8 characters');
  if (!['buyer', 'supplier'].includes(role)) return fail(res, 400, 'Choose a buyer or supplier account');

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(String(email));
  if (exists) return fail(res, 409, 'An account with that email already exists');

  const info = db.prepare(
    'INSERT INTO users (name, email, password_hash, role, company, country) VALUES (?,?,?,?,?,?)'
  ).run(String(name).trim(), String(email).toLowerCase().trim(), bcrypt.hashSync(String(password), 10),
        role, String(company).trim(), String(country).trim());

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  setSessionCookie(res, createSession(user.id));
  res.status(201).json({ user: publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return fail(res, 400, 'Enter your email and password');

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase().trim());
  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    return fail(res, 401, 'Incorrect email or password');
  }

  setSessionCookie(res, createSession(user.id));
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  destroySession(parseCookies(req)[COOKIE_NAME]);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));

app.patch('/api/auth/password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  if (!current || !next) return fail(res, 400, 'Current and new password are required');
  if (String(next).length < 8) return fail(res, 400, 'New password must be at least 8 characters');

  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(String(current), row.password_hash)) return fail(res, 401, 'Current password is incorrect');

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(bcrypt.hashSync(String(next), 10), req.user.id);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ stats */

app.get('/api/stats', requireAuth, (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const isSupplier = req.user.role === 'supplier';

  const rfqs = isAdmin ? count('SELECT COUNT(*) AS n FROM rfqs') : count('SELECT COUNT(*) AS n FROM rfqs WHERE buyer_id = ?', req.user.id);
  const openRfqs = count("SELECT COUNT(*) AS n FROM rfqs WHERE status = 'open'");
  const quotes = isAdmin
    ? count('SELECT COUNT(*) AS n FROM quotes')
    : count('SELECT COUNT(*) AS n FROM quotes q JOIN rfqs r ON r.id = q.rfq_id WHERE r.buyer_id = ?', req.user.id);
  const applications = isAdmin ? count('SELECT COUNT(*) AS n FROM applications') : count('SELECT COUNT(*) AS n FROM applications WHERE user_id = ?', req.user.id);
  const suppliers = count('SELECT COUNT(*) AS n FROM suppliers');
  const products = count('SELECT COUNT(*) AS n FROM products');
  const users = count('SELECT COUNT(*) AS n FROM users');
  const ownedSuppliers = count('SELECT COUNT(*) AS n FROM suppliers WHERE owner_user_id = ?', req.user.id);
  const unreadMessages = count(
    `SELECT COUNT(*) AS n FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
      WHERE m.sender_id <> ? AND m.read_at IS NULL
        AND (c.user_a_id = ? OR c.user_b_id = ? OR ? = 1)`,
    req.user.id, req.user.id, req.user.id, req.user.role === 'admin' ? 1 : 0
  );

  res.json({
    rfqs, openRfqs, quotes, applications, suppliers, products, users, ownedSuppliers, unreadMessages,
    scope: isSupplier ? 'supplier' : req.user.role,
  });
});

/* ------------------------------------------------------------------- RFQs */

app.get('/api/rfqs', requireAuth, (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const isSupplier = req.user.role === 'supplier';

  // Suppliers browse open buyer demand instead of "their own" requests.
  if (isSupplier && req.query.scope === 'open') {
    const rows = db.prepare(`
      SELECT r.*, u.name AS buyer_name,
             (SELECT COUNT(*) FROM quotes q WHERE q.rfq_id = r.id) AS quote_count,
             (SELECT COUNT(*) FROM quotes q
               WHERE q.rfq_id = r.id
                 AND q.supplier_id IN (SELECT id FROM suppliers WHERE owner_user_id = ?)) AS my_quote_count
        FROM rfqs r JOIN users u ON u.id = r.buyer_id
       WHERE r.status IN ('open', 'matched', 'quoted')
       ORDER BY r.created_at DESC`).all(req.user.id);
    return res.json({ rfqs: rows, scope: 'open' });
  }

  const rows = isAdmin
    ? db.prepare(`
        SELECT r.*, u.name AS buyer_name,
               (SELECT COUNT(*) FROM quotes q WHERE q.rfq_id = r.id) AS quote_count
          FROM rfqs r JOIN users u ON u.id = r.buyer_id
         ORDER BY r.created_at DESC`).all()
    : db.prepare(`
        SELECT r.*, u.name AS buyer_name,
               (SELECT COUNT(*) FROM quotes q WHERE q.rfq_id = r.id) AS quote_count
          FROM rfqs r JOIN users u ON u.id = r.buyer_id
         WHERE r.buyer_id = ?
         ORDER BY r.created_at DESC`).all(req.user.id);

  res.json({ rfqs: rows, scope: isAdmin ? 'all' : 'mine' });
});

app.post('/api/rfqs', requireAuth, (req, res) => {
  const { title, category, quantity, unit = 'pcs', destination = '', budget = '', specs = '' } = req.body || {};

  if (!title || String(title).trim().length < 4) return fail(res, 400, 'Give the request a clear title');
  if (!category || !String(category).trim()) return fail(res, 400, 'Choose a product category');

  const qty = Math.max(0, Number(quantity) || 0);
  if (qty <= 0) return fail(res, 400, 'Quantity must be greater than zero');

  const info = db.prepare(`
    INSERT INTO rfqs (buyer_id, title, category, quantity, unit, destination, budget, specs, status)
    VALUES (?,?,?,?,?,?,?,?,'open')
  `).run(req.user.id, String(title).trim(), String(category).trim(), qty,
         String(unit).trim() || 'pcs', String(destination).trim(), String(budget).trim(), String(specs).trim());

  const row = db.prepare('SELECT * FROM rfqs WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ rfq: row });
});

app.get('/api/rfqs/:id/quotes', requireAuth, (req, res) => {
  const rfq = db.prepare('SELECT * FROM rfqs WHERE id = ?').get(req.params.id);
  if (!rfq) return fail(res, 404, 'Request not found');
  if (req.user.role !== 'admin' && rfq.buyer_id !== req.user.id) return fail(res, 403, 'Not your request');

  const rows = db.prepare(`
    SELECT q.*, s.name AS supplier_name, s.country AS supplier_country, s.rating, s.verified
      FROM quotes q JOIN suppliers s ON s.id = q.supplier_id
     WHERE q.rfq_id = ? ORDER BY q.amount ASC
  `).all(rfq.id);

  res.json({ quotes: rows });
});

// A supplier responds to an open buyer request.
app.post('/api/rfqs/:id/quotes', requireAuth, (req, res) => {
  if (req.user.role !== 'supplier') return fail(res, 403, 'Only supplier accounts can send quotes');

  const rfq = db.prepare('SELECT * FROM rfqs WHERE id = ?').get(req.params.id);
  if (!rfq) return fail(res, 404, 'Request not found');
  if (rfq.status === 'closed') return fail(res, 409, 'This request is closed');

  const owned = db.prepare('SELECT id FROM suppliers WHERE owner_user_id = ?').all(req.user.id);
  if (!owned.length) return fail(res, 403, 'Create a supplier profile before sending quotes');

  const { amount, lead_time_days } = req.body || {};
  if (!(Number(amount) > 0)) return fail(res, 400, 'Quote amount must be greater than zero');
  const leadDays = Math.max(0, Number(lead_time_days) || 0);

  const already = db.prepare(`
    SELECT q.id FROM quotes q
     WHERE q.rfq_id = ? AND q.supplier_id IN (SELECT id FROM suppliers WHERE owner_user_id = ?)
     LIMIT 1`).get(rfq.id, req.user.id);
  if (already) return fail(res, 409, 'You have already quoted on this request');

  const info = db.prepare(`
    INSERT INTO quotes (rfq_id, supplier_id, amount, lead_time_days, status)
    VALUES (?,?,?,?,'received')`).run(rfq.id, owned[0].id, Number(amount), leadDays);

  if (rfq.status === 'open') db.prepare("UPDATE rfqs SET status = 'quoted' WHERE id = ?").run(rfq.id);

  res.status(201).json({ quote: db.prepare('SELECT * FROM quotes WHERE id = ?').get(info.lastInsertRowid) });
});

app.patch('/api/rfqs/:id', requireAuth, (req, res) => {
  const rfq = db.prepare('SELECT * FROM rfqs WHERE id = ?').get(req.params.id);
  if (!rfq) return fail(res, 404, 'Request not found');
  if (req.user.role !== 'admin' && rfq.buyer_id !== req.user.id) return fail(res, 403, 'Not your request');

  const status = String(req.body?.status || '');
  if (!['draft', 'open', 'matched', 'quoted', 'closed'].includes(status)) return fail(res, 400, 'Invalid status');

  db.prepare('UPDATE rfqs SET status = ? WHERE id = ?').run(status, rfq.id);
  res.json({ rfq: { ...rfq, status } });
});

app.delete('/api/rfqs/:id', requireAuth, (req, res) => {
  const rfq = db.prepare('SELECT * FROM rfqs WHERE id = ?').get(req.params.id);
  if (!rfq) return fail(res, 404, 'Request not found');
  if (req.user.role !== 'admin' && rfq.buyer_id !== req.user.id) return fail(res, 403, 'Not your request');

  db.prepare('DELETE FROM rfqs WHERE id = ?').run(rfq.id);
  res.json({ ok: true });
});

/* ----------------------------------------------------- applications (RFQs) */

app.get('/api/applications', requireAuth, (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const rows = isAdmin
    ? db.prepare('SELECT * FROM applications ORDER BY created_at DESC').all()
    : db.prepare('SELECT * FROM applications WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ applications: rows });
});

// Public on purpose: the marketing site lets visitors express interest.
app.post('/api/applications', throttle(50, 10 * 60 * 1000), (req, res) => {
  const { contact_name, email, company = '', message = '' } = req.body || {};

  if (!contact_name || String(contact_name).trim().length < 2) return fail(res, 400, 'Please enter a contact name');
  if (!email || !EMAIL_RE.test(String(email))) return fail(res, 400, 'Please enter a valid email address');
  if (!message || String(message).trim().length < 10) return fail(res, 400, 'Tell us a little more (at least 10 characters)');

  const info = db.prepare(
    'INSERT INTO applications (user_id, contact_name, email, company, message) VALUES (?,?,?,?,?)'
  ).run(null, String(contact_name).trim(), String(email).toLowerCase().trim(),
        String(company).trim(), String(message).trim());

  res.status(201).json({ ok: true, id: info.lastInsertRowid, status: 'new' });
});

app.patch('/api/applications/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!row) return fail(res, 404, 'Application not found');
  if (req.user.role !== 'admin' && row.user_id !== req.user.id) return fail(res, 403, 'Not your application');

  const status = String(req.body?.status || '');
  if (!['new', 'reviewing', 'approved', 'rejected'].includes(status)) return fail(res, 400, 'Invalid status');

  db.prepare('UPDATE applications SET status = ? WHERE id = ?').run(status, row.id);
  res.json({ application: { ...row, status } });
});

/* --------------------------------------------------------------- suppliers */

app.get('/api/suppliers', requireAuth, (req, res) => {
  const q = String(req.query.q || '').trim();

  if (req.query.mine === '1') {
    const rows = db.prepare('SELECT * FROM suppliers WHERE owner_user_id = ? ORDER BY created_at DESC').all(req.user.id);
    return res.json({ suppliers: rows });
  }

  const rows = q
    ? db.prepare(`
        SELECT * FROM suppliers
         WHERE name LIKE ? OR country LIKE ? OR category LIKE ?
         ORDER BY verified DESC, rating DESC`).all(`%${q}%`, `%${q}%`, `%${q}%`)
    : db.prepare('SELECT * FROM suppliers ORDER BY verified DESC, rating DESC').all();

  res.json({ suppliers: rows });
});

app.post('/api/suppliers', requireAuth, (req, res) => {
  if (req.user.role === 'buyer') return fail(res, 403, 'Switch to a supplier account to list a company');
  const { name, country, category, description = '', lead_time = '', moq = '' } = req.body || {};

  if (!name || String(name).trim().length < 2) return fail(res, 400, 'Enter your company name');
  if (!country || !String(country).trim()) return fail(res, 400, 'Enter the country of origin');
  if (!category || !String(category).trim()) return fail(res, 400, 'Enter a product category');

  const info = db.prepare(`
    INSERT INTO suppliers (owner_user_id, name, country, category, description, lead_time, moq, verified, rating)
    VALUES (?,?,?,?,?,?,?,0,0)
  `).run(req.user.id, String(name).trim(), String(country).trim(), String(category).trim(),
         String(description).trim(), String(lead_time).trim(), String(moq).trim());

  res.status(201).json({ supplier: db.prepare('SELECT * FROM suppliers WHERE id = ?').get(info.lastInsertRowid) });
});

/* ---------------------------------------------------------------- products */

app.get('/api/products', requireAuth, (req, res) => {
  const q = String(req.query.q || '').trim();
  const sql = `
    SELECT p.*, s.name AS supplier_name, s.country AS supplier_country,
           s.verified AS supplier_verified, s.rating AS supplier_rating,
           s.owner_user_id AS supplier_owner_id
      FROM products p JOIN suppliers s ON s.id = p.supplier_id
      ${q ? 'WHERE p.name LIKE ? OR p.category LIKE ? OR s.name LIKE ?' : ''}
      ORDER BY p.created_at DESC, p.id DESC`;
  const rows = q ? db.prepare(sql).all(`%${q}%`, `%${q}%`, `%${q}%`) : db.prepare(sql).all();
  res.json({ products: rows });
});

app.post('/api/products', requireAuth, (req, res) => {
  const { supplier_id, name, category, blurb = '', unit_price, currency = 'USD', moq, lead_time_days } = req.body || {};

  const owned = db.prepare('SELECT id FROM suppliers WHERE id = ? AND owner_user_id = ?')
    .get(supplier_id, req.user.id);
  if (!owned && req.user.role !== 'admin') return fail(res, 403, 'You can only add products to your own supplier profile');
  if (!name || String(name).trim().length < 3) return fail(res, 400, 'Enter a product name');
  if (!category || !String(category).trim()) return fail(res, 400, 'Enter a category');
  if (!(Number(unit_price) > 0)) return fail(res, 400, 'Unit price must be greater than zero');

  const info = db.prepare(`
    INSERT INTO products (supplier_id, name, category, blurb, unit_price, currency, moq, lead_time_days)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(owned.id, String(name).trim(), String(category).trim(), String(blurb).trim(),
         Number(unit_price), String(currency) || 'USD',
         Math.max(0, Number(moq) || 0), Math.max(0, Number(lead_time_days) || 0));

  res.status(201).json({ product: db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid) });
});

/* ------------------------------------------------------------- inbox / chat */

const nowIso = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const MSG_MAX = 2000;

/* One conversation joined against both participants + the product context.
   `viewerId` drives the unread counter. */
function conversationRow(id, viewerId) {
  return db.prepare(`
    SELECT c.*,
           ua.name   AS user_a_name,  ua.role AS user_a_role,  ua.company AS user_a_company,
           ub.name   AS user_b_name,  ub.role AS user_b_role,  ub.company AS user_b_company,
           p.name    AS product_name,
           s.name    AS supplier_name,
           (SELECT m.body       FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
           (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_at,
           (SELECT m.sender_id  FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_sender_id,
           (SELECT COUNT(*) FROM messages m
             WHERE m.conversation_id = c.id AND m.sender_id <> ? AND m.read_at IS NULL) AS unread
      FROM conversations c
      JOIN users ua ON ua.id = c.user_a_id
      JOIN users ub ON ub.id = c.user_b_id
      LEFT JOIN products p ON p.id = c.product_id
      LEFT JOIN suppliers s ON s.id = c.supplier_id
     WHERE c.id = ?
  `).get(viewerId, id) || null;
}

function listConversations(user) {
  const isAdmin = user.role === 'admin';
  return db.prepare(`
    SELECT c.*,
           ua.name   AS user_a_name,  ua.role AS user_a_role,  ua.company AS user_a_company,
           ub.name   AS user_b_name,  ub.role AS user_b_role,  ub.company AS user_b_company,
           p.name    AS product_name,
           s.name    AS supplier_name,
           (SELECT m.body       FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
           (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_at,
           (SELECT m.sender_id  FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_sender_id,
           (SELECT COUNT(*) FROM messages m
             WHERE m.conversation_id = c.id AND m.sender_id <> ? AND m.read_at IS NULL) AS unread
      FROM conversations c
      JOIN users ua ON ua.id = c.user_a_id
      JOIN users ub ON ub.id = c.user_b_id
      LEFT JOIN products p ON p.id = c.product_id
      LEFT JOIN suppliers s ON s.id = c.supplier_id
     WHERE c.user_a_id = ? OR c.user_b_id = ? OR ? = 1
     ORDER BY c.updated_at DESC, c.id DESC
  `).all(user.id, user.id, user.id, isAdmin ? 1 : 0);
}

function loadConversation(id, user) {
  const row = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  if (!row) return { error: [404, 'Conversation not found'] };
  const allowed = user.role === 'admin' || row.user_a_id === user.id || row.user_b_id === user.id;
  if (!allowed) return { error: [403, 'This conversation does not belong to you'] };
  return { row };
}

function insertMessage(conversationId, senderId, body) {
  const info = db.prepare('INSERT INTO messages (conversation_id, sender_id, body) VALUES (?,?,?)')
    .run(conversationId, senderId, body);
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(nowIso(), conversationId);
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);
}

app.get('/api/conversations', requireAuth, (req, res) => {
  res.json({ conversations: listConversations(req.user) });
});

// Start (or reuse) a thread — from a product card, a supplier profile, or a member.
app.post('/api/conversations', requireAuth, (req, res) => {
  const { supplier_id, product_id, user_id, message = '', subject = '' } = req.body || {};

  let otherId = null;
  let supplierId = null;
  let productId = null;
  let title = String(subject).trim();

  if (product_id) {
    const product = db.prepare(`
      SELECT p.id, p.name, p.supplier_id, s.owner_user_id, s.name AS supplier_name
        FROM products p JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ?`).get(product_id);
    if (!product) return fail(res, 404, 'Product not found');
    productId = product.id;
    supplierId = product.supplier_id;
    otherId = product.owner_user_id;
    if (!title) title = `${product.name} — ${product.supplier_name}`;
  } else if (supplier_id) {
    const supplier = db.prepare('SELECT id, name, owner_user_id FROM suppliers WHERE id = ?').get(supplier_id);
    if (!supplier) return fail(res, 404, 'Supplier not found');
    supplierId = supplier.id;
    otherId = supplier.owner_user_id;
    if (!title) title = supplier.name;
  } else if (user_id) {
    otherId = Number(user_id);
  } else {
    return fail(res, 400, 'Choose a supplier or a member to message');
  }

  if (!otherId) return fail(res, 409, 'This supplier has no account linked yet — send an RFQ instead');
  if (Number(otherId) === req.user.id) return fail(res, 400, 'You cannot start a conversation with yourself');
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(otherId)) return fail(res, 404, 'That member no longer exists');

  const a = Math.min(req.user.id, otherId);
  const b = Math.max(req.user.id, otherId);

  let conv = db.prepare(
    'SELECT * FROM conversations WHERE user_a_id = ? AND user_b_id = ? AND product_id IS ?'
  ).get(a, b, productId);

  if (!conv) {
    const info = db.prepare(`
      INSERT INTO conversations (user_a_id, user_b_id, supplier_id, product_id, subject)
      VALUES (?,?,?,?,?)`).run(a, b, supplierId, productId, title.slice(0, 160));
    conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(info.lastInsertRowid);
  }

  const body = String(message).trim();
  if (body) insertMessage(conv.id, req.user.id, body.slice(0, MSG_MAX));

  res.status(201).json({ conversation: conversationRow(conv.id, req.user.id) });
});

app.get('/api/conversations/:id', requireAuth, (req, res) => {
  const loaded = loadConversation(req.params.id, req.user);
  if (loaded.error) return fail(res, loaded.error[0], loaded.error[1]);
  const conversation = conversationRow(loaded.row.id, req.user.id);
  if (!conversation) return fail(res, 404, 'Conversation not found');
  res.json({ conversation });
});

app.get('/api/conversations/:id/messages', requireAuth, (req, res) => {
  const loaded = loadConversation(req.params.id, req.user);
  if (loaded.error) return fail(res, loaded.error[0], loaded.error[1]);

  // Reading the thread marks the other side's messages as seen.
  db.prepare('UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL')
    .run(nowIso(), loaded.row.id, req.user.id);

  const messages = db.prepare(`
    SELECT m.*, u.name AS sender_name, u.role AS sender_role
      FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = ?
     ORDER BY m.id ASC`).all(loaded.row.id);

  res.json({ conversation: conversationRow(loaded.row.id, req.user.id), messages });
});

app.post('/api/conversations/:id/messages', requireAuth, (req, res) => {
  const loaded = loadConversation(req.params.id, req.user);
  if (loaded.error) return fail(res, loaded.error[0], loaded.error[1]);

  const body = String(req.body?.body ?? '').trim();
  if (!body) return fail(res, 400, 'Write a message first');
  if (body.length > MSG_MAX) return fail(res, 400, `Messages are limited to ${MSG_MAX} characters`);

  res.status(201).json({
    message: insertMessage(loaded.row.id, req.user.id, body),
    conversation: conversationRow(loaded.row.id, req.user.id),
  });
});

/* ------------------------------------------------------------------ static */

const staticOpts = { index: false, maxAge: '1h', etag: true };
app.use('/css', express.static(path.join(ROOT, 'css'), staticOpts));
app.use('/js', express.static(path.join(ROOT, 'js'), staticOpts));

const page = (file) => (req, res) => res.sendFile(path.join(ROOT, file));

app.get('/', page('index.html'));
app.get('/auth', page('auth.html'));
app.get('/auth/sign-in', page('auth.html'));
app.get('/auth/sign-up', page('auth.html'));
app.get('/supplier/apply', page('auth.html'));
app.get('/dashboard', page('dashboard.html'));
app.get('/procurement', page('dashboard.html'));
app.get('/marketplace', page('dashboard.html'));
app.get('/consultations', page('dashboard.html'));
app.get('/service', page('dashboard.html'));

/* ---------------------------------------------------------------- fallback */

app.use('/api', (req, res) => fail(res, 404, 'Endpoint not found'));

app.use((req, res) => {
  if (req.method !== 'GET') return fail(res, 405, 'Method not allowed');
  if (path.extname(req.path)) return res.status(404).type('text').send('Not found');
  res.redirect('/');
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  fail(res, err.status || 500, err.status ? err.message : 'Something went wrong on the server');
});

app.listen(PORT, () => {
  console.log('');
  console.log('  Global Procurement OS running');
  console.log(`  → http://localhost:${PORT}`);
  console.log('');
  console.log('  demo accounts');
  console.log('  buyer    ada@buyer.demo        / demo1234');
  console.log('  buyer    nora@buyer.demo       / demo1234');
  console.log('  supplier liam@supplier.demo    / demo1234');
  console.log('  supplier rep1..rep9@supplier.demo / demo1234  (one per supplier profile)');
  console.log('  admin    admin@globalprocurement.os / admin1234');
  console.log('');
});
