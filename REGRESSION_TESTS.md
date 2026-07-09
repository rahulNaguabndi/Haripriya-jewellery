# Regression Test Scenarios — Haripriya Jewels Lending App

Reference checklist for manual (or Claude-driven) regression passes. When asked to
"run regression," work through each scenario below against the running app
(`backend` on :4100, `frontend` on :5173), using the preview browser tools.
Check console errors and failed network requests after every write action, not
just the visible UI state.

## Test accounts
- **super_admin**: your Supabase login (created in Supabase Auth + `admin_users`).
- **staff**: see `backend/TEST_USERS.local.md` (git-ignored) — create via a
  one-off script using the service-role key if the file is missing or the user
  no longer exists (`supabase.auth.admin.createUser` + insert into `admin_users`
  with `role: 'staff'`). Confirm with the user before creating/recreating a live
  auth account.
- If a 2nd tier ("admin", not super_admin) account is needed for a scenario,
  create the same way with `role: 'admin'`.

## Setup checklist before starting
1. Start both servers (`preview_start` for `backend` and `frontend` configs in
   `.claude/launch.json`).
2. Confirm no errors in `preview_logs` for both servers.
3. Open the frontend and confirm the login page renders.

---

## 1. Authentication & session

| ID | Scenario | Steps | Expected result |
|----|----------|-------|------------------|
| AUTH-1 | Valid login | Enter super_admin email/password, submit | Redirects to `/dashboard`; nav shows user's email and "Sign out" |
| AUTH-2 | Invalid login | Submit wrong password | Error message shown; stays on `/login`; no navigation |
| AUTH-3 | Protected route redirect | While logged out, navigate directly to `/dashboard`, `/loans`, `/admin/settings`, etc. | Redirects to `/login` for every protected route |
| AUTH-4 | Session persists on reload | Log in, reload the page | Stays logged in (session restored from Supabase), lands back on the same route |
| AUTH-5 | Sign out | Click "Sign out" | Redirects to `/login`; subsequent visit to any protected route redirects back to login |
| AUTH-6 | Staff login | Log in with staff test account | Succeeds; dashboard/nav identical to super_admin except Admin Settings restrictions (see RBAC section) |

## 2. Dashboard

| ID | Scenario | Steps | Expected result |
|----|----------|-------|------------------|
| DASH-1 | Stats load | Load `/dashboard` | Total Loans, Active Loans, Total Borrowers, Outstanding Principal, Outstanding Interest all render numeric/currency values, no `NaN`/`undefined` |
| DASH-2 | Recent payments | Check "Recent Payments" panel | Shows most recent payments across all loans, borrower name + loan number + date + amount; "View all" links to `/payments` |
| DASH-3 | Empty state | (Optional, only if a fresh DB is available) | Stats show zeros, no crash, "Recent Payments" shows an empty state instead of erroring |

## 3. Borrowers

| ID | Scenario | Steps | Expected result |
|----|----------|-------|------------------|
| BOR-1 | List loads | Navigate to `/borrowers` | Table renders with Name/Phone/Email/City columns |
| BOR-2 | Search | Type a partial name into "Search by name…" | List filters to matching borrowers only |
| BOR-3 | Create borrower | Click "+ New Borrower", fill Name (required) + optional fields, Save | Modal closes; new borrower appears in list immediately with correct field values |
| BOR-4 | Create borrower — validation | Click "+ New Borrower", leave Name blank, try Save | Browser/HTML5 validation blocks submit (required field) |
| BOR-5 | Borrower detail | Click a borrower row | Navigates to `/borrowers/:id`; shows borrower info + their loans table + "+ New Loan" button |
| BOR-6 | Edit borrower | From detail page, click "Edit", change a field, Save | Detail view reflects updated value immediately |
| BOR-7 | New loan from borrower detail | From a borrower's detail page, click "+ New Loan" | Modal opens with **no borrower dropdown** (borrower is implicit); saving creates a loan tied to that borrower and it appears in their loan list |

## 4. Loans

| ID | Scenario | Steps | Expected result |
|----|----------|-------|------------------|
| LOAN-1 | List loads | Navigate to `/loans` | Table renders: Loan #, Borrower, Item, Metal, Amount, Loan Date, Status |
| LOAN-2 | Filters | Set Status/Metal Type/Item Type/Min/Max Amount filters | List updates to match; "Reset" clears all filters back to full list |
| LOAN-3 | Create loan (existing borrower) | Click "+ New Loan" from `/loans`, select an existing borrower from the dropdown, fill required fields, Save | Loan appears in list with auto-generated loan number `LOAN-YYYYMMDD-NNN`, correct borrower, status `Active` |
| LOAN-4 | **Create loan + inline new borrower** | Click "+ New Loan", click "+ New Borrower" next to the Borrower dropdown, fill borrower Name (+ optional fields), Save the borrower modal | Borrower modal closes; borrower dropdown auto-selects the newly created borrower (no manual re-selection needed); borrower list (fetched fresh) includes it |
| LOAN-5 | Complete inline-borrower loan creation | Continuing LOAN-4: fill remaining loan fields (amount required), Save | Loan created successfully tied to the new borrower; appears in both `/loans` and that borrower's detail page |
| LOAN-6 | Loan detail | Click a loan row | Navigates to `/loans/:id`; shows loan header (amount, dates, total received, status), Interest Summary card, Payment History table |
| LOAN-7 | Edit loan | From detail page, click "Edit" | Modal opens with existing values pre-filled, **borrower field disabled** (cannot reassign borrower on edit); Save updates the loan |
| LOAN-8 | Status change | On detail page, change the status dropdown (active/partial_payment/closed/defaulted) | Status updates immediately via `PATCH /loans/:id/status`; badge reflects new status |
| LOAN-9 | New loan validation | Try to Save without selecting a borrower or entering a loan amount | Required-field validation blocks submit |

## 5. Payments

| ID | Scenario | Steps | Expected result |
|----|----------|-------|------------------|
| PAY-1 | Record payment | On a loan detail page, click "+ Add Payment", enter amount/date/type/notes, Save | `POST /api/payments` returns 201; modal closes; Payment History table shows the new row; loan's "Total Received" increases; Interest Summary's Principal Remaining decreases by the payment amount |
| PAY-2 | Payment validation | Try to Save with no amount | Required-field validation blocks submit |
| PAY-3 | Payments list | Navigate to `/payments` | Shows all payments across all loans: Date, Borrower, Loan #, Amount, Type, Notes |
| PAY-4 | Payments date filter | Set From/To date range | List filters to payments within range; "Reset" clears it |
| PAY-5 | Payment triggers status change | Record a payment that fully covers principal + interest on an `active` loan | Loan status auto-updates to `closed` (or `partial_payment` if only partially paid) |

## 6. Interest calculation & breakdown popover

Reference implementation: `backend/src/utils/interestCalculator.js`,
`frontend/src/components/common/InterestSummaryCard.jsx`.

| ID | Scenario | Steps | Expected result |
|----|----------|-------|------------------|
| INT-1 | Summary numbers render | Open any loan detail page | Interest Summary card shows Principal remaining, Interest accrued, Total amount due, Applied interest rate, Days elapsed — all numeric, no `NaN` |
| INT-2 | Info icon position | Inspect the card | "i" icon is absolutely positioned top-right of the card (not inline with the title) |
| INT-3 | Popover opens/closes | Click the info icon | Popover appears below the icon with "How this loan's interest was calculated"; clicking outside the popover (the fixed overlay) closes it; clicking the icon again toggles it closed |
| INT-4 | Breakdown — single short segment (<1 year, no payments) | Open a freshly created loan (few days old, no payments) | Popover shows one "Since loan start" section with one or more "Month N" chunks whose `interest` values sum to the loan's `totalInterestAccrued` |
| INT-5 | Breakdown — multiple payment segments | Open a loan with 2+ payments (e.g. `LOAN-20260706-001` in current test data) | Popover shows a segment per payment ("Until payment of X on date") plus a final "Since last payment" segment; each new segment's opening balance = previous segment's remaining principal **minus the payment amount** (not increased by unpaid interest — interest is tracked separately, not capitalized across payments) |
| INT-6 | **Breakdown — loan spanning >1 year, no payments in year 1** | Open a loan dated >365 days ago (e.g. `LOAN-20260708-002`, dated 7 Jan 2025) | First chunk is "Year 1": `interest = openingBalance × rate%`, `closingBalance = openingBalance + interest`; note text explicitly says interest was "added to principal for Year 2"; next chunk ("Year 2, Month 1" or similar) uses that closing balance as its opening balance, proving Year 2 compounds on (principal + Year 1 interest) |
| INT-7 | Breakdown — loan spanning >2 years | Manually verify (or construct a test loan dated >730 days ago) | Multiple sequential "Year N" chunks appear before dropping into month chunks for the remainder, each compounding on the prior year's closing balance |
| INT-8 | Breakdown totals reconcile | For any loan, sum every chunk's `interest` field from `GET /api/loans/:id` → `interest.breakdown` | Sum equals `interest.totalInterestAccrued` within ±0.01 (rounding tolerance from independently-rounded display chunks) |
| INT-9 | No-accrual state | Open a loan created today with `daysElapsed` effectively 0 | Popover shows "No interest has accrued yet." instead of an empty/broken breakdown |
| INT-10 | Popover scroll | Open the popover on a loan with a long breakdown (many chunks) | Popover content scrolls internally (`max-height` + `overflow-y: auto`) rather than overflowing the page |

## 7. Reports

| ID | Scenario | Steps | Expected result |
|----|----------|-------|------------------|
| REP-1 | Outstanding Interest tab | Navigate to `/reports` (default tab) | Table: Loan #, Borrower, Principal, Principal Remaining, Interest Accrued, Total Due, Due Date, Status — for all non-closed loans |
| REP-2 | Overdue Loans tab | Click "Overdue Loans" | Shows only loans past their due date; "No records found." if none |
| REP-3 | Closed Loans tab | Click "Closed Loans" | Shows only loans with status `closed`; "No records found." if none |
| REP-4 | Borrower Summary tab | Click "Borrower Summary" | Table: Borrower, Total Loans, Active Loans, Total Loan Amount, Total Outstanding — aggregated correctly per borrower |

## 8. Admin Settings & role-based access control (RBAC)

| ID | Scenario | Steps | Expected result |
|----|----------|-------|------------------|
| ADM-1 | Super admin — interest tiers editable | Log in as super_admin, go to `/admin/settings` | Interest tier rows show editable Min/Max/Rate/Description inputs, "+ Add Tier", "Save Tiers" buttons |
| ADM-2 | Super admin — admin users management | Same page | "+ New Admin User" button visible; each user row has a "Deactivate"/"Activate" toggle |
| ADM-3 | **Staff — interest tiers read-only** | Log in as staff, go to `/admin/settings` | Tier values render as plain text/disabled inputs; message "Only admin / super admin roles can edit interest tiers." shown; no Save/Add/Remove controls |
| ADM-4 | **Staff — no admin user management UI** | Same page | No "+ New Admin User" button; no "Deactivate" controls on the user list |
| ADM-5 | **Backend enforces RBAC independent of UI** | As staff, call `POST /api/admin/users` directly (with the staff JWT) attempting to create a `super_admin` account | Returns `403 { error: 'Insufficient permissions' }` — proves `requireRole()` middleware gates the real endpoint, not just hidden buttons |
| ADM-6 | Backend enforces interest-config RBAC | (Verify by code inspection unless a disposable tier config exists) `backend/src/routes/admin.js` `PUT /config/interest` uses `requireRole('super_admin', 'admin')` | Staff calling this endpoint directly should also get 403 — **do not test this against production tier data**; only run with a throwaway/reversible payload or via code review |
| ADM-7 | New admin user creation (super_admin only) | As super_admin, click "+ New Admin User", fill form, Save | New user appears in the Admin Users list with correct role and Active status |
| ADM-8 | Deactivate/reactivate admin user | As super_admin, click "Deactivate" on a non-self user, then reactivate | Status toggles; a deactivated user should fail login or lose access (spot check if feasible) |

## 9. Dark mode

Reference implementation: `frontend/src/theme.css` (`html[data-theme='dark']`
variables), `frontend/src/context/ThemeContext.jsx`, `frontend/src/components/common/ThemeToggle.jsx`.

| ID | Scenario | Steps | Expected result |
|----|----------|-------|------------------|
| DARK-1 | Toggle visible | Load any page (logged in or on `/login`) | 🌙/☀️ toggle button visible — top-right of the login card, and in the main nav bar next to "Sign out" when logged in |
| DARK-2 | Toggle switches theme | Click the toggle | `document.documentElement.dataset.theme` flips between `light`/`dark`; button icon and `aria-label` flip accordingly (🌙 "Switch to dark mode" ↔ ☀️ "Switch to light mode") |
| DARK-3 | Colors actually update | After toggling to dark, inspect `.card`, `.badge-partial_payment`, nav, inputs | Backgrounds/borders/text switch to the dark palette values defined in `theme.css` (e.g. `.card` background → `#1E1A13`) — verify via `preview_inspect` computed styles, not just visual screenshot (see note below) |
| DARK-4 | Persistence across reload | Toggle to dark, reload the page | Theme stays dark (read from `localStorage['haripriya-theme']`) instead of resetting to light |
| DARK-5 | Persistence across login/logout | Toggle to dark while logged in, sign out | Login page still renders in dark mode (theme is app-wide, not tied to auth state) |
| DARK-6 | First-visit default | Clear `localStorage`, reload | Theme defaults to the OS/browser `prefers-color-scheme` (dark if system is dark, light otherwise) |
| DARK-7 | No unstyled/hardcoded-color regressions | Spot check Reports tabs, status badges, buttons in dark mode | No element still shows a hardcoded light-only color (e.g. white text on white background) — if found, check for literal hex/rgb values in that component instead of `var(--...)` |

> **Known environment quirk (not an app bug):** in headless/CDP-controlled preview
> browsers, if the tab is backgrounded (`document.hidden === true`), `body`'s
> `transition: background 0.2s` can appear "stuck" on the old color when read via
> `getComputedStyle` or `preview_eval`, even though the underlying CSS variables
> and every other element (`.card`, badges, etc.) update correctly. Don't
> misdiagnose this as a broken toggle — verify with `preview_inspect` on a
> non-`body` element (e.g. `.card`) before concluding dark mode is broken.

## 10. Cross-cutting checks (run for every write-action scenario above)

- `preview_console_logs` (level `error`) — no new errors after the action.
- `preview_network` (filter `failed`) — no new failed requests (4xx/5xx) other than ones intentionally testing permission denial (e.g. ADM-5).
- `preview_logs` on the backend server — no unhandled exceptions/stack traces.
- Currency values render via `formatCurrency` (₹, 2 decimals) and dates via `formatDate` (no raw ISO strings leaking into the UI).

## 10a. Pagination (server-side)

Reference: `page`/`limit`/`total` params on `GET /api/borrowers`,
`/api/borrowers/search`, `/api/loans`, `/api/payments`;
`frontend/src/components/common/Pagination.jsx`.

| ID | Scenario | Steps | Expected result |
|----|----------|-------|------------------|
| PAGE-1 | Borrowers list paginated | Load `/borrowers` with 1000+ seeded borrowers | 20 rows shown, footer reads "N total · Page 1 of M"; Next/Prev advance pages and refetch from the server (`page` query param changes) |
| PAGE-2 | Borrower search paginated | Search a common first name (e.g. "Kabir") | Results are capped at 20/page with the same Prev/Next controls, not one giant unbounded list |
| PAGE-3 | Loans list paginated | Load `/loans` | Same pattern; changing a filter resets back to page 1 |
| PAGE-4 | Payments list paginated | Load `/payments` | Same pattern; changing the date filter resets back to page 1 |
| PAGE-5 | New Loan borrower search | Open "+ New Loan", type a partial name in the Borrower field | Debounced `/borrowers/search` call returns a dropdown of matches (not a single unbounded `<select>` of only the first 100 borrowers) |

## 10b. Dashboard parallel tiles

Reference: `backend/src/routes/reports.js` (`/reports/dashboard/*`), `frontend/src/pages/Dashboard.jsx`.

| ID | Scenario | Steps | Expected result |
|----|----------|-------|------------------|
| DASH2-1 | Independent tile loads | Load `/dashboard`, inspect network requests | 4 separate requests fire in parallel: `loan-counts`, `borrower-count`, `outstanding-totals`, `recent-payments` — not one combined `/summary` call |
| DASH2-2 | Partial failure isolation | (Hard to simulate live) Confirm in code that each tile has its own try/catch and loading state | If one endpoint fails, only that tile/card shows a dash/error, the rest of the dashboard still renders |

## 10c. Borrower detail loans table

Reference: `backend/src/controllers/borrowerController.js` (`getBorrower`), `frontend/src/pages/BorrowerDetail.jsx`.

| ID | Scenario | Steps | Expected result |
|----|----------|-------|------------------|
| BDET-1 | Interest column present | Open any borrower with loans | Loans table includes an "Interest Accrued" column with a correctly formatted currency value per loan |
| BDET-2 | All/Active/Closed toggle | Click each of the three filter buttons above the loans table | "All" shows every loan; "Active" shows only `active`/`partial_payment`; "Closed" shows only `closed`/`defaulted`; empty filter states show "No loans match this filter." (vs. "No loans yet." when the borrower truly has none) |

## 10d. Theme accent color (DB-persisted)

Reference: `db/schema.sql` (`admin_users.theme_preference`), `backend/src/controllers/adminController.js`
(`updateMyTheme`), `frontend/src/context/ThemeContext.jsx`, `frontend/src/theme/accents.js`,
Admin Settings → Appearance card.

> **Requires a one-time manual migration** — run this in the Supabase SQL editor
> before these scenarios can pass persistence checks:
> ```sql
> alter table public.admin_users
>   add column if not exists theme_preference jsonb not null default '{"mode":"light","accent":"gold"}'::jsonb;
> ```

| ID | Scenario | Steps | Expected result |
|----|----------|-------|------------------|
| THEME-1 | Accent swatches visible | Go to Admin Settings → Appearance | 4 swatches (Gold, Ruby, Emerald, Sapphire) plus Light/Dark mode buttons |
| THEME-2 | Accent applies live | Click a non-default swatch (e.g. Ruby) | `--gold`/`--gold-deep` CSS variables update immediately; buttons/links/focus rings reflect the new accent in both light and dark mode |
| THEME-3 | Accent persists to DB | After picking an accent, call `GET /api/auth/me` | `adminProfile.theme_preference` reflects `{ mode, accent }` matching the choice (requires the migration above to have been run — otherwise expect a 400 "Could not find the 'theme_preference' column" error, which is the expected pre-migration state, not a new bug) |
| THEME-4 | Preference follows the user across sessions | Set an accent, sign out, sign back in (same or different browser) | On login, `ThemeProvider` fetches `/auth/me` and applies the saved `{mode, accent}`, overriding whatever was in `localStorage` |
| THEME-5 | Graceful degradation without migration | With the migration NOT applied, toggle mode/accent | UI still applies the change live (localStorage-backed); the failed save is swallowed silently — no user-facing crash, just no cross-session persistence yet |

## 11. Regression run report format

When asked to "run regression," produce a summary table: ID, Pass/Fail, one-line
note. Call out any scenario that couldn't be run (e.g. missing test data, no
overdue loans to test REP-2) rather than skipping silently. Flag any newly
introduced console/network errors even if the visible behavior looked correct.
