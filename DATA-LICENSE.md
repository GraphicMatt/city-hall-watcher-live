# Data licensing

The [MIT licence](LICENSE) covers the **code** in this repository. It does not
cover the data, which comes from two different places and carries two different
sets of terms. If you are reusing anything from `data/` or `council-dates/`,
this file is the one that applies to you.

---

## 1. Council coverage posts — © Matt Elliott

**Files:** `data/council-tweets.json`

These are my own posts, written while covering Toronto City Council meetings,
exported from my Twitter/X archive and filtered to council meeting dates. The
post snapshots the live site serves from its database are the same material.

**Licence:** [Creative Commons Attribution-NonCommercial 4.0 International
(CC BY-NC 4.0)](https://creativecommons.org/licenses/by-nc/4.0/)

You may quote, excerpt, analyse, and redistribute this material for
non-commercial purposes with attribution to Matt Elliott. For commercial use,
ask me first.

Attribution should name me and, where practical, link to
[live.cityhallwatcher.com](https://live.cityhallwatcher.com).

---

## 2. Council vote records and meeting schedules — City of Toronto

**Files:** `data/votes/*.json`, `council-dates/*.csv`

The vote records are scraped from the City of Toronto's published Council
Minutes. The meeting schedules come from the City's Open Data portal. Neither
is mine, and I cannot relicense them.

**Licence:** [Open Government Licence – Toronto, version 1.0](https://www.toronto.ca/city-government/data-research-maps/open-data/open-data-licence/)

If you redistribute this material, that licence requires you to acknowledge the
source. Where no more specific attribution statement is given, it specifies:

> Contains information licensed under the Open Government Licence – Toronto.

The licence permits commercial use. Note that it does not allow you to imply
City of Toronto endorsement, and it does not extend to the City's names,
crests, logos, or official symbols.

Vote records name councillors and their recorded votes. These are the official
acts of elected officials in open session, published by the City as public
record.

---

## Summary

| What | Where | Terms |
|---|---|---|
| Application code | everything outside `data/` and `council-dates/` | MIT |
| My council posts | `data/council-tweets.json` | CC BY-NC 4.0 |
| Vote records | `data/votes/` | Open Government Licence – Toronto |
| Meeting schedules | `council-dates/` | Open Government Licence – Toronto |

Derived works that mix these — a page showing my commentary beside a recorded
vote, which is most of what this app does — need to respect both sets of terms.
