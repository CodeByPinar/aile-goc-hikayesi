# Search digitised archives and libraries that offer free, keyless APIs, and print ready-made search
# links for the important archives that have no API (read those with WebFetch or the browser).
#
# usage: python3 -I archives.py "Kavala tobacco" ["Salonique 1912" ...] [--n 8] [--only ia,europeana] [--links]
#
#   ia         Internet Archive: digitised books, Ottoman salnames, travel accounts, old periodicals
#   europeana  Europeana aggregate of European libraries, archives, museums (public demo key)
#   --links    also print search URLs for archives that block scripts or have no API: Library of Congress,
#              Gallica, Ottoman state archives, DergiPark, HathiTrust, ANNO, ... (open them with WebFetch
#              or the browser; do not try to get around a site that refuses automated clients)
#
# Query with place + period + topic words. Never include a family member's name.
import sys as _sys; [s.reconfigure(encoding="utf-8", errors="replace") for s in (_sys.stdout, _sys.stderr) if hasattr(s, "reconfigure")]  # Windows consoles default to a legacy code page
import json, re, sys, time, urllib.parse, urllib.request

UA = {"User-Agent": "family-history-research/1.0 (personal, non-commercial)"}


def fetch(url, as_json=True):
    for wait in (0, 5, 15):
        time.sleep(wait)
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40)
            return json.load(r) if as_json else r.read()
        except Exception as e:  # noqa: BLE001
            err = e
    print(f"   (request failed: {err})")
    return None


def ia(q, n):
    d = fetch("https://archive.org/advancedsearch.php?" + urllib.parse.urlencode(
        {"q": q, "fl[]": ["identifier", "title", "date", "mediatype", "language", "creator"], "rows": n, "output": "json"}, doseq=True))
    for doc in ((d or {}).get("response") or {}).get("docs", []):
        yield (str(doc.get("date", ""))[:4], doc.get("title"), doc.get("mediatype"), doc.get("language"),
               "https://archive.org/details/" + doc["identifier"])



def europeana(q, n):
    d = fetch("https://api.europeana.eu/record/v2/search.json?" + urllib.parse.urlencode(
        {"wskey": "api2demo", "query": q, "rows": n, "profile": "minimal"}))
    for it in (d or {}).get("items", []):
        yield ((it.get("year") or [""])[0], (it.get("title") or [""])[0], it.get("type"), ",".join(it.get("language", [])[:2]),
               it.get("guid", "").split("?")[0])


LINKS = {
    "Ottoman State Archives catalogue (BOA, Devlet Arşivleri)": "https://katalog.devletarsivleri.gov.tr/",
    "DergiPark (Turkish journals)": "https://dergipark.org.tr/tr/search?q={q}",
    "YÖK Ulusal Tez Merkezi (Turkish theses)": "https://tez.yok.gov.tr/UlusalTezMerkezi/",
    "Nişanyan Map / Index Anatolicus (old & new village names)": "https://www.nisanyanmap.com/?q={q}",
    "Google Books": "https://www.google.com/search?tbm=bks&q={q}",
    "HathiTrust full-text search": "https://babel.hathitrust.org/cgi/ls?q1={q};anyall1=phrase;lmt=ft",
    "JSTOR (open content filter)": "https://www.jstor.org/action/doBasicSearch?Query={q}",
    "ANNO, Austrian newspapers (Bosnia, Habsburg Balkans)": "https://anno.onb.ac.at/anno-suche#searchMode=simple&query={q}",
    "Greek press archive, National Library of Greece": "https://efimeris.nlg.gr/",
    "SALT Research (Ottoman photos, maps, postcards)": "https://archives.saltresearch.org/discover?query={q}",
    "Library of Congress (photos, maps; Abdul Hamid II albums)": "https://www.loc.gov/photos/?q={q}",
    "Chronicling America (US press 1770-1963)": "https://www.loc.gov/collections/chronicling-america/?q={q}",
    "Gallica, BnF (French press on the Levant and Balkans)": "https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&query=gallica%20all%20%22{q}%22",
    "Wikimedia Commons": "https://commons.wikimedia.org/w/index.php?search={q}&title=Special:MediaSearch&type=image",
}


def main():
    a = sys.argv[1:]
    opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    n = int(opt("--n", "8"))
    only = (opt("--only") or "ia,europeana").split(",")
    skip = {opt("--n"), opt("--only")}
    qs = [x for x in a if not x.startswith("--") and x not in skip]
    srcs = {"ia": ia, "europeana": europeana}
    for q in qs:
        print(f"=== {q}")
        for name in only:
            print(f" [{name}]")
            for date_, title, kind, lang, url in srcs[name](q, n) or []:
                title = re.sub(r"\s+", " ", str(title or ""))[:110]
                print(f"  - {date_ or '????'} | {title} | {kind or ''} | {lang or ''} | {url}")
            time.sleep(1)
        if "--links" in a:
            print(" [no-API archives: open with WebFetch or the browser]")
            for k, v in LINKS.items():
                print(f"  - {k}: {v.format(q=urllib.parse.quote(q))}")


if __name__ == "__main__":
    main()
