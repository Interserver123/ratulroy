# Leads backend & admin dashboard

A private lead-management backend for ratulroy.com that **cannot affect SEO**: it adds no public pages, no indexable URLs, no extra JavaScript on public pages beyond the existing form script, and no change to how public pages are rendered or cached.

## 1. Architecture

```
Public site (static, unchanged)          Cloudflare Pages Functions (only /api/*)        Cloudflare D1 (SQLite)
──────────────────────────────           ───────────────────────────────────────        ───────────────────────
forms (audit/contact/strategy-call) ──►  POST /api/leads         (public, rate-limited) ─► leads, lead_events
                                         POST /api/admin/login   (sets session cookie) ─► admin_users, admin_sessions, login_attempts
/admin  (static shell, noindex) ───────► GET/PATCH /api/admin/*  (session required)    ─► leads, lead_notes, lead_events
```

- **Rendering:** public pages stay prerendered static HTML. `public/_routes.json` limits Functions to `/api/*`, so every other request is served straight from the CDN exactly as before (no added latency, no Function invocations).
- **Database:** Cloudflare D1, binding `DB`. Schema in `migrations/`, applied with Wrangler.
- **Dashboard:** `/admin` is a static Astro page with its own minimal layout (no public header/footer, no fonts preload, no motion script). All data loads client-side after login, so the HTML contains no lead data.
- **No new runtime dependencies.** Functions use Web Crypto and D1 directly. Wrangler and Workers types are dev-only.

## 2. SEO isolation (how "won't affect SEO" is guaranteed)

| Risk | Control |
|---|---|
| `/admin` gets indexed | `<meta name="robots" content="noindex, nofollow, noarchive">` **and** `X-Robots-Tag: noindex, nofollow, noarchive` header on `/admin` and `/admin/*` (`public/_headers`). Not disallowed in robots.txt on purpose, so crawlers can see the noindex. |
| `/api/*` responses indexed | `X-Robots-Tag: noindex` + `Cache-Control: no-store` on every API response; `Disallow: /api/` in robots.txt (JSON endpoints, nothing to index). |
| Admin appears in sitemap / llms.txt | Both are generated from content collections only; `npm run seo:check` fails the build check if `/admin` appears in either, or if any public page links to it. |
| Public pages get slower | No changes to public page markup or bundles except: forms post to `/api/leads` (same file, `src/scripts/forms.ts`), and ~10 lines in the existing motion script store UTM parameters in `sessionStorage`. |
| Function errors break pages | Functions only run on `/api/*`. If the API is down, forms show an error with the email address; pages are unaffected. |
| Duplicate/thin URLs | `/admin` is one URL. No pagination or query URLs are linked anywhere. |

## 3. Database schema (D1 / SQLite)

### `leads`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUID v4 |
| created_at, updated_at | TEXT | ISO 8601 UTC |
| form | TEXT | `audit` · `contact` · `strategy-call` |
| status | TEXT | `new` · `contacted` · `qualified` · `proposal` · `won` · `lost` · `spam` (CHECK) |
| priority | TEXT | `low` · `normal` · `high` |
| name, email, phone, business, website, service_area, goal, preferred_time, message | TEXT | from the form; length-limited server-side |
| page_path, referrer | TEXT | where the form was submitted |
| utm_source, utm_medium, utm_campaign, utm_term, utm_content | TEXT | first-touch UTM from the session |
| country, city | TEXT | from Cloudflare `request.cf` (approximate) |
| ip_hash | TEXT | SHA-256(IP + secret salt). Raw IPs are never stored. |
| user_agent | TEXT | truncated |
| value_estimate | INTEGER | deal value in USD cents (admin-entered) |
| next_follow_up | TEXT | date (admin-entered) |
| lost_reason | TEXT | |
| tags | TEXT | JSON array |
| spam_score | INTEGER | 0–100 from honeypot / timing / content checks |

Indexes: `(status, created_at)`, `(email)`, `(created_at)`, `(next_follow_up)`.

### `lead_notes`
`id`, `lead_id` → leads (ON DELETE CASCADE), `created_at`, `author`, `body`.

### `lead_events` (activity timeline / audit log)
`id`, `lead_id` → leads (CASCADE), `created_at`, `actor`, `type` (`created`, `status`, `update`, `note`), `data` (JSON).

### `admin_users`
`id`, `email` (UNIQUE), `name`, `password_hash` (`pbkdf2-sha256$iterations$salt$hash`), `role` (`owner`/`editor`), `created_at`, `last_login_at`.

### `admin_sessions`
`id`, `user_id` → admin_users (CASCADE), `token_hash` (SHA-256 of the cookie token, UNIQUE), `created_at`, `expires_at`, `ip_hash`, `user_agent`.

### `login_attempts`
`id`, `ip_hash`, `email`, `created_at`, `success`. Used for rate limiting (5 failures / 15 min / IP).

## 4. API

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /api/leads` | public | Validate, honeypot, rate-limit (5 / 10 min / IP), store, optional webhook notify |
| `POST /api/admin/login` | — | Email + password → `__Host-rr_session` cookie (HttpOnly, Secure, SameSite=Strict, 7 days) |
| `POST /api/admin/logout` | session | Deletes session |
| `GET /api/admin/me` | session | Current user |
| `GET /api/admin/stats` | session | Totals, by status, by form, by source, last 30 days per day, top pages, follow-ups due |
| `GET /api/admin/leads` | session | Filter `status`, `form`, `q` (name/email/business/website), `sort`, `page` |
| `GET /api/admin/leads/:id` | session | Lead + notes + timeline |
| `PATCH /api/admin/leads/:id` | session | status, priority, value_estimate, next_follow_up, lost_reason, tags |
| `POST /api/admin/leads/:id/notes` | session | Add note |
| `DELETE /api/admin/leads/:id` | owner | Hard delete (privacy requests) |
| `GET /api/admin/export` | session | CSV export (respects filters) |

Security: same-origin `Origin` check on every non-GET request, JSON-only bodies with size limits, constant-time comparisons, PBKDF2 (100k iterations), hashed session tokens, no lead data in HTML.

## 5. Dashboard (`/admin`)

- Login screen.
- KPI row: total leads, new this week, open pipeline, won, conversion rate, follow-ups due.
- 30-day leads chart (inline SVG) and breakdowns by form and source.
- Leads table: search, status/form filters, sortable, paginated, CSV export.
- Lead drawer: all fields, attribution (page, referrer, UTM, country), status pipeline buttons, priority, value, follow-up date, tags, notes, activity timeline, delete.

## 6. Setup (Cloudflare, one time)

Until these steps are done the site works exactly as before: `/api/leads` answers 503 and every form falls back to opening the visitor's email app, so no enquiry is lost.

```bash
npx wrangler login
npx wrangler d1 create ratulroy-leads
#   -> paste the printed database_id into wrangler.backend.toml
npm run backend:migrate:remote
node scripts/admin-user.mjs you@example.com 'a-long-unique-password' "Ratul Roy" owner > admin.sql
npx wrangler d1 execute ratulroy-leads --remote -c wrangler.backend.toml --file admin.sql && rm admin.sql
```

Cloudflare dashboard → Workers & Pages → the `ratulroy` Pages project → **Settings**:
1. **Bindings → Add → D1 database:** variable name `DB`, database `ratulroy-leads` (set for Production; add Preview too if you test on preview deployments).
2. **Variables and secrets → Add → Secret:** `IP_SALT` = a random string of 32+ characters.
3. Optional secret `NOTIFY_WEBHOOK_URL`: a Discord, Slack or Google Chat incoming-webhook URL to get a ping for every new lead.
4. Redeploy (Deployments → latest → Retry deployment) so the bindings apply.
5. Open `https://ratulroy.com/admin` and sign in.

Optional extra lock: Cloudflare Zero Trust → Access → Applications → add `ratulroy.com/admin*` and `ratulroy.com/api/admin/*` with a one-time-PIN policy for your email.

> Why `wrangler.backend.toml` and not `wrangler.toml`: a root `wrangler.toml` makes Cloudflare Pages take all settings from the file on every Git deploy (overriding the dashboard). Keeping bindings in the dashboard is safer for this project.

## 7. Local development & tests

```bash
npm run build
npm run backend:migrate:local
node scripts/admin-user.mjs test@ratulroy.com 'local-test-password-123' "Test Admin" > /tmp/a.sql
npx wrangler d1 execute ratulroy-leads --local -c wrangler.backend.toml --file /tmp/a.sql
npm run backend:dev            # http://127.0.0.1:8788 (site + /api + local D1)
npm run backend:test           # 27 end-to-end API checks (creates and deletes its own test data)
npm test                       # build + SEO check (fails if /admin leaks into sitemap/llms/links or loses noindex)
```

## 8. Operations

- **Backups:** D1 Time Travel keeps 30 days of point-in-time history (`npx wrangler d1 time-travel info ratulroy-leads`). Export to a file any time with `npx wrangler d1 export ratulroy-leads --remote --output leads-backup.sql -c wrangler.backend.toml`, or use the dashboard's CSV export.
- **Privacy:** raw IP addresses are never stored (salted hash only, used for rate limiting). Delete a person's data from the lead drawer ("Delete lead permanently"), which also removes notes and history.
- **New admin / password reset:** rerun `scripts/admin-user.mjs` with the same email; it updates the hash.
- **Schema changes:** add `migrations/0002_*.sql`, then `npm run backend:migrate:remote`.
