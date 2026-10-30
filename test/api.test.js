'use strict';

/**
 * API integration tests.
 *
 *   npm test        → resets the database, runs every check, then re-seeds
 *   (the server must already be running: npm start)
 */

const PORT = process.env.PORT || 3000;
const BASE = `http://localhost:${PORT}`;

const results = [];
const ok = (name, cond, extra = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);

async function api(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}

(async () => {
  /* ------------------------------------------------------------ pages */
  let r = await api('/api/health');
  ok('GET /api/health', r.status === 200 && r.data.ok);

  for (const p of ['/', '/auth', '/dashboard', '/marketplace', '/supplier/apply']) {
    const res = await fetch(BASE + p);
    const html = await res.text();
    ok(`GET ${p}`, res.status === 200 && html.includes('<!DOCTYPE html>'), String(res.status));
  }

  ok('GET /css/styles.css', (await fetch(BASE + '/css/styles.css')).status === 200);
  ok('GET /js/main.js', (await fetch(BASE + '/js/main.js')).status === 200);

  /* -------------------------------------------------------------- auth */
  r = await api('/api/auth/login', { method: 'POST', body: { email: 'ada@buyer.demo', password: 'wrong' } });
  ok('login rejects a bad password', r.status === 401);

  r = await api('/api/auth/register', { method: 'POST', body: { name: 'X', email: 'bad', password: '1' } });
  ok('register validates input', r.status === 400, r.data.error);

  r = await api('/api/auth/register', { method: 'POST', body: { name: 'Dup User', email: 'ada@buyer.demo', password: 'password1' } });
  ok('duplicate email rejected', r.status === 409, String(r.status));

  r = await api('/api/auth/login', { method: 'POST', body: { email: 'ada@buyer.demo', password: 'demo1234' } });
  ok('buyer can sign in', r.status === 200 && r.data.user.role === 'buyer');
  const buyerCookie = r.cookie;
  ok('session cookie issued', buyerCookie.includes('gpos_session='));

  r = await api('/api/auth/me', { cookie: buyerCookie });
  ok('GET /api/auth/me', r.status === 200 && r.data.user.email === 'ada@buyer.demo');

  r = await api('/api/rfqs');
  ok('protected route rejects anonymous calls', r.status === 401);

  /* ------------------------------------------------------------- stats */
  r = await api('/api/stats', { cookie: buyerCookie });
  ok('GET /api/stats', r.status === 200 && r.data.rfqs === 4, JSON.stringify(r.data));

  /* -------------------------------------------------------------- rfqs */
  r = await api('/api/rfqs', { cookie: buyerCookie });
  ok('buyer sees own requests (4)', r.data.rfqs.length === 4, `got ${r.data.rfqs?.length}`);
  const firstRfq = r.data.rfqs[0];

  r = await api(`/api/rfqs/${firstRfq.id}/quotes`, { cookie: buyerCookie });
  ok('buyer sees quotes on own request', r.data.quotes.length === 3, `count ${r.data.quotes?.length}`);

  r = await api('/api/rfqs', {
    method: 'POST', cookie: buyerCookie,
    body: { title: 'Test request', category: 'Lighting', quantity: 100, unit: 'pcs', destination: 'Ghana' },
  });
  ok('POST /api/rfqs', r.status === 201 && r.data.rfq.status === 'open', r.data.error || '');
  const newRfqId = r.data.rfq?.id;

  r = await api('/api/rfqs', { method: 'POST', cookie: buyerCookie, body: { title: 'x', category: '' } });
  ok('rfq validates input', r.status === 400, r.data.error);

  r = await api(`/api/rfqs/${newRfqId}`, { method: 'PATCH', cookie: buyerCookie, body: { status: 'closed' } });
  ok('PATCH rfq status', r.status === 200 && r.data.rfq.status === 'closed');

  r = await api(`/api/rfqs/${newRfqId}`, { method: 'DELETE', cookie: buyerCookie });
  ok('DELETE rfq', r.status === 200);

  r = await api('/api/rfqs', { cookie: buyerCookie });
  ok('rfq removed from the list', r.data.rfqs.length === 4, String(r.data.rfqs.length));

  /* ------------------------------------------------- role isolation */
  const sup = await api('/api/auth/login', { method: 'POST', body: { email: 'liam@supplier.demo', password: 'demo1234' } });
  const supCookie = sup.cookie;
  ok('supplier can sign in', sup.status === 200);

  r = await api(`/api/rfqs/${firstRfq.id}`, { method: 'DELETE', cookie: supCookie });
  ok('supplier cannot delete another buyer request', r.status === 403, String(r.status));

  r = await api('/api/rfqs', { cookie: supCookie });
  ok('supplier sees only their own requests (0)', r.data.rfqs.length === 0, `got ${r.data.rfqs?.length}`);

  /* ------------------------------------------------------- quote loop */
  r = await api('/api/rfqs?scope=open', { cookie: supCookie });
  ok('supplier sees the open demand board', r.status === 200 && r.data.scope === 'open' && r.data.rfqs.length === 4, `got ${r.data.rfqs?.length}`);

  // Quote on a request owned by the demo buyer so the owner checks below are meaningful.
  const openRfq = r.data.rfqs.find((x) => x.status === 'open' && x.buyer_name === 'Ada Okonkwo');
  ok('an open request from the demo buyer exists', !!openRfq);

  if (openRfq) {
    r = await api(`/api/rfqs/${openRfq.id}/quotes`, { method: 'POST', cookie: supCookie, body: { amount: 44000, lead_time_days: 25 } });
    ok('supplier sends a quote', r.status === 201, r.data.error || '');

    r = await api(`/api/rfqs/${openRfq.id}/quotes`, { method: 'POST', cookie: supCookie, body: { amount: 50000, lead_time_days: 25 } });
    ok('duplicate quote rejected', r.status === 409, String(r.status));

    r = await api('/api/rfqs?scope=open', { cookie: supCookie });
    const updated = r.data.rfqs.find((x) => x.id === openRfq.id);
    ok('request auto-moves to "quoted"', updated && updated.status === 'quoted', updated?.status);
    ok('supplier sees their own quote flag', updated && updated.my_quote_count === 1, String(updated?.my_quote_count));

    r = await api(`/api/rfqs/${openRfq.id}/quotes`, { cookie: buyerCookie });
    ok('buyer sees the new quote', r.data.quotes.length === 2, `count ${r.data.quotes?.length}`);

    r = await api(`/api/rfqs/${openRfq.id}/quotes`, { method: 'POST', cookie: buyerCookie, body: { amount: 1, lead_time_days: 1 } });
    ok('buyers cannot send quotes', r.status === 403, String(r.status));
  }

  /* ------------------------------------------------- suppliers/products */
  r = await api('/api/suppliers', { cookie: supCookie });
  ok('GET /api/suppliers', r.data.suppliers.length === 10, `got ${r.data.suppliers?.length}`);

  r = await api('/api/suppliers?q=solar', { cookie: supCookie });
  ok('supplier search filters', r.data.suppliers.length >= 2, `got ${r.data.suppliers.length}`);

  r = await api('/api/products', { cookie: supCookie });
  ok('GET /api/products', r.data.products.length === 18, `got ${r.data.products?.length}`);

  r = await api('/api/products', { cookie: supCookie });
  const withOwner = r.data.products.filter((p) => p.supplier_owner_id);
  ok('products expose rating + linked supplier account', r.data.products.every((p) => typeof p.supplier_rating === 'number') && withOwner.length === r.data.products.length, `${withOwner.length}/${r.data.products.length}`);

  r = await api('/api/products', { method: 'POST', cookie: supCookie, body: { supplier_id: 5, name: 'Nope', category: 'X', unit_price: 1 } });
  ok('cannot add a product to someone else\'s profile', r.status === 403, String(r.status));

  r = await api('/api/suppliers', { method: 'POST', cookie: supCookie, body: { name: 'Test Factory', country: 'China', category: 'Lighting' } });
  ok('POST /api/suppliers', r.status === 201, r.data.error || '');
  const ownSupplier = r.data.supplier?.id;

  r = await api('/api/products', {
    method: 'POST', cookie: supCookie,
    body: { supplier_id: ownSupplier, name: 'Test Lamp', category: 'Lighting', unit_price: 5, moq: 100, lead_time_days: 20 },
  });
  ok('POST /api/products (own profile)', r.status === 201, r.data.error || '');

  r = await api('/api/suppliers?mine=1', { cookie: supCookie });
  ok('GET /api/suppliers?mine=1 (seeded + new)', r.data.suppliers.length === 2, `got ${r.data.suppliers?.length}`);

  /* ------------------------------------------------------ applications */
  r = await api('/api/applications', {
    method: 'POST',
    body: { contact_name: 'Test Person', email: 'test@example.com', company: 'ACME', message: 'We manufacture pumps for export.' },
  });
  ok('POST /api/applications works without a session', r.status === 201, r.data.error || '');

  r = await api('/api/applications', { method: 'POST', body: { contact_name: '', email: 'x', message: 'short' } });
  ok('application validates input', r.status === 400, r.data.error);

  r = await api('/api/applications', { cookie: supCookie });
  ok('supplier sees own applications (1)', r.data.applications.length === 1, `got ${r.data.applications?.length}`);

  r = await api('/api/applications');
  ok('listing applications requires a session', r.status === 401);

  const adm = await api('/api/auth/login', { method: 'POST', body: { email: 'admin@globalprocurement.os', password: 'admin1234' } });
  const admCookie = adm.cookie;

  r = await api('/api/applications', { cookie: admCookie });
  ok('admin sees all applications (4)', r.data.applications.length === 4, `got ${r.data.applications?.length}`);

  r = await api('/api/rfqs', { cookie: admCookie });
  ok('admin sees all requests (5)', r.data.rfqs.length === 5, `got ${r.data.rfqs?.length}`);

  /* -------------------------------------------------------- passwords */
  r = await api('/api/auth/password', { method: 'PATCH', cookie: supCookie, body: { current: 'demo1234', next: 'newpass123' } });
  ok('change password', r.status === 200, r.data.error || '');

  r = await api('/api/auth/login', { method: 'POST', body: { email: 'liam@supplier.demo', password: 'demo1234' } });
  ok('old password no longer works', r.status === 401);

  r = await api('/api/auth/login', { method: 'POST', body: { email: 'liam@supplier.demo', password: 'newpass123' } });
  ok('new password works', r.status === 200);
  await api('/api/auth/password', { method: 'PATCH', cookie: r.cookie, body: { current: 'newpass123', next: 'demo1234' } });

  /* -------------------------------------------------------- inbox / chat */
  r = await api('/api/conversations');
  ok('listing conversations requires a session', r.status === 401);

  r = await api('/api/conversations', { cookie: buyerCookie });
  ok('buyer sees their seeded threads (3)', r.data.conversations.length === 3, `got ${r.data.conversations?.length}`);

  const firstConv = r.data.conversations[0];
  ok('a thread exposes counterpart + last message',
    Boolean(firstConv.user_b_name) && typeof firstConv.last_body === 'string' && Boolean(firstConv.last_at),
    JSON.stringify(firstConv?.subject));
  ok('buyer starts with unread messages', r.data.conversations.some((c) => c.unread > 0),
    r.data.conversations.map((c) => c.unread).join(','));

  r = await api(`/api/conversations/${firstConv.id}/messages`, { cookie: buyerCookie });
  ok('GET thread messages', r.status === 200 && r.data.messages.length > 0, `got ${r.data.messages?.length}`);
  ok('reading a thread clears its unread counter', r.data.conversation.unread === 0, String(r.data.conversation.unread));
  ok('messages carry the sender name', Boolean(r.data.messages[0].sender_name));

  r = await api(`/api/conversations/${firstConv.id}/messages`, { method: 'POST', cookie: buyerCookie, body: { body: '   ' } });
  ok('empty messages are rejected', r.status === 400, r.data.error);

  r = await api(`/api/conversations/${firstConv.id}/messages`, { method: 'POST', cookie: buyerCookie, body: { body: 'Is the KEBS paperwork included?' } });
  ok('POST message', r.status === 201 && r.data.message.body === 'Is the KEBS paperwork included?', r.data.error || '');
  ok('sending updates the thread preview', r.data.conversation.last_body === 'Is the KEBS paperwork included?');

  r = await api('/api/conversations', { method: 'POST', cookie: buyerCookie, body: {} });
  ok('a conversation needs a target', r.status === 400, r.data.error);

  r = await api('/api/conversations', { method: 'POST', cookie: buyerCookie, body: { product_id: 3 } });
  ok('start a thread from a product card', r.status === 201 && /Hybrid Inverter/.test(r.data.conversation.subject), r.data.error || '');
  const productConvId = r.data.conversation?.id;

  r = await api('/api/conversations', { method: 'POST', cookie: buyerCookie, body: { product_id: 3 } });
  ok('the same product reuses the existing thread', r.status === 201 && r.data.conversation.id === productConvId, String(r.data.conversation?.id));

  r = await api(`/api/conversations/${productConvId}`, { cookie: supCookie });
  ok('other members cannot open a thread', r.status === 403, String(r.status));

  r = await api('/api/conversations/99999/messages', { cookie: buyerCookie });
  ok('unknown conversation returns 404', r.status === 404, String(r.status));

  r = await api('/api/conversations', { cookie: supCookie });
  ok('supplier sees the threads they take part in (2)', r.data.conversations.length === 2, `got ${r.data.conversations?.length}`);

  r = await api('/api/conversations', { cookie: admCookie });
  ok('admin sees every thread (5)', r.data.conversations.length === 5, `got ${r.data.conversations?.length}`);

  r = await api('/api/stats', { cookie: buyerCookie });
  ok('stats expose the unread message counter', typeof r.data.unreadMessages === 'number', String(r.data.unreadMessages));

  /* ----------------------------------------------------------- session */
  const logout = await api('/api/auth/logout', { method: 'POST', cookie: buyerCookie });
  ok('logout', logout.status === 200);
  r = await api('/api/auth/me', { cookie: buyerCookie });
  ok('session invalid after logout', r.status === 401, String(r.status));

  r = await api('/api/nope');
  ok('unknown api route returns 404 json', r.status === 404);

  const failed = results.filter((line) => line.startsWith('FAIL'));
  console.log(results.join('\n'));
  console.log(`\n  ${results.length - failed.length}/${results.length} checks passed\n`);
  process.exit(failed.length ? 1 : 0);
})().catch((err) => {
  console.error('\n  test run crashed:', err.message);
  console.error('  is the server running?  npm start\n');
  process.exit(1);
});
