# Global Procurement OS — landing page redesign + demo backend

A professional, light-theme redesign of the original dark landing page, backed by a small
Node/Express API and a real SQLite database so accounts, requests, quotes, suppliers,
products, applications and buyer↔supplier chat messages actually persist.

The workspace ships a **Shopee/Lazada-style marketplace** (hero search, category strip,
promo banners, flash deals with a live countdown, discount/sold/rating cards) and an
**Inbox** where buyers and suppliers talk to each other in real time.

Built as a self-contained assignment project — plain HTML, CSS and JavaScript on the front,
Express + SQLite on the back. No framework, no build step.

---

## Quick start

```bash
npm install     # once
npm start       # http://localhost:3000
```

Open **http://localhost:3000** for the landing page, **/auth/sign-in** to log in,
and **/dashboard** for the workspace.

### Demo accounts

| Role     | Email                            | Password    |
| -------- | -------------------------------- | ----------- |
| Buyer    | `ada@buyer.demo`                 | `demo1234`  |
| Buyer    | `nora@buyer.demo`                | `demo1234`  |
| Supplier | `liam@supplier.demo`             | `demo1234`  |
| Supplier | `rep1@supplier.demo` … `rep9@supplier.demo` | `demo1234` |
| Admin    | `admin@globalprocurement.os`     | `admin1234` |

Every seeded supplier profile has a linked "rep" account behind it, so the marketplace
**Chat** button always reaches a real counterpart you can log in as.

### Other scripts

```bash
npm run seed    # seed demo data only if the database is empty
npm run reset   # wipe every table and re-seed demo data
npm test        # reset → run 72 API checks → reset (server must be running)
npm run dev     # start the server with auto-restart on file changes
```

The database file is created automatically at `data/app.db` on first run.

### Deploy to a public URL (Render)

The repo ships a `render.yaml` blueprint, so the whole service is one click after you
connect GitHub:

1. Commit and push: `git add -A && git commit -m "deploy" && git push`
2. Sign up at **https://render.com** with your GitHub account
3. **New → Web Service → Connect** the `global-procurement-os` repository
4. Render picks up `render.yaml` automatically (Node 22, `npm install`, `npm start`,
   health check on `/api/health`) — just press **Create Web Service**
5. Your site goes live at `https://global-procurement-os.onrender.com`

> ⚠️ **Free tier caveat:** free instances have an *ephemeral* filesystem, so `data/app.db`
> is wiped whenever the service redeploys or spins down (15 min of no traffic → ~1 min to
> wake). The app re-seeds itself automatically on every boot, so visitors always see the
> full demo — but new registrations, RFQs and chat messages don't persist between restarts.
> Fix later with a paid disk or Render Postgres; the demo accounts always work either way.

---

## What was redesigned

**Before:** a dark, single-column landing page with generic cards.

**After:** a light corporate design (Stripe / Linear inspired) with:

- **Stronger hierarchy** — eyebrow labels, consistent section rhythm, tighter type scale (Inter, negative tracking on headings)
- **Split hero** with a CSS-built product mock (AI chat + supplier quote table) instead of a plain centered headline
- **Trust signals** — logo strip and an animated stats band (suppliers, countries, savings, turnaround)
- **Restructured workflow** — numbered step cards that become a connected timeline on wide screens
- **Case studies with a result callout** — each outcome is visually separated from the description
- **Two-tone supplier CTA** — brand-blue benefits panel paired with a live, validated application form
- **Multi-column footer** with grouped navigation
- **Full i18n** — landing and auth screens ship in EN / FR / ES / ZH (language menu in the header; the dashboard stays English)
- **Responsive from 320px up**, sticky header, mobile drawer, reduced-motion support, visible focus states, skip link and ARIA labelling

### The workspace (dashboard)

Seven views: Overview, Procurement requests, Suppliers, **Marketplace**, Applications, **Inbox**, Account.

- **Marketplace** — full Shopee / Lazada treatment:
  - **full-bleed orange header band** with the Global Mart logo, white pill search, perks,
    filter tabs (All · Flash Sale · Mall · New arrivals · Best sellers · Post an RFQ) and
    trending-search chips
  - **category circles** with listing counts
  - **auto-rotating hero slider** (arrows on hover, dots, pauses when the tab is hidden and
    respects `prefers-reduced-motion`) beside two stacked promo cards
  - **flash-deals strip** with a live countdown, "See all", and a *sold / %* progress bar on
    every card
  - **product cards**: discount badge, `MALL` ribbon for verified shops, free-shipping tag,
    orange price + struck-through was-price, 5-star rating, sold counter, MOQ/lead-time tags,
    supplier row with verification check + country code, and `💬 Chat` / `Request quote` actions
  - **sorting** (popular, discount, price, newest) plus Shopee-style **See more** pagination
    (12 listings per click); `Request quote` drafts an RFQ pre-filled from the listing
- **Inbox** — conversation list (search, unread badges, last-message preview, relative time) beside a
  chat thread with bubbles, composer (Enter to send, Shift+Enter for newline) and a "New chat" supplier
  picker. Unread counts surface in the sidebar, the topbar dot and `/api/stats`. Threads refresh on a
  15-second poll while the tab is visible.

### Files

```
index.html        landing page (hero, logos, stats, products, workflow, cases, suppliers)
auth.html         sign in / create account with buyer-supplier role picker
dashboard.html    logged-in workspace (7 views: + Marketplace, + Inbox)
css/styles.css    full design system — tokens, marketplace/inbox blocks, responsive rules
js/i18n.js        i18n core + EN/FR/ES/ZH dictionaries and the language menu
js/main.js        landing: nav, scroll-spy, reveals, counters, live application form
js/auth.js        auth tabs, validation, session redirect
js/dashboard.js   data loading, marketplace engine, inbox/chat, role-based views, CRUD forms
server.js         Express API, sessions, chat endpoints, static routes
db.js             schema + demo seed data (SQLite via node:sqlite)
seed.js           database CLI (seed / reset)
test/api.test.js  72 integration checks against the running server
```

### Seed data

13 users (2 buyers, 10 supplier accounts, 1 admin) · 10 suppliers · 18 products · 5 RFQs ·
4 conversations (11 messages, 3 of them unread).

---

## The backend

SQLite through Node's built-in `node:sqlite` driver, so there is no native module to
compile. Passwords are hashed with bcrypt (10 rounds). Sessions are random 256-bit tokens
stored in the `sessions` table and sent as `HttpOnly` cookies for 7 days.

### Tables

| Table          | Purpose                                                          |
| -------------- | ---------------------------------------------------------------- |
| `users`        | accounts: name, email, hashed password, role, company, country   |
| `sessions`     | token → user, expiry                                             |
| `suppliers`    | manufacturer profiles (owner, country, category, rating, flags)  |
| `products`     | catalog listings attached to a supplier                          |
| `rfqs`         | procurement requests: quantity, destination, budget, status      |
| `quotes`       | supplier responses to an RFQ (amount, lead time, status)         |
| `applications` | supplier "express interest" submissions with review status       |
| `conversations`| one row per buyer↔supplier thread (participants, supplier, product, subject) |
| `messages`     | chat messages with `read_at` driving the unread counters         |

### Roles

- **buyer** — posts RFQs, sees quotes on their own requests, cannot modify other buyers' data, chats with suppliers from the marketplace
- **supplier** — browses the open demand board, sends quotes, creates a company profile and products, tracks applications, answers marketplace chats
- **admin** — sees every request and application, can move applications through `new → reviewing → approved → rejected`, and can read every chat thread

### API

| Method   | Route                      | Auth    | Notes                                  |
| -------- | -------------------------- | ------- | -------------------------------------- |
| `POST`   | `/api/auth/register`       | public  | buyer or supplier, validates input     |
| `POST`   | `/api/auth/login`          | public  | sets session cookie                    |
| `POST`   | `/api/auth/logout`         | public  | clears the session                     |
| `GET`    | `/api/auth/me`             | session | current user                           |
| `PATCH`  | `/api/auth/password`       | session | requires current password              |
| `GET`    | `/api/stats`               | session | role-aware counters for the overview   |
| `GET`    | `/api/rfqs`                | session | own requests (admin: all)              |
| `GET`    | `/api/rfqs?scope=open`     | session | open demand board for suppliers        |
| `POST`   | `/api/rfqs`                | session | create a request                       |
| `PATCH`  | `/api/rfqs/:id`            | session | change status (owner only)             |
| `DELETE` | `/api/rfqs/:id`            | session | owner or admin                         |
| `GET`    | `/api/rfqs/:id/quotes`     | session | owner or admin                         |
| `POST`   | `/api/rfqs/:id/quotes`     | session | supplier only, one quote per request   |
| `GET`    | `/api/suppliers`           | session | `?q=` search, `?mine=1` own profiles   |
| `POST`   | `/api/suppliers`           | session | supplier/admin                         |
| `GET`    | `/api/products`            | session | catalog with `?q=` search              |
| `POST`   | `/api/products`            | session | must own the supplier profile          |
| `GET`    | `/api/conversations`       | session | inbox threads (admin: every thread)    |
| `POST`   | `/api/conversations`       | session | start/reuse a thread by `product_id`, `supplier_id` or `user_id` (optional first `message`) |
| `GET`    | `/api/conversations/:id`   | session | thread metadata + unread counter       |
| `GET`    | `/api/conversations/:id/messages` | session | messages; marks the other side's as read |
| `POST`   | `/api/conversations/:id/messages` | session | send a message (max 2 000 chars)  |
| `GET`    | `/api/applications`        | session | own submissions (admin: all)           |
| `POST`   | `/api/applications`        | public  | the landing-page express-interest form |
| `PATCH`  | `/api/applications/:id`    | session | status updates (admin/owner)           |

Routes are also mapped so the original site's URLs still work:
`/auth/sign-in`, `/supplier/apply`, `/marketplace`, `/consultations`, `/service`, `/procurement`.

### The core workflow

1. A **buyer** posts a procurement request.
2. It appears on the **supplier** demand board.
3. The supplier sends a quote; the request auto-moves to `quoted`.
4. The buyer opens the request and compares quotes side by side.
5. An **admin** reviews supplier applications and updates their status.

In the marketplace a buyer can also hit **💬 Chat** on any card — that opens (or reuses) a
thread with the supplier behind the listing, visible in the **Inbox** on both sides.

---

## Notes and limitations

- Demo scope: no email delivery, no payments, no real KYC/verification — "verified" flags are seed data.
- The stats band and logo strip on the landing page are illustrative content from the original brief.
- Sessions live in SQLite; restart the server and they survive (7-day expiry).
- `npm test` resets the database first, so run it before a demo rather than after entering data.
- Written for Node 22.5+ (it uses the built-in SQLite driver).

## Accessibility

Semantic landmarks, a skip link, labelled form controls with inline error messages,
`aria-expanded` on every disclosure, keyboard-closable menus, `:focus-visible` outlines,
sufficient contrast on the light palette, and `prefers-reduced-motion` disabling all
animation.
