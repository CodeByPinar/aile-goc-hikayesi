// Shared helpers for the project scripts: finding ffmpeg/python on any platform, reading and writing
// WAV files, and splitting a narration line into subtitle-sized chunks.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const WIN = process.platform === "win32";
const EXE = WIN ? ".exe" : "";
export const CACHE = path.join(os.homedir(), ".cache", "family-migration-story");

/** Python of the speech venv made by the skill's setup_tts.py (FMS_TTS_PYTHON overrides it). */
export const ttsPython = () =>
  process.env.FMS_TTS_PYTHON || path.join(CACHE, "venv", WIN ? "Scripts" : "bin", "python" + EXE);

/** ffmpeg / ffprobe: FMS_FFMPEG / FMS_FFPROBE, then PATH, then the binary Remotion ships in node_modules. */
export function ff(tool) {
  const env = process.env["FMS_" + tool.toUpperCase()];
  if (env && fs.existsSync(env)) return env;
  const probe = spawnSync(tool, ["-version"], { stdio: "ignore" });
  if (!probe.error && probe.status === 0) return tool;
  const base = path.join("node_modules", "@remotion");
  if (fs.existsSync(base)) {
    for (const d of fs.readdirSync(base)) {
      const f = path.join(base, d, tool + EXE);
      if (d.startsWith("compositor-") && fs.existsSync(f)) return f;
    }
  }
  throw new Error(`${tool} not found: install ffmpeg or run npm ci in this project (Remotion ships one)`);
}

/* ---------------- WAV (PCM 16-bit) ---------------- */
export function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") throw new Error(`${file}: not a WAV file`);
  let o = 12, fmt = null, data = null;
  while (o + 8 <= b.length) {
    const id = b.toString("ascii", o, o + 4), len = b.readUInt32LE(o + 4);
    if (id === "fmt ") fmt = { format: b.readUInt16LE(o + 8), channels: b.readUInt16LE(o + 10), rate: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) };
    if (id === "data") { data = b.subarray(o + 8, Math.min(b.length, o + 8 + len)); break; }
    o += 8 + len + (len % 2);
  }
  if (!fmt || !data) throw new Error(`${file}: missing fmt or data chunk`);
  return { ...fmt, data, seconds: data.length / (fmt.rate * fmt.channels * (fmt.bits / 8)) };
}

export const wavSeconds = (file) => readWav(file).seconds;

export function writeWav16(file, samples, rate) {
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + samples.length * 2, 4); head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write("data", 36); head.writeUInt32LE(samples.length * 2, 40);
  fs.writeFileSync(file, Buffer.concat([head, Buffer.from(samples.buffer, samples.byteOffset, samples.length * 2)]));
}

/** 30 ms fades at both ends of a 16-bit mono WAV, in place, so cuts never click. */
export function fadeWav(file, seconds = 0.03) {
  const w = readWav(file);
  if (w.format !== 1 || w.bits !== 16 || w.channels !== 1) throw new Error(`${file}: expected 16-bit mono PCM`);
  const s = new Int16Array(w.data.buffer.slice(w.data.byteOffset, w.data.byteOffset + w.data.length - (w.data.length % 2)));
  const n = Math.min(Math.round(seconds * w.rate), s.length >> 1);
  for (let i = 0; i < n; i++) {
    const g = i / n;
    s[i] = Math.round(s[i] * g);
    s[s.length - 1 - i] = Math.round(s[s.length - 1 - i] * g);
  }
  writeWav16(file, s, w.rate);
}

/* ---------------- subtitles ---------------- */
// Split a narration line into chunks of at most `max` characters, breaking at punctuation first and
// at spaces otherwise. Each chunk gets a share of the line's time in proportion to its length.
// MapStory.tsx has the same function (chunkLine); keep the two in step.
export function chunkLine(text, max) {
  if (text.length <= max) return [{ text, t0: 0, t1: 1 }];
  const words = text.split(/\s+/).filter(Boolean);
  const n = Math.ceil(text.length / max), target = text.length / n;
  const out = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    const atBreak = /[.,;:!?…]$/.test(cur);
    if (cur && (next.length > max || (cur.length >= target * 0.8 && atBreak) || (cur.length >= target && out.length < n - 1))) {
      out.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) out.push(cur);
  const total = out.reduce((a, c) => a + c.length, 0);
  let acc = 0;
  return out.map((c) => {
    const t0 = acc / total;
    acc += c.length;
    return { text: c, t0, t1: acc / total };
  });
}

export const readJson = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : d);
