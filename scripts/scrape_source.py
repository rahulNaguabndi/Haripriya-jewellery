#!/usr/bin/env python3
"""Scrape one bullion source and emit normalized per-gram gold/silver prices.

Usage:
    python scrape_source.py <source> --out snapshots/<source>.json
    python scrape_source.py <source> --html-file some.html   # parse local file (offline test)

<source> is one of: bullions | goldmeter | allindiabullion

Each source's site serves prices in static server-rendered HTML (no JS/websocket),
so plain requests + BeautifulSoup is enough. Every price is normalized to INR
*per gram* so the three sources are directly comparable in Supabase.

Design note: if a source's layout changes and yields zero prices, this script
exits non-zero on purpose. The GitHub workflow runs one job per source with
fail-fast disabled, so one broken parser fails only its own job; the consolidate
job still stores whatever succeeded.
"""
import argparse
import json
import re
import sys

import requests
from bs4 import BeautifulSoup

# Only these (metal, purity) combos are kept, so all three sources line up.
WANTED = {("gold", "24k"), ("gold", "22k"), ("silver", "999")}

SOURCES = {
    "bullions": "https://bullions.co.in/",
    "goldmeter": "https://goldmeter.in/",
    "allindiabullion": "https://allindiabullion.com/",
}

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}


def parse_inr(text):
    """'₹1,42,725' / '14,355.00' -> 142725.0 / 14355.0 (first number found)."""
    m = re.search(r"\d[\d,]*(?:\.\d+)?", text.replace("₹", ""))
    if not m:
        raise ValueError(f"no number in {text!r}")
    return float(m.group(0).replace(",", ""))


def _row(source, metal, purity, price_per_gram):
    return {
        "source": source,
        "metal": metal,
        "purity": purity,
        "price_inr": round(price_per_gram, 4),
        "unit": "gram",
    }


# --- per-source parsers: take HTML text, return list of normalized rows ------

def parse_bullions(html):
    """Table rows: 'Gold 24 Karat (Rs) | 1g | 10g | 100g | 1kg | oz | tola'.
    First value cell is already per-gram."""
    soup = BeautifulSoup(html, "html.parser")
    labels = {
        r"gold\s*24\s*karat": ("gold", "24k"),
        r"gold\s*22\s*karat": ("gold", "22k"),
        r"silver\s*999": ("silver", "999"),
    }
    rows = []
    for tr in soup.find_all("tr"):
        cells = tr.find_all(["td", "th"])
        if len(cells) < 2:
            continue
        label = re.sub(r"\s+", " ", cells[0].get_text(" ", strip=True)).lower()
        for pat, (metal, purity) in labels.items():
            if re.search(pat, label):
                per_gram = parse_inr(cells[1].get_text(strip=True))
                rows.append(_row("bullions", metal, purity, per_gram))
                break
    return rows


def parse_goldmeter(html):
    """Structured attributes: data-metal / data-purity / data-unit / data-price."""
    soup = BeautifulSoup(html, "html.parser")
    unit_divisor = {"per-10g": 10.0, "per-kg": 1000.0, "per-g": 1.0, "per-gram": 1.0}
    rows = []
    for el in soup.select("[data-price]"):
        metal = (el.get("data-metal") or "").lower()
        purity = (el.get("data-purity") or "").lower()
        if (metal, purity) not in WANTED:
            continue
        unit = (el.get("data-unit") or "").lower()
        div = unit_divisor.get(unit)
        if div is None:
            raise ValueError(f"goldmeter unknown unit {unit!r}")
        per_gram = parse_inr(el["data-price"]) / div
        rows.append(_row("goldmeter", metal, purity, per_gram))
    return rows


def parse_allindiabullion(html):
    """Summary blocks read like '24K Gold ₹1,42,725 per 10g' / 'Silver ... per kg'."""
    soup = BeautifulSoup(html, "html.parser")
    specs = [
        (r"24k\s*gold", "gold", "24k", 10.0),
        (r"22k\s*gold", "gold", "22k", 10.0),
        (r"\bsilver\b", "silver", "999", 1000.0),
    ]
    rows = []
    seen = set()
    # Value nodes are bold spans/divs; classify by the enclosing block's label text.
    for val in soup.select("div.font-bold, span.font-bold"):
        vtext = val.get_text(strip=True)
        if not re.search(r"\d[\d,]{3,}", vtext):  # must hold a price, not a label
            continue
        block = val.parent.get_text(" ", strip=True) if val.parent else ""
        block = re.sub(r"\s+", " ", block).lower()
        for pat, metal, purity, div in specs:
            key = (metal, purity)
            if key in seen:
                continue
            if re.search(pat, block):
                per_gram = parse_inr(vtext) / div
                rows.append(_row("allindiabullion", metal, purity, per_gram))
                seen.add(key)
                break
    return rows


PARSERS = {
    "bullions": parse_bullions,
    "goldmeter": parse_goldmeter,
    "allindiabullion": parse_allindiabullion,
}


def fetch(url):
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    resp.encoding = "utf-8"  # these sites are UTF-8 but don't always declare it
    return resp.text


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source", choices=sorted(SOURCES))
    ap.add_argument("--out", help="write JSON here; default stdout")
    ap.add_argument("--html-file", help="parse this local file instead of fetching")
    args = ap.parse_args()

    if args.html_file:
        with open(args.html_file, encoding="utf-8") as f:
            html = f.read()
    else:
        html = fetch(SOURCES[args.source])

    rows = PARSERS[args.source](html)
    # Keep the first row per (metal, purity): some sites render the same metal in
    # several tables (e.g. a per-gram table and a per-10g spot table); the first
    # match is the intended per-gram figure.
    deduped, keys = [], set()
    for r in rows:
        k = (r["metal"], r["purity"])
        if k not in keys:
            keys.add(k)
            deduped.append(r)
    rows = deduped
    if not rows:
        print(f"ERROR: {args.source} yielded 0 prices (layout changed?)", file=sys.stderr)
        sys.exit(1)

    payload = json.dumps(rows, indent=2)
    if args.out:
        import os
        os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(payload)
    print(payload)


if __name__ == "__main__":
    main()
