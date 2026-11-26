// Synthesize the narration locally, one WAV per subtitle line, then write src/data/timeline.json
// (frame timings for every line and scene). Nothing leaves the machine.
//
// usage:
//   node scripts/gen-vo.mjs --engine yazgi --voice male-01            # Turkish, open-source yazgi-tts-1 (best Turkish quality)
//   node scripts/gen-vo.mjs --engine say   --voice Yelda              # macOS built-in voices, any installed language
//   node scripts/gen-vo.mjs --timeline-only                           # re-time after editing story.json without re-synthesizing
//   ... --only giris-2,sema-1                                         # re-synthesize just these lines
//
// yazgi needs the venv from the skill's setup_tts.sh (or set FMS_TTS_PYTHON to a python that has yazgi-tts).
// Per-line seed overrides (yazgi): scripts/seeds.json  {"giris-2": 11}
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ENGINE = opt("--engine", "yazgi");
const VOICE = opt("--voice", ENGINE === "yazgi" ? "male-01" : "Yelda");
const ONLY = opt("--only") ? new Set(opt("--only").split(",")) : null;
const TIMELINE_ONLY = args.includes("--timeline-only");

const FPS = 30;
const LEAD = 0.7, GAP = 0.5, TAIL = 1.1, CARD_LEAD = 2.1; // seconds
const story = JSON.parse(fs.readFileSync("src/data/story.json", "utf8"));
const seeds = fs.existsSync("scripts/seeds.json") ? JSON.parse(fs.readFileSync("scripts/seeds.json", "utf8")) : {};
fs.mkdirSync("public/vo", { recursive: true });
fs.mkdirSync(".vo-tmp", { recursive: true });

const lines = [];
for (const sc of story) (sc.say || []).forEach((text, k) => lines.push({ base: `${sc.id}-${k + 1}`, text, seed: seeds[`${sc.id}-${k + 1}`] ?? 7 }));
fs.writeFileSync(".vo-tmp/all-lines.json", JSON.stringify(lines, null, 1));

if (!TIMELINE_ONLY) {
  const todo = ONLY ? lines.filter((l) => ONLY.has(l.base)) : lines.filter((l) => !fs.existsSync(`public/vo/${l.base}.wav`) || args.includes("--all"));
  if (!ONLY && !args.includes("--all") && todo.length < lines.length) console.log(`${lines.length - todo.length} lines already exist (use --all to redo them)`);
  if (todo.length && ENGINE === "yazgi") {
    const py = process.env.FMS_TTS_PYTHON || path.join(os.homedir(), ".cache/family-migration-story/venv/bin/python");
    if (!fs.existsSync(py)) throw new Error(`no TTS python at ${py}: run the skill's scripts/setup_tts.sh first`);
    fs.writeFileSync(".vo-tmp/lines.json", JSON.stringify(todo, null, 1));
    execFileSync(py, ["-I", "scripts/tts_yazgi.py", ".vo-tmp/lines.json", ".vo-tmp", VOICE], { stdio: ["ignore", "inherit", "inherit"] });
  } else if (todo.length && ENGINE === "say") {
    for (const l of todo) {
      fs.writeFileSync(".vo-tmp/line.txt", l.text);
      execFileSync("say", ["-v", VOICE, "-f", ".vo-tmp/line.txt", "-o", `.vo-tmp/${l.base}.aiff`]);
      execFileSync("ffmpeg", ["-y", "-v", "error", "-i", `.vo-tmp/${l.base}.aiff`, `.vo-tmp/${l.base}.wav`]);
      console.log(l.base);
    }
  } else if (todo.length) {
    throw new Error(`unknown engine ${ENGINE} (yazgi | say)`);
  }
  for (const l of todo) {
    // 48 kHz mono, with 30 ms fades so cuts never click
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", `.vo-tmp/${l.base}.wav`, "-af", "afade=t=in:d=0.03,areverse,afade=t=in:d=0.03,areverse",
      "-ar", "48000", "-ac", "1", `public/vo/${l.base}.wav`]);
  }
}

// ---- timeline ----
const dur = (f) => parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());
const scenes = [];
let cursor = 0;
for (const sc of story) {
  let t = LEAD + (sc.card ? CARD_LEAD : 0);
  const out = (sc.say || []).map((text, k) => {
    const f = `public/vo/${sc.id}-${k + 1}.wav`;
    if (!fs.existsSync(f)) throw new Error(`missing ${f}: run without --timeline-only`);
    const d = dur(f);
    const line = { file: `vo/${sc.id}-${k + 1}.wav`, text, from: Math.round(t * FPS), frames: Math.ceil(d * FPS) };
    t += d + GAP;
    return line;
  });
  const frames = out.length ? Math.ceil((t - GAP + TAIL) * FPS) : Math.round((sc.dur || 6) * FPS);
  scenes.push({ id: sc.id, from: cursor, frames, lines: out });
  cursor += frames;
}
fs.writeFileSync("src/data/timeline.json", JSON.stringify({ fps: FPS, total: cursor, voice: `${ENGINE}/${VOICE}`, scenes }, null, 1));
console.log(`timeline: ${(cursor / FPS).toFixed(1)} s, ${lines.length} lines, ${scenes.length} scenes`);
