# The interactive atlas inside report.html: a map with a year slider. Moving the slider (or pressing
# play) shows where the family was in that year, the routes they had travelled, the state borders of
# the time, and what happened that year. Clicking a place opens its graded and cited findings.
#
# Everything is inlined into the report (map, data, script): it opens offline and sends nothing anywhere.
#
# Map data, best first:
#   1. <video>/src/data/geo.json from `npm run geo` (land, today's borders, period borders, routes)
#   2. otherwise the land outline only, built here from Natural Earth (downloaded once into
#      ~/.cache/family-migration-story, the same file the video uses)
import base64, json, math, os, re, urllib.request

CACHE = os.path.join(os.path.expanduser("~"), ".cache", "family-migration-story")
FIRST_YEAR = re.compile(r"\b(1[0-9]{3}|20[0-9]{2})\b")


def first_year(s):
    m = FIRST_YEAR.search(str(s or ""))
    return int(m.group(1)) if m else None


# ---------------------------------------------------------------- land outline without a video project
def _merc(lat):
    return math.degrees(math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)))


def _land_geo(points):
    lons, lats = [p[0] for p in points], [p[1] for p in points]
    w, e, s, n = min(lons), max(lons), min(lats), max(lats)
    span = max(e - w, (n - s) * 1.6, 6)
    cx, cy, m = (w + e) / 2, (s + n) / 2, 0.18
    w, e = cx - span / 2 * (1 + 2 * m), cx + span / 2 * (1 + 2 * m)
    hs = max(n - s, span / 1.9) / 2 * (1 + 2 * m)
    s, n = max(-80, cy - hs), min(84, cy + hs)
    bb = {"w": round(w, 2), "e": round(e, 2), "s": round(s, 2), "n": round(n, 2)}
    S = 1260 / (bb["e"] - bb["w"])
    W, H = (bb["e"] - bb["w"]) * S, (_merc(bb["n"]) - _merc(bb["s"])) * S
    proj = lambda p: ((p[0] - bb["w"]) * S, (_merc(bb["n"]) - _merc(max(-85, min(85, p[1])))) * S)

    f = os.path.join(CACHE, "world-atlas", "land-10m.json")
    if not os.path.exists(f):
        os.makedirs(os.path.dirname(f), exist_ok=True)
        url = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-10m.json"
        print("downloading", url)
        data = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "family-history-report/1.0"}), timeout=120).read()
        open(f, "wb").write(data)
    topo = json.load(open(f, encoding="utf-8"))
    sc, tr = topo["transform"]["scale"], topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append((x * sc[0] + tr[0], y * sc[1] + tr[1]))
        arcs.append(pts)

    def ring_of(idxs):
        out = []
        for i in idxs:
            a = arcs[~i][::-1] if i < 0 else arcs[i]
            out.extend(a[1:] if out else a)
        return out

    M = 6
    def clip(ring):
        out = ring
        for inside, inter in (
            (lambda p: p[0] >= -M, lambda a, b: (-M, a[1] + (-M - a[0]) / (b[0] - a[0]) * (b[1] - a[1]))),
            (lambda p: p[0] <= W + M, lambda a, b: (W + M, a[1] + (W + M - a[0]) / (b[0] - a[0]) * (b[1] - a[1]))),
            (lambda p: p[1] >= -M, lambda a, b: (a[0] + (-M - a[1]) / (b[1] - a[1]) * (b[0] - a[0]), -M)),
            (lambda p: p[1] <= H + M, lambda a, b: (a[0] + (H + M - a[1]) / (b[1] - a[1]) * (b[0] - a[0]), H + M)),
        ):
            inp, out = out, []
            for k, cur in enumerate(inp):
                prev = inp[k - 1]
                if inside(cur):
                    if not inside(prev):
                        out.append(inter(prev, cur))
                    out.append(cur)
                elif inside(prev):
                    out.append(inter(prev, cur))
        return out

    tol = 0.009 * S * max(1, (bb["e"] - bb["w"]) / 31.5)
    def simplify(p):
        if len(p) < 4:
            return p
        keep = [False] * len(p)
        keep[0] = keep[-1] = True
        stack = [(0, len(p) - 1)]
        while stack:
            i, j = stack.pop()
            ax, ay = p[i]
            bx, by = p[j]
            dx, dy = bx - ax, by - ay
            L = dx * dx + dy * dy
            md, mi = -1, -1
            for k in range(i + 1, j):
                t = max(0, min(1, ((p[k][0] - ax) * dx + (p[k][1] - ay) * dy) / L)) if L else 0
                d = math.hypot(ax + t * dx - p[k][0], ay + t * dy - p[k][1])
                if d > md:
                    md, mi = d, k
            if mi > 0 and md > tol:
                keep[mi] = True
                stack += [(i, mi), (mi, j)]
        return [q for q, k in zip(p, keep) if k]

    d = []
    geoms = topo["objects"]["land"].get("geometries") or [topo["objects"]["land"]]
    for g in geoms:
        for poly in ([g["arcs"]] if g["type"] == "Polygon" else g["arcs"]):
            for idxs in poly:
                ring = ring_of(idxs)
                rx, ry = [q[0] for q in ring], [q[1] for q in ring]
                if max(rx) < bb["w"] - 1 or min(rx) > bb["e"] + 1 or max(ry) < bb["s"] - 1 or min(ry) > bb["n"] + 1:
                    continue
                ring = clip([proj(q) for q in ring])
                if len(ring) < 3:
                    continue
                ring = simplify(ring + [ring[0]])[:-1]
                if len(ring) < 3:
                    continue
                d.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in ring) + "Z")
    return {"bb": bb, "S": S, "W": round(W, 2), "H": round(H, 2), "land": "".join(d), "borders": "", "eras": [], "sceneEra": {}}


# ---------------------------------------------------------------- data for the page
def _media(media_tsv, video_dir, out_dir):
    """Family photos and documents: research/family-media.tsv, the same list `npm run family` reads.
    Columns: key, file, title, photo|document, credit, [dossier place id], [year]."""
    if not media_tsv or not os.path.exists(media_tsv):
        return []
    base = os.path.dirname(os.path.abspath(media_tsv))
    out = []
    for line in open(media_tsv, encoding="utf-8-sig"):
        if not line.strip() or line.startswith("#"):
            continue
        c = [x.strip() for x in line.rstrip("\n").split("\t")] + [""] * 7
        key, file, title, kind, credit, place, year = c[:7]
        src = file if os.path.isabs(file) else os.path.join(base, file)
        small = os.path.join(video_dir, "public", "img", key + ".jpg") if video_dir else ""
        if small and os.path.exists(small):  # resized by `npm run family`: small enough to embed
            url = "data:image/jpeg;base64," + base64.b64encode(open(small, "rb").read()).decode()
        elif os.path.exists(src):  # not resized: link to the original next to the report
            url = os.path.relpath(src, out_dir).replace(os.sep, "/")
        else:
            print(f"WARN family media {key}: {src} not found")
            continue
        out.append({"key": key, "url": url, "title": title or key, "kind": kind or "photo", "credit": credit, "place": place, "year": first_year(year)})
    return out


def build(t, P, d, L, lang, name, year, video_dir=None, media_tsv=None, out_dir="."):
    """Return (atlas_html, media_html). Either is empty when there is nothing to show."""
    places = {pid: pl for pid, pl in d.get("places", {}).items() if isinstance(pl.get("c"), list) and len(pl["c"]) == 2}
    media = _media(media_tsv, video_dir, out_dir)
    media_html = ""
    if media:
        cards = "".join(
            f'<figure class="fm {"doc" if m["kind"] == "document" else ""}"><a href="{m["url"]}" target="_blank" rel="noopener">'
            f'<img loading="lazy" src="{m["url"]}" alt=""></a><figcaption>{_e(m["title"])}'
            f'{" · " + str(m["year"]) if m["year"] else ""}{"<span>" + _e(m["credit"]) + "</span>" if m["credit"] else ""}</figcaption></figure>'
            for m in media)
        media_html = f'<h2>{L["media"]}</h2><div class="fmgrid">{cards}</div>'
    if not places:
        return "", media_html

    geo, routes = None, []
    if video_dir and os.path.exists(os.path.join(video_dir, "src", "data", "geo.json")):
        data = lambda f, dflt: json.load(open(os.path.join(video_dir, "src", "data", f), encoding="utf-8")) if os.path.exists(os.path.join(video_dir, "src", "data", f)) else dflt
        geo = data("geo.json", None)
        story, rts, branches = data("story.json", []), data("routes.json", []), data("branches.json", {})
        r_year = {}
        for sc in story:
            for rid, *_ in sc.get("routes", []):
                r_year.setdefault(rid, first_year(sc.get("years")))
        pal = ["#7fb1e6", "#e9a25a", "#78cf95", "#bb98ea", "#e58f9c", "#d9c36a", "#6fc7c2", "#b4bcc6"]
        bkeys = list(branches)
        for r in rts:
            colr = (branches.get(r.get("b"), {}) or {}).get("color") or pal[max(0, bkeys.index(r["b"]) if r.get("b") in bkeys else 0) % 8]
            routes.append({"pts": r["pts"], "y": r_year.get(r["id"]), "dotted": bool(r.get("dotted")), "bend": r.get("bend", 0.18), "c": colr})
        # which borders to show for a year: the earliest year each period map is used for
        eras_by_year = {}
        for se in (geo.get("sceneEra") or {}).values():
            eras_by_year[se["e"]] = min(eras_by_year.get(se["e"], 9999), se["y"])
        geo["eraYears"] = sorted([y, e] for e, y in eras_by_year.items())
        for k in ("sceneEra",):
            geo.pop(k, None)
        for era in geo.get("eras", []):
            for k in ("labels", "labelsV", "at"):
                era.pop(k, None)
    if not geo:
        geo = _land_geo([pl["c"] for pl in places.values()])
        geo["eraYears"] = []

    # places: who was born there, when the family first appears there
    alias = {raw.lower(): pid for pid, pl in places.items() for raw in pl.get("raw", []) + [pl.get("name", "")] if raw}
    born = {pid: [] for pid in places}
    for p in t["people"]:
        pid = alias.get(str((p.get("birth") or {}).get("place") or "").lower())
        if pid:
            born[pid].append(p["id"])
    claims = {pid: [] for pid in places}
    for c in d.get("claims", []):
        if c.get("place") in claims:
            claims[c["place"]].append({"when": str(c.get("when") or ""), "text": c.get("text", ""), "conf": c.get("confidence", ""),
                                       "src": c.get("sources", []), "fam": bool(c.get("people"))})
    src_num = {s: i + 1 for i, s in enumerate(d.get("sources", {}))}
    pl_out = {}
    for pid, pl in places.items():
        ids = list(dict.fromkeys((pl.get("people") or []) + born[pid]))
        people = sorted(({"n": name(P[x]), "b": year(P[x]["birth"].get("date"))} for x in ids if x in P), key=lambda q: q["b"] or 0)
        # a place shows from the first time the family is there: a birth, or a dated finding about a family
        # member (an arrival, a register entry); failing both, from its first dated finding
        fam = [q["b"] for q in people if q["b"]] + [first_year(c["when"]) for c in claims[pid] if c["fam"] and first_year(c["when"])]
        any_ = [first_year(c["when"]) for c in claims[pid] if first_year(c["when"])]
        first = min(fam, default=None) or min(any_, default=None)
        pl_out[pid] = {"n": pl.get("name", pid), "c": pl["c"], "y": first, "then": pl.get("then", ""), "now": pl.get("now", ""),
                       "names": ", ".join(v for v in (pl.get("names") or {}).values() if v and v != pl.get("name")),
                       "sum": pl.get("summary", ""), "people": people, "claims": sorted(claims[pid], key=lambda c: c["when"]),
                       "media": [m["key"] for m in media if m["place"] == pid]}

    # events for the year panel
    ev = []
    for p in t["people"]:
        b = year((p.get("birth") or {}).get("date"))
        if b:
            ev.append({"y": b, "k": "family", "t": f'{name(p)} · {L["born"].lower()} · {(p.get("birth") or {}).get("place") or ""}', "p": alias.get(str((p.get("birth") or {}).get("place") or "").lower())})
        dd = year((p.get("death") or {}).get("date"))
        if dd:
            ev.append({"y": dd, "k": "family", "t": f'{name(p)} · {L["died"].lower()}', "p": None})
    for e in t.get("events", []) or []:
        y = year(e.get("date"))
        if y:
            who = " & ".join(name(P[x]) for x in e.get("people", []) if x in P)
            ev.append({"y": y, "k": "family", "t": f'{who} · {L["events"].get(e.get("type"), e.get("type", ""))}{" · " + e["place"] if e.get("place") else ""}', "p": alias.get(str(e.get("place") or "").lower())})
    for w in d.get("world", []):
        y = first_year(w.get("date"))
        if y:
            ev.append({"y": y, "k": w.get("scope", "world"), "t": w.get("text", ""), "p": None, "d": str(w.get("date"))})
    for pid, pl in pl_out.items():
        for c in pl["claims"]:
            y = first_year(c["when"])
            if y:
                ev.append({"y": y, "k": "place", "t": f'{pl["n"]}: {c["text"]}', "p": pid, "d": c["when"]})
    ev.sort(key=lambda e: (e["y"], e.get("d", "")))

    payload = {"geo": geo, "places": pl_out, "routes": routes, "events": ev, "srcNum": src_num, "media": {m["key"]: m for m in media},
               "ui": {k: L[k] for k in ("conf", "born", "then", "now", "names", "family", "world", "country", "region", "play", "pause",
                                        "bordersOf", "bordersToday", "pick", "inYear", "place", "reset", "noEvents", "atlasHint")}}
    blob = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    html = (f'<h2>{L["atlas"]}</h2><p class="hint">{L["atlasHint"]}</p>'
            '<div class="atlas"><div class="amap"><svg id="asvg" role="img"></svg><div class="atip"></div>'
            '<div class="azoom"><button data-z="in" aria-label="+">+</button><button data-z="out" aria-label="-">&minus;</button>'
            f'<button data-z="fit" aria-label="{L["reset"]}">&#x2922;</button></div><div class="aera"></div></div>'
            f'<div class="actl"><button class="aplay" aria-label="{L["play"]}">&#9654;</button><input class="ayear" type="range" aria-label="year">'
            '<output class="ayr"></output></div><div class="acols"><ul class="aev"></ul><aside class="apanel"></aside></div></div>'
            f'<script type="application/json" id="atlas-data">{blob}</script><script>{ATLAS_JS}</script>')
    return html, media_html


def _e(s):
    import html
    return html.escape(str(s or ""))


ATLAS_CSS = """
.hint{color:var(--muted);font:14px system-ui,sans-serif;margin:-.4em 0 .8em}
.atlas{font:14px/1.45 system-ui,sans-serif}
.amap{position:relative;height:min(62vh,560px);border-radius:12px;overflow:hidden;background:#0d1219;touch-action:none;cursor:grab}
.amap.drag{cursor:grabbing} .amap svg{width:100%;height:100%;display:block}
.amap .pl{cursor:pointer} .amap text{font:600 13px system-ui,sans-serif;fill:#efece6;paint-order:stroke;stroke:#15161b;stroke-width:3px;stroke-linejoin:round;pointer-events:none}
.amap text.st{font-weight:600;fill:#c9c1b1;letter-spacing:.18em;opacity:.55;text-transform:uppercase}
.atip{position:absolute;pointer-events:none;background:rgba(10,11,15,.9);color:#efece6;padding:4px 9px;border-radius:6px;font-size:13px;opacity:0;transition:opacity .12s;white-space:nowrap}
.azoom{position:absolute;right:10px;top:10px;display:flex;flex-direction:column;gap:4px}
.azoom button,.aplay{width:34px;height:34px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:rgba(20,21,27,.85);color:#efece6;font-size:18px;cursor:pointer}
.aera{position:absolute;left:12px;bottom:10px;color:#a39e95;font-size:12px;text-shadow:0 1px 4px #000}
.actl{display:flex;align-items:center;gap:12px;margin:10px 0 4px}
.aplay{background:var(--ink);color:var(--bg);border:none;flex:none}
.ayear{flex:1;accent-color:#3a6ea5} .ayr{font:700 26px/1 system-ui,sans-serif;font-variant-numeric:tabular-nums;min-width:3.2em;text-align:right}
.acols{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:8px}
@media (max-width:700px){.acols{grid-template-columns:1fr}}
ul.aev{list-style:none;margin:0;padding:0} ul.aev li{padding:6px 0;border-bottom:1px solid var(--line);color:var(--muted)}
ul.aev li.now{color:var(--ink)} ul.aev li b{font-variant-numeric:tabular-nums;margin-right:6px} ul.aev li[data-p]{cursor:pointer}
ul.aev li .k{font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin-right:6px}
.apanel{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;min-height:120px}
.apanel h3{margin:0 0 .2em;font:700 20px/1.2 Georgia,serif} .apanel .st{color:var(--muted);margin-bottom:.5em}
.apanel ul{padding-left:1.1em;margin:.4em 0} .apanel li{margin:.3em 0} .apanel img{max-width:100%;border-radius:8px;margin-top:6px}
.fmgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px}
.fm{margin:0;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.fm img{width:100%;height:180px;object-fit:cover;display:block} .fm.doc img{object-fit:contain;background:#e9e5dc}
.fm figcaption{padding:8px 10px;font:13px/1.35 system-ui,sans-serif} .fm figcaption span{display:block;color:var(--muted);font-size:12px}
"""

ATLAS_JS = r"""
(() => {
const D = JSON.parse(document.getElementById("atlas-data").textContent);
const G = D.geo, U = D.ui, NS = "http://www.w3.org/2000/svg";
const root = document.querySelector(".atlas"), svg = root.querySelector("#asvg"), box = root.querySelector(".amap");
const tip = root.querySelector(".atip"), slider = root.querySelector(".ayear"), out = root.querySelector(".ayr");
const evList = root.querySelector(".aev"), panel = root.querySelector(".apanel"), eraNote = root.querySelector(".aera");
const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180 / Math.PI;
const P = ([lon, lat]) => [(lon - G.bb.w) * G.S, (merc(G.bb.n) - merc(lat)) * G.S];
const el = (tag, at = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); if (parent) parent.appendChild(e); return e; };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const TINTS = ["#8fa6c8", "#c8a98f", "#9fc39b", "#b9a2cc", "#c9b48a", "#8fc0bd"];
const CONF = { documented: "#2f7d4f", probable: "#3a6ea5", tradition: "#a0662b", speculative: "#8a5a9e" };

// ---- layers ----
const defs = el("defs", {}, svg);
el("path", { d: G.land }, el("clipPath", { id: "aland" }, defs));
el("rect", { x: -5000, y: -5000, width: G.W + 10000, height: G.H + 10000, fill: "#0d1219" }, svg);
el("path", { d: G.land, fill: "#2a2a31", stroke: "#4d4a56", "vector-effect": "non-scaling-stroke", "stroke-width": 1 }, svg);
const gEra = el("g", {}, svg), gRoutes = el("g", {}, svg), gPlaces = el("g", {}, svg), gLabels = el("g", {}, svg);

// routes: an arc for two points, a smooth curve for more (as in the video)
const routeD = (r) => {
  const p = r.pts.map(P);
  if (p.length === 2) {
    const [a, b] = p, k = r.bend ?? 0.18;
    return `M${a}Q${(a[0] + b[0]) / 2 - (b[1] - a[1]) * k},${(a[1] + b[1]) / 2 + (b[0] - a[0]) * k} ${b}`;
  }
  let d = `M${p[0]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    d += `C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2}`;
  }
  return d;
};
const routeEls = D.routes.map((r) => ({ r, e: el("path", { d: routeD(r), fill: "none", stroke: r.c, "stroke-width": r.dotted ? 3.2 : 2.4, "stroke-linecap": "round", "vector-effect": "non-scaling-stroke", "stroke-dasharray": r.dotted ? "0.1 7" : "" }, gRoutes) }));

let selected = null;
const placeEls = Object.entries(D.places).map(([id, p]) => {
  const [x, y] = P(p.c);
  const g = el("g", { class: "pl" }, gPlaces);
  const halo = el("circle", { cx: x, cy: y, fill: "#e9a25a", opacity: 0 }, g);
  const dot = el("circle", { cx: x, cy: y, fill: "#e9a25a", stroke: "#15161b" }, g);
  const t = el("text", { x, y }, gLabels); t.textContent = p.n;
  g.addEventListener("click", (ev) => { ev.stopPropagation(); select(id); });
  g.addEventListener("mousemove", (ev) => { tip.textContent = p.n + (p.y ? ` · ${p.y}` : ""); const r = box.getBoundingClientRect(); tip.style.left = ev.clientX - r.left + 12 + "px"; tip.style.top = ev.clientY - r.top - 28 + "px"; tip.style.opacity = 1; });
  g.addEventListener("mouseleave", () => (tip.style.opacity = 0));
  return { id, p, x, y, g, halo, dot, t };
});

// ---- view: pan and zoom by changing the viewBox; sizes stay constant on screen ----
const all = placeEls.map((q) => [q.x, q.y]);
const fitBox = () => {
  const xs = all.map((a) => a[0]), ys = all.map((a) => a[1]);
  const pad = 0.25, w = Math.max(...xs) - Math.min(...xs) || 60, h = Math.max(...ys) - Math.min(...ys) || 40;
  return [Math.min(...xs) - w * pad - 20, Math.min(...ys) - h * pad - 20, w * (1 + 2 * pad) + 40, h * (1 + 2 * pad) + 40];
};
let vb = fitBox();
const apply = () => {
  const r = box.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return; // not laid out yet: the ResizeObserver calls again
  const asp = r.width / r.height;
  let [x, y, w, h] = vb;
  if (w / h < asp) { const nw = h * asp; x -= (nw - w) / 2; w = nw; } else { const nh = w / asp; y -= (nh - h) / 2; h = nh; }
  vb = [x, y, w, h];
  svg.setAttribute("viewBox", vb.join(" "));
  const u = w / Math.max(1, r.width); // map units per screen pixel
  for (const q of placeEls) {
    const on = q.g.style.display !== "none", sel = q.id === selected;
    q.dot.setAttribute("r", (sel ? 7 : 5.5) * u); q.dot.setAttribute("stroke-width", 2 * u);
    q.halo.setAttribute("r", 14 * u);
    q.t.setAttribute("x", q.x + 9 * u); q.t.setAttribute("y", q.y + 4.5 * u);
    q.t.style.fontSize = 13 * u + "px"; q.t.style.strokeWidth = 3 * u + "px";
    q.t.style.display = on ? "" : "none";
  }
  for (const t of gEra.querySelectorAll("text")) { t.style.fontSize = 12 * u + "px"; t.style.strokeWidth = 3 * u + "px"; }
};
const zoomAt = (f, cx, cy) => { const [x, y, w, h] = vb; vb = [cx - (cx - x) * f, cy - (cy - y) * f, w * f, h * f]; apply(); };
const toMap = (ev) => { const r = box.getBoundingClientRect(); return [vb[0] + ((ev.clientX - r.left) / r.width) * vb[2], vb[1] + ((ev.clientY - r.top) / r.height) * vb[3]]; };
box.addEventListener("wheel", (ev) => { ev.preventDefault(); const [x, y] = toMap(ev); zoomAt(ev.deltaY > 0 ? 1.15 : 1 / 1.15, x, y); }, { passive: false });
let drag = null;
// the pointer is captured only once it really moves, so a click still reaches the place under it
box.addEventListener("pointerdown", (ev) => { if (ev.target.closest("button")) return; drag = { x: ev.clientX, y: ev.clientY, vb: vb.slice(), moved: false, id: ev.pointerId }; });
box.addEventListener("pointermove", (ev) => {
  if (!drag) return;
  const r = box.getBoundingClientRect(), dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
  if (!drag.moved && Math.abs(dx) + Math.abs(dy) <= 4) return;
  if (!drag.moved) { drag.moved = true; box.classList.add("drag"); box.setPointerCapture(drag.id); tip.style.opacity = 0; }
  vb = [drag.vb[0] - (dx / r.width) * drag.vb[2], drag.vb[1] - (dy / r.height) * drag.vb[3], drag.vb[2], drag.vb[3]];
  svg.setAttribute("viewBox", vb.join(" "));
});
box.addEventListener("pointerup", () => { drag = null; box.classList.remove("drag"); });
root.querySelectorAll(".azoom button").forEach((b) => b.addEventListener("click", () => {
  const cx = vb[0] + vb[2] / 2, cy = vb[1] + vb[3] / 2;
  if (b.dataset.z === "fit") { vb = fitBox(); apply(); } else zoomAt(b.dataset.z === "in" ? 1 / 1.4 : 1.4, cx, cy);
}));
new ResizeObserver(apply).observe(box);

// ---- the year ----
const nowY = new Date().getFullYear();
const ys = [...D.events.map((e) => e.y), ...Object.values(D.places).map((p) => p.y).filter(Boolean)];
const y0 = Math.min(...ys, nowY) - 1, y1 = Math.max(nowY, ...ys);
slider.min = y0; slider.max = y1; slider.value = y0;
let eraShown = -2;
const eraFor = (y) => { let e = -1, ey = null; for (const [yy, ee] of G.eraYears) if (yy <= y) { e = ee; ey = yy; } if (e < 0 && G.eraYears.length) [ey, e] = G.eraYears[0]; return [e, ey]; };
const drawEra = (y) => {
  const [e, ey] = eraFor(y);
  if (e === eraShown) return; eraShown = e;
  gEra.replaceChildren();
  if (e >= 0 && G.eras[e]) {
    const era = G.eras[e], g = el("g", { "clip-path": "url(#aland)" }, gEra);
    era.areas.forEach((a) => { const pth = el("path", { d: a.d, fill: TINTS[a.t % 6], opacity: 0.2, "fill-rule": "evenodd" }, g); pth.dataset.n = a.n; });
    el("path", { d: era.borders, fill: "none", stroke: "#c9c1b1", opacity: 0.75, "stroke-width": 1.3, "stroke-dasharray": "5 4", "vector-effect": "non-scaling-stroke" }, gEra);
    eraNote.textContent = "- - - " + (ey >= 2009 ? U.bordersToday : U.bordersOf.replace("{y}", ey));
  } else if (G.borders) {
    el("path", { d: G.borders, fill: "none", stroke: "#46434f", "stroke-width": 1, "stroke-dasharray": "4 4", "vector-effect": "non-scaling-stroke" }, gEra);
    eraNote.textContent = "- - - " + U.bordersToday;
  } else eraNote.textContent = "";
};
const stateAt = (x, y) => { const pt = new DOMPoint(x, y); for (const p of gEra.querySelectorAll("path[data-n]")) if (p.dataset.n && p.isPointInFill(pt)) return p.dataset.n; return ""; };

const kindLabel = (k) => ({ family: U.family, world: U.world, country: U.country, region: U.region, place: U.place })[k] || k;
const setYear = (y) => {
  y = +y; out.textContent = y; slider.value = y;
  drawEra(y);
  for (const q of placeEls) {
    const on = !q.p.y || q.p.y <= y;
    q.g.style.display = on ? "" : "none";
    const fresh = on && q.p.y && y - q.p.y < 3;
    q.halo.setAttribute("opacity", q.id === selected ? 0.35 : fresh ? 0.3 : 0);
    q.dot.setAttribute("fill", q.id === selected ? "#efece6" : "#e9a25a");
  }
  for (const { r, e } of routeEls) e.style.display = !r.y || r.y <= y ? "" : "none";
  const past = D.events.filter((e) => e.y <= y).slice(-7).reverse();
  evList.innerHTML = past.length ? past.map((e) => `<li class="${e.y === y ? "now" : ""}" ${e.p ? `data-p="${esc(e.p)}"` : ""}><b>${e.y}</b><span class="k">${esc(kindLabel(e.k))}</span>${esc(e.t)}</li>`).join("") : `<li>${esc(U.noEvents)}</li>`;
  apply();
  if (selected) showPanel(selected, y);
};
evList.addEventListener("click", (ev) => { const li = ev.target.closest("li[data-p]"); if (li) select(li.dataset.p); });

// ---- the place panel ----
const cite = (ids) => (ids || []).filter((s) => D.srcNum[s]).map((s) => `<a class="cite" href="#src-${esc(s)}">[${D.srcNum[s]}]</a>`).join("");
const showPanel = (id, y) => {
  const p = D.places[id], q = placeEls.find((x) => x.id === id);
  const st = q ? stateAt(q.x, q.y) : "";
  panel.innerHTML = `<h3>${esc(p.n)}</h3>`
    + (st ? `<div class="st">${esc(U.inYear.replace("{y}", eraFor(y)[1]))}: ${esc(st)}</div>` : "")
    + `<dl>${p.names ? `<dt>${U.names}</dt><dd>${esc(p.names)}</dd>` : ""}${p.then ? `<dt>${U.then}</dt><dd>${esc(p.then)}</dd>` : ""}${p.now ? `<dt>${U.now}</dt><dd>${esc(p.now)}</dd>` : ""}`
    + (p.people.length ? `<dt>${U.family}</dt><dd>${p.people.map((x) => esc(x.n) + (x.b ? ` (${x.b})` : "")).join(", ")}</dd>` : "") + `</dl>`
    + (p.sum ? `<p>${esc(p.sum)}</p>` : "")
    + (p.claims.length ? `<ul>${p.claims.map((c) => `<li><span class="when">${esc(c.when)}</span> ${esc(c.text)} <span class="badge" style="--c:${CONF[c.conf] || "#777"}">${esc(U.conf[c.conf] || c.conf)}</span>${cite(c.src)}</li>`).join("")}</ul>` : "")
    + p.media.map((k) => D.media[k]).filter(Boolean).map((m) => `<figure style="margin:.6em 0 0"><img src="${m.url}" alt=""><figcaption class="when">${esc(m.title)}</figcaption></figure>`).join("");
};
const select = (id) => { selected = id; setYear(slider.value); panel.scrollIntoView({ block: "nearest", behavior: "smooth" }); };
panel.innerHTML = `<p class="when">${esc(U.pick)}</p>`;

// ---- play ----
const playBtn = root.querySelector(".aplay");
let timer = null;
const stop = () => { clearInterval(timer); timer = null; playBtn.innerHTML = "&#9654;"; playBtn.setAttribute("aria-label", U.play); };
playBtn.addEventListener("click", () => {
  if (timer) return stop();
  if (+slider.value >= y1) setYear(y0);
  playBtn.innerHTML = "&#10073;&#10073;"; playBtn.setAttribute("aria-label", U.pause);
  timer = setInterval(() => { const y = +slider.value + 1; setYear(y); if (y >= y1) stop(); }, 110);
});
slider.addEventListener("input", () => { stop(); setYear(slider.value); });
setYear(Math.min(...Object.values(D.places).map((p) => p.y || y1), y1));
})();
"""
