# Family story video (Remotion)

Made by the `family-migration-story` skill. Everything family-specific is in `src/data/`:
story.json (scenes and narration), places/routes/context/zones/branches.json (map), meta.json (language
and on-screen words), credits.json (images), geo.json and timeline.json (generated).

    npm run geo                                   # build the map for the places
    npm run check                                 # check story against data
    npm run vo -- --engine yazgi --voice male-01  # narration (or --engine say --voice <macOS voice>)
    npm run dev                                   # preview in Remotion Studio
    npm run render                                # out/master.mp4
