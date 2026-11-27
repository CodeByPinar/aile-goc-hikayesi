# Inspect a familytree.json: validate it, print a generation summary, compute the ancestry mix by
# origin place, and write the research targets (every place x the years the family was there).
#
# usage:
#   python3 -I tree_tool.py validate familytree.json
#   python3 -I tree_tool.py summary  familytree.json
#   python3 -I tree_tool.py origins  familytree.json            # % of the subject's ancestry per frontier birthplace
#   python3 -I tree_tool.py targets  familytree.json research/targets.json
#
# Everything here is local. The targets file lists places and years only, never names, so it is the
# thing research queries are built from.
import sys as _sys; [s.reconfigure(encoding="utf-8", errors="replace") for s in (_sys.stdout, _sys.stderr) if hasattr(s, "reconfigure")]  # Windows consoles default to a legacy code page
import json, re, sys
from collections import defaultdict


def year(d):
    if not d:
        return None
    m = re.search(r"\d{4}", str(d))
    return int(m.group()) if m else None


def load(path):
    t = json.load(open(path, encoding="utf-8"))
    return t, {p["id"]: p for p in t["people"]}


def name(p):
    return " ".join(x for x in (p.get("given"), p.get("surname")) if x) or p["id"]


def generations(t, P):
    """Generation number relative to the subject: 0 subject, 1 parents, 2 grandparents, -1 children."""
    gen = {t["subject"]: 0}
    todo = [t["subject"]]
    while todo:
        cur = todo.pop()
        p = P[cur]
        for k in ("father", "mother"):
            if p.get(k) and p[k] in P and p[k] not in gen:
                gen[p[k]] = gen[cur] + 1
                todo.append(p[k])
        for c in P.values():
            if cur in (c.get("father"), c.get("mother")) and c["id"] not in gen:
                gen[c["id"]] = gen[cur] - 1
                todo.append(c["id"])
    return gen


def validate(t, P):
    errs, warns = [], []
    if t.get("subject") not in P:
        errs.append("subject id not found in people")
    seen = set()
    for p in t["people"]:
        if p["id"] in seen:
            errs.append(f"duplicate id {p['id']}")
        seen.add(p["id"])
        for k in ("father", "mother"):
            if p.get(k) and p[k] not in P:
                errs.append(f"{p['id']}.{k} -> missing {p[k]}")
        b = p.get("birth") or {}
        if not b.get("place"):
            warns.append(f"{p['id']} has no birthplace")
        if not year(b.get("date")):
            warns.append(f"{p['id']} has no birth year")
        by, dy = year(b.get("date")), year((p.get("death") or {}).get("date"))
        for k in ("father", "mother"):
            par = P.get(p.get(k) or "")
            if par and by and year(par["birth"].get("date")):
                gap = by - year(par["birth"]["date"])
                if gap < 13 or gap > 70:
                    warns.append(f"{p['id']}: parent {par['id']} is {gap} years older (check dates)")
        if by and dy and dy < by:
            errs.append(f"{p['id']} dies before birth")
    gen = generations(t, P)
    loose = [p["id"] for p in t["people"] if p["id"] not in gen]
    if loose:
        warns.append(f"not connected to the subject: {', '.join(loose)}")
    for e in errs:
        print("ERROR", e)
    for w in warns:
        print("WARN ", w)
    print("OK" if not errs else f"{len(errs)} errors", f"({len(t['people'])} people, {len(warns)} warnings)")
    return not errs


def summary(t, P):
    gen = generations(t, P)
    for g in sorted(set(gen.values()), reverse=True):
        print(f"--- generation {g}")
        for pid in sorted((k for k, v in gen.items() if v == g), key=lambda k: year(P[k]["birth"].get("date")) or 0):
            p = P[pid]
            reg = p.get("registry") or {}
            regs = "/".join(x for x in (reg.get("province"), reg.get("district"), reg.get("locality")) if x)
            d = p.get("death") or {}
            print(f"  {pid:10s} {p.get('sex') or '?'} {p['birth'].get('date') or '?':>10s} {p['birth'].get('place') or '?':22s}"
                  f" d.{d.get('date') or ('alive' if p.get('living') else '?'):10s} reg: {regs}  [{name(p)}]")
    couples = defaultdict(list)
    for p in t["people"]:
        if p.get("father") and p.get("mother"):
            couples[(p["father"], p["mother"])].append(year(p["birth"].get("date")))
    print("--- couples (married by the first child's birth)")
    for (f, m), ys in couples.items():
        ys = [y for y in ys if y]
        print(f"  {f} + {m}: first known child {min(ys) if ys else '?'}")


def origins(t, P):
    """Split the subject's ancestry over the birthplaces of the earliest known ancestors (frontier)."""
    share = defaultdict(float)

    def walk(pid, w):
        p = P[pid]
        par = [p.get(k) for k in ("father", "mother") if p.get(k) in P]
        if not par:
            share[p["birth"].get("place") or "unknown"] += w
            return
        # an unknown parent keeps half of the weight on this person's own birthplace
        if len(par) == 1:
            share[p["birth"].get("place") or "unknown"] += w / 2
        for q in par:
            walk(q, w / 2)

    walk(t["subject"], 1.0)
    rows = sorted(share.items(), key=lambda kv: -kv[1])
    for place, w in rows:
        print(f"  {w * 100:6.2f}%  {place}")
    return rows


def targets(t, P, out):
    """One research target per place: when family members were born there / registered there."""
    tg = defaultdict(lambda: {"years": [], "roles": set(), "people": set()})
    for p in t["people"]:
        by = year(p["birth"].get("date"))
        if p["birth"].get("place"):
            k = p["birth"]["place"]
            tg[k]["years"].append(by)
            tg[k]["roles"].add("birthplace")
            tg[k]["people"].add(p["id"])
        reg = p.get("registry") or {}
        loc = ", ".join(x for x in (reg.get("locality"), reg.get("district"), reg.get("province")) if x)
        if loc:
            tg[loc]["years"].append(by)
            tg[loc]["roles"].add("registry (where the household was entered in the civil register)")
            tg[loc]["people"].add(p["id"])
        for r in p.get("residences") or []:
            tg[r["place"]]["years"].append(year(r.get("date")) or by)
            tg[r["place"]]["roles"].add(r.get("type", "residence"))
            tg[r["place"]]["people"].add(p["id"])
    res = []
    for place, v in tg.items():
        ys = [y for y in v["years"] if y]
        res.append({
            "place": place,
            "roles": sorted(v["roles"]),
            "people": sorted(v["people"]),
            # look a generation before the first birth: that is when the family arrived or was already there
            "window": [min(ys) - 30, max(ys) + 20] if ys else None,
            "first_birth": min(ys) if ys else None,
        })
    res.sort(key=lambda r: r["first_birth"] or 9999)
    json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for r in res:
        print(f"  {r['place']:40s} {r['window']}  {', '.join(r['roles'])[:60]}  ({len(r['people'])} people)")
    print(f"{len(res)} targets -> {out}")


if __name__ == "__main__":
    cmd, path = sys.argv[1], sys.argv[2]
    t, P = load(path)
    if cmd == "validate":
        sys.exit(0 if validate(t, P) else 1)
    elif cmd == "summary":
        summary(t, P)
    elif cmd == "origins":
        origins(t, P)
    elif cmd == "targets":
        targets(t, P, sys.argv[3])
