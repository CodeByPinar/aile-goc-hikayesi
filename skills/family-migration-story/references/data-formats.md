# Data formats

Contents: 1. familytree.json (input) · 2. research/dossier.json · 3. video project data (src/data/*.json) · 4. story.json scenes · 5. a second language (src/data/lang/&lt;code&gt;.json) · 6. family photos and documents (research/family-media.tsv)

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
| `meta.json` | `{"lang": "tr", "title": "...", "ui": {"route": "temsili güzergâh", "sources": "Kaynaklar", "publicDomain": "kamu malı", "noRestrictions": "kısıtlama yok", "commons": "Wikimedia Commons", "bordersOf": "{y} sınırları", "bordersToday": "bugünkü sınırlar", "familyArchive": "Aile arşivi"}, "sourcesText": "Aile bilgileri: …\nSeslendirme: …", "vertical": false, "eras": true, "subtitles": true}`. `vertical: true` builds the map tall enough for the 9:16 video and makes `npm run check` frame it too; `eras: false` turns the period borders off (e.g. for commercial use, see the CShapes licence below); `subtitles: false` leaves subtitles out of the picture (deliver them as `.srt`). |
| `branches.json` | lineages and their colours: `{"selanik": {"label": "Baba tarafı · Selanik", "color": "#7fb1e6"}, …}`. Colour is optional; a palette fills it in. |
| `places.json` | family places: `{"selanik": {"n": "Selanik", "c": [22.944, 40.64], "b": "selanik", "dx": 14, "dy": 10, "anchor": "start", "minor": false, "onlyFar": false, "zoomName": "…", "farName": "…"}}` |
| `context.json` | `{"labels": [{"n": "İstanbul", "c": [28.98, 41.02], "dx": -14, "dy": -12, "anchor": "end", "minor": false, "onlyIn": ["scene-id"], "hideIn": []}], "seas": [{"n": "Ege Denizi", "c": [25.0, 38.9]}]}`: neighbouring cities for orientation, never family places |
| `routes.json` | `[{"id": "sel-izm", "b": "selanik", "pts": [[lon,lat], …], "dotted": true, "boat": true, "bend": 0.2}]`. 2 points become an arc (`bend` sets the curvature); 3+ points become a smooth curve through them. `dotted` = representative route (the exact path is unknown); `boat` = a ship icon moves along it. |
| `zones.json` | optional highlighted areas: `[{"id": "exempt", "fill": [[lon,lat]…], "line": [[lon,lat]…], "fillColor": "#e9a25a", "lineColor": "#6fa8dc", "labels": [["Batı Trakya: muaf", [25.45, 41.12], 30]]}]` |
| `credits.json` | written by `commons_fetch.py`: `{"key": {"file": "key.jpg", "title": "File:…", "author": "…", "license": "CC BY-SA 4.0", "page": "https://commons…", "w": 1800, "h": 1200}}`; family files added by `npm run family` also carry `"family": true` and `"kind": "photo" \| "document"` |
| `geo.json` | written by `npm run geo`: land, today's borders, and the period maps (`eras`, `sceneEra`) |
| `timeline.json` | written by `npm run vo` |
| `i18n.json` | written by `npm run vo -- --lang <code>`: each extra language with its own timeline |
| `lang/<code>.json` | a translation you write (§5) |

**Period borders.** `npm run geo` draws, for every scene, the state borders of the scene's date from CShapes 2.0 (Schvitz et al. 2022, borders of 1886-2019 with the date of every change; licence CC BY-NC-SA 4.0, so personal and non-commercial use only: set `"eras": false` otherwise). The date is the scene's `era` if set, else 1 July of the first year in `years`; scenes before 1886 get the 1886 map. The script prints which state each focus place lay in; check those lines against the dossier, and set `era` when a border moved during the scene's year (e.g. `"era": "1913-08-11"` after the Treaty of Bucharest). The data is approximate and simplified; small islands, short-lived occupations and disputed zones may be missing.

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
- `era`: which borders the map shows: a year (`1913`), a date (`"1913-08-11"`) or `"today"`. Default: the first year in `years`. Give the closing "whole family" scene `"era": "today"`.

## 5. A second language (`src/data/lang/<code>.json`)

The same video in another language, for relatives abroad. Write a translation file, then either synthesize its own narration or keep the original voice and translate only the subtitles:

```json
{
 "lang": "en",
 "meta": {"title": "…", "ui": {"route": "representative route", "sources": "Sources", "bordersOf": "borders of {y}", "bordersToday": "today's borders", "familyArchive": "Family archive", "…": "…"}, "sourcesText": "…"},
 "labels": {"Selanik": "Salonica", "Osmanlı Devleti": "Ottoman Empire", "Ege Denizi": "Aegean Sea"},
 "scenes": {
  "selanik": {"part": "Father's side · Salonica", "title": "A port city", "card": "Salonica", "facts": ["…"], "captions": ["Salonica, 1910s"], "say": ["…", "…", "…"]}
 }
}
```

- `scenes.<id>` overrides any text field of that scene (`part`, `years`, `title`, `card*`, `facts`); `captions` replaces the photo captions in order; `say` must have exactly as many lines as story.json (every scene, including those with `"say": []`).
- `labels` translates map words: place names, context labels, seas and the state names of the period borders.
- `npm run vo -- --lang en --engine sapi --voice "Microsoft Zira Desktop"` (Windows) or `--engine say --voice Samantha` (macOS) synthesizes it into `public/vo/en/`; `npm run vo -- --lang en --subs-only` keeps the original narration and shows the translated subtitles.
- Both add compositions `FamilyStory-en` and `FamilyStoryVertical-en`; `npm run srt` writes one `.srt` per language.

## 6. Family photos and documents (`research/family-media.tsv`)

The family's own pictures: a wedding photo, a nüfus cüzdanı, a passport page, a letter. One line per file, tab-separated:

```
key<TAB>path<TAB>title<TAB>photo|document<TAB>credit<TAB>place id<TAB>year
dugun	aile/1958-dugun.jpg	Hasan ile Fatma'nın düğünü	photo	Ayşe Örnek'in albümü	izmir	1958
nufus	aile/nufus-1934.jpg	Nüfus kaydı, 1934	document	Aile evrakı	izmir	1934
```

- `npm run family -- ../research/family-media.tsv` copies each file into `public/img/<key>.jpg` (at most 1800 px), and adds it to `credits.json` with `"family": true`. Cue it in a scene like any image: `"imgs": [[1, "dugun", "Düğün, 1958"]]`. The video credits it as "Aile arşivi · <credit>", not Wikimedia.
- `document` files are shown whole, never cropped, with a gentler zoom.
- `render_report.py … --media research/family-media.tsv` adds an "Aile arşivi" gallery to the report and shows each file under its place (column 6, a dossier place id) in the interactive map.
- These files contain the family's private history: they stay on this machine like the rest of the outputs.
