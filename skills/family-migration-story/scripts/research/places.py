# Resolve a place name (as written in a civil register) to Wikidata candidates: coordinates, names in
# other languages and scripts (old names matter: Karaferye = Βέροια, Veria), the administrative
# chain, population and the Wikipedia articles to read next.
#
# usage: python3 -I places.py "Karaferye" [--lang tr] [--n 5] [--near 22.2,40.52]
#        python3 -I places.py --qid Q1018427
#
# Send only the place name. Never put a person's name in a query.
import json, sys, time, urllib.parse, urllib.request

UA = {"User-Agent": "family-history-research/1.0 (personal, non-commercial)"}
API = "https://www.wikidata.org/w/api.php?"
LANGS = ["tr", "en", "el", "bg", "sr", "bs", "hr", "mk", "sq", "ro", "hu", "ru", "uk", "hy", "ka", "az", "ar", "fa", "de", "fr", "it", "pl", "he", "yi"]


def get(params):
    url = API + urllib.parse.urlencode({**params, "format": "json"})
    for wait in (0, 5, 15):
        time.sleep(wait)
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30))
        except Exception as e:  # noqa: BLE001 - retry on transient network errors
            err = e
    raise SystemExit(f"wikidata request failed: {err}")


def claim_vals(ent, pid):
    out = []
    for c in ent.get("claims", {}).get(pid, []):
        dv = c["mainsnak"].get("datavalue", {}).get("value")
        if dv is None:
            continue
        q = {k: [s.get("datavalue", {}).get("value") for s in v] for k, v in c.get("qualifiers", {}).items()}
        out.append((dv, q))
    return out


def labels_for(qids, lang):
    qids = [q for q in qids if q]
    res = {}
    for i in range(0, len(qids), 45):
        d = get({"action": "wbgetentities", "ids": "|".join(qids[i:i + 45]), "props": "labels", "languages": f"{lang}|en"})
        for q, e in d.get("entities", {}).items():
            lb = e.get("labels", {})
            res[q] = (lb.get(lang) or lb.get("en") or {}).get("value", q)
    return res


def describe(qids, lang):
    d = get({"action": "wbgetentities", "ids": "|".join(qids), "props": "labels|descriptions|claims|sitelinks|aliases", "languages": "|".join(LANGS)})
    ents = d.get("entities", {})
    refs = set()
    for e in ents.values():
        for pid in ("P31", "P17", "P131"):
            refs.update(v["id"] for v, _ in claim_vals(e, pid) if isinstance(v, dict) and "id" in v)
    names = labels_for(sorted(refs), lang)
    out = []
    for q in qids:
        e = ents.get(q, {})
        coord = next((v for v, _ in claim_vals(e, "P625")), None)
        pops = sorted(((v["amount"].lstrip("+"), (qq.get("P585") or [{}])[0]) for v, qq in claim_vals(e, "P1082")), key=lambda x: str(x[1]))
        official = [(v.get("text"), v.get("language"), [(x or {}).get("time", "")[:5] for x in qq.get("P580", [])], [(x or {}).get("time", "")[:5] for x in qq.get("P582", [])])
                    for v, qq in claim_vals(e, "P1448")]
        in_admin = []
        for v, qq in claim_vals(e, "P131"):
            start = [(x or {}).get("time", "")[1:5] for x in qq.get("P580", [])]
            end = [(x or {}).get("time", "")[1:5] for x in qq.get("P582", [])]
            in_admin.append(names.get(v["id"], v["id"]) + (f" ({'/'.join(start) or '?'}–{'/'.join(end) or ''})" if start or end else ""))
        out.append({
            "qid": q,
            "label": (e.get("labels", {}).get(lang) or e.get("labels", {}).get("en") or {}).get("value"),
            "description": (e.get("descriptions", {}).get(lang) or e.get("descriptions", {}).get("en") or {}).get("value"),
            "coords": [round(coord["longitude"], 4), round(coord["latitude"], 4)] if coord else None,
            "instance_of": [names.get(v["id"], v["id"]) for v, _ in claim_vals(e, "P31") if isinstance(v, dict)][:4],
            "country": [names.get(v["id"], v["id"]) for v, _ in claim_vals(e, "P17") if isinstance(v, dict)][:3],
            "located_in": in_admin[:6],
            "names": {l: v["value"] for l, v in e.get("labels", {}).items()},
            "aliases": {l: [a["value"] for a in v] for l, v in e.get("aliases", {}).items() if l in ("tr", "en", "el", "bg", "sr", "ota", "de")},
            "official_names": official,
            "population": pops[-3:],
            "wikipedia": {k[:-4]: f"https://{k[:-4]}.wikipedia.org/wiki/" + urllib.parse.quote(v["title"].replace(" ", "_"))
                          for k, v in e.get("sitelinks", {}).items() if k.endswith("wiki") and k[:-4] in LANGS and k != "commonswiki"},
            "commons_category": next((v for v, _ in claim_vals(e, "P373")), None),
        })
    return out


def main():
    a = sys.argv[1:]
    opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    lang, n = opt("--lang", "tr"), int(opt("--n", "5"))
    if "--qid" in a:
        print(json.dumps(describe([opt("--qid")], lang), ensure_ascii=False, indent=1))
        return
    name = a[0]
    hits = []
    for L in dict.fromkeys([lang, "en"]):
        d = get({"action": "wbsearchentities", "search": name, "language": L, "uselang": lang, "type": "item", "limit": n})
        hits += [h["id"] for h in d.get("search", []) if h["id"] not in hits]
    if not hits:
        print("[]  (no match: try the modern name, another spelling, or the name in the local language)")
        return
    res = describe(hits[: n * 2], lang)
    near = opt("--near")
    if near:
        lon, lat = map(float, near.split(","))
        res.sort(key=lambda r: (r["coords"] is None, ((r["coords"] or [999, 999])[0] - lon) ** 2 + ((r["coords"] or [999, 999])[1] - lat) ** 2))
    print(json.dumps(res[:n], ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
