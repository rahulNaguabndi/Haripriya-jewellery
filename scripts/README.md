# Bullion price scraper

Records live gold & silver INR prices from three public Indian bullion sites
into Supabase, once a day, via a GitHub Action. Zero infrastructure cost —
runs on GitHub-hosted runners.

## Sources (all static server-rendered HTML, per-gram after normalization)

| source            | site                | gold        | silver |
| ----------------- | ------------------- | ----------- | ------ |
| `bullions`        | bullions.co.in      | 24k, 22k    | 999    |
| `goldmeter`       | goldmeter.in        | 24k, 22k    | 999    |
| `allindiabullion` | allindiabullion.com | 24k, 22k    | 999    |

Prices differ slightly per site (dealer spread) — that's intentional; storing
all three lets you compare drift over time.

## How it runs

`.github/workflows/scrape-prices.yml`, **every 3 hours** (`17 */3 * * *` UTC =
8 runs/day) to capture intraday price movement. GitHub cron is UTC-only and
best-effort (may drift or skip under load); the odd :17 minute dodges the
contended :00/:30 ticks. Also has a manual **Run workflow** button
(`workflow_dispatch`).

- One **scrape** job per source, in parallel (`fail-fast: false`) — a broken
  parser on one site fails only its own job.
- One **store** job (`if: always()`) consolidates whatever succeeded and
  POSTs it to the backend. It goes red only if *every* source failed.

The store job does **not** write to Supabase directly — it posts the rates to
the Express backend's `POST /api/prices/snapshots` endpoint, guarded by a shared
ingest key. The backend (service-role) is the only DB writer, same as every
other write in this app.

## One-time setup

1. **Create the table** — run the `price_snapshots` block from
   [`db/schema.sql`](../db/schema.sql) in the Supabase SQL editor.
2. **Set the backend ingest key** — on Render (backend env), add
   `PRICE_INGEST_KEY` = a long random string.
3. **Add repo secrets** (Settings → Secrets and variables → Actions):
   - `PRICE_API_URL` — `https://<render-app>.onrender.com/api/prices/snapshots`
   - `PRICE_INGEST_KEY` — the **same** value as the backend env var
4. Trigger the workflow manually once to confirm rows land in Supabase.
   (First run may take ~50s if Render cold-starts; the store job retries.)

## Local testing

The sites are UTF-8 but don't all declare it; the scraper forces UTF-8.
Behind a TLS-inspecting proxy (Zscaler) set `REQUESTS_CA_BUNDLE` first.

```bash
pip install -r scripts/requirements.txt
python scripts/scrape_source.py goldmeter            # fetch + print
python scripts/scrape_source.py bullions --html-file saved.html   # parse a local file, no network
python scripts/store_snapshots.py <dir> --dry-run    # consolidate + show the POST body, no request

# Post for real (points at a running backend):
PRICE_API_URL=http://localhost:4100/api/prices/snapshots \
PRICE_INGEST_KEY=yourkey \
python scripts/store_snapshots.py <dir>
```
