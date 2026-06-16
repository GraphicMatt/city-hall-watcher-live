#!/usr/bin/env python3
"""
Batch-scrapes Toronto Council Minutes for all meetings in council-meetings.json,
outputting one JSON file per meeting under data/votes/{meetingCode}.json.

Usage:
    python3 scripts/scrape-all-votes.py [options]

Options:
    --delay N     Seconds between requests (default: 10)
    --force       Re-scrape even if output file already exists
    --dry-run     Print what would be scraped without running
    --meeting X   Only scrape a specific meetingCode (e.g. 2026.CC41)

Once complete, commit data/votes/*.json so the admin vote-matcher can load
them automatically without any copy-paste.
"""
import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).parent.parent
MEETINGS_FILE = Path(__file__).parent / "council-meetings.json"
SCRAPER = ROOT / "votecard-maker/votecard-maker/chw_minutes_scraper.py"
OUT_DIR = ROOT / "data/votes"


def main():
    ap = argparse.ArgumentParser(description="Batch scrape council minutes votes")
    ap.add_argument("--delay", type=float, default=10, help="Seconds between requests")
    ap.add_argument("--force", action="store_true", help="Re-scrape even if file exists")
    ap.add_argument("--dry-run", action="store_true", help="Print plan without running")
    ap.add_argument("--meeting", help="Only scrape one meetingCode (e.g. 2026.CC41)")
    args = ap.parse_args()

    if not SCRAPER.exists():
        print(f"ERROR: scraper not found at {SCRAPER}", file=sys.stderr)
        sys.exit(1)

    meetings = json.loads(MEETINGS_FILE.read_text())
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if args.meeting:
        meetings = [m for m in meetings if m["meetingCode"] == args.meeting]
        if not meetings:
            print(f"ERROR: meetingCode '{args.meeting}' not found in council-meetings.json")
            sys.exit(1)

    total = len(meetings)
    skipped = scraped = failed = 0

    for i, meeting in enumerate(meetings):
        code = meeting.get("meetingCode", "")
        url = meeting.get("url", "")
        if not code or not url:
            continue

        out_file = OUT_DIR / f"{code}.json"
        prefix = f"[{i+1}/{total}] {code}"

        if out_file.exists() and not args.force:
            print(f"{prefix} — skip (exists)")
            skipped += 1
            continue

        if args.dry_run:
            print(f"{prefix} — would scrape {url}")
            continue

        print(f"{prefix} — {url}")
        try:
            result = subprocess.run(
                [sys.executable, str(SCRAPER), url, "--out", str(out_file)],
                capture_output=True,
                text=True,
                timeout=120,
            )
            if result.returncode == 0:
                # Print the scraper's summary line (last non-empty line)
                lines = [l for l in result.stdout.splitlines() if l.strip()]
                if lines:
                    print(f"  {lines[-1]}")
                scraped += 1
            else:
                print(f"  FAILED (exit {result.returncode})")
                if result.stderr:
                    print(f"  {result.stderr.strip()[-300:]}")
                failed += 1
        except subprocess.TimeoutExpired:
            print(f"  TIMEOUT after 120s")
            failed += 1
        except Exception as e:
            print(f"  ERROR: {e}")
            failed += 1

        if i < total - 1:
            time.sleep(args.delay)

    if not args.dry_run:
        print(f"\nDone: {scraped} scraped, {skipped} skipped, {failed} failed")
        if scraped:
            print(f"Files in: {OUT_DIR}/")
            print("Next: commit data/votes/*.json and reload /admin/vote-tagger")


if __name__ == "__main__":
    main()
