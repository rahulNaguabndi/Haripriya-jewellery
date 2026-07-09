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
needed, `NODE_EXTRA_CA_CERTS` must be set in the shell *before* `npm`/`node`
starts (setting it in `.env` does not work, since Node reads it at process
bootstrap):
```powershell
$env:NODE_EXTRA_CA_CERTS = "C:\path\to\your-proxy-root-ca.pem"
npm run dev
```

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
