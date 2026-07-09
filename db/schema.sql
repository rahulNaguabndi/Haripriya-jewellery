-- Jewelry Lending Management Application
-- Supabase (Postgres) schema. Run this in the Supabase SQL editor.
-- Auth is handled by Supabase's built-in `auth.users` table; the tables
-- below reference it for ownership/audit fields.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Borrowers
-- ---------------------------------------------------------------------
create table if not exists public.borrowers (
  id uuid primary key default gen_random_uuid(),
  supabase_user_id uuid references auth.users(id),
  name text not null,
  phone text,
  email text,
  address text,
  city text,
  state text,
  pincode text,
  aadhar_or_id text,
  care_of text,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Care-of (C/O) field for borrowers created before this column existed.
alter table public.borrowers
  add column if not exists care_of text;

create index if not exists idx_borrowers_name on public.borrowers using gin (to_tsvector('simple', name));
create index if not exists idx_borrowers_is_deleted on public.borrowers (is_deleted);

-- ---------------------------------------------------------------------
-- Loans
-- ---------------------------------------------------------------------
create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  borrower_id uuid not null references public.borrowers(id) on delete restrict,
  loan_number text not null unique,

  -- Jewelry details
  item_type text not null,
  metal_type text not null,
  weight numeric,
  purity text,
  description text,

  -- Loan terms
  loan_amount numeric not null,
  loan_date date not null,
  due_date date,
  status text not null default 'active'
    check (status in ('active', 'closed', 'defaulted', 'partial_payment')),

  -- Interest configuration snapshot
  interest_rate numeric not null,
  interest_type text not null default 'compound_annual',

  -- Payment tracking (denormalized total; source of truth is `payments`)
  total_payment_received numeric not null default 0,

  -- Closure details, captured when status is set to 'closed'
  closure_date date,
  interest_collected numeric,

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Closure details for loans tables created before these columns existed.
alter table public.loans
  add column if not exists closure_date date;
alter table public.loans
  add column if not exists interest_collected numeric;

create index if not exists idx_loans_borrower_id on public.loans (borrower_id);
create index if not exists idx_loans_status on public.loans (status);
create index if not exists idx_loans_metal_type on public.loans (metal_type);
create index if not exists idx_loans_item_type on public.loans (item_type);
create index if not exists idx_loans_loan_amount on public.loans (loan_amount);

-- ---------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  borrower_id uuid not null references public.borrowers(id) on delete restrict,
  amount numeric not null,
  payment_date date not null,
  payment_type text not null default 'cash',
  notes text,
  is_deleted boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_payments_loan_id on public.payments (loan_id);
create index if not exists idx_payments_borrower_id on public.payments (borrower_id);
create index if not exists idx_payments_payment_date on public.payments (payment_date);
create index if not exists idx_payments_is_deleted on public.payments (is_deleted);

-- Keep loans.total_payment_received in sync with payments
create or replace function public.recalc_loan_total_payments()
returns trigger as $$
declare
  target_loan_id uuid;
begin
  target_loan_id := coalesce(new.loan_id, old.loan_id);

  update public.loans
  set total_payment_received = (
        select coalesce(sum(amount), 0)
        from public.payments
        where loan_id = target_loan_id and is_deleted = false
      ),
      updated_at = now()
  where id = target_loan_id;

  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_payments_recalc on public.payments;
create trigger trg_payments_recalc
after insert or update or delete on public.payments
for each row execute function public.recalc_loan_total_payments();

-- ---------------------------------------------------------------------
-- Interest configuration (admin settings)
-- ---------------------------------------------------------------------
create table if not exists public.interest_config (
  id uuid primary key default gen_random_uuid(),
  config_name text not null default 'default',
  is_active boolean not null default true,
  tiers jsonb not null default '[]'::jsonb,
  compounding_frequency text not null default 'annual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

-- Seed the default tier configuration described in the spec
insert into public.interest_config (config_name, is_active, tiers, compounding_frequency)
select 'default', true,
  '[
     {"minAmount": 0, "maxAmount": 999, "interestRate": 36, "description": "Small loans"},
     {"minAmount": 1000, "maxAmount": null, "interestRate": 24, "description": "Standard loans"}
   ]'::jsonb,
  'annual'
where not exists (select 1 from public.interest_config where config_name = 'default');

-- ---------------------------------------------------------------------
-- Admin users (mirrors Supabase auth users with app-level role info)
-- ---------------------------------------------------------------------
create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  supabase_user_id uuid not null unique references auth.users(id),
  email text not null,
  full_name text,
  role text not null default 'staff' check (role in ('super_admin', 'admin', 'staff')),
  is_active boolean not null default true,
  last_login timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- Per-user UI theme preference (mode + accent color), settable from Admin
-- Settings and persisted per admin_users row so it follows the user across
-- devices/sessions instead of only living in browser localStorage.
alter table public.admin_users
  add column if not exists theme_preference jsonb not null default '{"mode":"light","accent":"gold"}'::jsonb;

-- ---------------------------------------------------------------------
-- Row Level Security
-- The Express backend talks to Supabase using the service_role key, which
-- bypasses RLS entirely. RLS is enabled here as defense-in-depth in case
-- the anon/public key is ever used directly against these tables.
-- ---------------------------------------------------------------------
alter table public.borrowers enable row level security;
alter table public.loans enable row level security;
alter table public.payments enable row level security;
alter table public.interest_config enable row level security;
alter table public.admin_users enable row level security;

drop policy if exists "authenticated read borrowers" on public.borrowers;
create policy "authenticated read borrowers" on public.borrowers
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated read loans" on public.loans;
create policy "authenticated read loans" on public.loans
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated read payments" on public.payments;
create policy "authenticated read payments" on public.payments
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated read interest_config" on public.interest_config;
create policy "authenticated read interest_config" on public.interest_config
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated read admin_users" on public.admin_users;
create policy "authenticated read admin_users" on public.admin_users
  for select using (auth.role() = 'authenticated');

-- No insert/update/delete policies are defined for the anon/authenticated
-- roles: all writes go through the backend using the service_role key.
