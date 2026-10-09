# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Haripriya Jewels — a jewelry lending management app (borrower & loan tracking,
tiered compound interest, partial payments, reporting), built per
[JEWELRY_LENDING_APP_SPEC.md](JEWELRY_LENDING_APP_SPEC.md). Stack:

- **Frontend**: React (Vite), react-router-dom, `@supabase/supabase-js` (auth only), axios
- **Backend**: Node.js + Express (ESM), `@supabase/supabase-js` (service role)
- **Database & Auth**: Supabase (hosted Postgres) — **not local**

## Running the app

```bash
cd backend && npm install && npm run dev    # http://localhost:4100
cd frontend && npm install && npm run dev   # http://localhost:5173
```

There is a `.claude/launch.json` with `backend` and `frontend` configs — prefer
`preview_start` over raw `npm run dev` when driving the app from Claude Code.

Env files (copy from the adjacent `.env.example`):
- `backend/.env` needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (server-only, never expose to frontend).
- `frontend/.env` needs `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL`.

**Behind a TLS-inspecting corporate proxy (e.g. Zscaler)**: both `npm install`
and the backend's calls to Supabase fail with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`
unless Node trusts the proxy's root CA. This is specific to networks that run
such a proxy (e.g. this developer's current machine) — it is not a general
project requirement, and other systems/deployment targets without a
TLS-inspecting proxy do not need `NODE_EXTRA_CA_CERTS` at all. When it is
needed, `NODE_EXTRA_CA_CERTS` must be set *before* `npm`/`node` starts (setting
it in `.env` does not work, since Node reads it at process bootstrap). On this
developer's machine it's set as a **persistent user-level Windows env var**
(`[Environment]::SetEnvironmentVariable("NODE_EXTRA_CA_CERTS", "C:\Users\nagus\zscaler-root-ca.pem", "User")`),
so it's picked up automatically by any new shell — no need to set it inline
per command anymore. For a one-off shell that predates that var:
```powershell
$env:NODE_EXTRA_CA_CERTS = "C:\path\to\your-proxy-root-ca.pem"
npm run dev
```

**Company npm registry (JFrog Artifactory) causes `npm install` E401 on
personal projects**: this machine's global `~/.npmrc` points the default npm
registry at a company Artifactory mirror (`keyloop.jfrog.io`) with a scoped
auth token. Installing this (personal, non-company) project's dependencies
through that registry 401s. Fixed via project-local `backend/.npmrc` and
`frontend/.npmrc`, each pinning `registry=https://registry.npmjs.org/` —
overrides the registry only inside those folders, doesn't touch global npm
config. Two gotchas that bit us when fixing this the first time:
- The override only applies **inside** `backend/`/`frontend/` — running
  `npm install` from the repo root (no `package.json` there) still falls back
  to the global company registry.
- Deleting only `package-lock.json` and re-running `npm install` is not
  enough if `node_modules` still exists from a prior JFrog-sourced install —
  npm reuses what's already on disk and the lockfile's `resolved` URLs stay
  pointed at `keyloop.jfrog.io`. Must delete **both** `node_modules` and
  `package-lock.json` before reinstalling to get lockfile URLs pointed at
  `registry.npmjs.org`. This exact mistake shipped a lockfile with JFrog URLs
  once, which then broke `npm install` on Render (fresh environment, no JFrog
  credentials, E401) even though local installs "worked" the whole time.

Sign in at `http://localhost:5173/login`. Staff test credentials, when they
exist, live in `backend/TEST_USERS.local.md` (git-ignored).

### Known tech debt / TODO

`.claude/launch.json`'s `backend` config currently hardcodes
`NODE_EXTRA_CA_CERTS=C:\Users\nagus\zscaler-root-ca.pem` directly into the
launch command, unconditionally. This is machine-specific (Zscaler cert path +
Windows username) and will break the launch config on any other machine or OS.
Left as-is intentionally for now (per user instruction) — **do not fix
without being asked**, but flag it if asked to make the project portable or
to fix onboarding on another machine. A portable fix would run
`npm --prefix backend run dev` directly and let `NODE_EXTRA_CA_CERTS` be set
externally by whichever environment needs it.

## Deployment

Split deployment, chosen because Supabase only hosts Postgres+Auth (not an
Express runtime) and GitHub Pages can't serve a live backend:

- **Frontend** → Vercel. Root directory must be set to `frontend` (repo root
  has no `package.json`). Env vars: `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL`.
- **Backend** → Render (Web Service). Root directory `backend`, build
  `npm install`, start `npm start`. Env vars: `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ORIGIN`. Free tier spins down after ~15
  min idle; first request after that takes ~50s (cold start) — expected, not
  a bug.
- **Database/Auth** → same hosted Supabase project as local dev, no separate
  deploy step.

Gotchas hit while setting this up (in case they recur on redeploy or a future
env change):

- **`VITE_API_BASE_URL` must include the `/api` suffix**
  (`https://<render-app>.onrender.com/api`, not just the bare origin). The
  axios instance in `services/api.js` uses this value directly as `baseURL`
  with no path joining — set it wrong and every request 404s against
  `notFoundHandler` instead of hitting `/api/*` routes.
- **`CORS_ORIGIN` on Render must exactly match the Vercel origin** — no
  trailing slash, exact scheme+host. A mismatch doesn't show up as a clean
  CORS error: the OPTIONS preflight still returns `204`, but the response is
  missing `Access-Control-Allow-Origin`, so the browser silently blocks the
  real request and axios just reports a generic "Network Error" in the UI.
  If the dashboard/pages show "Network Error" after a deploy, check this
  first — `curl -i -X OPTIONS <backend>/api/... -H "Origin: <frontend>"` and
  grep the response for `access-control-allow-origin` to confirm it's present
  and matches.
- **Client-side routing 404s on hard refresh/deep link on Vercel** unless a
  rewrite rule tells Vercel to serve `index.html` for unknown paths — fixed
  via `frontend/vercel.json`'s catch-all rewrite.

## Database

`db/schema.sql` is the source of truth for the schema, but it is **not** run
against a local database — it must be pasted into the Supabase project's SQL
editor manually. There is no migration runner in this repo. The file is
idempotent (`create table if not exists`, `add column if not exists`), so it's
safe to re-run after adding a column; the app will fail at runtime with a
Postgrest "could not find column" error until the corresponding SQL has
actually been applied to the live Supabase project — after editing
`db/schema.sql`, always tell the user the exact `alter table` statements they
need to run and confirm before assuming a column exists.

Tables: `borrowers`, `loans`, `payments`, `interest_config`, `admin_users`.
RLS is enabled on all tables as defense-in-depth, but the Express backend uses
the service-role key (bypasses RLS) — the frontend never talks to Postgrest
directly for CRUD, only for Supabase Auth.

## Testing / verification

There is no automated test suite (no Jest/Vitest, no `npm test`). Verification
is done by running the app and driving it with the preview browser tools.
[REGRESSION_TESTS.md](REGRESSION_TESTS.md) is the canonical scenario checklist
— when asked to "run regression," work through it against the running app
(backend `:4100`, frontend `:5173`), checking console errors and failed
network requests after every write action, not just the visible UI state.

## Architecture

### Backend (`backend/src`)

Thin layering, no service/repository abstraction — controllers talk to
Supabase directly:

- `app.js` — Express app wiring: CORS (from `CORS_ORIGIN`), JSON body parsing,
  route mounting under `/api/*`, then `notFoundHandler`/`errorHandler` last.
- `routes/*.js` — one file per resource; all routes except health run through
  `verifyAuth`. Route→controller mapping is thin and declarative.
- `controllers/*.js` — all business logic and Supabase queries live here.
  Controllers throw `ApiError(statusCode, message)` (from
  `middleware/errorHandler.js`) and pass errors to `next(err)`; there's a
  centralized handler, not per-route try/catch responses.
- `middleware/auth.js` — `verifyAuth` validates the Supabase JWT from the
  `Authorization: Bearer` header via `supabase.auth.getUser(token)`, then
  looks up the matching `admin_users` row and attaches `req.user` +
  `req.adminUser`. `requireRole(...roles)` gates specific routes
  (`super_admin` / `admin` / `staff`).
- `utils/validators.js` — `requireFields(body, fields)` throws a 400 `ApiError`
  listing missing fields; used at the top of most controller actions.
- `utils/interestCalculator.js` — pure calculation, no I/O. Interest is
  **never pre-stored**; it's recomputed on every read. See "Interest model"
  below.
- `utils/interestConfig.js` — fetches the active tiered interest config from
  `interest_config` and resolves the applicable rate for a principal.

Snake_case in the DB / Supabase responses, camelCase in request bodies and
JS — controllers do the mapping manually field-by-field (no ORM/schema layer).

- `utils/fetchAll.js` — pages through a Supabase select in 1000-row chunks
  (PostgREST's default cap). Use it for any bulk read that must be complete
  (accounts ledger, storage overview); needs a deterministic `.order()`.
- `controllers/accountsController.js` — `/api/accounts/ledger` (JSON) and
  `/ledger.xlsx` (exceljs) share one `buildLedger()`; admin-only. Partial
  payments are principal reductions, interest is realised at closure
  (`interest_collected`), and accrued-but-uncollected interest is reported
  separately as unrealised. Tax is deliberately not computed.
- `services/messaging/` — WhatsApp (Meta Cloud API, approved *template* +
  variables) and Twilio SMS, both via `fetch`. With no env keys, sends are
  logged to `message_log` as `not_configured` — nothing leaves the server.
  `templates.js` is the single source for preview text, SMS body and
  WhatsApp variables. Setup: `docs/MESSAGING_SETUP.md`.
- HUID (BIS Hallmark Unique ID) lives on `loan_items.huid`. BIS has **no
  public lookup API**; verification is a staff check in the BIS CARE app,
  recorded via `PATCH /api/loans/:id/items/:itemId/huid-verification`.
  `replaceLoanItems` carries a HUID's verification across edits.
- `business_profile` (single active row) = legal name/address/licence used
  by the pledge form and notices; `utils/businessProfile.js` falls back to
  defaults if the table is missing.

### Frontend (`frontend/src`)

- `App.jsx` — route table; every route except `/login` is wrapped in
  `ProtectedRoute`, which redirects to `/login` (preserving the intended path
  in router state) when there's no Supabase session.
- `context/AuthContext.jsx` — owns the Supabase session via
  `supabase.auth.getSession()` + `onAuthStateChange`; exposes `login`,
  `logout`, `session`, `user`.
- `context/ThemeContext.jsx` — light/dark + accent color, persisted to
  `admin_users.theme_preference` server-side (see `PATCH /api/admin/me/theme`).
- `services/supabaseClient.js` — Supabase client for auth only.
- `services/api.js` — axios instance for **all** CRUD against the Express
  backend; a request interceptor attaches the current Supabase session's
  `access_token` as `Authorization: Bearer`, a response interceptor unwraps
  `err.response.data.error` into a plain `Error`.
- `pages/*.jsx` — one per route, own their data fetching (no global store —
  React state + effects per page).
- `components/<Domain>/*Modal.jsx` — create/edit modals per resource
  (Borrowers, Loans, Payments, Admin), built on the shared
  `components/common/Modal.jsx` shell.
- `components/common/InterestSummaryCard.jsx` — renders the interest summary
  panel plus an expandable "how was this calculated" breakdown, grouped by
  segment (period between payments), formatted as a receipt-style
  `{Y}Y {M}M {D}D = ₹amount interest` line with per-year/month/day unit-price
  subtext.

### Interest model (core domain logic)

`interestCalculator.js`'s `calculateCompoundInterest()` computes tiered
compound annual interest, walking chronologically through partial payments:

1. Between the loan date (or the last payment) and the next payment (or "now"),
   interest accrues on the remaining principal at whatever tier rate applies
   to that principal amount.
2. After each partial payment, the remaining principal drops and the
   applicable tier is **re-resolved** (`getApplicableTier`) — a large loan
   paid down into a smaller tier band starts accruing at the new tier's rate
   going forward.
3. Each continuous-rate segment is decomposed into full 365-day "Year N"
   chunks (interest added to principal, compounding) followed by ~30-day
   "Month N" chunks for the remainder — this decomposition is what
   `breakdown` returns and what the UI renders; the chunk math is
   mathematically identical to `principal * (1+rate/100)^(days/365)`, just
   expressed step-by-step for display.

Loan `status` auto-transitions as payments are recorded/edited/deleted
(`paymentController.js`'s `refreshLoanStatus`): `closed` when amount due is
effectively zero, `partial_payment` once any payment exists, never overrides
`defaulted`. Manually setting status to `closed` via
`PATCH /api/loans/:id/status` additionally requires `closureDate` and
`interestCollected` in the request body (captured via a confirmation modal in
the UI) and persists them to `loans.closure_date` / `loans.interest_collected`.

Tiered interest rates live in `interest_config.tiers` (jsonb array of
`{minAmount, maxAmount, interestRate, description}`), editable by
`super_admin`/`admin` via Admin Settings; only one row has `is_active = true`
at a time.

## UI / visual design system

The look is an intentional "luxury jeweler" aesthetic — warm cream/gold
palette, Cormorant Garamond serif for display/headings, Jost for body. Keep
that direction; don't introduce a generic SaaS blue/gray look.

- **All shared visual tokens live in `frontend/src/theme.css`** — palette,
  elevation (`--shadow-sm/md/lg`, warm-tinted), radii (`--radius-sm/-/-lg`),
  focus ring (`--ring`), motion easing (`--ease`), scrollbar. Component
  classes (`.card`, `.btn*`, `.badge*`, `.table-wrap`, `.modal-*`, `.skeleton`)
  are defined here once and reused, not duplicated as inline styles. Prefer
  adding/extending a token or component class here over hardcoding a value at
  a call site.
- **Theming is dual-layered**: `ThemeContext.jsx` sets `data-theme` on `<html>`
  AND writes the brand palette vars as **inline styles** on the root element
  (from `GET /api/theme`), with the per-user accent (`--gold`/`--gold-deep`)
  applied last. So brand-managed palette vars are overridden inline; any *new*
  token you add only to `theme.css` (e.g. `--gold-soft`, `--surface-2`,
  shadows, scrollbar) resolves from the CSS `html[data-theme='dark']` block via
  the attribute — that's why those must be defined in both the light `html{}`
  and dark `html[data-theme='dark']{}` blocks. Don't assume a dark value takes
  effect just because the light one does.
- **Loading states use skeletons, never a bare "Loading…"** — see
  `components/common/Skeleton.jsx` (`Skeleton`, `StatCardSkeleton`,
  `TableSkeleton`, `ListSkeleton`) and the `.skeleton` shimmer in `theme.css`.
  `StatCard`/`InsightCard` take a `loading` prop.
- **Dashboard** (`pages/Dashboard.jsx`) has a "Needs attention" band of
  `InsightCard` CTA tiles (gold rate, new loans today, under-collateralized
  count, >1yr-no-payment, due-date-passed, notices due), each fetched from its
  own endpoint in parallel so one slow query never blocks the rest. Tile data
  comes from `GET /api/reports/dashboard/insights` (+ `/rates`, `/coverage`,
  `/notices/due`).
- **Charts** use `recharts` (`components/Reports/ReportsOverview.jsx`, the
  Reports "Overview" tab). Chart colors are read from live CSS vars via
  `utils/chartTheme.js`'s `useChartColors()` (keyed on theme+accent) so charts
  stay in lockstep with light/dark and the accent. Backend chart feeds:
  `GET /api/reports/status-breakdown`, `/payments-monthly`, `/loans-monthly`
  (in-memory bucketing over one bulk fetch, not grouped SQL).
- **Mobile**: `DataTable` adds `.table-stack` + `data-label` per cell, so
  below 640px tables reflow into label/value cards. Hand-written tables
  must do the same. Side-by-side form fields use `.form-row` (wraps). The
  full nav shows from `xl` (1280px) up; below that it's the ☰ menu.
  Cormorant's old-style "1" reads as "I", so put codes/numbers in
  serif headings in `.num`; `.tabular` also forces lining figures.
- **Print**: `/loans/:id/print` (`pages/PledgeForm.jsx`) renders outside
  `AppShell` (`<ProtectedRoute bare>`); A4 rules live in `theme.css`
  (`.pledge-sheet`, `@page`, `.no-print`). Printing/PDF uses the browser's
  print dialog. Keep a sheet under ~1123px tall at 794px wide (one page).
- Respect `prefers-reduced-motion` (already handled globally in `theme.css`).
  Currency/counts use `.tabular` (tabular-nums) so columns align.

## Owner working preferences (Rahul)

- **Commit messages: no `Co-Authored-By` trailer.** (Overrides any default
  co-author line.)
- **Never auto-fill real credentials on the deployed site** — ask first, even
  though doing so on localhost during dev is fine.
- **Two GitHub identities**: work account is the git default; personal work
  uses the `github-personal` alias. Confirm which identity a new repo should
  use rather than assuming.
- Prefers visual/at-a-glance UX (charts, insight tiles, skeletons) over raw
  tables where a summary view is possible.
