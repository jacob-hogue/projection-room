"""Draft the area code lineage table from NANPA's NPA report and Wikipedia's 1947 list.

Writes lineage_draft.csv next to this file. It never writes lineage.csv; that file is
curated by hand from the draft, row by row, with a source per row.

Sources:
- NANPA NPA report (CSV, refreshed daily): https://reports.nanpa.com/public/npa_report.csv
  Columns used: NPA_ID, type_of_code, COUNTRY, LOCATION, IN_SERVICE, IN_SERVICE_DT,
  OVERLAY_COMPLEX, PARENT_NPA_ID.
- Wikipedia, "Original North American area codes" (the 86 codes of October 1947).

Rules:
- type "original": the code is in the 1947 table.
- type "overlay": the child's NANPA overlay complex lists its parent (same territory).
- type "split": the child has a parent and is not in the parent's overlay complex.
- year: the year of NANPA's IN_SERVICE_DT; originals are forced to 1947.
- confidence "low": no parent in NANPA for a non-original code, or a parent newer than
  the child. These rows are the hand-check list.
"""
from __future__ import annotations

import csv
import json
import pathlib
import re
import sys
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
CACHE = HERE.parent.parent.parent / ".cache"
NANPA_URL = "https://reports.nanpa.com/public/npa_report.csv"
WIKI_API = (
    "https://en.wikipedia.org/w/api.php?action=parse&page=Original_North_American_area_codes"
    "&prop=wikitext&format=json&formatversion=2"
)
WIKI_PAGE = "https://en.wikipedia.org/wiki/Original_North_American_area_codes"
UA = "lab-dial-pulse/0.1 (https://jacob-hogue.github.io/lab/)"
ROW_RE = re.compile(
    r"^\|\s*\[\[Area code (\d{3})\|\d{3}\]\]\s*\|\|\s*(?:\{\{Hidden sort key\|([A-Z]{2}:[A-Z]{2})\}\})?\s*(.*)$",
    re.M,
)


def fetch(url: str, dest: pathlib.Path) -> pathlib.Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists():
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as f:
            f.write(r.read())
    return dest


def strip_wiki(text: str) -> str:
    text = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]", r"\1", text)
    text = re.sub(r"<ref[^>]*>.*?</ref>|<ref[^>]*/>", "", text)
    text = re.sub(r"\{\{[^}]*\}\}", "", text)
    return text.strip()


def originals() -> dict[str, str]:
    path = fetch(WIKI_API, CACHE / "wiki_originals.json")
    wikitext = json.load(open(path, encoding="utf-8"))["parse"]["wikitext"]
    return {code: strip_wiki(territory) for code, _, territory in ROW_RE.findall(wikitext)}


def nanpa_rows() -> list[dict[str, str]]:
    path = fetch(NANPA_URL, CACHE / "npa_report.csv")
    lines = open(path, encoding="utf-8-sig", newline="").read().splitlines()
    if lines and lines[0].startswith("File Date"):
        lines = lines[1:]
    return list(csv.DictReader(lines))


def main() -> int:
    orig = originals()
    rows = nanpa_rows()
    geographic = [
        r for r in rows
        if r["type_of_code"].startswith("General")
        and r["IN_SERVICE"].strip() == "Y"
        and r["COUNTRY"].strip().upper() in {"US", "CANADA", "CA"}
    ]
    by_code = {r["NPA_ID"].strip(): r for r in geographic}
    out = []
    for code, r in sorted(by_code.items()):
        parent = r["PARENT_NPA_ID"].strip()
        year = r["IN_SERVICE_DT"].strip()[-4:] if r["IN_SERVICE_DT"].strip() else ""
        complex_codes = set(re.findall(r"\d{3}", r["OVERLAY_COMPLEX"]))
        confidence = "high"
        note = ""
        if code in orig:
            kind, parent, year = "original", "", "1947"
            note = orig[code]
        elif parent and parent in complex_codes:
            kind = "overlay"
        elif parent:
            kind = "split"
        else:
            kind = "split"
            confidence = "low"
            note = "no parent in NANPA report; fill from the Wikipedia article"
        if parent and parent in by_code and year:
            pyear = by_code[parent]["IN_SERVICE_DT"].strip()[-4:]
            if parent in orig:
                pyear = "1947"
            if pyear and int(pyear) > int(year):
                confidence = "low"
                note = f"parent {parent} newer than child in NANPA report"
        if parent and parent not in by_code:
            confidence = "low"
            note = f"parent {parent} not a geographic code in service"
        country = r["COUNTRY"].strip().upper()
        if r["LOCATION"].strip() in {"AK", "HI"}:
            note = (note + "; " if note else "") + "outside lower 48"
        if country != "US":
            note = (note + "; " if note else "") + "Canada"
        source = WIKI_PAGE if kind == "original" else NANPA_URL
        out.append({"code": code, "parent": parent, "year": year, "type": kind,
                    "note": note, "source": source, "confidence": confidence})
    missing_originals = sorted(set(orig) - set(by_code))
    for code in missing_originals:
        out.append({"code": code, "parent": "", "year": "1947", "type": "original",
                    "note": orig[code] + "; not in NANPA in-service list", "source": WIKI_PAGE,
                    "confidence": "low"})
    out.sort(key=lambda d: d["code"])
    with open(HERE / "lineage_draft.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["code", "parent", "year", "type", "note", "source", "confidence"])
        w.writeheader(); w.writerows(out)
    low = [d for d in out if d["confidence"] == "low"]
    print(f"originals from Wikipedia: {len(orig)}; geographic codes in NANPA: {len(by_code)}; "
          f"draft rows: {len(out)}; hand-check rows: {len(low)}")
    for d in low:
        print(f"  {d['code']} parent={d['parent'] or '-'} year={d['year']} {d['type']}: {d['note']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
