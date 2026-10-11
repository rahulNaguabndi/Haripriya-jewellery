-- ---------------------------------------------------------------------
-- 2026-10-10: re-pledge, interest waiver (grace override), item photos,
-- activity log. Idempotent - safe to re-run. Same SQL is appended to
-- db/schema.sql.
-- ---------------------------------------------------------------------

-- Re-pledge: a returning customer pledging the same ornaments again after
-- an earlier loan was closed. Unlike rollover (previous_loan_id), the old
-- loan was already closed on its own - this just links the new loan back
-- to the record its item details were copied from.
alter table public.loans add column if not exists repledged_from_loan_id uuid references public.loans(id);
create index if not exists idx_loans_repledged_from on public.loans (repledged_from_loan_id);

-- Interest waiver at closure/rollover: the system-calculated interest is
-- what staff quote; if the customer negotiates it down (e.g. closing a few
-- days after the 1-year compounding mark), the difference and the reason
-- are recorded instead of silently typing a smaller number.
alter table public.loans add column if not exists interest_calculated numeric;
alter table public.loans add column if not exists interest_waived numeric;
alter table public.loans add column if not exists interest_waiver_reason text;

-- Item photos. Files live in the private `loan-photos` Storage bucket,
-- compressed in the browser to ~100 KB WebP before upload. Rows are per
-- loan (a photo of the packet/ornaments), not per loan_items row, because
-- loan items are replaced wholesale on every loan edit. A re-pledge copies
-- the rows forward pointing at the same files.
create table if not exists public.loan_photos (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  storage_path text not null,
  content_type text not null default 'image/webp',
  size_bytes integer,
  width integer,
  height integer,
  caption text,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_loan_photos_loan_id on public.loan_photos (loan_id);
create index if not exists idx_loan_photos_path on public.loan_photos (storage_path);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('loan-photos', 'loan-photos', false, 524288, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;

-- Activity log: who did what, when. Written by the backend after every
-- money-changing or record-changing action; never updated or deleted.
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  actor_email text,
  actor_name text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  loan_id uuid references public.loans(id) on delete set null,
  borrower_id uuid references public.borrowers(id) on delete set null,
  summary text not null,
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_activity_log_created_at on public.activity_log (created_at desc);
create index if not exists idx_activity_log_loan_id on public.activity_log (loan_id);
create index if not exists idx_activity_log_borrower_id on public.activity_log (borrower_id);
create index if not exists idx_activity_log_actor_id on public.activity_log (actor_id);

alter table public.loan_photos enable row level security;
alter table public.activity_log enable row level security;
