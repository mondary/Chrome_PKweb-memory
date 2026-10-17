#!/usr/bin/env python3
"""Chrome Bookmarks Sorter — parse, inventory, dedupe. Python stdlib only."""
import argparse
import json
import shutil
import sys
import time
from collections import Counter
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

TRACKING_PARAMS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "utm_id", "fbclid", "gclid", "msclkid", "dclid", "igshid", "ttclid",
    "ref", "ref_src", "ref_url", "si", "spm", "scm", "mc_cid", "mc_eid",
    "_ga", "yclid", "twclid",
}

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
BACKUPS = ROOT / "backups"


class NetscapeParser(HTMLParser):
    """Parses the Netscape bookmark HTML exported by Chrome."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.bookmarks = []
        self.folders = []
        self._pending_folder = None
        self._in_h3 = False
        self._h3_parts = []
        self._in_a = False
        self._a_parts = []
        self._a_attrs = {}

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "h3":
            self._in_h3 = True
            self._h3_parts = []
        elif tag == "dl":
            self.folders.append(self._pending_folder or "")
            self._pending_folder = None
        elif tag == "a" and a.get("href"):
            self._in_a = True
            self._a_parts = []
            self._a_attrs = a

    def handle_endtag(self, tag):
        if tag == "h3" and self._in_h3:
            self._in_h3 = False
            self._pending_folder = unescape("".join(self._h3_parts)).strip()
        elif tag == "dl" and self.folders:
            self.folders.pop()
        elif tag == "a" and self._in_a:
            self._in_a = False
            try:
                added = int(float(self._a_attrs.get("add_date") or 0))
            except ValueError:
                added = 0
            self.bookmarks.append({
                "id": len(self.bookmarks) + 1,
                "title": unescape("".join(self._a_parts)).strip(),
                "url": (self._a_attrs.get("href") or "").strip(),
                "path": [f for f in self.folders if f],
                "added": added,
            })

    def handle_data(self, data):
        if self._in_h3:
            self._h3_parts.append(data)
        elif self._in_a:
            self._a_parts.append(data)


def _from_chrome_json(node, path, out):
    if node.get("type") == "url":
        try:
            added = int(node.get("date_added", 0)) // 1_000_000
        except (TypeError, ValueError):
            added = 0
        out.append({
            "id": len(out) + 1,
            "title": node.get("name", "").strip(),
            "url": node.get("url", "").strip(),
            "path": path,
            "added": added,
        })
    elif node.get("type") == "folder":
        sub = path + ([node.get("name", "").strip()] if path else [])
        for child in node.get("children", []):
            _from_chrome_json(child, sub, out)


def load(path):
    """Load a Chrome export (Netscape HTML or raw Bookmarks JSON) into a flat list."""
    text = Path(path).read_text(encoding="utf-8", errors="replace")
    if '"roots"' in text[:2000] or Path(path).suffix.lower() == ".json":
        doc = json.loads(text)
        out = []
        for root in doc.get("roots", {}).values():
            if isinstance(root, dict):
                _from_chrome_json(root, [], out)
        for i, b in enumerate(out, 1):
            b["id"] = i
        return out
    p = NetscapeParser()
    p.feed(text)
    return p.bookmarks


def domain(url):
    netloc = urlsplit(url).netloc.lower()
    return netloc.removeprefix("www.")


def normalize(url, level=1):
    """Dedup key. L1 exact URL, L2 without tracking params, L3 without scheme/www/any params."""
    u = url.strip()
    if level <= 1:
        return u
    s = urlsplit(u)
    if level >= 3:
        scheme, netloc = "http", s.netloc.lower().removeprefix("www.")
        query = []
        path = (s.path or "/").rstrip("/") or "/"
    else:
        scheme, netloc = s.scheme.lower(), s.netloc.lower()
        query = [(k, v) for k, v in parse_qsl(s.query, keep_blank_values=True)
                 if k.lower() not in TRACKING_PARAMS]
        path = s.path or "/"
    return urlunsplit((scheme, netloc, path, urlencode(query), ""))


def dedupe(bookmarks, level=1):
    groups = {}
    for b in bookmarks:
        groups.setdefault(normalize(b["url"], level), []).append(b)
    out = []
    for key, members in groups.items():
        if len(members) < 2:
            continue
        keep = min(members, key=lambda b: (b["added"], b["id"]))
        out.append({"key": key, "keep": keep, "duplicates": [b for b in members if b is not keep]})
    out.sort(key=lambda g: -len(g["duplicates"]))
    return out


def stats(bookmarks):
    by_folder = Counter("/".join(b["path"]) or "(racine)" for b in bookmarks)
    by_domain = Counter(domain(b["url"]) for b in bookmarks)
    untitled = sum(1 for b in bookmarks if not b["title"])
    return {
        "total": len(bookmarks),
        "untitled": untitled,
        "folders": by_folder.most_common(),
        "domains": by_domain.most_common(),
    }


def print_stats(st):
    print(f"Total: {st['total']} bookmarks  ({st['untitled']} sans titre)")
    print(f"Dossiers distincts: {len(st['folders'])}   Domaines distincts: {len(st['domains'])}")
    print("\nTop dossiers:")
    for path, n in st["folders"][:20]:
        print(f"  {n:5d}  {path}")
    print("\nTop domaines:")
    for d, n in st["domains"][:20]:
        print(f"  {n:5d}  {d}")


def print_dedupe(groups, level):
    n = sum(len(g["duplicates"]) for g in groups)
    print(f"Niveau {level}: {len(groups)} groupes, {n} doublons a retirer")
    for g in groups[:15]:
        print(f"\n  GARDE  [{g['keep']['id']}] {g['keep']['title'][:60]}")
        print(f"         {g['keep']['url'][:90]}")
        for d in g["duplicates"]:
            print(f"  suppr  [{d['id']}] ({'/'.join(d['path'])}) {d['url'][:80]}")


def cmd_stats(args):
    bms = load(args.file)
    st = stats(bms)
    print_stats(st)
    DATA.mkdir(exist_ok=True)
    (DATA / "inventory.json").write_text(
        json.dumps({"bookmarks": bms, "stats": st}, ensure_ascii=False, indent=1),
        encoding="utf-8")
    print(f"\n-> {DATA / 'inventory.json'}")


def cmd_dedupe(args):
    bms = load(args.file)
    groups = dedupe(bms, args.level)
    print_dedupe(groups, args.level)
    report = {
        "generated": int(time.time()),
        "source": str(args.file),
        "level": args.level,
        "groups": groups,
    }
    DATA.mkdir(exist_ok=True)
    out = DATA / "dedupe_report.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n-> {out}")


def cmd_backup(args):
    src = Path(args.file)
    BACKUPS.mkdir(exist_ok=True)
    dest = BACKUPS / f"{src.stem}_{time.strftime('%Y%m%d_%H%M%S')}{src.suffix}"
    shutil.copy2(src, dest)
    bms = load(src)
    DATA.mkdir(exist_ok=True)
    (DATA / "bookmarks.json").write_text(
        json.dumps(bms, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Backup: {dest}")
    print(f"Copy de travail: {DATA / 'bookmarks.json'} ({len(bms)} bookmarks)")


def main():
    ap = argparse.ArgumentParser(description="Chrome Bookmarks Sorter")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("stats", help="inventaire: total, dossiers, domaines")
    p.add_argument("file")
    p.set_defaults(func=cmd_stats)

    p = sub.add_parser("dedupe", help="detecte les doublons")
    p.add_argument("file")
    p.add_argument("--level", type=int, choices=[1, 2, 3], default=1,
                   help="1=URL stricte (defaut), 2=sans params de tracking, 3=sans scheme/www/params")
    p.set_defaults(func=cmd_dedupe)

    p = sub.add_parser("backup", help="backup horodate + copie de travail normalisee")
    p.add_argument("file")
    p.set_defaults(func=cmd_backup)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
