#!/usr/bin/env python3
"""
CHW Minutes Vote Scraper
-------------------------
Scrapes a Toronto Council "minutes" page (the same AMS template as an
agenda-item page, but covering an entire meeting) and emits a JSON file
listing every recorded vote in the meeting, tagged with the agenda item
it belongs to and an ISO timestamp.

This JSON is meant to be pasted/uploaded into the CHW Live admin "Match
votes" tool (/admin/<slug>/votes), which matches these votes against
"CARRIES n-n" / "FAILS n-n" posts from the live coverage thread.

Usage:
    python3 chw_minutes_scraper.py <minutes-url> --out votes.json

Example:
    python3 chw_minutes_scraper.py \\
        "https://secure.toronto.ca/council/report.do?meeting=2026.CC41&type=minutes" \\
        --out cc41-votes.json

Options:
    --debug   Print every agenda-item header encountered (useful for
              verifying the item-number/title detection against a page
              whose markup differs from what this script expects).

NOTE: The item-number/title detection is based on the common Toronto AMS
pattern of heading elements carrying an `id`/`name` like "CC41.3". If a
given minutes page uses different markup, votes will still be extracted
correctly but `item_number`/`item_title` may come back empty — run with
--debug to see what headers were found and adjust ITEM_ID_RE / the
start-tag handling below as needed.
"""

import sys
import re
import os
import json
import argparse
from urllib.parse import urlparse, parse_qs
from html.parser import HTMLParser
from datetime import datetime
from zoneinfo import ZoneInfo

TORONTO_TZ = ZoneInfo("America/Toronto")

# Matches agenda item numbers like "CC41.3", "MM41.24", "TE32.46", "DM41.1"
ITEM_ID_RE = re.compile(r'^[A-Z]{1,3}\d+\.\d+$')
ITEM_HEADING_RE = re.compile(r'^([A-Z]{1,3}\d+\.\d+)\b[\s:.\-–—]*(.*)$')


# ---------------------------------------------------------------------------
# 1. Fetch the minutes page
# ---------------------------------------------------------------------------

def fetch_page(url):
    """
    Fetch page HTML using Selenium with the same bot-evasion approach used by
    the CHW council summariser. Requires: selenium, webdriver-manager.
    Install: pip install selenium webdriver-manager
    """
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from webdriver_manager.chrome import ChromeDriverManager
    import time

    opts = Options()
    opts.add_argument("--headless")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    opts.add_argument(
        "user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )

    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=opts)
    driver.execute_script(
        "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
    )

    try:
        driver.get(url)
        wait = WebDriverWait(driver, 20)
        # The minutes page is much longer than a single agenda item, so give
        # it a bit more time to settle once the main content shows up.
        wait.until(EC.presence_of_element_located((By.TAG_NAME, "body")))
        time.sleep(2)
        return driver.page_source
    finally:
        driver.quit()


# ---------------------------------------------------------------------------
# 2. Parse the minutes page
# ---------------------------------------------------------------------------

class MinutesParser(HTMLParser):
    """
    Walks the whole minutes document, tracking the "current" agenda item
    (by item number + title) as it goes, and collecting every vote block
    (`<h4 class="vote-table-header">` + `report-table`) — same shape as
    chw_vote_cards.py's AgendaParser — stamped with that current item.
    """

    def __init__(self, debug=False):
        super().__init__()
        self.debug = debug
        self.votes = []  # list of vote dicts

        self._current_item_number = ""
        self._current_item_title = ""
        self._item_vote_counts = {}  # item_number -> count, for vote ids

        self._current_vote = None
        # Stack of bools, one per open <table>, marking whether that table is
        # the report-table belonging to _current_vote. Needed because the
        # Procedural Motions section (and other dense areas) can contain
        # other <table> elements between a vote's <h4> header and its actual
        # report-table — without this, the first nested </table> would
        # prematurely finalize (and drop) the vote.
        self._table_stack = []
        self._in_report_table = False
        self._in_vote_header = False
        self._in_result_th = False
        self._in_threshold_th = False
        self._in_yes_count_td = False
        self._in_yes_names_td = False
        self._in_no_count_td = False
        self._in_no_names_td = False
        self._in_absent_count_td = False
        self._in_absent_names_td = False
        self._skip_sr = False
        self._row_index = 0
        self._col_index = 0
        self._in_motion_label = False
        self._motion_label_buf = ""

        # Heading capture, used to detect "CC41.3 - Item title" headers
        self._heading_tags = {"h1", "h2", "h3", "h4", "h5"}
        self._in_heading = False
        self._heading_buf = ""

    # -- helpers -----------------------------------------------------------

    def _maybe_set_item_from_id(self, attrs):
        for attr_name in ("id", "name"):
            val = dict(attrs).get(attr_name, "")
            if ITEM_ID_RE.match(val):
                self._current_item_number = val
                self._current_item_title = ""  # filled in by heading text, if any
                if self.debug:
                    print(f"[debug] item id detected: {val}")

    def _maybe_set_item_from_heading(self, text):
        m = ITEM_HEADING_RE.match(text)
        if m:
            self._current_item_number = m.group(1)
            self._current_item_title = m.group(2).strip()
            if self.debug:
                print(f"[debug] item heading detected: {self._current_item_number} — {self._current_item_title}")
        elif self._current_item_number and not self._current_item_title:
            # A heading right after an id-only anchor — treat as the title.
            self._current_item_title = text

    # -- HTMLParser overrides ------------------------------------------------

    def handle_starttag(self, tag, attrs):
        cls = dict(attrs).get("class", "")

        self._maybe_set_item_from_id(attrs)

        if tag in self._heading_tags:
            self._in_heading = True
            self._heading_buf = ""

        if tag in ("h3", "h4") and "vote-table-header" in cls:
            self._in_vote_header = True
            self._current_vote = {
                "item_number": self._current_item_number,
                "item_title": self._current_item_title,
                "label": "", "date": "", "motion_label": "",
                "result": "", "threshold": "",
                "yes_count": 0, "yes_names": [],
                "no_count": 0, "no_names": [],
                "absent_count": 0, "absent_names": [],
            }

        if tag == "div" and cls == "italics":
            self._in_motion_label = True
            self._motion_label_buf = ""

        if tag == "table":
            is_report = (
                "report-table" in cls
                and self._current_vote is not None
                and not self._in_report_table
            )
            self._table_stack.append(is_report)
            if is_report:
                self._in_report_table = True
                self._row_index = 0
                self._col_index = 0

        if tag == "th" and self._current_vote is not None:
            normal = dict(attrs).get("class", "")
            if normal == "normal-text":
                self._in_threshold_th = True
            else:
                self._in_result_th = True

        if tag == "tr" and self._current_vote is not None:
            self._col_index = 0

        if tag == "td" and self._current_vote is not None:
            if self._col_index == 0:
                if self._row_index == 0: self._in_yes_count_td = True
                elif self._row_index == 1: self._in_no_count_td = True
                elif self._row_index == 2: self._in_absent_count_td = True
            elif self._col_index == 1:
                if self._row_index == 0: self._in_yes_names_td = True
                elif self._row_index == 1: self._in_no_names_td = True
                elif self._row_index == 2: self._in_absent_names_td = True

        if tag == "span" and dict(attrs).get("class", "") == "sr-only":
            self._skip_sr = True

    def handle_endtag(self, tag):
        if tag in self._heading_tags and self._in_heading:
            self._in_heading = False
            text = self._heading_buf.strip()
            if text:
                self._maybe_set_item_from_heading(text)

        if tag in ("h3", "h4") and self._in_vote_header:
            self._in_vote_header = False

        if tag == "div" and self._in_motion_label:
            self._in_motion_label = False
            if self._current_vote is not None:
                self._current_vote["motion_label"] = self._motion_label_buf.strip()

        if tag == "span":
            self._skip_sr = False

        if tag == "th":
            self._in_result_th = False
            self._in_threshold_th = False

        if tag == "td" and self._current_vote is not None:
            self._col_index += 1
            self._in_yes_count_td = False
            self._in_yes_names_td = False
            self._in_no_count_td = False
            self._in_no_names_td = False
            self._in_absent_count_td = False
            self._in_absent_names_td = False

        if tag == "tr" and self._current_vote is not None:
            if self._col_index > 0:
                self._row_index += 1
                self._col_index = 0

        if tag == "table":
            was_report = self._table_stack.pop() if self._table_stack else False
            if was_report:
                self._in_report_table = False
                if self._current_vote is not None and self._current_vote.get("result"):
                    item_num = self._current_vote["item_number"] or "UNKNOWN"
                    n = self._item_vote_counts.get(item_num, 0) + 1
                    self._item_vote_counts[item_num] = n
                    self._current_vote["id"] = f"{item_num}-vote-{n}"
                    self.votes.append(self._current_vote)
                self._current_vote = None
                self._row_index = 0

    def handle_data(self, data):
        data_s = data.strip()
        if not data_s:
            return
        if self._skip_sr:
            return

        if self._in_heading:
            self._heading_buf += data

        if self._in_motion_label:
            self._motion_label_buf += data

        if self._in_vote_header and self._current_vote is not None:
            parts = data_s.split("\n")
            for part in parts:
                part = part.strip()
                if part.startswith("Vote ("):
                    self._current_vote["label"] = part
                elif re.match(r'\w+-\d+-\d+', part):
                    self._current_vote["date"] = part

        if self._in_result_th and self._current_vote is not None:
            m = re.search(r'Result:\s*(\w+)', data_s)
            if m:
                self._current_vote["result"] = m.group(1)

        if self._in_threshold_th and self._current_vote is not None:
            self._current_vote["threshold"] = data_s.strip()

        if self._in_yes_count_td and self._current_vote is not None:
            m = re.search(r'Yes:\s*(\d+)', data_s)
            if m:
                self._current_vote["yes_count"] = int(m.group(1))

        if self._in_no_count_td and self._current_vote is not None:
            m = re.search(r'No:\s*(\d+)', data_s)
            if m:
                self._current_vote["no_count"] = int(m.group(1))

        if self._in_absent_count_td and self._current_vote is not None:
            m = re.search(r'Absent:\s*(\d+)', data_s)
            if m:
                self._current_vote["absent_count"] = int(m.group(1))

        if self._in_yes_names_td and self._current_vote is not None:
            names = [n.strip() for n in data_s.split(",") if n.strip()]
            self._current_vote["yes_names"].extend(names)

        if self._in_no_names_td and self._current_vote is not None:
            names = [n.strip() for n in data_s.split(",") if n.strip()]
            self._current_vote["no_names"].extend(names)

        if self._in_absent_names_td and self._current_vote is not None:
            names = [n.strip() for n in data_s.split(",") if n.strip()]
            self._current_vote["absent_names"].extend(names)


# ---------------------------------------------------------------------------
# 3. Date handling
# ---------------------------------------------------------------------------

def parse_vote_timestamp(raw):
    """
    Convert 'May-21-2026 7:55 PM' (Toronto local time, no explicit TZ) into
    an ISO 8601 string with the correct EDT/EST offset for that date.
    Returns (iso_string, raw) — iso_string is "" if parsing fails.
    """
    m = re.match(r'(\w+)-(\d+)-(\d+)\s+(\d+):(\d+)\s*(AM|PM)', raw, re.IGNORECASE)
    if not m:
        return "", raw
    month_str, day, year, hour, minute, ampm = m.groups()
    try:
        dt = datetime.strptime(
            f"{month_str} {day} {year} {hour}:{minute} {ampm.upper()}",
            "%b %d %Y %I:%M %p",
        )
    except ValueError:
        return "", raw
    dt = dt.replace(tzinfo=TORONTO_TZ)
    return dt.isoformat(), raw


def derive_motion_label(threshold):
    """
    The threshold cell reads like "Majority Required - DM41.2 - Matlow -
    motion 2" or "Two-Thirds Required - MM41.4 - Waive the referral". Strip
    the requirement and item-number prefix, leaving the motion descriptor
    (e.g. "Matlow - motion 2", "Adopt the item as amended").
    """
    parts = [p.strip() for p in threshold.split(" - ") if p.strip()]
    return " - ".join(parts[2:]) if len(parts) >= 3 else ""


THRESHOLD_ITEM_RE = re.compile(r'-\s*([A-Z]{1,3}\d+\.\d+)\s*-')

# Procedural motion keywords — when a motion label matches any of these, the
# vote is a procedural motion rather than a substantive item vote. We clear
# item_title so VoteCard falls back to showing the motion descriptor.
PROCEDURAL_RE = re.compile(
    r'\b(extend|recess|adjourn|waive|dispense|refer|defer|postpone|table)\b',
    re.IGNORECASE,
)


def is_procedural_motion(motion_label, threshold):
    return bool(PROCEDURAL_RE.search(motion_label) or PROCEDURAL_RE.search(threshold))


def extract_item_number_from_threshold(threshold):
    """
    The threshold cell reads like "Two-Thirds Required - RM41.1 - Chow -
    Extend the meeting" — pull out the item number ("RM41.1"). This is more
    reliable than heading-based item tracking for procedural motions, whose
    <h3>/<h4> headers can fall between two unrelated agenda items.
    """
    m = THRESHOLD_ITEM_RE.search(threshold)
    return m.group(1) if m else ""


def extract_meeting_key(url):
    qs = parse_qs(urlparse(url).query)
    meeting = qs.get("meeting", [""])[0]
    # "2026.CC41" -> "CC41"
    parts = meeting.split(".")
    return parts[-1] if parts else meeting


# ---------------------------------------------------------------------------
# 4. Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="CHW Minutes Vote Scraper")
    parser.add_argument("url", help="Minutes page URL (?type=minutes)")
    parser.add_argument("--out", default="votes.json", help="Output JSON path")
    parser.add_argument("--debug", action="store_true", help="Print detected item headers")
    args = parser.parse_args()

    print(f"Fetching {args.url} ...")
    html_src = fetch_page(args.url)

    p = MinutesParser(debug=args.debug)
    p.feed(html_src)

    print(f"Found {len(p.votes)} vote(s)")

    votes_out = []
    for v in p.votes:
        iso, raw_date = parse_vote_timestamp(v["date"])
        label_match = re.search(r'Vote \((.+)\)', v["label"])
        motion_label = v["motion_label"] or derive_motion_label(v["threshold"])
        item_number = v["item_number"]
        item_title = v["item_title"]
        threshold_item = extract_item_number_from_threshold(v["threshold"])
        if threshold_item and threshold_item != item_number:
            item_number = threshold_item
            item_title = ""
        if is_procedural_motion(motion_label, v["threshold"]):
            item_title = ""
        votes_out.append({
            "id": v["id"],
            "itemNumber": item_number,
            "itemTitle": item_title,
            "motionLabel": motion_label,
            "voteLabel": label_match.group(1) if label_match else v["label"],
            "result": v["result"],
            "timestamp": iso,
            "rawDate": raw_date,
            "threshold": v["threshold"],
            "yesCount": v["yes_count"],
            "noCount": v["no_count"],
            "absentCount": v["absent_count"],
            "yesNames": v["yes_names"],
            "noNames": v["no_names"],
            "absentNames": v["absent_names"],
        })

    output = {
        "meetingKey": extract_meeting_key(args.url),
        "scrapedAt": datetime.now(TORONTO_TZ).isoformat(),
        "votes": votes_out,
    }

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
