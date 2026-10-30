'use strict';

/**
 * Database layer — SQLite via Node's built-in `node:sqlite` driver.
 * No native build step required (Node >= 22.5).
 */

const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'app.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'buyer'
                  CHECK (role IN ('buyer', 'supplier', 'admin')),
    company       TEXT    NOT NULL DEFAULT '',
    country       TEXT    NOT NULL DEFAULT '',
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    name          TEXT    NOT NULL,
    country       TEXT    NOT NULL,
    category      TEXT    NOT NULL,
    description   TEXT    NOT NULL DEFAULT '',
    verified      INTEGER NOT NULL DEFAULT 0,
    rating        REAL    NOT NULL DEFAULT 0,
    lead_time     TEXT    NOT NULL DEFAULT '',
    moq           TEXT    NOT NULL DEFAULT '',
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id    INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    name           TEXT    NOT NULL,
    category       TEXT    NOT NULL,
    blurb          TEXT    NOT NULL DEFAULT '',
    unit_price     REAL    NOT NULL DEFAULT 0,
    currency       TEXT    NOT NULL DEFAULT 'USD',
    moq            INTEGER NOT NULL DEFAULT 0,
    lead_time_days INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rfqs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    buyer_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT    NOT NULL,
    category    TEXT    NOT NULL,
    quantity    INTEGER NOT NULL DEFAULT 0,
    unit        TEXT    NOT NULL DEFAULT 'pcs',
    destination TEXT    NOT NULL DEFAULT '',
    budget      TEXT    NOT NULL DEFAULT '',
    specs       TEXT    NOT NULL DEFAULT '',
    status      TEXT    NOT NULL DEFAULT 'open'
                CHECK (status IN ('draft', 'open', 'matched', 'quoted', 'closed')),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS quotes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    rfq_id         INTEGER NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
    supplier_id    INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    amount         REAL    NOT NULL DEFAULT 0,
    currency       TEXT    NOT NULL DEFAULT 'USD',
    lead_time_days INTEGER NOT NULL DEFAULT 0,
    status         TEXT    NOT NULL DEFAULT 'received'
                   CHECK (status IN ('received', 'shortlisted', 'accepted', 'declined')),
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS applications (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    contact_name TEXT    NOT NULL,
    email        TEXT    NOT NULL,
    company      TEXT    NOT NULL DEFAULT '',
    message      TEXT    NOT NULL DEFAULT '',
    status       TEXT    NOT NULL DEFAULT 'new'
                 CHECK (status IN ('new', 'reviewing', 'approved', 'rejected')),
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_a_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    subject    TEXT    NOT NULL DEFAULT '',
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
    CHECK (user_a_id <> user_b_id),
    UNIQUE (user_a_id, user_b_id, product_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body            TEXT    NOT NULL,
    read_at         TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user   ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_rfqs_buyer      ON rfqs(buyer_id);
  CREATE INDEX IF NOT EXISTS idx_quotes_rfq      ON quotes(rfq_id);
  CREATE INDEX IF NOT EXISTS idx_products_sup    ON products(supplier_id);
  CREATE INDEX IF NOT EXISTS idx_suppliers_owner ON suppliers(owner_user_id);
  CREATE INDEX IF NOT EXISTS idx_conv_a          ON conversations(user_a_id);
  CREATE INDEX IF NOT EXISTS idx_conv_b          ON conversations(user_b_id);
  CREATE INDEX IF NOT EXISTS idx_messages_conv   ON messages(conversation_id);
`);

const hash = (pw) => bcrypt.hashSync(pw, 10);

/* --------------------------------------------------------------------------
   Seed data
   -------------------------------------------------------------------------- */

const SUPPLIERS = [
  ['Guangzhou SolarTech Co.', 'China', 'Solar & Energy',
    'ISO 9001 certified manufacturer of solar street lights, panels and off-grid systems for municipal and commercial projects.',
    1, 4.8, '25–35 days', '500 pcs'],
  ['Ningbo PowerWorks Ltd.', 'China', 'Solar & Energy',
    'Solar inverters, battery banks and LED street lighting with full IEC and CE documentation.',
    1, 4.6, '20–30 days', '1,000 pcs'],
  ['Foshan EcoLamp Industries', 'China', 'Lighting',
    'Commercial and residential LED luminaires, smart dimming drivers and bespoke housings.',
    1, 4.5, '18–26 days', '2,000 pcs'],
  ['Shenzhen Vertex Electronics', 'China', 'Consumer Electronics',
    'Smart home devices, wearables and TWS audio with CE, FCC and GCC certification support.',
    1, 4.9, '15–22 days', '1,000 pcs'],
  ['Tirupati Textile Mills', 'India', 'Textiles & Apparel',
    'Woven and knitted cotton fabric, denim and finished garments for export to West Africa and the EU.',
    1, 4.4, '30–45 days', '3,000 m'],
  ['Ahmedabad Fabric House', 'India', 'Textiles & Apparel',
    'Organic cotton, technical textiles and private-label garment production with GOTS certification.',
    0, 4.3, '28–40 days', '5,000 m'],
  ['Dongguan AgriPump Works', 'China', 'Agriculture Equipment',
    'Irrigation pumps, greenhouse framing and drip systems supplied to cooperatives across East Africa.',
    1, 4.7, '22–30 days', '100 pcs'],
  ['Istanbul MedTech Manufacturing', 'Türkiye', 'Medical & Lab',
    'Diagnostic consumables and laboratory equipment assembled under ISO 13485 quality management.',
    1, 4.6, '24–32 days', '500 pcs'],
  ['Ho Chi Minh Precision Parts', 'Vietnam', 'Industrial Components',
    'CNC machined components, injection moulding and sub-assembly for industrial OEMs.',
    1, 4.5, '19–28 days', '2,000 pcs'],
  ['Jebel Ali Assembly FZE', 'United Arab Emirates', 'Consumer Electronics',
    'Regional kitting, final assembly and free-zone logistics for GCC distribution.',
    0, 4.4, '12–18 days', '750 pcs'],
];

const PRODUCTS = [
  [1, 'Solar Street Light 120W', 'Solar & Energy', 'All-in-one 120W luminaire with 60Ah LiFePO4 battery and motion sensor.', 168, 500, 28],
  [1, 'Monocrystalline Panel 550W', 'Solar & Energy', 'Half-cut PERC module, 21.3% efficiency, 25-year performance warranty.', 74, 1000, 24],
  [2, 'Hybrid Inverter 5kW', 'Solar & Energy', 'Pure sine wave hybrid inverter with MPPT and parallel capability.', 429, 200, 21],
  [2, 'Lithium Battery Bank 10kWh', 'Solar & Energy', 'Stackable LiFePO4 battery with built-in BMS and CAN/RS485 communication.', 1850, 100, 30],
  [3, 'LED Panel Light 600×600', 'Lighting', 'Ultra-slim backlit panel, UGR<19, 4000K, 5-year warranty.', 12.4, 2000, 22],
  [4, 'Smart Plug with Energy Meter', 'Consumer Electronics', 'Wi-Fi smart plug with real-time energy monitoring and app control.', 6.9, 1000, 16],
  [4, 'TWS Earbuds (ANC)', 'Consumer Electronics', 'Active noise cancelling earbuds with ENC microphone, custom packaging.', 18.5, 1000, 20],
  [5, 'Cotton Poplin Fabric', 'Textiles & Apparel', '100% combed cotton poplin, 120 gsm, 400+ colours in stock.', 2.35, 3000, 34],
  [6, 'GOTS Organic T-Shirt', 'Textiles & Apparel', '180 gsm organic cotton tee, private label and custom print.', 4.8, 1000, 30],
  [7, 'Centrifugal Irrigation Pump', 'Agriculture Equipment', '2HP stainless pump, 45 m head, designed for smallholder schemes.', 132, 100, 26],
  [8, 'Rapid Test Cassette Kit', 'Medical & Lab', 'CE-marked in-vitro diagnostic cassettes, 40 tests per box.', 1.65, 5000, 27],
  [9, 'CNC Aluminium Bracket', 'Industrial Components', 'Custom CNC part, anodised, ±0.02 mm tolerance, tooling included.', 3.2, 2000, 23],
  [10, 'Portable Power Station 500W', 'Consumer Electronics', 'LiFePO4 512Wh station with AC, PD 100W and solar input for field kits.', 189, 300, 18],
  [3, 'Smart Ceiling Light RGB', 'Lighting', 'App + voice dimmable 48W ceiling light, 16M colours, CCT tuneable.', 21.5, 1000, 20],
  [5, 'Selvedge Denim 12oz', 'Textiles & Apparel', 'Ring-spun indigo denim, 4.5 m width, sanforised and GRS recycled options.', 4.15, 2000, 32],
  [7, 'Drip Irrigation Kit (1 acre)', 'Agriculture Equipment', 'Complete emitter, filter and valve kit sized for one-acre smallholder plots.', 96, 150, 24],
  [8, 'Digital Blood Pressure Monitor', 'Medical & Lab', 'Upper-arm monitor with AFIB detection, OEM packaging and CE 0123.', 14.8, 500, 26],
  [9, 'Injection Moulded Gear Set', 'Industrial Components', 'Nylon + glass gear pair, ±0.03 mm, mould flow analysis included.', 6.4, 1500, 21],
];

const BUYER_RFQS = [
  ['Solar street lights for Lagos State rollout', 'Solar & Energy', 2400, 'pcs', 'Lagos, Nigeria', 'USD 380,000',
    'All-in-one 100–120W units, 60Ah battery, IK08 rated. KEBS compliance documents required with quotation.', 'quoted'],
  ['Cotton fabric for garment line (Q3)', 'Textiles & Apparel', 42000, 'm', 'Accra, Ghana', 'USD 95,000',
    'Combed cotton poplin 110–130 gsm, 14 base colours, GOTS preferred.', 'matched'],
  ['Irrigation pumps for cooperative cluster', 'Agriculture Equipment', 320, 'pcs', 'Nairobi, Kenya', 'USD 60,000',
    '2 HP centrifugal pumps with 12 months spare-parts cover, KEBS standard mark.', 'open'],
  ['Smart plugs for GCC retail launch', 'Consumer Electronics', 15000, 'pcs', 'Dubai, UAE', 'USD 120,000',
    'CE + GCC conformity, Arabic/English packaging, private label artwork supplied.', 'closed'],
];

const OTHER_RFQS = [
  ['LED panel lights for office retrofit', 'Lighting', 4800, 'pcs', 'Lagos, Nigeria', 'USD 70,000',
    '600×600 backlit panels, UGR<19, 5-year warranty.', 'open'],
];

const QUOTES = [
  [1, 1, 391200, 30, 'received'],
  [1, 2, 386400, 27, 'shortlisted'],
  [1, 3, 402900, 34, 'received'],
  [2, 5, 96600, 34, 'received'],
  [2, 6, 91800, 32, 'received'],
  [3, 7, 42240, 26, 'received'],
];

const APPLICATIONS = [
  ['Kwame Asante', 'kwame@sertex-gh.com', 'Sertex Industrial', 'We manufacture woven polypropylene bags and would like to respond to buyer RFQs in West Africa.', 'reviewing'],
  ['Mei Lin Chow', 'mei.chow@gzt-solar.cn', 'Guangzhou SolarTech Co.', 'Requesting access to municipal tenders for solar street lighting across East Africa.', 'approved'],
  ['Rahul Verma', 'rahul@tirupatitextile.in', 'Tirupati Textile Mills', 'Twelve years exporting cotton fabric to Ghana and Kenya — keen to join the verified network.', 'new'],
];

/* Sales reps: one account behind every seeded supplier profile so that the
   marketplace chat (buyer ↔ supplier) always has somebody on the other end.
   Index 0 of SUPPLIERS is already owned by the demo supplier account. */
const REPS = [
  ['Chen Wei', 'Ningbo PowerWorks Ltd.', 'China'],
  ['Aisha Rahman', 'Foshan EcoLamp Industries', 'China'],
  ['Diego Alvarez', 'Shenzhen Vertex Electronics', 'China'],
  ['Priya Nair', 'Tirupati Textile Mills', 'India'],
  ['Rohan Mehta', 'Ahmedabad Fabric House', 'India'],
  ['Yuki Tanaka', 'Dongguan AgriPump Works', 'China'],
  ['Sofia Rossi', 'Istanbul MedTech Manufacturing', 'Türkiye'],
  ['Nguyen Van Minh', 'Ho Chi Minh Precision Parts', 'Vietnam'],
  ['Omar Haddad', 'Jebel Ali Assembly FZE', 'United Arab Emirates'],
];

/* Inbox seed — threads are [userA, userB, supplierId, productId, subject, messages].
   `mins` is minutes ago (used to stamp created_at), `read` marks the message as
   already seen by its recipient. */
const THREADS = [
  {
    a: 'ada', b: 'liam', supplier: 0, product: 0,
    subject: 'Solar Street Light 120W — 2,400 units for Lagos',
    messages: [
      ['ada', 'Hi Liam — we are tendering 2,400 all-in-one solar street lights for Lagos State. Best unit price at that volume?', 4320, 1],
      ['liam', 'Hi Ada, thanks for reaching out. At 2,400 units we can hold USD 165 with the 60Ah LiFePO4 battery upgrade included.', 4250, 1],
      ['ada', 'That works. Can you confirm the KEBS compliance pack ships with the order?', 2160, 1],
      ['liam', 'Yes — KEBS and IEC documents are included and lead time is 30 days after deposit. Sending the proforma today.', 38, 0],
    ],
  },
  {
    a: 'ada', b: 'rep3', supplier: 3, product: 5,
    subject: 'Smart Plug with Energy Meter — MOQ for GCC launch',
    messages: [
      ['ada', 'We are launching smart plugs in the UAE. Is the MOQ really 1,000 pcs with our own packaging?', 1680, 1],
      ['rep3', 'Yes — 1,000 pcs is the MOQ and custom box artwork is free above 2,000 units. CE + GCC conformity included.', 1620, 1],
      ['rep3', 'I can reserve production capacity for October. Shall I send the test report?', 95, 0],
    ],
  },
  {
    a: 'ada', b: 'rep4', supplier: 4, product: 7,
    subject: 'Cotton Poplin Fabric — Q3 programme',
    messages: [
      ['ada', 'Hello! We need 42,000 m of combed cotton poplin in 14 base colours for Q3.', 7200, 1],
      ['rep4', 'Received. 120 gsm poplin is in stock in all 14 shades — GOTS available on request. Sampling starts Monday.', 7100, 1],
    ],
  },
  {
    a: 'nora', b: 'liam', supplier: 0, product: 1,
    subject: 'Monocrystalline Panel 550W — container to Accra',
    messages: [
      ['nora', 'Hi, can you quote 2 containers of the 550W modules to Tema port, Accra?', 600, 1],
      ['liam', 'Hi Nora — yes, 1,100 pcs per container at USD 71 each, CIF Tema. Attached the warranty terms.', 25, 0],
    ],
  },
];

/* --------------------------------------------------------------------------
   Seeding
   -------------------------------------------------------------------------- */

function count(table) {
  return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
}

function seed() {
  const now = new Date().toISOString();

  const insertUser = db.prepare(
    'INSERT INTO users (name, email, password_hash, role, company, country, created_at) VALUES (?,?,?,?,?,?,?)'
  );

  const users = [
    ['Ada Okonkwo', 'ada@buyer.demo', hash('demo1234'), 'buyer', 'Lagos Trading Co.', 'Nigeria'],
    ['Liam Chen', 'liam@supplier.demo', hash('demo1234'), 'supplier', 'Guangzhou SolarTech Co.', 'China'],
    ['Platform Admin', 'admin@globalprocurement.os', hash('admin1234'), 'admin', 'Global Procurement OS', 'Singapore'],
    ['Nora Mensah', 'nora@buyer.demo', hash('demo1234'), 'buyer', 'Sahel Imports Ltd.', 'Ghana'],
  ];
  const userIds = users.map((u) => Number(insertUser.run(...u, now).lastInsertRowid));

  /* one sales account behind every supplier profile (index 0 is the demo supplier) */
  const repIds = REPS.map(([name, company, country], i) =>
    Number(insertUser.run(name, `rep${i + 1}@supplier.demo`, hash('demo1234'), 'supplier', company, country, now).lastInsertRowid));

  const insertSupplier = db.prepare(
    `INSERT INTO suppliers (owner_user_id, name, country, category, description, verified, rating, lead_time, moq, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  );
  const supplierIds = SUPPLIERS.map((s, i) => {
    const owner = i === 0 ? userIds[1] : repIds[i - 1]; // demo supplier + one rep per profile
    return Number(insertSupplier.run(owner, ...s, now).lastInsertRowid);
  });

  const insertProduct = db.prepare(
    `INSERT INTO products (supplier_id, name, category, blurb, unit_price, currency, moq, lead_time_days, created_at)
     VALUES (?,?,?,?,?,'USD',?,?,?)`
  );
  const productIds = PRODUCTS.map(([supplierIdx, name, category, blurb, price, moq, leadDays]) =>
    Number(insertProduct.run(supplierIds[supplierIdx - 1], name, category, blurb, price, moq, leadDays, now).lastInsertRowid));

  const insertRfq = db.prepare(
    `INSERT INTO rfqs (buyer_id, title, category, quantity, unit, destination, budget, specs, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  );
  const buyerRfqIds = BUYER_RFQS.map((r) => Number(insertRfq.run(userIds[0], ...r, now).lastInsertRowid));
  insertRfq.run(userIds[2], ...OTHER_RFQS[0], now);

  const insertQuote = db.prepare(
    `INSERT INTO quotes (rfq_id, supplier_id, amount, currency, lead_time_days, status, created_at)
     VALUES (?,?,?,'USD',?,?,?)`
  );
  QUOTES.forEach(([rfqIdx, supIdx, amount, leadDays, status]) => {
    insertQuote.run(buyerRfqIds[rfqIdx - 1], supplierIds[supIdx - 1], amount, leadDays, status, now);
  });

  const insertApplication = db.prepare(
    'INSERT INTO applications (user_id, contact_name, email, company, message, status, created_at) VALUES (?,?,?,?,?,?,?)'
  );
  APPLICATIONS.forEach((a, i) => {
    const owner = i === 2 ? userIds[1] : null;
    insertApplication.run(owner, ...a, now);
  });

  /* --- inbox: seeded buyer ↔ supplier threads ------------------------------ */
  const actors = {
    ada: userIds[0],
    liam: userIds[1],
    admin: userIds[2],
    nora: userIds[3],
  };
  repIds.forEach((id, i) => { actors[`rep${i + 1}`] = id; });

  const stamp = (minutesAgo) =>
    new Date(Date.now() - minutesAgo * 60000).toISOString().replace('T', ' ').slice(0, 19);

  const insertConv = db.prepare(
    `INSERT INTO conversations (user_a_id, user_b_id, supplier_id, product_id, subject, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?)`
  );
  const insertMsg = db.prepare(
    'INSERT INTO messages (conversation_id, sender_id, body, read_at, created_at) VALUES (?,?,?,?,?)'
  );

  let threadCount = 0;
  THREADS.forEach((t) => {
    const a = actors[t.a];
    const b = actors[t.b];
    if (!a || !b || a === b) return;

    const supplierId = t.supplier == null ? null : supplierIds[t.supplier];
    const productId = t.product == null ? null : productIds[t.product];
    const oldest = Math.max(...t.messages.map((m) => m[2]));
    const newest = Math.min(...t.messages.map((m) => m[2]));

    const info = insertConv.run(
      Math.min(a, b), Math.max(a, b), supplierId, productId, t.subject, stamp(oldest), stamp(newest)
    );

    t.messages.forEach(([actor, body, minsAgo, read]) => {
      insertMsg.run(info.lastInsertRowid, actors[actor], body, read ? stamp(minsAgo) : null, stamp(minsAgo));
    });
    threadCount += 1;
  });

  return {
    users: users.length + repIds.length,
    suppliers: supplierIds.length,
    products: PRODUCTS.length,
    rfqs: buyerRfqIds.length + 1,
    conversations: threadCount,
  };
}

function seedIfEmpty() {
  if (count('users') > 0) return null;
  const summary = seed();
  return summary;
}

function resetAndSeed() {
  db.exec(`
    DELETE FROM messages;
    DELETE FROM conversations;
    DELETE FROM quotes;
    DELETE FROM applications;
    DELETE FROM products;
    DELETE FROM rfqs;
    DELETE FROM suppliers;
    DELETE FROM sessions;
    DELETE FROM users;
    DELETE FROM sqlite_sequence WHERE name IN ('messages','conversations','quotes','applications','products','rfqs','suppliers','users');
  `);
  return seed();
}

module.exports = { db, DB_PATH, seedIfEmpty, resetAndSeed };
