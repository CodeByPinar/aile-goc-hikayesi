# Data formats

Contents: 1. familytree.json (input) · 2. research/dossier.json · 3. video project data (src/data/*.json) · 4. story.json scenes

All files are UTF-8 JSON. Coordinates are always `[longitude, latitude]`.

## 1. familytree.json (the required input)

Produced by `import_edevlet.py` (Turkish e-Devlet PDF) or `import_gedcom.py` (any genealogy app), or written by hand from whatever the user gives (a spreadsheet, a photo of a handwritten tree, a chat message).

```json
{
  "subject": "p0",
  "source": {"type": "GEDCOM | e-Devlet Alt-Üst Soy Belgesi | user notes", "file": "tree.ged", "imported": "2026-11-26"},
  "people": [
    {
      "id": "p0",
      "given": "Deniz", "surname": "Örnek", "sex": "F",
      "relation": "Kendisi",
      "birth": {"date": "1992-04-11", "place": "Kadıköy"},
      "death": null, "living": true,
      "father": "pF", "mother": "pM",
      "father_name": "Murat", "mother_name": "Ayşe",
      "registry": {"province": "İzmir", "district": "Konak", "locality": "Alsancak Mahallesi", "cilt_hane_bsn": "12-34-5"},
      "residences": [{"type": "emig", "place": "Selanik", "date": "1924"}],
      "notes": "Family says they came on a steamer from Selanik."
    }
  ],
  "events": [{"type": "marriage", "people": ["pF", "pM"], "date": "1988", "place": "İstanbul"}],
  "oral_history": [{"about": ["pFF"], "text": "Came with one trunk and a copper pot.", "from": "the user's aunt, 2026"}],
  "review": []
}
```

Rules that matter downstream:
- `id` is any unique string; `father`/`mother` point to ids. Unknown parents are `null`.
- Dates: `"1903-04-12"` exact, `"1903"` year only, `"~1849"` approximate, `"1849/1851"` range. The Turkish register writes `01/07/YYYY` when only the year was known; the importer turns that into `"YYYY"`.
- `registry` (Turkish *nüfus kaydı*) is where the household is entered in the civil register, not necessarily where anyone lived. For migrants it is often the settlement place assigned on arrival, so it is a research clue, not a residence.
- `oral_history` is family tradition. It goes into the story only with hedged wording.
- `review` lists things the importer could not read cleanly; resolve them with the user before research.

## 2. research/dossier.json (the research output)

One file collects every place, every claim and every source. `render_report.py` turns it into the HTML report, and the story is written from it.

```json
{
  "title": "Selanik'ten Trabzon'a: Örnek ailesinin yüz yılı",
  "lang": "tr",
  "summary": "One paragraph: what the research found, in plain words.",
  "places": {
    "selanik": {
      "name": "Selanik", "qid": "Q17151",
      "names": {"el": "Θεσσαλονίκη", "en": "Thessaloniki", "lad": "Salonik"},
      "raw": ["Selanik", "Selanik Yunanistan"],
      "c": [22.944, 40.64],
      "then": "Selanik vilayeti merkezi, Osmanlı (1912'ye kadar)",
      "now": "Thessaloniki, Yunanistan",
      "people": ["pFFF", "pFFM"],
      "summary": "Two or three sentences on the place in the family's years."
    }
  },
  "claims": [
    {
      "id": "c1", "place": "selanik", "when": "1912-11-08", "topic": "war",
      "text": "Yunan ordusu 8 Kasım 1912'de Selanik'e girdi; şehir Osmanlı yönetiminden çıktı.",
      "confidence": "documented",
      "sources": ["s1"],
      "people": ["pFFF"]
    }
  ],
  "world": [
    {"date": "1923-01-30", "scope": "country", "text": "Lozan'da Türk-Yunan nüfus mübadelesi sözleşmesi imzalandı.", "sources": ["s2"]}
  ],
  "sources": {
    "s1": {"kind": "paper", "author": "…", "title": "…", "where": "Journal, vol(issue), pages", "year": "2019",
           "doi": "10.xxxx/…", "url": "https://…", "accessed": "2026-11-26", "note": "p. 14: the date and the entry of the troops"}
  },
  "open_questions": ["Which ship? The passenger lists for 1924 are not online; the Lozan Mübadilleri Vakfı may know."]
}
```

- `raw` lists every spelling used in familytree.json for this place; the report and `tree_tool.py` merge them through it.
- `confidence`: `documented` (a primary source or solid scholarship says so), `probable` (strong inference from documented facts, e.g. a register place plus a known settlement scheme), `tradition` (family or local oral history, or a non-scholarly site without sources), `speculative` (a reasonable guess you label as such).
- `kind`: `archive` (give the call number in `where`), `paper`, `thesis`, `book`, `newspaper`, `census`, `map`, `image`, `dataset`, `web`, `oral`.
- `note`: the page or the exact passage, so a reader can check it.

## 3. Video project data (`<project>/src/data/`)

| file | what it holds |
|---|---|
| `meta.json` | `{"lang": "tr", "title": "...", "ui": {"route": "temsili güzergâh", "sources": "Kaynaklar", "publicDomain": "kamu malı", "noRestrictions": "kısıtlama yok", "commons": "Wikimedia Commons"}, "sourcesText": "Aile bilgileri: …\nSeslendirme: …"}` |
| `branches.json` | lineages and their colours: `{"selanik": {"label": "Baba tarafı · Selanik", "color": "#7fb1e6"}, …}`. Colour is optional; a palette fills it in. |
| `places.json` | family places: `{"selanik": {"n": "Selanik", "c": [22.944, 40.64], "b": "selanik", "dx": 14, "dy": 10, "anchor": "start", "minor": false, "onlyFar": false, "zoomName": "…", "farName": "…"}}` |
| `context.json` | `{"labels": [{"n": "İstanbul", "c": [28.98, 41.02], "dx": -14, "dy": -12, "anchor": "end", "minor": false, "onlyIn": ["scene-id"], "hideIn": []}], "seas": [{"n": "Ege Denizi", "c": [25.0, 38.9]}]}`: neighbouring cities for orientation, never family places |
| `routes.json` | `[{"id": "sel-izm", "b": "selanik", "pts": [[lon,lat], …], "dotted": true, "boat": true, "bend": 0.2}]`. 2 points become an arc (`bend` sets the curvature); 3+ points become a smooth curve through them. `dotted` = representative route (the exact path is unknown); `boat` = a ship icon moves along it. |
| `zones.json` | optional highlighted areas: `[{"id": "exempt", "fill": [[lon,lat]…], "line": [[lon,lat]…], "fillColor": "#e9a25a", "lineColor": "#6fa8dc", "labels": [["Batı Trakya: muaf", [25.45, 41.12], 30]]}]` |
| `credits.json` | written by `commons_fetch.py`: `{"key": {"file": "key.jpg", "title": "File:…", "author": "…", "license": "CC BY-SA 4.0", "page": "https://commons…", "w": 1800, "h": 1200}}` |
| `geo.json` | written by `npm run geo` |
| `timeline.json` | written by `npm run vo` |

Label offsets `dx`/`dy` are screen pixels from the dot; `anchor: "end"` puts the label left of the dot. When two family places are close (two neighbourhoods of one city), give one `minor: true` (shown only zoomed in) and add the city with `onlyFar: true`.

## 4. story.json scenes

An array of scenes in screen order. Each scene is one camera position and two to five narrated lines.

```json
{
  "id": "mubadele",
  "part": "Baba tarafı · Selanik",
  "b": "selanik",
  "years": "1924",
  "title": "Bir vapur, bir sandık",
  "cam": [22.5, 38.2, 27.5, 41.2],
  "cardKick": "Bölüm II", "card": "Mübadele", "cardSub": "1923 – 1924",
  "places": ["izmir"],
  "focus": ["selanik", "izmir"],
  "routes": [["sel-izm", 0.15, 0.85]],
  "zone": "exempt",
  "facts": ["#Selanik → İzmir", "Mübadil hane · 1924", "W|30 Ocak 1923 · Lozan sözleşmesi"],
  "say": ["Line one of narration.", "Line two."],
  "imgs": [[1, "vapur", "Mübadil taşıyan bir vapur, 1924", 2]],
  "origins": [["Selanik", 50, "selanik"], ["Trabzon", 50, "trabzon"]],
  "dur": 6,
  "credits": false
}
```

- `b`: branch key for the colour of the chip, the focus dots and the facts; `"all"` for scenes about everyone.
- `cam`: `[west, south, east, north]` of what must be visible. Facts push the view right automatically, so frame the places, not the text.
- `places`: places that appear for the first time in this scene; they stay on the map afterwards. `focus`: places that pulse in this scene.
- `routes`: `[id, start, end]` with start/end as fractions of the scene's length; a route stays drawn after its scene.
- `facts`: short chips on the right. `#Heading`, plain text for family facts, `W|…` for a world/country event (white pill with a globe).
- `say`: narration lines; each becomes one audio file and one subtitle. Keep each under ~200 characters.
- `imgs`: `[lineIndex, creditsKey, caption, spanLines?]`: the photo card appears with that line and stays for `spanLines` lines.
- `card*`: a chapter card at the start of the scene (adds ~2 s before the first line).
- `origins`: ancestry bar (percent values), usually on the closing scene.
- `dur`: length in seconds of a scene without narration. The last scene is normally `{"id": "son", "credits": true, "dur": 9, "say": [], …}`.
