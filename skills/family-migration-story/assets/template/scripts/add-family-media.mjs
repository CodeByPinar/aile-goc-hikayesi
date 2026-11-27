// Add the family's own photos and scanned documents (a wedding photo, a nüfus cüzdanı, a letter, a
// passport page) to the video. They stay on this machine: the files are copied into public/img and
// listed in src/data/credits.json with "family": true, so the video credits them as the family archive
// instead of Wikimedia Commons.
//
// usage: node scripts/add-family-media.mjs <list.tsv>
//   list.tsv, one file per line, tab-separated:
//     key <TAB> path/to/file.jpg <TAB> title <TAB> [photo|document] <TAB> [who lent it, e.g. "Ayşe Örnek'in albümü"]
//   key       what story.json cues in "imgs" (letters, digits and dashes)
//   document  a scanned paper: shown whole (never cropped), a little larger, with a lighter zoom
//
// Images are resized to at most 1800 px on the long side with the ffmpeg that Remotion ships, so a
// 40 MB scan from a phone does not slow the render. JPEG, PNG, WebP, HEIC (if ffmpeg reads it) and TIFF.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ff, readJson } from "./lib.mjs";

const list = process.argv[2];
if (!list) { console.error("usage: node scripts/add-family-media.mjs <list.tsv>"); process.exit(1); }
const rows = fs.readFileSync(list, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"));
const base = path.dirname(path.resolve(list));
const CREDITS = "src/data/credits.json";
const credits = readJson(CREDITS, {});
const ffmpeg = ff("ffmpeg"), ffprobe = ff("ffprobe");
fs.mkdirSync("public/img", { recursive: true });

let n = 0;
for (const row of rows) {
  const [key, file, title = "", kind = "photo", author = ""] = row.split("\t").map((x) => x.trim());
  if (!/^[\w-]+$/.test(key || "")) { console.warn(`skip: key "${key}" must be letters, digits or dashes`); continue; }
  const src = path.isAbsolute(file || "") ? file : path.join(base, file || "");
  if (!fs.existsSync(src)) { console.warn(`skip ${key}: ${src} not found`); continue; }
  if (credits[key] && !credits[key].family) { console.warn(`skip ${key}: already used by a Commons image; pick another key`); continue; }
  const out = `public/img/${key}.jpg`;
  // fit inside 1800x1800, keep the aspect ratio, never upscale; flatten transparency onto black
  execFileSync(ffmpeg, ["-y", "-v", "error", "-i", src, "-frames:v", "1",
    "-vf", "scale='min(1800,iw)':'min(1800,ih)':force_original_aspect_ratio=decrease,format=yuvj420p", "-q:v", "3", out]);
  const [w, h] = execFileSync(ffprobe, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", out])
    .toString().trim().split(",").map(Number);
  credits[key] = { file: `${key}.jpg`, title: title || key, author, license: "family", page: "", w, h, family: true, kind: kind === "document" ? "document" : "photo" };
  console.log(`${key.padEnd(16)} ${String(w).padStart(4)}x${h}  ${credits[key].kind.padEnd(8)}  ${title}`);
  n++;
}
fs.writeFileSync(CREDITS, JSON.stringify(credits, null, 1));
console.log(`${n} family file(s) in ${CREDITS}. Cue them in story.json: "imgs": [[lineIndex, "key", "caption", spanLines]]`);
