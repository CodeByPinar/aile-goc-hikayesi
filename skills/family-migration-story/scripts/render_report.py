# Render the research dossier + family tree as a self-contained HTML report (local file; it contains
# family names, so it is not published anywhere unless the user asks).
#
# usage: python3 -I render_report.py familytree.json research/dossier.json report.html
#
# Every claim is printed with its confidence and numbered citations, so a reader can tell what is
# documented, what is probable, and what is family tradition.
import html, json, re, sys
from collections import defaultdict

sys.path.insert(0, __import__("os").path.dirname(__file__))
from tree_tool import generations, load, name, year  # noqa: E402

UI = {
    "tr": {"people": "Kişiler", "gen": "Kuşak", "born": "Doğum", "died": "Ölüm", "reg": "Nüfus kaydı", "places": "Yerler ve tarihleri",
           "timeline": "Zaman çizelgesi", "sources": "Kaynaklar", "open": "Açık sorular", "mix": "Köken dağılımı",
           "conf": {"documented": "belgeli", "probable": "güçlü olasılık", "tradition": "aile/yerel anlatı", "speculative": "tahmin"},
           "then": "O zaman", "now": "Bugün", "names": "Diğer adları", "family": "Ailede", "world": "Dünya", "country": "Ülke",
           "region": "Bölge", "subject": "Kendisi", "gens": {0: "Kendisi", 1: "Ebeveynler", 2: "Büyükanne/babalar", 3: "Büyük büyükler"},
           "living": "yaşıyor", "accessed": "erişim"},
    "en": {"people": "People", "gen": "Generation", "born": "Born", "died": "Died", "reg": "Civil register", "places": "Places and their history",
           "timeline": "Timeline", "sources": "Sources", "open": "Open questions", "mix": "Ancestry by origin",
           "conf": {"documented": "documented", "probable": "probable", "tradition": "family/local tradition", "speculative": "speculative"},
           "then": "Then", "now": "Now", "names": "Other names", "family": "Family", "world": "World", "country": "Country",
           "region": "Region", "subject": "Subject", "gens": {0: "Subject", 1: "Parents", 2: "Grandparents", 3: "Great-grandparents"},
           "living": "living", "accessed": "accessed"},
}
CONF_COL = {"documented": "#2f7d4f", "probable": "#3a6ea5", "tradition": "#a0662b", "speculative": "#8a5a9e"}
e = lambda s: html.escape(str(s or ""))


def main(tree_path, dossier_path, out):
    t, P = load(tree_path)
    d = json.load(open(dossier_path, encoding="utf-8"))
    lang = d.get("lang", "tr")
    L = UI.get(lang, UI["en"])
    src_ids = list(d.get("sources", {}))
    num = {s: i + 1 for i, s in enumerate(src_ids)}
    cite = lambda ids: "".join(f'<a class="cite" href="#src-{e(s)}">[{num[s]}]</a>' for s in ids or [] if s in num)
    badge = lambda c: f'<span class="badge" style="--c:{CONF_COL.get(c, "#777")}">{e(L["conf"].get(c, c))}</span>' if c else ""
    gen = generations(t, P)

    # ancestry mix (frontier birthplaces), merged through dossier place aliases
    alias = {raw.lower(): pl.get("name", pid) for pid, pl in d.get("places", {}).items() for raw in pl.get("raw", [])}
    share = defaultdict(float)

    def walk(pid, w):
        p = P[pid]
        par = [p.get(k) for k in ("father", "mother") if p.get(k) in P]
        place = p["birth"].get("place") or "?"
        place = alias.get(place.lower(), place)
        if not par:
            share[place] += w
            return
        if len(par) == 1:
            share[place] += w / 2
        for q in par:
            walk(q, w / 2)

    walk(t["subject"], 1.0)
    mix = sorted(share.items(), key=lambda kv: -kv[1])
    palette = ["#3a6ea5", "#a0662b", "#2f7d4f", "#8a5a9e", "#b5485d", "#9a8a2a", "#2f8a86", "#6b7280"]
    pct = lambda w: (lambda v: "%" + v.replace(".", ",") if lang == "tr" else v + "%")(f"{round(w * 100, 2):g}")
    bar = "".join(f'<span style="width:{w * 100:.2f}%;background:{palette[i % 8]}" title="{e(pl)} {pct(w)}"></span>' for i, (pl, w) in enumerate(mix))
    legend = "".join(f'<li><i style="background:{palette[i % 8]}"></i>{pct(w)} {e(pl)}</li>' for i, (pl, w) in enumerate(mix))

    # people table by generation
    rows = []
    for g in sorted({v for v in gen.values()}, reverse=True):
        label = L["gens"].get(g, f'{L["gen"]} {g}' if g > 0 else f'{L["gen"]} {g}')
        rows.append(f'<tr class="gen"><td colspan="5">{e(label)}</td></tr>')
        for pid in sorted((k for k, v in gen.items() if v == g), key=lambda k: year(P[k]["birth"].get("date")) or 0):
            p = P[pid]
            reg = p.get("registry") or {}
            regs = " / ".join(x for x in (reg.get("province"), reg.get("district"), reg.get("locality")) if x)
            dd = p.get("death") or {}
            died = L["living"] if p.get("living") else (dd.get("date") or "?")
            rows.append(f'<tr><td>{e(name(p))}<div class="rel">{e(p.get("relation") or "")}</div></td><td>{e(p["birth"].get("date"))}</td>'
                        f'<td>{e(p["birth"].get("place"))}</td><td>{e(died)}</td><td>{e(regs)}</td></tr>')

    # places with claims
    claims_by_place = defaultdict(list)
    for c in d.get("claims", []):
        claims_by_place[c.get("place")].append(c)
    sec = []
    for pid, pl in d.get("places", {}).items():
        names = ", ".join(f"{v}" for k, v in (pl.get("names") or {}).items() if v and v != pl.get("name"))
        cl = sorted(claims_by_place.get(pid, []), key=lambda c: str(c.get("when", "")))
        items = "".join(f'<li><span class="when">{e(c.get("when"))}</span> {e(c["text"])} {badge(c.get("confidence"))}{cite(c.get("sources"))}</li>' for c in cl)
        people = ", ".join(e(name(P[x])) for x in pl.get("people", []) if x in P)
        sec.append(f'''<section class="place" id="pl-{e(pid)}"><h3>{e(pl.get("name", pid))}</h3>
<dl>{f"<dt>{L['names']}</dt><dd>{e(names)}</dd>" if names else ""}{f"<dt>{L['then']}</dt><dd>{e(pl.get('then'))}</dd>" if pl.get("then") else ""}{f"<dt>{L['now']}</dt><dd>{e(pl.get('now'))}</dd>" if pl.get("now") else ""}{f"<dt>{L['family']}</dt><dd>{people}</dd>" if people else ""}</dl>
{f'<p>{e(pl["summary"])}</p>' if pl.get("summary") else ""}<ul class="claims">{items}</ul></section>''')

    # merged timeline: family births/deaths + world events + dated claims
    tl = []
    for p in t["people"]:
        if year(p["birth"].get("date")):
            tl.append((str(p["birth"]["date"]).lstrip("~"), "family", f'{name(p)} · {L["born"].lower()} · {p["birth"].get("place") or ""}', [], None))
        dd = p.get("death") or {}
        if year(dd.get("date")):
            tl.append((str(dd["date"]), "family", f'{name(p)} · {L["died"].lower()}', [], None))
    for w in d.get("world", []):
        tl.append((str(w.get("date")), w.get("scope", "world"), w["text"], w.get("sources"), None))
    tl.sort(key=lambda x: x[0])
    tl_html = "".join(f'<li class="{e(k)}"><span class="when">{e(dt)}</span><span class="tag">{e(L.get(k, k))}</span> {e(txt)} {cite(s)}</li>' for dt, k, txt, s, _ in tl)

    srcs = []
    for sid in src_ids:
        s = d["sources"][sid]
        bits = [e(s.get("author")), f'<b>{e(s.get("title"))}</b>', e(s.get("where")), e(s.get("year"))]
        link = s.get("url") or (f'https://doi.org/{s["doi"]}' if s.get("doi") and not str(s["doi"]).startswith("http") else s.get("doi"))
        meta = f' · <a href="{e(link)}">{e(link)}</a>' if link else ""
        acc = f' ({L["accessed"]} {e(s["accessed"])})' if s.get("accessed") else ""
        note = f'<div class="note">{e(s["note"])}</div>' if s.get("note") else ""
        srcs.append(f'<li id="src-{e(sid)}"><span class="kind">{e(s.get("kind"))}</span> {". ".join(b for b in bits if b)}{meta}{acc}{note}</li>')
    oq = "".join(f"<li>{e(q)}</li>" for q in d.get("open_questions", []))

    doc = f'''<!doctype html><html lang="{e(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(d.get("title", "Family history"))}</title><style>
:root{{--bg:#fbfaf7;--ink:#1d1c1a;--muted:#6b665e;--line:#e4e0d8;--card:#fff}}
@media (prefers-color-scheme:dark){{:root{{--bg:#141517;--ink:#ecebe7;--muted:#a19c93;--line:#2c2d31;--card:#1b1c1f}}}}
body{{margin:0;background:var(--bg);color:var(--ink);font:17px/1.6 Georgia,"Iowan Old Style",serif}}
main{{max-width:900px;margin:0 auto;padding:48px 20px 80px}} h1{{font-size:2.3em;line-height:1.15;margin:0 0 .2em}}
h2{{font:600 1.05em/1.3 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:3em 0 1em;border-top:1px solid var(--line);padding-top:1.2em}}
h3{{font-size:1.35em;margin:1.6em 0 .3em}} .lede{{font-size:1.15em;color:var(--muted)}}
.mix{{display:flex;height:22px;border-radius:6px;overflow:hidden;margin:.6em 0}} .mix span{{display:block}}
ul.legend{{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:6px 18px;font:14px system-ui,sans-serif}} ul.legend i{{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:6px}}
table{{width:100%;border-collapse:collapse;font:14px/1.4 system-ui,sans-serif}} td{{padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}}
tr.gen td{{font-weight:700;color:var(--muted);padding-top:18px;text-transform:uppercase;letter-spacing:.06em;font-size:12px}} .rel{{color:var(--muted);font-size:12px}}
dl{{display:grid;grid-template-columns:max-content 1fr;gap:2px 14px;font:14px system-ui,sans-serif;margin:.4em 0 .8em}} dt{{color:var(--muted)}} dd{{margin:0}}
ul.claims,ul.tl{{padding-left:1.1em}} ul.claims li,ul.tl li{{margin:.35em 0}} .when{{font:600 13px system-ui,sans-serif;color:var(--muted);margin-right:6px}}
.badge{{font:600 11px system-ui,sans-serif;color:var(--c);border:1px solid var(--c);border-radius:99px;padding:0 7px;margin-left:4px;white-space:nowrap}}
.cite{{font:12px system-ui,sans-serif;vertical-align:super;text-decoration:none;margin-left:2px}} .tag{{font:11px system-ui,sans-serif;text-transform:uppercase;color:var(--muted);margin-right:6px}}
ul.tl li.family{{font-weight:600}} ol.src{{font-size:14px;line-height:1.45}} ol.src li{{margin:.5em 0}} .kind{{font:11px system-ui,sans-serif;text-transform:uppercase;color:var(--muted)}} .note{{color:var(--muted)}}
a{{color:#3a6ea5}} @media (max-width:600px){{td:nth-child(5){{display:none}}}}
</style></head><body><main>
<h1>{e(d.get("title", "Family history"))}</h1><p class="lede">{e(d.get("summary", ""))}</p>
<h2>{L["mix"]}</h2><div class="mix">{bar}</div><ul class="legend">{legend}</ul>
<h2>{L["people"]}</h2><table>{"".join(rows)}</table>
<h2>{L["places"]}</h2>{"".join(sec)}
<h2>{L["timeline"]}</h2><ul class="tl">{tl_html}</ul>
{f'<h2>{L["open"]}</h2><ul>{oq}</ul>' if oq else ""}
<h2>{L["sources"]}</h2><ol class="src">{"".join(srcs)}</ol>
</main></body></html>'''
    open(out, "w", encoding="utf-8").write(doc)
    uncited = [c.get("id") for c in d.get("claims", []) if not c.get("sources")]
    print(f"report -> {out}  ({len(d.get('claims', []))} claims, {len(src_ids)} sources)")
    if uncited:
        print("WARN claims without a source:", ", ".join(map(str, uncited)))


if __name__ == "__main__":
    main(*sys.argv[1:4])
