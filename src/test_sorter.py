#!/usr/bin/env python3
"""Self-check for sorter.py — run: python3 src/test_sorter.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sorter import dedupe, load, normalize, stats

FIXTURE = """<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1600000000">Outils</H3>
    <DL><p>
        <DT><A HREF="https://example.com/" ADD_DATE="1600000001">Example</A>
        <DT><A HREF="https://example.com/" ADD_DATE="1610000000">Example (copie)</A>
        <DT><A HREF="https://example.com/pricing?utm_source=nl&utm_campaign=x" ADD_DATE="1600000002">Example pricing</A>
        <DT><A HREF="https://example.com/pricing?fbclid=abc" ADD_DATE="1620000000">Example pricing 2</A>
        <DT><A HREF="http://www.example.com/pricing" ADD_DATE="1630000000">Example pricing 3</A>
        <DT><H3 ADD_DATE="1600000005">Social</H3>
        <DL><p>
            <DT><A HREF="https://linkedin.com/in/clm" ADD_DATE="1600000010">Clément</A>
            <DT><A HREF="https://linkedin.com/in/johanna" ADD_DATE="1600000011">Johanna</A>
        </DL><p>
    </DL><p>
</DL><p>
"""

tmp = Path("/tmp/sorter_test.html")
tmp.write_text(FIXTURE, encoding="utf-8")

bms = load(tmp)
assert len(bms) == 7, f"parse: {len(bms)} != 7"
assert bms[0]["path"] == ["Outils"], bms[0]["path"]
assert bms[6]["path"] == ["Outils", "Social"], bms[6]["path"]
assert bms[6]["title"] == "Johanna"
assert bms[0]["added"] == 1600000001
assert bms[0]["id"] == 1 and bms[6]["id"] == 7

st = stats(bms)
assert st["total"] == 7
assert st["domains"][0] == ("example.com", 5)

# L1: strict — only the exact duplicate
g1 = dedupe(bms, 1)
assert len(g1) == 1 and len(g1[0]["duplicates"]) == 1, g1
assert g1[0]["keep"]["title"] == "Example"

# L2: + tracking params — utm/fbclid pricing duplicates merge (http://www. only merges at L3)
g2 = dedupe(bms, 2)
assert len(g2) == 2, [g["key"] for g in g2]
assert sorted(len(g["duplicates"]) for g in g2) == [1, 1]

# L3: + scheme/www/params — all 3 example.com/pricing merge
g3 = dedupe(bms, 3)
assert len(g3) == 2, [g["key"] for g in g3]
assert len([g for g in g3 if len(g["duplicates"]) == 2]) == 1

# L3 keeps the oldest bookmark
big = [g for g in g3 if len(g["duplicates"]) == 2][0]
assert big["keep"]["added"] == 1600000002

# Distinct LinkedIn profiles are never merged
assert normalize("https://linkedin.com/in/clm", 3) != normalize("https://linkedin.com/in/johanna", 3)

assert normalize("https://Example.com/A/?x=1#top", 3) == "http://example.com/A"
assert normalize("http://example.com/A", 3) == normalize("https://www.example.com/A/", 3)
assert normalize("https://a.b/c?utm_source=x&id=7", 2) == "https://a.b/c?id=7"

print("OK — 15/15 asserts pass")
