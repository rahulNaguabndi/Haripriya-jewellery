# Business Process vs. App: Gap Analysis

Captured from a stakeholder interview about how loan dispatch, interest,
lifecycle, and storage actually work in the physical business (Haripriya
Jewels), compared against what `Haripriya Finance Application` currently
implements. Purpose: identify every place the app diverges from real
practice or is simply missing a feature, so gaps can be fixed one at a time
in priority order.

**Stated priority order (from the business owner):**
1. Accurate, configurable interest + notice calculation matching real rules.
2. Locker/box-range lookup system (packet → box → locker, with metal-type
   and number-range restrictions).
3. Everything else below, to be sequenced by the business owner as each
   prior item is fixed and deployed.
4. **Deliberately deferred, out of scope for now:** migrating the historical
   Access-DB data into Supabase, and the broader accounting/tax/audit
   automation + 8-year archival requirement. These are real, confirmed future
   needs — just not what to build next.

---

## Open questions (not yet resolved — do not assume answers)

- **Partial-payment worked example**: business owner still owes a concrete
  numeric example (real dates + amounts) for how a mid-loan partial payment
  nets out against interest on the original principal. Needed to verify
  whether the app's segment-based recompute produces the same total payable
  as the real-world method (see Interest section below).
- **KDM / known-customer loan % bump**: confirmed to raise the loan
  percentage offered, but not confirmed to be a fixed/quantifiable bump
  (e.g. "+10%") vs. pure case-by-case judgment.
- **Repeat-pledge item lookup**: confirmed practice is to match a returning
  item against a prior record (weight + description) instead of re-doing an
  acid test — but whether this lookup is already done via the desktop app or
  purely from memory/paper is unconfirmed. Given no other lookup tooling
  exists today, likely manual — needs confirming before designing a fix.
- **Notice suppression rule**: partial payments suppress the scheduled
  overdue notice *unless* the loan is still under-covered on margin — this
  exception is explicitly "under discussion," not a settled rule yet.
- **Auctioning authority name**: recorded generically as "government-approved
  pawnbroker auction" — exact scheme/authority name not yet given.
- **Post-year-1 compounding grace window** (~7 days, negotiable): unclear
  whether this should become a soft override control in the app, or stay a
  manual/off-system judgment call never encoded as a rule.

---

## A. Valuation & pricing

**Real process:**
- Daily metal rate sourced from bullion apps + WhatsApp live-rate groups;
  market opens 12:00 PM IST; the rate is captured once at open and **locked
  for the entire day**.
- Loan % offered (50–65%) is judgment-based with real factors: **KDM gold**
  attracts a higher %, a **known-customer** relationship raises it, and for
  silver the **brand/company** matters (e.g. BSP *pattilu* yields better than
  KSV).
- Silver melt yield lives in the appraiser's head; a quick-reference lookup
  table would help, but must stay **editable** — items vary (e.g.
  accumulated dust adds deceptive weight, judged by eye).
- **Acid test** used when purity is doubtful; skipped for **repeat customers
  re-mortgaging the same item**, where the item is instead matched against
  its prior record (weight + description).
- **Coverage/margin monitoring (new concept, not built anywhere):** the
  metal rate used for each loan should be stored, so that as rates move over
  time, a loan's current (principal + accrued interest) can be compared
  against the item's *today's* melt value. If margin erodes past a
  threshold, the loan should be flagged into a risk category — purely a
  flag/surface, the auction/hold decision stays with the admin. This feeds
  directly into the quarterly hold-vs-auction review described in Lifecycle
  below.

**Current app:**
- No metal-rate field exists anywhere on `loans` (confirmed via code
  search — no `metal_rate`/`gold_rate`/`rate_per_gram` column).
- No coverage/margin calculation, no risk flagging, no periodic re-evaluation
  of any kind.
- No silver-yield lookup table exists.

**Gap:** Entirely missing. Needs: a rate-capture mechanism (daily, admin- or
staff-entered), a `metal_rate` snapshot stored per loan, and a coverage/margin
computation (against the *current* stored rate) surfaced per loan and in
aggregate — likely a dashboard view of "at-risk" loans for the quarterly
review process.

---

## B. Interest

**Real process:**
- Tiers: **≥ ₹1000 → 24%/year (2%/month)**; **< ₹1000 → 36%/year
  (3%/month)**. Tiers must be admin-configurable.
- **Elapsed time is true calendar Y/M/D**, not a fixed day-count convention —
  e.g. Jan 17 → Jul 17 is exactly "6 months" regardless of which calendar
  months (28/30/31 days) fall in between.
- **Minimum charge:** redemption under 30 days into the loan still incurs a
  full month's interest.
- **Compounding is annual, not continuous/monthly:** within year 1, interest
  is simple/non-compounding; only from day 366 onward does the prior year's
  interest fold into principal for the next year's calculation (e.g. ₹1000 →
  ₹1240 after year 1 at 24%, and year 2's interest is computed on ₹1240).
  There's an informal ~7-day grace window right at the 1-year mark where
  compounding may be held off at staff discretion — a negotiable judgment
  call, not a hard rule.
- **Partial payments:** described method is to compute interest on the full
  original principal for the entire loan-date-to-today span, then net off
  the interest that accrued on the paid-off portion from its payment date
  forward, arriving at total payable. (Concrete worked example still
  pending — see Open Questions.)
- **Overdue notices:** sent at **13, 19, 26, and 36 months** (configurable
  schedule, not evenly spaced) via registered post. Notice cost is a **flat,
  non-compounding charge** added to the amount owed, but must be
  **configurable** (postal rates + labor cost change over time). Notices are
  suppressed if the borrower is making partial payments, *unless* those
  payments aren't enough to restore adequate coverage margin (exception
  status: under discussion). Wanted: a "Notices Due" dashboard view, plus a
  sub-section for exception cases that staff can manually override into a
  "send anyway" bucket.
- **Legal default/auction:** eligible to auction 1 year + 7 days after loan
  date (matches the same figure printed on the loan document), per Indian
  pawnbroker licensing law. In practice, often held off 2–3 years depending
  on borrower relationship/history, reviewed **quarterly** by the admin
  weighing coverage margin and rate trends.

**Current app** (`backend/src/utils/interestCalculator.js`):
- Tiers (₹1000 threshold, 24%/36%) and admin-editability **already match**
  real practice — this is a confirmed point of alignment, not a gap. Editable
  via Admin Settings (min/max amount, rate, description per tier); gated to
  `admin`/`super_admin` roles.
- **Elapsed time is NOT calendar Y/M/D** — it's computed as a fractional
  `(days difference) / 365` and fed into continuous compounding
  `principal * (1+rate/100)^(days/365)`. This will diverge from the real
  calendar-month method, especially around months of different lengths — a
  likely **numeric mismatch**, not just a display difference. (The
  code's `breakdown`/chunk display *does* decompose into 365-day-year +
  ~30-day-month chunks for the UI, but that's explicitly just for display —
  the actual totals still come from the continuous-compounding formula, not
  calendar arithmetic.)
- **No minimum-period rule** exists — a loan redeemed in under 30 days is
  charged for the exact fractional period, not a full month.
- **Compounding is continuous** (applied per-day via the exponent), not
  "simple within year 1, annual step-compounding from year 2 onward." No
  concept of the ~7-day post-year-1 grace window.
- **Partial payments**: the app *does* walk through payments chronologically,
  compounding the remaining balance between each payment and re-resolving
  the tier after each one — conceptually a segmented approach, but not
  verified to produce the same final number as the real-world "net off"
  method described above. Needs the worked example to check for parity.
- **Notices**: confirmed via full-codebase search — **nothing exists**. No
  notice schedule, no notice cost field, no dashboard, no suppression logic.
  Entirely new feature to build.
- **Legal auction/default tracking**: `loans.status` has a `'defaulted'`
  value, but there's no automation, no 1yr7day eligibility calculation, no
  quarterly-review workflow, and no linkage to the coverage-margin concept
  from Section A.

**Gap:** The interest math itself needs to move from continuous
day-fraction compounding to true calendar Y/M/D with annual-only compounding
and a minimum-period floor. Notices are a full new feature. Default/auction
tracking needs to tie into the coverage-margin flag from Section A and
surface a quarterly-review queue.

---

## C. Lifecycle: due dates, rollover, top-up, multiple items

**Real process:**
- **No hard due date** exists in real operations — deliberate, since most
  borrowers are farmers whose repayment timing tracks crop cycles (e.g.
  paddy ~90 days) and is sometimes delayed further while awaiting government
  subsidies. The business owner wants a **soft, non-binding due date field**
  added purely for admin reference — explicitly not meant to drive any
  automation, pricing, or enforcement.
- **Rollover**: not a "renew in place." When interest is paid off in full to
  date, the old loan is **closed**, and a **brand-new loan is opened** for
  the same borrower/item, **carrying forward the old loan number as a
  reference** on the new loan. Physically: item retrieved from locker,
  contents verified, pouch re-tagged with a new barcode/tracking number,
  placed in a newly assigned box (location/tracking number changes).
- **Top-up (requested new feature, not yet built anywhere)**: a borrower can
  get an **additional disbursement on an existing open loan**, treated as an
  "additional loan disbursement" rather than a new loan. Interest on the
  additional amount starts from **its own disbursement date**, not the
  original loan date — implying the loan needs to support **multiple
  principal tranches with independent start dates**.
- **Multiple items per loan**: confirmed real — a single loan can cover
  **several pledged ornaments** under one amount/document.
- **Multiple concurrent loans per borrower**: no cap. A borrower can pledge
  a new/different item while an existing loan is still open (that becomes a
  separate loan). Staff informally nudge borrowers with old overdue loans to
  pay those off first, but it's not a hard block.

**Current app:**
- `due_date` **exists in schema and UI** (optional date field on the loan
  form) but is confirmed **vestigial** — never read by any status
  transition, filter, or overdue logic anywhere in the backend. This is
  actually close to what's wanted (a soft, informational field) — but
  nothing currently communicates to staff that it's non-binding, and no
  dashboard surfaces it.
- **No rollover concept at all** — no column linking a new loan to a
  previous one, no workflow that closes-and-recreates. Closing a loan only
  sets `status='closed'` + `closure_date` + `interest_collected`.
- **No top-up/tranche support** — a loan has exactly one `loan_amount` and
  one `loan_date`; there's no structure for multiple disbursements with
  independent interest start dates.
- **Strictly one item per loan** — `item_type`, `metal_type`, `weight`,
  `purity`, `description` are single columns directly on the `loans` table,
  confirmed via schema and both the create/edit form and controller. This is
  a **structural mismatch**, not a minor gap: real loans can have several
  items, and the data model has no way to represent that today.
- **Multiple loans per borrower already works** — `loans.borrower_id` is a
  plain foreign key with no uniqueness constraint, so this one is already
  aligned with real practice, no gap here.

**Gap:** Two structural data-model changes are implied here — (1) loans need
a **one-to-many item list** instead of single item columns, and (2) loans
need to support **multiple principal tranches** (for top-up) and a
**previous-loan reference** (for rollover). These are bigger changes than
the interest-math fix and will need careful migration planning given ~10–15k
existing loans (see Scale, below) — worth sequencing deliberately rather
than bundling into the first interest-accuracy pass.

---

## D. Item identity & photos

**Real process:**
- No photographs taken today — written description only. Business owner
  wants to add photography in the future but hasn't decided where to store
  images (must be accessible, and cost-sensitive/cheap).
- Gold and silver are **not** two parallel record-keeping systems — loan
  numbering is shared across both; only the **physical lockers** differ.

**Current app:**
- No photo/upload capability anywhere in the codebase (confirmed by search —
  no Supabase Storage usage, no file-upload endpoint, no file input for
  borrower or item documents).
- `metal_type` is a plain text field with no locker/location concept
  attached at all — consistent with there being no storage-location feature
  in the app yet (see Storage section below), so there's nothing to
  reconcile here beyond building the locker system itself.

**Gap:** Photo capability is a genuinely new feature for *both* the real
business and the app (not a case of the app missing something the business
already does) — low urgency relative to interest/notices/lockers per the
stated priority order, but worth designing storage cost/access into whatever
locker/packet feature gets built, since photos would likely attach to the
same packet/item record.

---

## E. Storage & retrieval (cards, packets, boxes, lockers)

**Real process — the "Card":**
- An optional physical token issued at loan time (borrower name, loan
  number, date, shop address+stamp). Legally binding: if issued, it must be
  physically returned and signed at redemption before the item is released;
  losing it triggers a real legal process (affidavit, signed document,
  registration) — which is exactly why most borrowers decline to take one.

**Current app — Card:** **Already correctly modeled.** `card_given` /
`card_returned` booleans exist on `loans`, are set at creation/edit, and
`updateLoanStatus` actively blocks closing a loan with `card_given=true` and
`card_returned=false`. Frontend shows a status badge and forces confirmation
of card return before closure. **This is a confirmed point of alignment —
no work needed here.**

**Real process — packets, boxes, lockers:**
- During the day, all of that day's loan packets sit together in one place.
- At day close, packets are **segregated by metal type** and placed into the
  currently "running" box for that type. Box capacity varies physically by
  item size (rings: up to ~150–200/box; necklaces/bangles: as few as
  ~50–60/box). Racks hold ~100–200 boxes depending on height/box model.
- **Reshuffling** happens quarterly/half-yearly, ad hoc, entirely manual and
  untracked today: as loans close, boxes empty unevenly, so staff
  consolidate gaps by moving packets between boxes, sometimes changing which
  locker a box lives in. Business owner wants this tracked (packet
  track/trace history) — not built yet, explicitly a future feature.
- **Locating a packet today**: boxes are transparent and numbered with a
  visible start–end range; staff with locker access (restricted to a few
  people) mentally map loan/packet number ranges to box ranges to lockers.
  Entirely tribal knowledge — no system exists. Business owner explicitly
  wants a system where **typing in a number returns its location**.
- **Design requirement for the fix**: a box (or range of boxes) should be
  configurable with the **loan/packet number range it holds** and a
  **metal-type restriction** (gold-only or silver-only) — the system should
  only permit matching loans into that range. **Gold and silver lockers are
  numbered independently from each other**, and box numbers are also
  distinct/non-overlapping between them.

**Current app:** Confirmed via full-codebase search — **zero** existing
concept of packets, boxes, lockers, or physical location tracking anywhere,
including the schema.

**Gap:** Entirely new feature — needs new tables for lockers, boxes
(with number ranges + metal-type restriction), and packet/item location
assignment, plus a lookup UI ("type a number, get a location"). This is the
business owner's #2 stated priority after interest/notice accuracy.

---

## F. Documents & signatures

**Real process:**
- Pre-printed two-sided form; blank spaces filled by hand. **Front side
  signed at issue**, **back side signed at release** (back also carries
  printed legal terms). Same physical paper is the record of both events.
- No ID-proof copy kept today — only the Aadhar number is recorded as text.
  Business owner would like to optionally keep a physical/photo copy of the
  Aadhar card in the future.

**Current app:** No document-generation/printing feature exists; this has
always been an entirely physical, off-system process, and the physical
ledger/paper form is staying regardless (legal requirement) even if it
someday becomes a printed rather than handwritten form. Aadhar number
capture already matches (`aadhar_or_id` field on `borrowers`).

**Gap:** Low priority relative to the top two items — no urgent mismatch,
since the paper process isn't going away. The only actionable item is the
same photo/document-storage capability noted in Section D (for an optional
Aadhar copy), which can be designed together with item photos.

---

## G. Scale, staff, and the old desktop app

**Real process:**
- All staff are cross-trained in appraisal — no fixed role separation;
  unsure staff escalate to the business owner, who also appraises directly.
- Scale: roughly **10,000–15,000 active loans** outstanding, **~20–25 new
  loans/day**.
- Old desktop app: fully offline, single-machine only, backed by a
  **Microsoft Access database**, clunky/dated UI, has an interest calculator
  but it's hard to enable/use, no reports/dashboards, hard to maintain,
  generic off-the-shelf build not tailored to this process. **Explicit goal
  to migrate all historical data from Access into Supabase** — confirmed
  real, but **deliberately deferred** until after the interest/notice and
  locker gaps are fixed.
- The physical ledger stays regardless of any app changes — it's a legal
  requirement plus habit/backup, though it may eventually become a printed
  ledger instead of handwritten.

**Current app:** Role-based access (`staff`/`admin`/`super_admin`) already
exists and is used to gate interest-tier editing — no material gap here
since real staff are cross-trained rather than role-siloed, and the app's
role gating is narrowly about config edits, not appraisal itself.

**Gap:** None specific to correct now — this section is context for
sequencing (large existing dataset to eventually migrate, ~20–25 new
loans/day as an ongoing load) rather than a feature gap.

---

## H. Parked for later (explicitly, not to be designed yet)

- **Access → Supabase historical data migration.**
- **Accounting/tax/audit automation** and the **8-year record archival
  requirement** (per closed loan, bundled yearly) for regulatory compliance.
  Recorded here so the context isn't lost, per the business owner's
  explicit instruction not to elaborate on this now.

---

## Summary: gap severity at a glance

| Area | Real process exists? | App has it? | Severity |
|---|---|---|---|
| Interest tiers (24%/36% @ ₹1000) | Yes | Yes (matches) | ✅ Aligned |
| Interest elapsed-time method | Calendar Y/M/D | Continuous day-fraction | 🔴 Numeric mismatch |
| Interest compounding | Annual only, w/ grace | Continuous | 🔴 Numeric mismatch |
| Minimum interest period | Yes (min 1 month) | No | 🔴 Missing |
| Partial payment netting | Described method | Segmented, unverified parity | 🟡 Needs verification |
| Overdue notices (13/19/26/36mo) | Yes | No | 🔴 Missing (new feature) |
| Coverage/margin risk flagging | Wanted | No | 🔴 Missing (new feature) |
| Daily metal rate capture/storage | Practiced, not stored | No | 🔴 Missing |
| Soft due date | Wanted (non-binding) | Field exists, unused | 🟡 Close, needs wiring |
| Rollover (close+relink) | Yes | No | 🔴 Missing |
| Top-up / multiple tranches | Wanted (new) | No | 🔴 Missing (structural) |
| Multiple items per loan | Yes | No (single item only) | 🔴 Missing (structural) |
| Multiple loans per borrower | Yes | Yes | ✅ Aligned |
| Card issue/return tracking | Yes | Yes (matches closely) | ✅ Aligned |
| Packet/box/locker tracking | Manual/tribal | No | 🔴 Missing (new feature, priority #2) |
| Item/ID photos | Wanted (new) | No | 🟡 New for both sides |
| Borrower identity fields | Yes | Yes (matches) | ✅ Aligned |
| Desktop→Supabase migration | Needed | N/A | ⏸️ Deferred on purpose |
| Accounting/tax/archival automation | Needed | N/A | ⏸️ Deferred on purpose |
