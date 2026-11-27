# Search academic literature (journal articles, theses, book chapters) about a place and period.
# OpenAlex indexes most DOI-registered work, including much of DergiPark (Turkish journals);
# Crossref catches what OpenAlex misses. Both are free and need no key.
#
# usage: python3 -I papers.py "Urla mübadele" ["Kavala tobacco 1910" ...] [--n 8] [--from 1990] [--oa]
#   --oa   only results with an open-access full text
#
# Query with place + topic + period words, never with a family member's name.
import sys as _sys; [s.reconfigure(encoding="utf-8", errors="replace") for s in (_sys.stdout, _sys.stderr) if hasattr(s, "reconfigure")]  # Windows consoles default to a legacy code page
import json, os, sys, time, urllib.parse, urllib.request

UA = {"User-Agent": "family-history-research/1.0 (personal, non-commercial)"}


def get(url):
    for wait in (0, 5, 15):
        time.sleep(wait)
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40))
        except Exception as e:  # noqa: BLE001
            err = e
    print(f"   (request failed: {err})")
    return {}


def openalex(q, n, since, oa):
    flt = [f"from_publication_date:{since}-01-01"] if since else []
    if oa:
        flt.append("is_oa:true")
    p = {"search": q, "per_page": n, "select": "id,doi,title,publication_year,primary_location,open_access,cited_by_count,authorships,language,type"}
    if flt:
        p["filter"] = ",".join(flt)
    if os.environ.get("OPENALEX_API_KEY"):  # optional: the user's own key raises the shared daily budget
        p["api_key"] = os.environ["OPENALEX_API_KEY"]
    # OpenAlex rejects percent-encoded commas and colons in select/filter
    d = get("https://api.openalex.org/works?" + urllib.parse.urlencode(p, safe=",:"))
    out = []
    for w in d.get("results", []):
        src = ((w.get("primary_location") or {}).get("source") or {}).get("display_name")
        out.append({
            "title": w.get("title"), "year": w.get("publication_year"), "venue": src, "type": w.get("type"),
            "authors": ", ".join(a["author"]["display_name"] for a in (w.get("authorships") or [])[:3]),
            "doi": w.get("doi"), "oa_url": (w.get("open_access") or {}).get("oa_url"), "cited": w.get("cited_by_count"),
            "lang": w.get("language"), "via": "openalex",
        })
    return out


def crossref(q, n, since):
    p = {"query.bibliographic": q, "rows": n, "select": "DOI,title,issued,container-title,author,type,URL"}
    if since:
        p["filter"] = f"from-pub-date:{since}"
    d = get("https://api.crossref.org/works?" + urllib.parse.urlencode(p, safe=",:"))
    out = []
    for w in d.get("message", {}).get("items", []):
        out.append({
            "title": (w.get("title") or [""])[0], "year": ((w.get("issued") or {}).get("date-parts") or [[None]])[0][0],
            "venue": (w.get("container-title") or [""])[0], "type": w.get("type"),
            "authors": ", ".join(f"{a.get('given', '')} {a.get('family', '')}".strip() for a in (w.get("author") or [])[:3]),
            "doi": "https://doi.org/" + w["DOI"] if w.get("DOI") else None, "oa_url": None, "cited": None,
            "lang": w.get("language"), "via": "crossref",
        })
    return out


def main():
    a = sys.argv[1:]
    opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    n, since, oa = int(opt("--n", "8")), opt("--from"), "--oa" in a
    skip = {opt("--n"), opt("--from")}
    qs = [x for x in a if not x.startswith("--") and x not in skip]
    for q in qs:
        print(f"=== {q}")
        seen = set()
        for r in openalex(q, n, since, oa) + ([] if oa else crossref(q, max(3, n // 2), since)):
            key = (r["doi"] or r["title"] or "").lower()
            if key in seen or not r["title"]:
                continue
            seen.add(key)
            link = r["oa_url"] or r["doi"] or ""
            print(f"- {r['year']} | {r['title'][:110]} | {r['authors'][:60]} | {(r['venue'] or '')[:50]} | {r['type']} | {link}")
        time.sleep(1)


if __name__ == "__main__":
    main()
