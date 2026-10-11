-- ---------------------------------------------------------------------
-- 2026-10-11: multi-branch, end-of-day cash close, OTP check at release,
-- release-OTP / nightly-digest settings. Idempotent - safe to re-run.
-- Same SQL is appended to db/schema.sql.
-- ---------------------------------------------------------------------

-- Branches. One business, several shops: loans, payments, lockers and the
-- day's cash close belong to a branch; borrowers, rates and settings are
-- shared across the business (a customer can walk into any branch).
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  address text,
  phone text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
-- At most one default branch (where existing data and unassigned writes go).
create unique index if not exists uq_branches_one_default on public.branches (is_default) where is_default;

insert into public.branches (name, code, is_default)
select 'Main branch', 'MAIN', true
where not exists (select 1 from public.branches);

alter table public.loans add column if not exists branch_id uuid references public.branches(id);
alter table public.payments add column if not exists branch_id uuid references public.branches(id);
alter table public.lockers add column if not exists branch_id uuid references public.branches(id);
alter table public.activity_log add column if not exists branch_id uuid references public.branches(id);
-- Staff with a branch only see/act on that branch; null = all branches
-- (admins and super admins normally have none).
alter table public.admin_users add column if not exists branch_id uuid references public.branches(id);

-- Everything that existed before branches belongs to the default branch.
update public.loans set branch_id = (select id from public.branches where is_default) where branch_id is null;
update public.payments p set branch_id = l.branch_id from public.loans l where p.loan_id = l.id and p.branch_id is null;
update public.lockers set branch_id = (select id from public.branches where is_default) where branch_id is null;

create index if not exists idx_loans_branch_id on public.loans (branch_id);
create index if not exists idx_payments_branch_id on public.payments (branch_id);
create index if not exists idx_lockers_branch_id on public.lockers (branch_id);
create index if not exists idx_activity_log_branch_id on public.activity_log (branch_id);

-- End-of-day cash close: staff count the drawer, the app compares it with
-- what the day book says should be there. One close per branch per day;
-- figures are snapshotted so later edits to that day show up as drift.
create table if not exists public.cash_closes (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  close_date date not null,
  opening_cash numeric not null default 0,
  cash_in numeric not null default 0,
  cash_out numeric not null default 0,
  other_in numeric not null default 0,
  other_out numeric not null default 0,
  expected_cash numeric not null default 0,
  counted_cash numeric not null,
  variance numeric not null default 0,
  denominations jsonb,
  notes text,
  closed_by uuid references auth.users(id),
  closed_by_name text,
  closed_at timestamptz not null default now(),
  unique (branch_id, close_date)
);
create index if not exists idx_cash_closes_date on public.cash_closes (close_date desc);

-- OTP check before ornaments are handed back. Only a hash of the code is
-- stored; a code is single-use and expires after a few minutes.
create table if not exists public.release_otps (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  code_hash text not null,
  sent_to text,
  delivery_status text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  verified_at timestamptz,
  consumed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_release_otps_loan_id on public.release_otps (loan_id, created_at desc);

-- Business-wide switches.
alter table public.business_profile add column if not exists require_release_otp boolean not null default false;
alter table public.business_profile add column if not exists digest_emails text;

alter table public.branches enable row level security;
alter table public.cash_closes enable row level security;
alter table public.release_otps enable row level security;

drop policy if exists "authenticated read branches" on public.branches;
create policy "authenticated read branches" on public.branches
  for select using (auth.role() = 'authenticated');
