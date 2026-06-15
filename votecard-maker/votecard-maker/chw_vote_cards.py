#!/usr/bin/env python3
"""
CHW Vote Card Generator
-----------------------
Usage:
    python3 chw_vote_cards.py <agenda-item-url> [--mayor "Last Name"] [--out ./output]

Example:
    python3 chw_vote_cards.py "https://secure.toronto.ca/council/agenda-item.do?item=2026.MM41.24"

Outputs:
    - One HTML file per vote (e.g. MM41.24_vote_1_waive_referral.html)
    - One PNG screenshot per vote  (e.g. MM41.24_vote_1_waive_referral.png)

Options:
    --mayor     Last name of the mayor (default: Chow). Gets star treatment.
    --out       Output directory (default: current directory)
    --html-only Skip PNG rendering (faster, no Playwright needed)
    --no-prompt Skip title prompts; use default labels from the minutes
"""

import sys
import re
import os
import argparse
from urllib.request import urlopen, Request
from urllib.parse import urlparse, parse_qs
from html.parser import HTMLParser

# ---------------------------------------------------------------------------
# 1. Fetch & parse the agenda page
# ---------------------------------------------------------------------------

class AgendaParser(HTMLParser):
    """Minimal state-machine parser — extracts item number, title, and vote blocks."""

    def __init__(self):
        super().__init__()
        self.item_number = ""
        self.item_title = ""
        self.votes = []           # list of vote dicts
        self._current_vote = None
        self._in_vote_header = False
        self._in_result_th = False
        self._in_threshold_th = False
        self._in_yes_count_td = False
        self._in_yes_names_td = False
        self._in_no_count_td = False
        self._in_no_names_td = False
        self._in_absent_count_td = False
        self._in_absent_names_td = False
        self._in_sr_only = False
        self._skip_sr = False     # suppress sr-only text
        self._row_index = 0       # 0=yes, 1=no, 2=absent
        self._col_index = 0       # 0=count, 1=names
        self._in_motion_label = False
        self._motion_label_buf = ""
        self._in_item_title = False
        self._item_title_buf = ""

    def handle_starttag(self, tag, attrs):
        cls = dict(attrs).get("class", "")
        name_attr = dict(attrs).get("name", "")

        # Item title lives in an <h2> or similar — capture the first one with "MM" content
        if tag == "h1" and "item" in cls.lower():
            self._in_item_title = True

        # Vote header: <h4 class="vote-table-header">
        if tag == "h4" and "vote-table-header" in cls:
            self._in_vote_header = True
            self._current_vote = {
                "label": "", "date": "", "motion_label": "",
                "result": "", "threshold": "",
                "yes_count": 0, "yes_names": [],
                "no_count": 0, "no_names": [],
                "absent_count": 0, "absent_names": [],
            }

        # Motion label div (e.g. "Motion to Adopt Item (Lost)")
        if tag == "div" and cls == "italics":
            self._in_motion_label = True
            self._motion_label_buf = ""

        # Vote result table
        if tag == "table" and "report-table" in cls and self._current_vote is not None:
            self._row_index = 0
            self._col_index = 0

        if tag == "thead" and self._current_vote is not None:
            pass

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

        if tag == "span" and dict(attrs).get("class","") == "sr-only":
            self._skip_sr = True

    def handle_endtag(self, tag):
        if tag == "h4" and self._in_vote_header:
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
            if self._col_index > 0:  # was a data row
                self._row_index += 1
                self._col_index = 0

        if tag == "table" and self._current_vote is not None:
            if self._current_vote.get("result"):
                self.votes.append(self._current_vote)
                self._current_vote = None
                self._row_index = 0

    def handle_data(self, data):
        data_s = data.strip()
        if not data_s:
            return

        if self._skip_sr:
            return

        if self._in_item_title:
            self._item_title_buf = data_s
            self._in_item_title = False

        if self._in_motion_label:
            self._motion_label_buf += data

        if self._in_vote_header and self._current_vote is not None:
            # h4 text is like "Vote (Adopt Item)\nMay-21-2026 7:55 PM"
            parts = data_s.split("\n")
            for part in parts:
                part = part.strip()
                if part.startswith("Vote ("):
                    self._current_vote["label"] = part
                elif re.match(r'\w+-\d+-\d+', part):
                    self._current_vote["date"] = part

        if self._in_result_th and self._current_vote is not None:
            # "Result: Carried" or "Result: Lost"
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


def fetch_page(url):
    """
    Fetch page HTML using Selenium with the same bot-evasion approach used by
    the CHW council summariser. Requires: selenium, webdriver-manager, beautifulsoup4.
    Install: pip install selenium webdriver-manager beautifulsoup4
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
        wait = WebDriverWait(driver, 15)
        # Wait for the accordion to appear — it's server-rendered so should be fast
        wait.until(EC.presence_of_element_located((By.ID, "agenda-item-accordion")))
        time.sleep(1)  # brief settle for any remaining JS
        return driver.page_source
    finally:
        driver.quit()


def extract_item_number(url):
    qs = parse_qs(urlparse(url).query)
    item = qs.get("item", [""])[0]
    # "2026.MM41.24" -> "MM41.24"
    parts = item.split(".")
    return ".".join(parts[1:]) if len(parts) >= 3 else item


def parse_date(raw):
    """Convert 'May-21-2026 7:55 PM' to 'May 21, 2026'."""
    m = re.match(r'(\w+)-(\d+)-(\d+)', raw)
    if m:
        return f"{m.group(1)} {m.group(2)}, {m.group(3)}"
    return raw


# Councillors with compound surnames that should not be reduced to the final word.
# Add new entries here as needed (key = final word, value = full display name).
COMPOUND_SURNAMES = {
    "lin": "Chernos Lin",
}

def last_name(full):
    """
    Extract display name from a full councillor name.
    Strips role suffixes like '(Chair)', handles compound surnames.
    """
    full = re.sub(r'\s*\(.*?\)', '', full).strip()
    parts = full.split()
    if not parts:
        return full
    last = parts[-1]
    # Check if the final word is the tail of a known compound surname
    if last.lower() in COMPOUND_SURNAMES:
        return COMPOUND_SURNAMES[last.lower()]
    return last


# ---------------------------------------------------------------------------
# 2. Render HTML
# ---------------------------------------------------------------------------

TABLER_CDN = "https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.34.0/dist/tabler-icons.min.css"

def councillor_pill(name, vote_type, mayor_last):
    """Return an HTML pill span for a councillor name."""
    lname = last_name(name)
    is_mayor = lname.lower() == mayor_last.lower()

    if vote_type == "yes":
        bg, color, border = "#EAF3DE", "#3B6D11", None
    elif vote_type == "no":
        bg, color, border = "#FCEBEB", "#A32D2D", None
    else:
        bg, color, border = "#f3f3f1", "#666", None

    base_style = (
        f"font-size:13px; background:{bg}; color:{color}; "
        f"border-radius:4px; padding:4px 9px; display:inline-flex; "
        f"align-items:center; gap:5px;"
    )
    if is_mayor:
        border_color = "#639922" if vote_type == "yes" else ("#aaa" if vote_type == "absent" else "#E24B4A")
        base_style += f" font-weight:500; border:1.5px solid {border_color};"
        icon = f'<i class="ti ti-star" aria-hidden="true" style="font-size:13px;"></i>'
    else:
        base_style += " border:1.5px solid transparent;"
        icon = ""

    return f'<span style="{base_style}">{icon}{lname}</span>'


def render_vote_html(vote, item_number, mayor_last, title=None):
    """Render a single vote as a self-contained HTML card."""
    yes_n = vote["yes_count"]
    no_n = vote["no_count"]
    absent_n = vote["absent_count"]
    total_voting = yes_n + no_n
    threshold_raw = vote["threshold"].lower()
    majority_n = (total_voting // 2) + 1 if "majority" in threshold_raw else int(total_voting * 2 / 3) + 1
    majority_pct = 50 if "majority" in threshold_raw else 66.67

    # Bar widths are proportional to ALL councillors (yes + no + absent),
    # so the absent segment is visually represented in the bar.
    total_all = yes_n + no_n + absent_n
    yes_pct    = (yes_n    / total_all * 100) if total_all else 0
    no_pct     = (no_n     / total_all * 100) if total_all else 0
    absent_pct = (absent_n / total_all * 100) if total_all else 0
    # Majority line: majority threshold as % of total_all
    # e.g. for majority: need >50% of total_voting, which as a share of total_all is:
    majority_bar_pct = (majority_n / total_all * 100) if total_all else 50

    result = vote["result"]  # "Carried" or "Lost"
    result_color = "#27500A" if result == "Carried" else "#791F1F"
    result_bg = "#EAF3DE" if result == "Carried" else "#FCEBEB"
    result_border = "#639922" if result == "Carried" else "#E24B4A"

    # Vote label: use custom title if provided, else extract from "Vote (Adopt Item)"
    if title:
        vote_type_label = title
    else:
        label_match = re.search(r'Vote \((.+)\)', vote["label"])
        vote_type_label = label_match.group(1) if label_match else vote["label"]

    date_str = parse_date(vote["date"])

    yes_pills = "\n".join(councillor_pill(n, "yes", mayor_last) for n in vote["yes_names"])
    no_pills = "\n".join(councillor_pill(n, "no", mayor_last) for n in vote["no_names"])
    absent_pills = "\n".join(councillor_pill(n, "absent", mayor_last) for n in vote["absent_names"])

    bar_yes_w    = f"{yes_pct:.1f}%"
    bar_no_w     = f"{no_pct:.1f}%"
    bar_absent_w = f"{absent_pct:.1f}%"
    maj_line_pct = majority_bar_pct
    absent_bar   = f'<div class="bar-absent" style="width:{absent_pct:.1f}%;"></div>' if absent_n else ''

    absent_section = ""
    if absent_n > 0:
        absent_section = f"""
        <div style="margin-top:1rem; display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
          <span style="font-size:12px; color:#888;">Absent:</span>
          {absent_pills}
        </div>"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vote: {item_number} — {vote_type_label}</title>
<link rel="stylesheet" href="{TABLER_CDN}">
<style>
  *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    background: #ffffff;
    padding: 24px;
    width: 680px;
  }}
  .meta {{
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 4px;
  }}
  .meta-label {{
    font-size: 13px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: #888;
  }}
  .meta-date {{ font-size: 12px; color: #aaa; }}
  .meta-item {{
    margin-left: auto;
    font-size: 12px;
    font-family: "SFMono-Regular", Consolas, monospace;
    background: #f3f3f1;
    color: #666;
    border-radius: 4px;
    padding: 2px 7px;
    border: 0.5px solid #ddd;
  }}
  .vote-title {{
    font-size: 18px;
    font-weight: 500;
    margin: 0 0 1.25rem;
    color: #111;
  }}
  .bar-wrap {{ position: relative; padding-top: 20px; margin-bottom: 0.5rem; }}
  .maj-label {{
    position: absolute;
    top: 0;
    font-size: 10px;
    color: #aaa;
    white-space: nowrap;
    transform: translateX(-50%);
  }}
  .maj-line {{
    position: absolute;
    top: 16px;
    width: 2px;
    height: 28px;
    background: #fff;
    opacity: 0.9;
    z-index: 1;
  }}
  .bar {{
    display: flex;
    height: 28px;
    border-radius: 4px;
    overflow: hidden;
  }}
  .bar-yes {{
    background: #639922;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-right: 8px;
  }}
  .bar-no {{
    background: #E24B4A;
    display: flex;
    align-items: center;
    padding-left: 8px;
  }}
  .bar-absent {{
    background: #f0ede8;
    border-left: 0.5px solid #ddd;
  }}
  .bar-num {{
    font-size: 13px;
    font-weight: 500;
  }}
  .legend {{
    display: flex;
    gap: 16px;
    font-size: 12px;
    color: #666;
    margin: 0.75rem 0 1.5rem;
    align-items: center;
  }}
  .legend-dot {{
    width: 10px;
    height: 10px;
    display: inline-block;
    border-radius: 2px;
    margin-right: 5px;
    vertical-align: middle;
  }}
  .result-badge {{
    margin-left: auto;
    font-size: 12px;
    font-weight: 500;
  }}
  .names-grid {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }}
  .names-header {{
    font-size: 12px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: .05em;
    margin-bottom: 8px;
  }}
  .pills {{ display: flex; flex-wrap: wrap; gap: 6px; }}
</style>
</head>
<body>

<div class="meta">
  <span class="meta-label">Council vote</span>
  <span class="meta-date">{date_str}</span>
  <span class="meta-item">{item_number}</span>
</div>

<p class="vote-title">{vote_type_label}</p>

<div class="bar-wrap">
  <span class="maj-label" style="left:{maj_line_pct:.1f}%;">majority ({majority_n})</span>
  <div class="maj-line" style="left:{maj_line_pct:.1f}%;"></div>
  <div class="bar">
    <div class="bar-yes" style="width:{bar_yes_w};">
      <span class="bar-num" style="color:#EAF3DE;">{yes_n}</span>
    </div>
    <div class="bar-no" style="width:{bar_no_w};">
      <span class="bar-num" style="color:#FCEBEB;">{no_n}</span>
    </div>
    {absent_bar}
  </div>
</div>

<div class="legend">
  <span><span class="legend-dot" style="background:#639922;"></span>Yes</span>
  <span><span class="legend-dot" style="background:#E24B4A;"></span>No</span>
  <span><span class="legend-dot" style="background:#f0ede8; border:0.5px solid #ddd;"></span>Absent</span>
  <span class="result-badge" style="color:{result_color};">Motion {result.lower()}</span>
</div>

<div class="names-grid">
  <div>
    <div class="names-header" style="color:#27500A;">Voted yes ({yes_n})</div>
    <div class="pills">{yes_pills}</div>
  </div>
  <div>
    <div class="names-header" style="color:#791F1F;">Voted no ({no_n})</div>
    <div class="pills">{no_pills}</div>
  </div>
</div>

{absent_section}

</body>
</html>
"""
    return html


# ---------------------------------------------------------------------------
# 3. PNG rendering via Playwright
# ---------------------------------------------------------------------------

def render_png(html_path, png_path):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 728, "height": 800})
        page.goto(f"file://{os.path.abspath(html_path)}")
        page.wait_for_load_state("networkidle")
        # Crop to content height
        height = page.evaluate("document.body.scrollHeight")
        page.set_viewport_size({"width": 728, "height": height})
        page.screenshot(path=png_path, full_page=True)
        browser.close()


# ---------------------------------------------------------------------------
# 4. Main
# ---------------------------------------------------------------------------

def slugify(text):
    return re.sub(r'[^a-z0-9]+', '_', text.lower()).strip('_')


def main():
    parser = argparse.ArgumentParser(description="CHW Vote Card Generator")
    parser.add_argument("url", help="Agenda item URL")
    parser.add_argument("--mayor", default="Chow", help="Mayor's last name (default: Chow)")
    parser.add_argument("--out", default=".", help="Output directory")
    parser.add_argument("--html-only", action="store_true", help="Skip PNG rendering")
    parser.add_argument("--no-prompt", action="store_true", help="Skip title prompts, use default labels")
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)
    item_number = extract_item_number(args.url)

    print(f"Fetching {args.url} ...")
    html_src = fetch_page(args.url)

    p = AgendaParser()
    p.feed(html_src)

    if not p.votes:
        print("No votes found on page.")
        sys.exit(1)

    print(f"Found {len(p.votes)} vote(s) for {item_number}")

    for i, vote in enumerate(p.votes, 1):
        label_match = re.search(r'Vote \((.+)\)', vote["label"])
        default_label = label_match.group(1) if label_match else f"vote_{i}"

        # Show a preview so the user knows which vote they're titling
        print(f"\n── Vote {i} of {len(p.votes)} ──────────────────────────")
        print(f"  Motion:  {vote.get('motion_label') or '(no motion label)'}")
        print(f"  Default: {default_label}")
        print(f"  Result:  {vote['result']}  ({vote['yes_count']} yes / {vote['no_count']} no / {vote['absent_count']} absent)")

        if args.no_prompt:
            title = default_label
        else:
            raw = input(f"  Title [Enter to use default]: ").strip()
            title = raw if raw else default_label

        slug = slugify(title)
        base = f"{item_number.replace('.', '_')}_vote_{i}_{slug}"

        html_path = os.path.join(args.out, base + ".html")
        png_path  = os.path.join(args.out, base + ".png")

        card_html = render_vote_html(vote, item_number, args.mayor, title=title)
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(card_html)
        print(f"  Wrote {html_path}")

        if not args.html_only:
            print(f"  Rendering PNG ...")
            render_png(html_path, png_path)
            print(f"  Wrote {png_path}")

    print("Done.")


if __name__ == "__main__":
    main()