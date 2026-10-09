-- =====================================================================
-- 2026-10-09: accounts export, locker visualiser, village/district
-- demographics, WhatsApp/SMS messaging, HUID, printable pledge form.
-- Idempotent - safe to paste into the Supabase SQL editor more than once.
-- (Also appended verbatim to db/schema.sql.)
-- =====================================================================

-- Borrower location hierarchy for the demographics view. `city` stays as-is
-- (town/postal locality); village -> mandal/taluk -> district -> state is
-- the hierarchy the demographics report rolls up by.
alter table public.borrowers add column if not exists village text;
alter table public.borrowers add column if not exists mandal text;
alter table public.borrowers add column if not exists district text;
create index if not exists idx_borrowers_district on public.borrowers (district);
create index if not exists idx_borrowers_village on public.borrowers (village);

-- HUID (Hallmark Unique ID): 6-char alphanumeric code BIS laser-marks on
-- hallmarked gold (and, since Sep 2025, silver) articles. BIS offers no
-- public lookup API - verification is done by staff in the BIS CARE app
-- ("Verify HUID"), and the outcome is recorded here.
alter table public.loan_items add column if not exists huid text;
alter table public.loan_items add column if not exists huid_verified_at timestamptz;
alter table public.loan_items add column if not exists huid_verified_by uuid references auth.users(id);
alter table public.loan_items add column if not exists huid_verification_note text;
create index if not exists idx_loan_items_huid on public.loan_items (huid);

-- Locker capacity: how many box slots the cabinet physically holds, so the
-- visual locker view can draw empty slots alongside the configured boxes.
-- Nullable = "unknown, just draw the boxes that exist".
alter table public.lockers add column if not exists box_capacity integer;

-- Business profile: legal name/address/licence printed on the pledge form
-- and quoted in WhatsApp/SMS notices. Single active row, admin-editable.
create table if not exists public.business_profile (
  id uuid primary key default gen_random_uuid(),
  is_active boolean not null default true,
  legal_name text not null,
  trade_name text,
  address text,
  phone text,
  email text,
  licence_number text,
  gstin text,
  jurisdiction text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.business_profile (is_active, legal_name, trade_name)
select true, 'Haripriya Jewels', 'Haripriya Jewels'
where not exists (select 1 from public.business_profile where is_active = true);

-- Outbound WhatsApp/SMS log. One row per message attempt (including
-- attempts skipped because the provider isn't configured yet), so staff
-- can see who was contacted, when, on which channel, and what happened.
create table if not exists public.message_log (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid references public.loans(id) on delete set null,
  borrower_id uuid references public.borrowers(id) on delete set null,
  channel text not null check (channel in ('whatsapp', 'sms')),
  template text not null,
  to_phone text,
  body text not null,
  status text not null check (status in ('sent', 'failed', 'not_configured', 'skipped')),
  provider_message_id text,
  error text,
  sent_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_message_log_loan_id on public.message_log (loan_id);
create index if not exists idx_message_log_created_at on public.message_log (created_at);

alter table public.business_profile enable row level security;
alter table public.message_log enable row level security;
