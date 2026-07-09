# Haripriya Jewels — Lending Management Application

Full-stack jewelry lending management app: borrower & loan tracking, tiered
compound interest calculation, partial payments, and reporting. Built per
[JEWELRY_LENDING_APP_SPEC.md](JEWELRY_LENDING_APP_SPEC.md), using **Supabase**
(Postgres + Auth) instead of MongoDB for both the database and admin login.

## Stack
- **Frontend**: React (Vite), react-router-dom, supabase-js (auth), axios
- **Backend**: Node.js + Express, @supabase/supabase-js (service role)
- **Database & Auth**: Supabase (Postgres)

## 1. Set up Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run [db/schema.sql](db/schema.sql) — this creates
   the `borrowers`, `loans`, `payments`, `interest_config`, and `admin_users`
   tables, RLS policies, and seeds the default interest tiers.
3. In **Authentication → Users**, create your first staff/admin login
   (email + password).
4. Manually insert a matching row into `admin_users` for that user so they
   have a role (super_admin/admin/staff) — e.g.:
   ```sql
   insert into admin_users (supabase_user_id, email, full_name, role)
   values ('<auth-user-uuid>', 'you@example.com', 'Your Name', 'super_admin');
   ```
   After that, super admins can create additional staff via the Admin
   Settings page.
5. From **Project Settings → API**, grab the `Project URL`, `anon public`
   key, and `service_role` key for the env files below.

## 2. Configure environment variables
```
backend/.env    (copy from backend/.env.example)
frontend/.env   (copy from frontend/.env.example)
```
- `backend/.env` needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (server-side only — never expose this key to the frontend).
- `frontend/.env` needs `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (safe for the browser) and `VITE_API_BASE_URL` pointing at the backend.

## 3. Install & run
```bash
# Backend
cd backend
npm install
npm run dev      # http://localhost:4100

# Frontend (separate terminal)
cd frontend
npm install
npm run dev       # http://localhost:5173
```

> **Behind a TLS-inspecting corporate proxy (e.g. Zscaler)?** Both `npm install`
> and the backend's outbound calls to Supabase will fail with
> `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` unless Node trusts your proxy's root CA.
> Export it once (PowerShell) and point `NODE_EXTRA_CA_CERTS` at it —
> **this must be set in the shell before `npm`/`node` starts**; setting it
> inside `.env` does not work, since Node reads it during process bootstrap:
> ```powershell
> $env:NODE_EXTRA_CA_CERTS = "C:\path\to\your-proxy-root-ca.pem"
> npm run dev
> ```

Sign in at `http://localhost:5173/login` with the staff account created in
step 1.

## Project structure
```
backend/    Express API (routes, controllers, interest calculator, auth middleware)
frontend/   React app (pages, components, Supabase auth context)
db/         schema.sql — run once in the Supabase SQL editor
```

## Notes
- All CRUD writes go through the Express API using the Supabase
  service-role key; the frontend only talks to Supabase directly for
  login/logout/session (RLS locks down direct table writes from the browser).
- Interest is calculated dynamically on read (not pre-stored) using
  compound annual interest, re-evaluating the applicable tier after each
  partial payment — see `backend/src/utils/interestCalculator.js`.
- Loan status auto-updates to `partial_payment` / `closed` as payments are
  recorded, based on the calculated amount due.
