#!/usr/bin/env python3
"""Consolidate per-source snapshot JSON files and POST them to the backend.

Usage:
    python store_snapshots.py <dir>        # reads <dir>/*.json
    python store_snapshots.py <dir> --dry-run

Reads every *.json produced by scrape_source.py and posts them as one batch to
the Express backend's ingest endpoint (POST /api/prices/snapshots). The backend
is the only service-role writer to Supabase — this script never touches the DB
directly. The endpoint stamps all rows in a request with one shared recorded_at.

Env:
    PRICE_API_URL     full endpoint URL, e.g.
                      https://<render-app>.onrender.com/api/prices/snapshots
    PRICE_INGEST_KEY  shared secret; sent as the X-Ingest-Key header

The backend runs on Render's free tier, which cold-starts (~50s) after idle, so
this retries a few times with a long timeout before giving up.

Exit codes:
    0  posted successfully (or --dry-run)
    2  no snapshot rows found at all (every source failed) -> workflow goes red
    1  request rejected / config missing / all retries exhausted
"""
import argparse
import glob
import json
import os
import sys
import time

import requests

MAX_ATTEMPTS = 5
TIMEOUT_SECONDS = 90  # generous, to absorb a Render cold start


def load_rows(directory):
    rows = []
    files = sorted(glob.glob(os.path.join(directory, "*.json")))
    for path in files:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            rows.extend(data)
    print(f"Loaded {len(rows)} rows from {len(files)} file(s): "
          f"{[os.path.basename(p) for p in files]}")
    return rows


def to_payload(rows):
    """Map scraper JSON (snake_case, per-gram) to the API's camelCase body."""
    snapshots = []
    for r in rows:
        snapshots.append({
            "source": r["source"],
            "metal": r["metal"],
            "purity": r["purity"],
            "priceInr": r["price_inr"],
            "unit": r.get("unit", "gram"),
        })
    return {"snapshots": snapshots}


def post_with_retry(url, key, payload):
    last = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            resp = requests.post(
                url,
                headers={"Content-Type": "application/json", "X-Ingest-Key": key},
                json=payload,
                timeout=TIMEOUT_SECONDS,
            )
            if resp.status_code < 300:
                print(f"OK {resp.status_code}: {resp.text}")
                return True
            # 4xx (bad key / bad body) won't fix on retry — stop immediately.
            if 400 <= resp.status_code < 500:
                print(f"ERROR {resp.status_code}: {resp.text}", file=sys.stderr)
                return False
            last = f"{resp.status_code}: {resp.text}"
        except requests.RequestException as e:
            last = repr(e)
        wait = min(5 * attempt, 30)
        print(f"attempt {attempt}/{MAX_ATTEMPTS} failed ({last}); retrying in {wait}s",
              file=sys.stderr)
        time.sleep(wait)
    print(f"ERROR: all attempts failed: {last}", file=sys.stderr)
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("directory", help="folder holding <source>.json files")
    ap.add_argument("--dry-run", action="store_true", help="print, don't post")
    args = ap.parse_args()

    rows = load_rows(args.directory)
    if not rows:
        print("ERROR: no snapshot rows found — every source failed", file=sys.stderr)
        sys.exit(2)

    payload = to_payload(rows)

    if args.dry_run:
        print(json.dumps(payload, indent=2))
        return

    url = os.environ.get("PRICE_API_URL", "")
    key = os.environ.get("PRICE_INGEST_KEY", "")
    if not url or not key:
        print("ERROR: PRICE_API_URL / PRICE_INGEST_KEY not set", file=sys.stderr)
        sys.exit(1)

    if not post_with_retry(url, key, payload):
        sys.exit(1)


if __name__ == "__main__":
    main()
