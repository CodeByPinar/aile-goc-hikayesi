# usage: python3 -I commons_fetch.py list.tsv <project>/public/img <project>/src/data/credits.json
#   list.tsv: key<TAB>File:Title.jpg   (one image per line; keys are what story.json cues)
# Downloads a 1800 px rendition, records author/license/page for on-screen credits, merges into credits.json.
import sys as _sys; [s.reconfigure(encoding="utf-8", errors="replace") for s in (_sys.stdout, _sys.stderr) if hasattr(s, "reconfigure")]  # Windows consoles default to a legacy code page
import sys, json, urllib.parse, urllib.request, urllib.error, re, html, time, os
UA = {"User-Agent": "family-history-research/1.0 (personal, non-commercial)"}
def strip(s):
    t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html.unescape(s or ""))).strip()
    # Commons often repeats the author in a hidden element ("Unknown author Unknown author")
    h = len(t) // 2
    return t[:h].strip() if len(t) % 2 == 1 and t[:h] == t[h + 1:] else t
def req(url, raw=False):
    for wait in (0, 8, 20, 40):
        time.sleep(wait)
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60)
            return r.read() if raw else json.load(r)
        except urllib.error.HTTPError as e:
            if e.code != 429: raise
    raise SystemExit("rate limited")
rows = [l.rstrip("\n").split("\t") for l in open(sys.argv[1], encoding="utf-8") if l.strip()]
out = sys.argv[2]; os.makedirs(out, exist_ok=True)
credits = json.load(open(sys.argv[3], encoding="utf-8")) if os.path.exists(sys.argv[3]) else {}
for key, title in rows:
    d = req("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
        "action": "query", "format": "json", "titles": title, "prop": "imageinfo",
        "iiprop": "url|size|extmetadata|mime", "iiurlwidth": 1800}))
    p = next(iter(d["query"]["pages"].values()))
    if "imageinfo" not in p: print("MISSING", key, title); continue
    ii = p["imageinfo"][0]; m = ii.get("extmetadata", {})
    src = ii.get("thumburl") or ii["url"]
    data = req(src, raw=True)
    ext = ".png" if src.lower().split("?")[0].endswith(".png") else ".jpg"
    open(os.path.join(out, key + ext), "wb").write(data)
    credits[key] = {"file": key + ext, "title": title, "author": strip(m.get("Artist", {}).get("value"))[:120],
                    "license": strip(m.get("LicenseShortName", {}).get("value")), "page": ii.get("descriptionurl"),
                    "w": ii.get("thumbwidth") or ii["width"], "h": ii.get("thumbheight") or ii["height"]}
    print(key, credits[key]["w"], credits[key]["h"], credits[key]["license"], "|", credits[key]["author"][:50], flush=True)
    time.sleep(2)
json.dump(credits, open(sys.argv[3], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
