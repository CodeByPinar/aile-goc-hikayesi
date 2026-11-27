# Convert a GEDCOM 5.5/5.5.1/7 file (exported by Ancestry, MyHeritage, FamilySearch, Gramps, ...) into familytree.json.
#
# usage: python3 -I import_gedcom.py family.ged familytree.json [--subject @I1@]
#
# Only the fields the story needs are kept: names, sex, birth/death/marriage date+place, parents, notes.
import sys as _sys; [s.reconfigure(encoding="utf-8", errors="replace") for s in (_sys.stdout, _sys.stderr) if hasattr(s, "reconfigure")]  # Windows consoles default to a legacy code page
import json, re, sys
from datetime import date

MONTHS = {m: i + 1 for i, m in enumerate("JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split())}


def parse_date(s):
    """GEDCOM date -> 'YYYY', 'YYYY-MM-DD', '~YYYY' (ABT/EST/CAL) or 'YYYY/YYYY' (BET..AND)."""
    if not s:
        return None
    s = s.upper().strip()
    m = re.match(r"BET\s+(.*?)\s+AND\s+(.*)", s)
    if m:
        a, b = parse_date(m.group(1)), parse_date(m.group(2))
        return f"{(a or '').lstrip('~')[:4]}/{(b or '').lstrip('~')[:4]}"
    approx = bool(re.match(r"(ABT|EST|CAL|BEF|AFT)\b", s))
    s = re.sub(r"^(ABT|EST|CAL|BEF|AFT|FROM|TO|INT)\s+", "", s)
    parts = s.split()
    y = next((p for p in reversed(parts) if re.fullmatch(r"\d{3,4}", p)), None)
    if not y:
        return None
    out = y
    if len(parts) == 3 and parts[1] in MONTHS and parts[0].isdigit():
        out = f"{y}-{MONTHS[parts[1]]:02d}-{int(parts[0]):02d}"
    return ("~" if approx else "") + out


def records(lines):
    """Yield (level0_record_lines) blocks."""
    block = []
    for ln in lines:
        if ln.startswith("0 ") and block:
            yield block
            block = []
        block.append(ln)
    if block:
        yield block


def main(src, out, subject=None):
    raw = open(src, encoding="utf-8-sig", errors="replace").read().splitlines()
    lines = [l.strip() for l in raw if l.strip()]
    indi, fams = {}, {}
    for blk in records(lines):
        m = re.match(r"0 (@[^@]+@) (INDI|FAM)", blk[0])
        if not m:
            continue
        xref, kind = m.groups()
        rec, ctx = {"xref": xref, "notes": []}, []
        for ln in blk[1:]:
            mm = re.match(r"(\d+) (\S+)(?: (.*))?", ln)
            if not mm:
                continue
            lvl, tag, val = int(mm.group(1)), mm.group(2), (mm.group(3) or "").strip()
            ctx = ctx[: lvl - 1] + [tag]
            path = ".".join(ctx)
            if kind == "INDI":
                if path == "NAME" and "name" not in rec:
                    rec["name"] = val
                elif path == "NAME.GIVN":
                    rec["given"] = val
                elif path == "NAME.SURN":
                    rec["surname"] = val
                elif path == "SEX":
                    rec["sex"] = val[:1]
                elif path in ("BIRT.DATE", "DEAT.DATE", "BIRT.PLAC", "DEAT.PLAC"):
                    rec[path] = val
                elif tag == "DEAT" and lvl == 1:
                    rec["dead"] = True
                elif path == "FAMC":
                    rec.setdefault("famc", []).append(val)
                elif path in ("NOTE", "NOTE.CONT", "NOTE.CONC") and not val.startswith("@"):
                    if path == "NOTE.CONC" and rec["notes"]:
                        rec["notes"][-1] += val
                    else:
                        rec["notes"].append(val)
                elif path in ("RESI.PLAC", "EMIG.PLAC", "IMMI.PLAC", "NATU.PLAC"):
                    rec.setdefault("residences", []).append({"type": ctx[0].lower(), "place": val})
                elif path in ("RESI.DATE", "EMIG.DATE", "IMMI.DATE", "NATU.DATE") and rec.get("residences"):
                    rec["residences"][-1]["date"] = parse_date(val)
            else:
                if path in ("HUSB", "WIFE"):
                    rec[path.lower()] = val
                elif path == "CHIL":
                    rec.setdefault("chil", []).append(val)
                elif path in ("MARR.DATE", "MARR.PLAC"):
                    rec[path] = val
        (indi if kind == "INDI" else fams)[xref] = rec

    ids = {x: "p" + re.sub(r"\W", "", x) for x in indi}
    people = []
    for x, r in indi.items():
        given, surname = r.get("given"), r.get("surname")
        if not given and r.get("name"):
            nm = re.match(r"([^/]*)/?([^/]*)/?", r["name"])
            given, surname = nm.group(1).strip() or None, nm.group(2).strip() or None
        father = mother = None
        for f in r.get("famc", []):
            fam = fams.get(f, {})
            father = father or ids.get(fam.get("husb"))
            mother = mother or ids.get(fam.get("wife"))
        people.append({
            "id": ids[x], "given": given, "surname": surname, "sex": {"M": "M", "F": "F"}.get(r.get("sex")),
            "birth": {"date": parse_date(r.get("BIRT.DATE")), "place": r.get("BIRT.PLAC")},
            "death": {"date": parse_date(r.get("DEAT.DATE")), "place": r.get("DEAT.PLAC")} if r.get("dead") or r.get("DEAT.DATE") else None,
            "living": not (r.get("dead") or r.get("DEAT.DATE")),
            "father": father, "mother": mother,
            "residences": r.get("residences", []),
            "notes": " ".join(r["notes"]) or None,
        })
    events = []
    for f in fams.values():
        if f.get("MARR.DATE") or f.get("MARR.PLAC"):
            events.append({"type": "marriage", "people": [ids[k] for k in (f.get("husb"), f.get("wife")) if k in ids],
                           "date": parse_date(f.get("MARR.DATE")), "place": f.get("MARR.PLAC")})
    subj = ids.get(subject) if subject else None
    if not subj:  # default: the youngest person who has at least one recorded parent
        withp = [p for p in people if p["father"] or p["mother"]]
        subj = max(withp or people, key=lambda p: (p["birth"]["date"] or "").lstrip("~"))["id"]
    tree = {"subject": subj, "source": {"type": "GEDCOM", "file": src.split("/")[-1], "imported": date.today().isoformat()},
            "people": people, "events": events, "oral_history": [], "review": []}
    json.dump(tree, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{len(people)} people, {len(events)} marriages, subject {subj} -> {out}")


if __name__ == "__main__":
    a = sys.argv[1:]
    subj = a[a.index("--subject") + 1] if "--subject" in a else None
    main(a[0], a[1], subj)
