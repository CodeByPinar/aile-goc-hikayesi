# Find freely licensed images on Wikimedia Commons (prints size, license, author, date for each hit).
# usage: python3 -I commons_search.py limit "query1" "query2" ...   (polite: pauses between requests, retries on 429)
import sys, json, urllib.parse, urllib.request, urllib.error, re, html, time
UA = {"User-Agent": "family-history-research/1.0 (personal, non-commercial)"}
n = int(sys.argv[1]); qs = sys.argv[2:]
strip = lambda s: re.sub(r"<[^>]+>", "", html.unescape(s or "")).strip()[:80]
def get(url):
    for wait in (0, 8, 20, 40):
        time.sleep(wait)
        try: return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30))
        except urllib.error.HTTPError as e:
            if e.code != 429: raise
    raise SystemExit("rate limited")
for q in qs:
    print("===", q, flush=True)
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
        "action": "query", "format": "json", "generator": "search", "gsrsearch": q if "filetype:" in q else q + " filetype:bitmap", "gsrnamespace": 6,
        "gsrlimit": n, "prop": "imageinfo", "iiprop": "url|size|extmetadata", "iiurlwidth": 1600})
    d = get(url)
    for p in sorted(d.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 0)):
        ii = p["imageinfo"][0]; m = ii.get("extmetadata", {})
        print(f'{p["title"][5:85]} | {ii["width"]}x{ii["height"]} | {strip(m.get("LicenseShortName", {}).get("value"))} | {strip(m.get("Artist", {}).get("value"))[:40]} | {strip(m.get("DateTimeOriginal", {}).get("value"))[:20]}', flush=True)
    time.sleep(3)
