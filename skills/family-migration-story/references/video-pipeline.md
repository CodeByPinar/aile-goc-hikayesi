# Video pipeline

Contents: 1. Set up · 2. Fill the data · 3. Map and checks · 4. Voice · 5. Preview and render · 6. Deliver and QA · 7. Troubleshooting

`$SKILL` below is this skill's directory. Commands run from the video project folder unless noted.

## 1. Set up

```bash
zsh $SKILL/scripts/new_project.sh <workdir>/video     # copies assets/template, runs npm ci (Remotion 4)
zsh $SKILL/scripts/setup_tts.sh                       # once per machine: ~/.cache/family-migration-story/venv
```

Requirements: Node 20+, ffmpeg/ffprobe, uv (for the Python venv). The yazgi model (~1.2 GB) downloads on the first synthesis; faster-whisper "small" (~0.5 GB) on the first ASR check. Check free disk space first (`df -h ~`); keep at least 5 GB free.

## 2. Fill the data

Write these from the dossier and the story (formats in `data-formats.md`):

1. `src/data/meta.json`: language, UI strings, the credits paragraph (family data source, voice, map data "Natural Earth", "dotted routes are representative").
2. `src/data/branches.json`: one branch per lineage you want coloured (usually by the origin place of each grandparent's line: 2-5 branches).
3. `src/data/places.json`: every family place (birthplaces, register places, residences) with coordinates from the dossier (`places.py`).
4. `src/data/context.json`: 6-15 neighbouring cities and the seas, for orientation. Use `onlyIn` for labels that matter in one scene only.
5. `src/data/routes.json`: each journey. For sea and long land routes give 8-25 waypoints that follow the coast or the road/rail of the period, not a straight line. Mark unknown exact paths `dotted`.
6. `src/data/zones.json`: only if a scene needs a highlighted area or line; else `[]`.
7. `src/data/story.json`: the scenes.
8. Images: write `research/images.tsv` (`key<TAB>File:Title.jpg`) and run
   `python3 -I $SKILL/scripts/research/commons_fetch.py research/images.tsv public/img src/data/credits.json`.

## 3. Map and checks

```bash
npm run geo      # crops Natural Earth to all places, routes and scene cameras (+margin)
npm run check    # story <-> data consistency (missing places/routes/images, long lines, stale timeline)
                 # and framing: warns when a focus place lands under the photo card, header, fact chips or subtitles
```

`npm run geo -- --bbox w,s,e,n` forces a frame (e.g. to include a far-off capital in context). Borders on the map are today's; the credits should say so.

## 4. Voice

Turkish, best quality (default):
```bash
npm run vo -- --engine yazgi --voice male-01
```
Other languages (macOS built-in voices, e.g. `say -v '?'` lists them; English "Samantha", German "Anna", Greek "Melina"):
```bash
npm run vo -- --engine say --voice Samantha
```
Then check every line by ear-proxy (local Whisper):
```bash
~/.cache/family-migration-story/venv/bin/python -I $SKILL/scripts/asr_check.py . --lang tr
```
For each flagged line, add a seed to `scripts/seeds.json` (`{"scene-2": 11}`) and run `npm run vo -- --engine yazgi --only scene-2`. After editing narration text: `npm run vo -- --engine yazgi --only <changed lines>`; after editing anything else only: `npm run vo -- --timeline-only`.

yazgi voices: male-01 … male-04, female-01 … female-04. male-01 held up best over long narration in testing; offer the user a short sample of two voices if they care.

## 5. Preview and render

Look at stills before the full render (fast, catches layout problems):
```bash
npx remotion still FamilyStory out/check/s-<n>.jpg --frame=<frame> --scale=0.5
```
Take frames from `src/data/timeline.json` (scene `from` + ~120): a scene with a photo card, one with many facts, the closing origins scene, the credits. Read the JPGs and fix overlaps, then:
```bash
npm run render        # out/master.mp4, h264 CRF 18. On an M-series Mac 2:15 of video took 1-5 min depending on machine load; budget ~0.5x-2x the video length.
```
Run long renders in the background. Remotion Studio (`npm run dev`) is useful when the user wants to scrub through it live.

## 6. Deliver and QA

```bash
zsh $SKILL/scripts/deliver.sh out/master.mp4 out/<name>     # <name>.mp4 (1080p) + <name>-720p.mp4, loudness -16 LUFS
zsh $SKILL/scripts/qa_video.sh out/<name>.mp4 20 95 240     # loudness, long silences, subtitle-band jitter
```
Expect: integrated loudness about -16 LUFS; silences over 3.5 s only at chapter cards and the end; jitter PSNR `inf` (or > 45 dB) on still text.

## 7. Troubleshooting

| symptom | cause and fix |
|---|---|
| text shimmers or jitters | labels must stay in the HTML layer with `translate3d` (they are in the template); don't move text into the SVG or scale it per frame |
| map shows empty sea at the edge | the camera is clamped to `geo.json`; widen with `npm run geo -- --margin 0.3` or a `--bbox` |
| a place label overlaps another | adjust its `dx`/`dy`/`anchor`, or make one `minor` / `onlyFar` |
| a place sits under the photo card, the header or the fact chips (`npm run check` warns) | the photo card covers the left 40% of the screen, the header the top-left, facts the top-right. In scenes with a photo, move `cam` west so the place lands at about 60% of the width; for scenes with many facts, move `cam` north so the place sits lower. Re-check with `npm run check` and a still |
| photo card covers the facts | captions stay inside the card; keep 1 image at a time and ≤ 6 facts in that scene |
| subtitle wraps to 3 lines | split the line in `story.json` (≤ 200 chars) |
| narration too quiet | the delivery encode normalises to -16 LUFS; the master is not normalised |
| a line mispronounces a name | respell it phonetically in `say` (keep the real spelling in facts) and resynthesize that line |
| `npm run check` says timeline stale | text changed after synthesis: `npm run vo -- --engine … --only <ids>` |
