# Writing the story

Contents: 1. What makes it work · 2. Structure · 3. Narration lines · 4. Saying how sure we are · 5. On-screen elements · 6. Images · 7. Length · 8. Turkish narration notes · 9. Review with the user

The video is a documentary about the viewer's own family, told on a moving map. The research gives the facts; the story decides the order, the voice and the feeling.

## 1. What makes it work

These came from a user's feedback on earlier drafts, and they hold generally:

- **One timeline, all branches interleaved.** Don't tell the mother's side and then the father's side. Move through the years and cut between the lines: *"1912. While Balkan guns close in on Selanik, your great-grandmother's family in Trabzon is …"*. The cross-cuts ("o sırada…", "meanwhile…", "the same winter, eight hundred kilometres east…") are what make it feel like one family.
- **Life events, not just places.** Births, marriages, a child dying young, a widowhood, a second marriage, leaving, arriving, a surname given. "They married; within a year their first son was born" is the backbone the history hangs on. Infer marriages from the first child's birth and say "by 1925 they were married".
- **The world in the room.** Every chapter ties family moments to what was happening in the country and the world: a war reaching the town, a treaty that moved the border under them, a law that gave them a surname, a crash that emptied a market. Use the dossier's world spine, with exact dates.
- **Specific, concrete details.** A ship's name and its history, a village's tobacco, the trunk they carried, the number of households settled in the village, the museum that stands there now. One concrete detail per scene beats three general sentences.
- **Drama from the facts, not adjectives.** The stakes are real (a border moving, a town burning, a forced journey). State them plainly and let them land. No invented dialogue, no invented feelings stated as fact ("she wept"); you may invite the viewer to imagine ("think of a nine-year-old on that deck").
- **Second person.** Address the subject: "your great-great-grandfather", "your grandmother's village". In Turkish use the familiar "sen" ("büyük deden", "annenin annesi") unless the user prefers otherwise.
- **Something keeps moving.** The map drifts and flies; routes draw; photos slowly zoom. Plan every scene to have a route, a new place or a photo.

## 2. Structure

Typical arc for 4-5 generations (adjust to the family):

1. **Opening** (1 scene): the earliest known person, the place, the empire or state they lived in. A chapter card for part I.
2. **Roots** (3-6 scenes): each lineage's earliest place, interleaved by year. What the place was like (population, economy), the first marriages and births.
3. **Upheaval** (4-8 scenes): the wars, border changes, exchanges, deportations or emigration waves that moved the family, each with its route on the map. This is the dramatic core; give the journeys time.
4. **Settling** (3-5 scenes): arrival, the new village or city, the other side of the mirror (who left the place they came to), the surname law, the first births in the new place.
5. **Converging** (2-4 scenes): the lines meet: marriages between branches, moves to the city, the parents' births and marriage.
6. **Today** (1-2 scenes): the subject's birth; then a closing scene with all places lit (`all: true`), every route visible, and the ancestry bar (`origins` from `tree_tool.py origins`).
7. **Credits** (1 scene, `credits: true`): sources, voice, map data, photo credits.

Chapter cards (`cardKick`, `card`, `cardSub`) at 3-5 turning points: "Bölüm I · İmparatorluk · 1849-1911".

## 3. Narration lines

- 2-5 lines per scene, each one sentence or two short ones, under ~200 characters (one subtitle, two lines on screen).
- First line of a scene orients: year, place, who. Last line hands over to the next scene or lands an image.
- Prefer verbs and numbers to adjectives. Read it aloud: if a sentence needs a breath in the middle, split it.
- Names of places: use the form the family used and give the modern one once ("Karaferye, bugün Yunanistan'da Veria").
- Keep personal names to given names and kinship ("Ali, your great-great-grandfather"), which is how families talk.
- Avoid stacked dates in one line; one date per sentence.

## 4. Saying how sure we are

Match the wording to the claim's confidence in the dossier. This keeps the story honest without being dry:

| confidence | Turkish | English |
|---|---|---|
| documented | (plain statement) | (plain statement) |
| probable | "büyük olasılıkla", "kayıtlar … gösteriyor" | "most likely", "the records point to" |
| tradition | "ailede anlatılana göre", "köyde anlatılan" | "the family says", "local memory has it" |
| speculative | "belki de", "… olabilir", "kim bilir" | "perhaps", "it may have been" |

A tradition can still be a highlight. Tell it as tradition, then add the documented context: "The family says they came on the Gülcemal. The ship was real: built in Belfast in 1874, torpedoed in 1915 and patched up, she carried exchangees along this coast."

Dotted routes on the map mean "representative route"; the header shows the legend automatically.

## 5. On-screen elements

- `years` (big) and `title` (short, 2-5 words) in the header.
- `part`: the lineage chip ("Baba tarafı · Selanik"); `b` picks its colour. Use `"all"` for shared scenes.
- `facts`: 3-6 chips per scene: `#Heading`, family facts ("Ali · d. 1895, Selanik"), and 1-2 world pills (`W|8 Kasım 1912 · Yunan ordusu Selanik'te`). Facts appear one by one while the narration runs.
- `routes`: draw the journey during the scene (`[id, 0.15, 0.85]`), boat icon for sea legs.
- `zone`: a highlighted area or line when a border or a river matters (exchange exemption zone, a front line).
- `focus`: the places this scene is about (they pulse).
- Framing: the header covers the top-left, the facts the top-right third and a photo card the left 40% of the screen. Choose `cam` so the scene's places land in the middle and lower part, and in photo scenes in the right half (extend `cam` to the west); for wide east-west scenes, extend `cam` a little beyond the outermost places. `npm run check` warns when a focus place is covered.
- A route whose end is a city on the left of the screen and a photo don't mix in one scene: split it (the journey without a photo, then a zoomed scene at the destination with the photo).

## 6. Images

- Aim for one image in at least half the scenes: the place in the period (postcard, photograph, engraving), the ship, the event, a document type, a period map.
- Free licenses only (public domain, CC0, CC BY, CC BY-SA), with author and license on the card and in the credits. Check that the image really shows the place (namesakes are common) and the period.
- Cue it on the line it illustrates: `[lineIndex, key, caption, spanLines]`. Captions: what and when, under ~60 characters.
- No images of real family members unless the user provides them and asks.

## 7. Length

About 3-4 narration lines per person-generation pair works out to: ~25 people → ~85 lines → ~11 minutes. For a short version (social media, 2-3 minutes), keep one scene per migration and drop the roots detail.

## 8. Turkish narration notes (yazgi-tts)

- yazgi-tts reads numbers, dates and ordinals from digits correctly ("1924'te", "14 hane"); write them as digits.
- Avoid abbreviations (yazgi reads "Mah." literally): write "Mahallesi", "yaklaşık".
- Foreign names: spell them as a Turkish reader would say them ("Tesaloniki", "Saraybosna"); keep the original spelling in facts and captions.
- Apostrophes before suffixes are fine ("Selanik'ten").
- After synthesis, `asr_check.py` flags lines where a word was swallowed; regenerate with another seed.

## 9. Review with the user

Before synthesis, show the user the scene outline (years, title, one line each) and the claims marked tradition/speculative that the story uses. Changing text after synthesis is cheap per line but re-timing everything is easier before. After rendering, offer the 720p file first (small enough for phones), then the 1080p master.
