// Write subtitle files from the timeline: out/<name>.<lang>.srt (and one per extra language), for
// players and upload sites that take a separate subtitle track (YouTube, VLC, a TV), or for a video
// rendered with burnt-in subtitles switched off (--props='{"subs":false}').
//
// usage: node scripts/export-srt.mjs [name] [--vertical]
//   --vertical  shorter cues, matching the burnt-in subtitles of the 9:16 video
import fs from "node:fs";
import { chunkLine, readJson } from "./lib.mjs";

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith("--")) || "family-story";
const MAX = args.includes("--vertical") ? 64 : 9999; // MapStory.tsx uses the same limits
const TAIL = 18; // frames a line stays up after its audio ends (as in the video)

const ts = (f, fps) => {
  const ms = Math.max(0, Math.round((f / fps) * 1000));
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
function srt(tl) {
  const cues = [];
  for (const sc of tl.scenes) sc.lines.forEach((l, k) => {
    const next = sc.lines[k + 1];
    const end = next ? next.from : l.from + l.frames + TAIL;
    for (const c of chunkLine(l.text, MAX)) {
      const a = sc.from + l.from + c.t0 * l.frames;
      const b = c.t1 >= 1 ? sc.from + end : sc.from + l.from + c.t1 * l.frames;
      cues.push(`${cues.length + 1}\n${ts(a, tl.fps)} --> ${ts(b - 1, tl.fps)}\n${c.text}\n`);
    }
  });
  return cues.join("\n");
}
fs.mkdirSync("out", { recursive: true });
const base = readJson("src/data/timeline.json", { scenes: [] });
const lang = readJson("src/data/meta.json", {}).lang || "tr";
const files = [[`out/${name}.${lang}.srt`, base]];
for (const [k, v] of Object.entries(readJson("src/data/i18n.json", {}))) files.push([`out/${name}.${k}.srt`, v.timeline]);
for (const [f, tl] of files) {
  fs.writeFileSync(f, "﻿" + srt(tl).replace(/\n/g, "\r\n"));
  console.log(f);
}
