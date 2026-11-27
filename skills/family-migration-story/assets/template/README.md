# Family story video (Remotion)

Made by the `family-migration-story` skill. Everything family-specific is in `src/data/`:
story.json (scenes and narration), places/routes/context/zones/branches.json (map), meta.json (language
and on-screen words), credits.json (images), lang/<code>.json (translations), geo.json, timeline.json and
i18n.json (generated).

    npm run geo                                   # build the map and the period borders for the places
    npm run check                                 # check story against data (add -- --vertical for 9:16)
    npm run family -- ../research/family-media.tsv   # the family's own photos and documents
    npm run vo -- --engine yazgi --voice male-01  # narration (or --engine sapi|say --voice <voice>, or draft)
    npm run vo -- --lang en --engine sapi --voice "Microsoft Zira Desktop"   # a second language
    npm run dev                                   # preview in Remotion Studio
    npm run render                                # out/master.mp4           (1920x1080)
    npm run render:vertical                       # out/master-vertical.mp4  (1080x1920)
    npm run srt -- <name>                         # out/<name>.<lang>.srt

Compositions: FamilyStory, FamilyStoryVertical, and FamilyStory-<lang> / FamilyStoryVertical-<lang>
for every translated language. `--props='{"subs":false}'` renders without burnt-in subtitles.
