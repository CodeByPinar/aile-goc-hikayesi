// Synthesize the narration locally, one WAV per subtitle line, then write src/data/timeline.json
// (frame timings for every line and scene). Nothing leaves the machine.
//
// usage:
//   node scripts/gen-vo.mjs --engine yazgi --voice male-01     # Turkish, open-source yazgi-tts-1 (best Turkish quality)
//   node scripts/gen-vo.mjs --engine say   --voice Yelda       # macOS built-in voices, any installed language
//   node scripts/gen-vo.mjs --engine sapi  --voice "Microsoft Zira Desktop"   # Windows built-in voices
//   node scripts/gen-vo.mjs --engine draft                     # silent placeholder audio with estimated timing:
//                                                              # check the pictures before installing any voice
//   node scripts/gen-vo.mjs --timeline-only                    # re-time after editing story.json without re-synthesizing
//   ... --only giris-2,sema-1                                  # re-synthesize just these lines
//   ... --voices                                               # list the voices of the chosen engine
//
// A second language (src/data/lang/<code>.json, see references/data-formats.md):
//   node scripts/gen-vo.mjs --lang en --engine sapi --voice "Microsoft Zira Desktop"   # its own narration
//   node scripts/gen-vo.mjs --lang en --subs-only                                      # original voice, translated text
//
// yazgi needs the venv from the skill's setup_tts.py (or set FMS_TTS_PYTHON to a python that has yazgi-tts).
// Per-line seed overrides (yazgi): scripts/seeds.json  {"giris-2": 11}
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fadeWav, ff, readJson, ttsPython, wavSeconds, writeWav16 } from "./lib.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const DEFAULT_ENGINE = "yazgi";
const ENGINE = opt("--engine", DEFAULT_ENGINE);
const VOICE = opt("--voice", { yazgi: "male-01", say: "Yelda", sapi: "", draft: "" }[ENGINE] ?? "");
const ONLY = opt("--only") ? new Set(opt("--only").split(",")) : null;
const TIMELINE_ONLY = args.includes("--timeline-only");
const LANG = opt("--lang", "");
const SUBS_ONLY = args.includes("--subs-only");

const FPS = 30;
const LEAD = 0.7, GAP = 0.5, TAIL = 1.1, CARD_LEAD = 2.1; // seconds
const DRAFT_CPS = 15; // narration speed assumed by the draft engine, characters per second

/* ---------------- Windows voices (System.Speech, offline) ---------------- */
const PS = (script, env) =>
  execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "inherit"] }).toString();
const SAPI_LIST = "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name + ' | ' + $_.VoiceInfo.Culture + ' | ' + $_.VoiceInfo.Gender }";
const SAPI_SAY = [
  "Add-Type -AssemblyName System.Speech",
  "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
  "if ($env:FMS_VOICE) { $s.SelectVoice($env:FMS_VOICE) }",
  "$lines = [System.IO.File]::ReadAllText($env:FMS_LINES, [System.Text.Encoding]::UTF8) | ConvertFrom-Json",
  "foreach ($l in $lines) { $s.SetOutputToWaveFile((Join-Path $env:FMS_OUT ($l.base + '.wav'))); $s.Speak($l.text); Write-Output $l.base }",
  "$s.SetOutputToNull(); $s.Dispose()",
].join("; ");

if (args.includes("--voices")) {
  if (ENGINE === "sapi") console.log(PS(SAPI_LIST).trim() || "no Windows voices installed");
  else if (ENGINE === "say") console.log(execFileSync("say", ["-v", "?"]).toString());
  else console.log("yazgi voices: male-01 … male-04, female-01 … female-04");
  process.exit(0);
}

/* ---------------- which text is spoken ---------------- */
const story = readJson("src/data/story.json", []);
let variant = null;
if (LANG) {
  const f = `src/data/lang/${LANG}.json`;
  if (!fs.existsSync(f)) throw new Error(`${f} is missing: write the translation first (references/data-formats.md, section 5)`);
  variant = readJson(f, {});
  for (const sc of story) {
    const tr = variant.scenes?.[sc.id]?.say || [];
    if ((sc.say || []).length !== tr.length) throw new Error(`${f}: scene "${sc.id}" has ${tr.length} lines, story.json has ${(sc.say || []).length}; they must match line for line`);
  }
}
const sayOf = (sc) => (variant ? variant.scenes?.[sc.id]?.say || [] : sc.say || []);
const VO = LANG && !SUBS_ONLY ? `vo/${LANG}` : "vo"; // folder under public/
const TMP = LANG ? `.vo-tmp/${LANG}` : ".vo-tmp";
fs.mkdirSync(`public/${VO}`, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const seeds = readJson("scripts/seeds.json", {});
const lines = [];
for (const sc of story) sayOf(sc).forEach((text, k) => lines.push({ base: `${sc.id}-${k + 1}`, text, seed: seeds[`${sc.id}-${k + 1}`] ?? 7 }));
fs.writeFileSync(`${TMP}/all-lines.json`, JSON.stringify(lines, null, 1));

/* ---------------- synthesis ---------------- */
if (!TIMELINE_ONLY && !SUBS_ONLY) {
  const todo = ONLY ? lines.filter((l) => ONLY.has(l.base)) : lines.filter((l) => !fs.existsSync(`public/${VO}/${l.base}.wav`) || args.includes("--all"));
  if (!ONLY && !args.includes("--all") && todo.length < lines.length) console.log(`${lines.length - todo.length} lines already exist (use --all to redo them)`);
  if (todo.length && ENGINE === "draft") {
    for (const l of todo) {
      const seconds = Math.max(1.4, l.text.length / DRAFT_CPS);
      writeWav16(`public/${VO}/${l.base}.wav`, new Int16Array(Math.round(seconds * 48000)), 48000);
    }
    console.log(`draft: ${todo.length} silent placeholder lines (~${DRAFT_CPS} characters per second). Synthesize with a real engine and --all before delivering.`);
  } else if (todo.length) {
    if (ENGINE === "yazgi") {
      const py = ttsPython();
      if (!fs.existsSync(py)) throw new Error(`no TTS python at ${py}: run the skill's scripts/setup_tts.py first (or try --engine draft)`);
      fs.writeFileSync(`${TMP}/lines.json`, JSON.stringify(todo, null, 1));
      execFileSync(py, ["-I", "scripts/tts_yazgi.py", `${TMP}/lines.json`, TMP, VOICE], { stdio: ["ignore", "inherit", "inherit"] });
    } else if (ENGINE === "say") {
      if (process.platform !== "darwin") throw new Error("--engine say is macOS only; on Windows use --engine sapi");
      for (const l of todo) {
        fs.writeFileSync(`${TMP}/line.txt`, l.text);
        execFileSync("say", ["-v", VOICE, "-f", `${TMP}/line.txt`, "-o", `${TMP}/${l.base}.aiff`]);
        execFileSync(ff("ffmpeg"), ["-y", "-v", "error", "-i", `${TMP}/${l.base}.aiff`, `${TMP}/${l.base}.wav`]);
        console.log(l.base);
      }
    } else if (ENGINE === "sapi") {
      if (process.platform !== "win32") throw new Error("--engine sapi is Windows only; on macOS use --engine say");
      fs.writeFileSync(`${TMP}/lines.json`, JSON.stringify(todo));
      process.stdout.write(PS(SAPI_SAY, { FMS_LINES: `${TMP}/lines.json`, FMS_OUT: TMP, FMS_VOICE: VOICE }));
    } else {
      throw new Error(`unknown engine ${ENGINE} (yazgi | say | sapi | draft)`);
    }
    const ffmpeg = ff("ffmpeg");
    for (const l of todo) {
      // 48 kHz mono 16-bit, with 30 ms fades so cuts never click
      execFileSync(ffmpeg, ["-y", "-v", "error", "-i", `${TMP}/${l.base}.wav`, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", `public/${VO}/${l.base}.wav`]);
      fadeWav(`public/${VO}/${l.base}.wav`);
    }
  }
}

/* ---------------- timeline ---------------- */
const scenes = [];
let cursor = 0;
for (const sc of story) {
  let t = LEAD + (sc.card ? CARD_LEAD : 0);
  const out = sayOf(sc).map((text, k) => {
    const rel = `${VO}/${sc.id}-${k + 1}.wav`;
    if (!fs.existsSync(`public/${rel}`)) throw new Error(`missing public/${rel}: run without --timeline-only`);
    const d = wavSeconds(`public/${rel}`);
    const line = { file: rel, text, from: Math.round(t * FPS), frames: Math.ceil(d * FPS) };
    t += d + GAP;
    return line;
  });
  const frames = out.length ? Math.ceil((t - GAP + TAIL) * FPS) : Math.round((sc.dur || 6) * FPS);
  scenes.push({ id: sc.id, from: cursor, frames, lines: out });
  cursor += frames;
}
const prev = readJson(LANG ? "src/data/i18n.json" : "src/data/timeline.json", {});
const prevVoice = LANG ? prev[LANG]?.timeline?.voice : prev.voice;
const voice = SUBS_ONLY ? readJson("src/data/timeline.json", {}).voice || "" : TIMELINE_ONLY && prevVoice ? prevVoice : `${ENGINE}/${VOICE}`;
const timeline = { fps: FPS, total: cursor, voice, scenes };
if (LANG) {
  const all = readJson("src/data/i18n.json", {});
  all[LANG] = { ...variant, lang: variant.lang || LANG, subsOnly: SUBS_ONLY, timeline };
  fs.writeFileSync("src/data/i18n.json", JSON.stringify(all, null, 1));
  console.log(`i18n.json[${LANG}]: ${(cursor / FPS).toFixed(1)} s, ${lines.length} lines${SUBS_ONLY ? " (subtitles only, original voice)" : ""} -> compositions FamilyStory-${LANG}, FamilyStoryVertical-${LANG}`);
} else {
  fs.writeFileSync("src/data/timeline.json", JSON.stringify(timeline, null, 1));
  console.log(`timeline: ${(cursor / FPS).toFixed(1)} s, ${lines.length} lines, ${scenes.length} scenes`);
}
