# Video pipeline

Contents: 1. Set up · 2. Fill the data · 3. Map and checks · 4. Voice · 5. Preview and render · 6. Deliver and QA · 7. Vertical, other languages, subtitles · 8. Troubleshooting

`$SKILL` below is this skill's directory. Commands run from the video project folder unless noted. Every script works on Windows, macOS and Linux; `python` means Python 3.10+ (`python3` on macOS/Linux, `python` or `py` on Windows).

## 1. Set up

```bash
python -I $SKILL/scripts/new_project.py <workdir>/video     # copies assets/template, runs npm ci (Remotion 4)
python -I $SKILL/scripts/setup_tts.py                       # once per machine: ~/.cache/family-migration-story/venv
```

Requirements: Node 20+, and uv for the Turkish voice. ffmpeg is optional: the scripts use the system ffmpeg when there is one and otherwise the copy Remotion installs in `node_modules`. The yazgi model (~1.2 GB) downloads on the first synthesis; faster-whisper "small" (~0.5 GB) on the first ASR check. Keep at least 5 GB free (`setup_tts.py` checks).

To see the pictures before installing any voice, use the draft engine: silent placeholder lines timed at about 15 characters per second (`npm run vo -- --engine draft`). Synthesize the real narration with `--all` before delivering.

## 2. Fill the data

Write these from the dossier and the story (formats in `data-formats.md`):

1. `src/data/meta.json`: language, UI strings, the credits paragraph (family data source, voice, "Natural Earth" and "CShapes 2.0 (Schvitz et al. 2022, CC BY-NC-SA 4.0)" for the map, "dotted routes are representative"). `"vertical": true` if a 9:16 version is wanted.
2. `src/data/branches.json`: one branch per lineage you want coloured (usually by the origin place of each grandparent's line: 2-5 branches).
3. `src/data/places.json`: every family place (birthplaces, register places, residences) with coordinates from the dossier (`places.py`).
4. `src/data/context.json`: 6-15 neighbouring cities and the seas, for orientation. Use `onlyIn` for labels that matter in one scene only.
5. `src/data/routes.json`: each journey. For sea and long land routes give 8-25 waypoints that follow the coast or the road/rail of the period, not a straight line. Mark unknown exact paths `dotted`.
6. `src/data/zones.json`: only if a scene needs a highlighted area or line; else `[]`.
7. `src/data/story.json`: the scenes.
8. Images: write `research/images.tsv` (`key<TAB>File:Title.jpg`) and run
   `python -I $SKILL/scripts/research/commons_fetch.py research/images.tsv public/img src/data/credits.json`.
9. The family's own photos and documents, if they shared any: `research/family-media.tsv` (data-formats.md §6), then `npm run family -- ../research/family-media.tsv`.

## 3. Map and checks

```bash
npm run geo      # crops Natural Earth to all places, routes and scene cameras (+margin), and draws the period borders
npm run check    # story <-> data consistency (missing places/routes/images, long lines, stale timeline)
                 # and framing: warns when a focus place lands under the photo card, header, fact chips or subtitles
```

`npm run geo` prints, for every scene, the date of its borders and the state each focus place lay in. Read it against the dossier: CShapes dates every border change, but its outlines are simplified and it starts in 1886. Where a border moved during the scene's year, set the scene's `era` to an exact date. `npm run geo -- --bbox w,s,e,n` forces a frame (e.g. to include a far-off capital in context); `--no-eras` leaves period borders out.

## 4. Voice

Turkish, best quality (default):
```bash
npm run vo -- --engine yazgi --voice male-01
```
Other languages: the operating system's own voices. `--voices` lists them.
```bash
npm run vo -- --engine sapi --voice "Microsoft Zira Desktop"   # Windows (Settings > Time & language > Speech adds more)
npm run vo -- --engine say --voice Samantha                    # macOS
```
Then check every line by ear-proxy (local Whisper); the venv python is the one `setup_tts.py` printed:
```bash
<venv python> -I $SKILL/scripts/asr_check.py . --lang tr
```
For each flagged line, add a seed to `scripts/seeds.json` (`{"scene-2": 11}`) and run `npm run vo -- --engine yazgi --only scene-2`. After editing narration text: `npm run vo -- --engine yazgi --only <changed lines>`; after editing anything else only: `npm run vo -- --timeline-only`.

yazgi voices: male-01 … male-04, female-01 … female-04. male-01 held up best over long narration in testing; offer the user a short sample of two voices if they care.

## 5. Preview and render

Look at stills before the full render (fast, catches layout problems):
```bash
npx remotion still FamilyStory out/check/s-<n>.jpg --frame=<frame> --scale=0.5
npx remotion still FamilyStoryVertical out/check/v-<n>.jpg --frame=<frame> --scale=0.5
```
Take frames from `src/data/timeline.json` (scene `from` + ~120): a scene with a photo card, one with many facts, one where the borders change, the closing origins scene, the credits. Read the JPGs and fix overlaps, then:
```bash
npm run render             # out/master.mp4, h264 CRF 18. Budget ~0.5x-2x the video length.
npm run render:vertical    # out/master-vertical.mp4 (1080x1920)
```
Run long renders in the background. Remotion Studio (`npm run dev`) is useful when the user wants to scrub through it live.

## 6. Deliver and QA

```bash
python -I $SKILL/scripts/deliver.py out/master.mp4 out/<name>      # <name>.mp4 + <name>-720p.mp4, loudness -16 LUFS
python -I $SKILL/scripts/qa_video.py out/<name>.mp4 20 95 240      # loudness, long silences, subtitle-band jitter
```
`deliver.py` sees a vertical master and makes 1080x1920 and 720x1280 copies. Expect: integrated loudness about -16 LUFS; silences over 3.5 s only at chapter cards and the end; jitter `inf` (or > 45 dB) on still text.

## 7. Vertical, other languages, subtitles

- **Vertical (9:16)** for Instagram Reels, TikTok, YouTube Shorts and WhatsApp status: set `"vertical": true` in meta.json, run `npm run geo` and `npm run check` again (they then also check the vertical framing), and `npm run render:vertical`. The layout keeps the top ~150 px and the bottom ~400 px clear for the apps' own buttons; header and facts stack at the top, long subtitle lines are shown in parts. Keep vertical scenes to ≤ 5 facts. The same `cam` boxes serve both formats; the vertical camera leans toward the scene's focus places.
- **Another language**: write `src/data/lang/<code>.json` (data-formats.md §5), then `npm run vo -- --lang en --engine sapi --voice "…"` (own narration) or `npm run vo -- --lang en --subs-only` (original voice, translated subtitles); render `FamilyStory-en` / `FamilyStoryVertical-en`.
- **Subtitles as a file**: `npm run srt -- <name>` writes `out/<name>.<lang>.srt` for every language (`--vertical` for the shorter vertical cues). To render without burnt-in subtitles: `npx remotion render FamilyStory out/clean.mp4 --props='{"subs":false}'`.

## 8. Troubleshooting

| symptom | cause and fix |
|---|---|
| text shimmers or jitters | labels must stay in the HTML layer with `translate3d` (they are in the template); don't move text into the SVG or scale it per frame |
| map shows empty sea at the edge | the camera is clamped to `geo.json`; widen with `npm run geo -- --margin 0.3` or a `--bbox` |
| vertical frame is cut off or zoomed out | the map is too short for 9:16: `npm run geo -- --tall` (or `"vertical": true` in meta.json) |
| a place label overlaps another | adjust its `dx`/`dy`/`anchor`, or make one `minor` / `onlyFar` |
| a place sits under the photo card, the header or the fact chips (`npm run check` warns) | the photo card covers the left 40% of the screen, the header the top-left, facts the top-right. In scenes with a photo, move `cam` west so the place lands at about 60% of the width; for scenes with many facts, move `cam` north so the place sits lower. Re-check with `npm run check` and a still |
| the borders show the wrong state for a place | the scene's date falls before or after a change: set `era` to the date you mean and run `npm run geo`; if CShapes itself is wrong there, say so in the narration and the report rather than drawing it |
| a state name sits awkwardly on the map | the names are placed per scene by `npm run geo`; moving `cam` or adding `onlyIn` context labels changes where they go |
| photo card covers the facts | captions stay inside the card; keep 1 image at a time and ≤ 6 facts in that scene |
| subtitle wraps to 3 lines | split the line in `story.json` (≤ 200 chars) |
| narration too quiet | the delivery encode normalises to -16 LUFS; the master is not normalised |
| a line mispronounces a name | respell it phonetically in `say` (keep the real spelling in facts) and resynthesize that line |
| `npm run check` says timeline stale | text changed after synthesis: `npm run vo -- --engine … --only <ids>` |
| Turkish letters garbled in a Windows console | the scripts switch their own output to UTF-8; for other tools run `chcp 65001` first |
