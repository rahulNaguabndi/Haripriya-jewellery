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

-- Card given/returned tracking: staff issue a physical card with the loan
-- number, which must be collected back before the loan is closed.
alter table public.loans
  add column if not exists card_given boolean not null default false;
alter table public.loans
  add column if not exists card_returned boolean not null default false;

-- Snapshot of the day's locked metal rate (Rs/gram) at loan creation time -
-- used later to compute the loan's original coverage margin.
alter table public.loans
  add column if not exists metal_rate numeric;

-- Packet number: a fresh, physical-packet-tracking number distinct from
-- loan_number (which is date-based and resets daily, unsuitable for
-- bucketing into storage box ranges). Starts at 1001 per the business
-- owner's request; existing loans are intentionally left null - this is a
-- forward-only rollout, not a retrofit of already-labeled historical
-- packets.
create sequence if not exists public.loan_packet_number_seq start with 1001;
alter table public.loans
  add column if not exists packet_number bigint unique;
alter table public.loans
  alter column packet_number set default nextval('public.loan_packet_number_seq');

-- Rollover: closing a loan once interest is paid to date and opening a
-- brand-new loan for the same borrower/item is NOT the same as renewing
-- in place - it's a distinct new loan row that references the one it
-- replaced, for audit/history purposes.
alter table public.loans
  add column if not exists previous_loan_id uuid references public.loans(id);

create index if not exists idx_loans_previous_loan_id on public.loans (previous_loan_id);

create index if not exists idx_loans_borrower_id on public.loans (borrower_id);
create index if not exists idx_loans_status on public.loans (status);
create index if not exists idx_loans_metal_type on public.loans (metal_type);
create index if not exists idx_loans_item_type on public.loans (item_type);
create index if not exists idx_loans_loan_amount on public.loans (loan_amount);

-- ---------------------------------------------------------------------
-- Loan items - a loan can cover several pledged ornaments under one
-- amount/document (confirmed real business practice, not an edge case).
-- Replaces the single item_type/metal_type/weight/purity/description
-- columns on `loans` above, which are kept in place (unused going
-- forward) rather than dropped, to avoid a destructive column removal.
-- gross_weight is the item's full weight; net_weight is the metal-only
-- weight after excluding stones (only net_weight is used for valuation).
-- No check constraint on metal_type here (mirrors loans.metal_type,
-- which also has none) - some historical loans are metal_type
-- 'Platinum', which would fail a Gold/Silver-only constraint.
-- ---------------------------------------------------------------------
create table if not exists public.loan_items (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  item_type text not null,
  metal_type text not null,
  gross_weight numeric,
  net_weight numeric,
  purity text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_loan_items_loan_id on public.loan_items (loan_id);

-- One-time backfill: give every existing loan a single loan_items row
-- built from its legacy single-item columns (weight -> gross_weight;
-- net_weight left null, since the gross/net split wasn't recorded
-- before this feature). Idempotent - only inserts for loans that don't
-- already have at least one loan_items row, so safe to re-run.
insert into public.loan_items (loan_id, item_type, metal_type, gross_weight, net_weight, purity, description)
select l.id, l.item_type, l.metal_type, l.weight, null, l.purity, l.description
from public.loans l
where not exists (select 1 from public.loan_items li where li.loan_id = l.id);

-- item_type/metal_type were NOT NULL when a loan had exactly one item;
-- new loans no longer populate these (item data lives in loan_items now).
alter table public.loans alter column item_type drop not null;
alter table public.loans alter column metal_type drop not null;

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
-- Overdue notice configuration (admin settings)
-- Registered-post notices are sent at configurable month-thresholds after
-- the loan date (default 13/19/26/36 months); each notice adds a flat,
-- non-compounding cost to the amount owed.
-- ---------------------------------------------------------------------
create table if not exists public.notice_config (
  id uuid primary key default gen_random_uuid(),
  config_name text not null default 'default',
  is_active boolean not null default true,
  threshold_months jsonb not null default '[13, 19, 26, 36]'::jsonb,
  cost_amount numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.notice_config (config_name, is_active, threshold_months, cost_amount)
select 'default', true, '[13, 19, 26, 36]'::jsonb, 0
where not exists (select 1 from public.notice_config where config_name = 'default');

-- One row per notice actually sent for a loan. cost_charged snapshots
-- notice_config.cost_amount at send time, so later cost changes don't
-- retroactively alter historical notices.
create table if not exists public.loan_notices (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  threshold_month integer not null,
  sent_date date not null default current_date,
  cost_charged numeric not null default 0,
  sent_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (loan_id, threshold_month)
);

create index if not exists idx_loan_notices_loan_id on public.loan_notices (loan_id);

-- ---------------------------------------------------------------------
-- Daily metal rates - captured once per day per metal type (Rs/gram),
-- after the bullion market opens (~12:00 PM IST). Locked once set; only a
-- super_admin can override an already-set day's rate (enforced in the
-- backend, not here - the frontend confirms with the user before calling
-- the override).
-- ---------------------------------------------------------------------
create table if not exists public.daily_rates (
  id uuid primary key default gen_random_uuid(),
  rate_date date not null,
  metal_type text not null,
  rate_per_gram numeric not null,
  set_by uuid references auth.users(id),
  set_at timestamptz not null default now(),
  unique (rate_date, metal_type)
);

create index if not exists idx_daily_rates_date on public.daily_rates (rate_date);

-- ---------------------------------------------------------------------
-- Coverage/margin thresholds (admin settings). A loan's coverage ratio =
-- (item's current melt value at today's rate) / (principal + interest
-- currently owed). red_threshold and amber_threshold are the ratio
-- cutoffs used to flag under-covered loans for the quarterly review.
-- ---------------------------------------------------------------------
create table if not exists public.coverage_config (
  id uuid primary key default gen_random_uuid(),
  config_name text not null default 'default',
  is_active boolean not null default true,
  red_threshold numeric not null default 1.0,
  amber_threshold numeric not null default 1.1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.coverage_config (config_name, is_active, red_threshold, amber_threshold)
select 'default', true, 1.0, 1.1
where not exists (select 1 from public.coverage_config where config_name = 'default');

-- ---------------------------------------------------------------------
-- Storage: lockers and boxes. A locker is a named physical cabinet,
-- tagged with the metal type(s) it may hold (a locker can be Gold-only,
-- Silver-only, or both, since some cabinets house separate racks per
-- metal). A box lives inside one locker, is itself single-metal, has a
-- globally unique box_number, and covers a packet-number range - admin-
-- maintained by hand (not auto-computed), since boxes keep absorbing new
-- packets over time until manually reassigned during a reshuffle.
-- ---------------------------------------------------------------------
create table if not exists public.lockers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  metal_types jsonb not null default '[]'::jsonb,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.boxes (
  id uuid primary key default gen_random_uuid(),
  locker_id uuid not null references public.lockers(id) on delete restrict,
  box_number text not null unique,
  metal_type text not null check (metal_type in ('Gold', 'Silver')),
  range_start bigint,
  range_end bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create index if not exists idx_boxes_locker_id on public.boxes (locker_id);
create index if not exists idx_boxes_metal_type on public.boxes (metal_type);

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
-- Brand theme (whole-app color palette, editable by super_admin/admin)
-- Unlike admin_users.theme_preference (a personal light/dark + accent
-- pick), this is a single, deployment-wide palette so a jewelry/lending
-- business can rebrand the whole app's colors from Admin Settings without
-- a code change. Seeded with this app's current default palette (copied
-- verbatim from src/theme.css) so a fresh deployment looks unchanged.
-- ---------------------------------------------------------------------
create table if not exists public.brand_theme (
  id uuid primary key default gen_random_uuid(),
  is_active boolean not null default true,
  colors jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.brand_theme (is_active, colors)
select true,
  '{
     "light": {
       "bg": "#F7F1E6", "surface": "#FFFCF5", "border": "#E6D8BC",
       "divider": "#EFE3C9", "hover": "#F3EAD6", "text": "#20160F",
       "textMuted": "#8A7B5E", "text3": "#5A4630", "ink": "#16130F",
       "inkHover": "#2a2119", "danger": "#b3413a", "dangerSoft": "#fbeceb",
       "success": "#3f7d4f", "successSoft": "#eaf5ec", "warning": "#8a6512",
       "warningSoft": "#fff3d6", "gold": "#CBA45C", "goldDeep": "#B78C3C"
     },
     "dark": {
       "bg": "#14110D", "surface": "#1E1A13", "border": "#362E22",
       "divider": "#2A231A", "hover": "#29221A", "text": "#F3E9D2",
       "textMuted": "#A2916F", "text3": "#C9B89A", "ink": "#0F0C08",
       "inkHover": "#1c170f", "danger": "#b3413a", "dangerSoft": "#2a1512",
       "success": "#3f7d4f", "successSoft": "#12261a", "warning": "#e0b563",
       "warningSoft": "#332a12", "gold": "#CBA45C", "goldDeep": "#D2B36A"
     }
   }'::jsonb
where not exists (select 1 from public.brand_theme where is_active = true);

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
alter table public.brand_theme enable row level security;
alter table public.notice_config enable row level security;
alter table public.loan_notices enable row level security;
alter table public.daily_rates enable row level security;
alter table public.coverage_config enable row level security;
alter table public.lockers enable row level security;
alter table public.boxes enable row level security;
alter table public.loan_items enable row level security;

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

-- brand_theme is readable by anyone (including anon/pre-login), since the
-- login page itself needs to render with the deployment's branding.
drop policy if exists "public read brand_theme" on public.brand_theme;
create policy "public read brand_theme" on public.brand_theme
  for select using (true);

drop policy if exists "authenticated read notice_config" on public.notice_config;
create policy "authenticated read notice_config" on public.notice_config
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated read loan_notices" on public.loan_notices;
create policy "authenticated read loan_notices" on public.loan_notices
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated read daily_rates" on public.daily_rates;
create policy "authenticated read daily_rates" on public.daily_rates
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated read coverage_config" on public.coverage_config;
create policy "authenticated read coverage_config" on public.coverage_config
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated read lockers" on public.lockers;
create policy "authenticated read lockers" on public.lockers
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated read boxes" on public.boxes;
create policy "authenticated read boxes" on public.boxes
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated read loan_items" on public.loan_items;
create policy "authenticated read loan_items" on public.loan_items
  for select using (auth.role() = 'authenticated');

-- No insert/update/delete policies are defined for the anon/authenticated
-- roles: all writes go through the backend using the service_role key.
