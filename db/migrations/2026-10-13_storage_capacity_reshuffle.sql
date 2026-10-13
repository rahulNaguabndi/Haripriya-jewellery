-- ---------------------------------------------------------------------
-- 2026-10-13: storage capacity, occupancy history and reshuffle log.
-- Idempotent - safe to re-run. Same SQL is appended to db/schema.sql.
-- ---------------------------------------------------------------------

-- Starting guess for how many packets fit in one box. Only used until the
-- app has learned real figures (boxes marked full during a reshuffle, or
-- boxes that were set up before they filled and have since been sealed).
alter table public.business_profile add column if not exists default_box_capacity integer not null default 20;

-- One row per staff-confirmed box range change during a reshuffle. Staff
-- move the lowest packets of the next box into a box with space, then
-- enter the box's new start/end; following boxes are trimmed to match
-- (stored in `adjusted` as [{boxId, boxNumber, from:[s,e], to:[s,e]|null}]).
create table if not exists public.box_reshuffles (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id),
  box_id uuid not null references public.boxes(id) on delete cascade,
  box_number text not null,
  metal_type text not null,
  old_start bigint,
  old_end bigint,
  new_start bigint,
  new_end bigint,
  packets_before integer not null default 0,
  packets_after integer not null default 0,
  -- Staff confirmed the box is physically full: packets_after is then a
  -- real capacity sample for the estimate.
  box_full boolean not null default false,
  adjusted jsonb not null default '[]'::jsonb,
  notes text,
  created_by uuid references auth.users(id),
  created_by_name text,
  created_at timestamptz not null default now()
);
create index if not exists idx_box_reshuffles_box_id on public.box_reshuffles (box_id, created_at);
create index if not exists idx_box_reshuffles_created_at on public.box_reshuffles (created_at desc);

-- Nightly occupancy snapshot per branch and metal (taken by the digest
-- job). Box set-up and reshuffles can't be reconstructed later, so this is
-- the history of capacity; packets-in-storage alone is rebuilt from loans.
create table if not exists public.storage_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  branch_id uuid references public.branches(id),
  metal_type text not null,
  packets_in_storage integer not null default 0,
  boxes_in_use integer not null default 0,
  box_slots integer,
  est_box_capacity integer,
  headroom integer,
  boxes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_storage_snapshots_day on public.storage_snapshots (snapshot_date, branch_id, metal_type);

alter table public.box_reshuffles enable row level security;
alter table public.storage_snapshots enable row level security;
