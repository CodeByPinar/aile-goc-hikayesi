// Check src/data/story.json against the other data files before spending time on TTS or rendering.
// usage: node scripts/check-story.mjs [--vertical]
//   --vertical  also check the framing of the 9:16 video (on by default when meta.json has "vertical": true)
import fs from "node:fs";
import { fitView, focusXOf, viewOf } from "../src/camera.mjs";

const D = "src/data";
const read = (f, d) => (fs.existsSync(`${D}/${f}`) ? JSON.parse(fs.readFileSync(`${D}/${f}`, "utf8")) : d);
const story = read("story.json", []);
const places = read("places.json", {});
const routes = Object.fromEntries(read("routes.json", []).map((r) => [r.id, r]));
const zones = new Set(read("zones.json", []).map((z) => z.id));
const branches = read("branches.json", {});
const credits = read("credits.json", {});
const ctx = read("context.json", { labels: [] });
const tl = read("timeline.json", { scenes: [] });
const geo = read("geo.json", null);
const meta = read("meta.json", {});
const i18n = read("i18n.json", {});
const VERTICAL = process.argv.includes("--vertical") || meta.vertical === true;

const err = [], warn = [];
const ids = new Set();
const used = { places: new Set(), routes: new Set(), imgs: new Set() };
story.forEach((s, i) => {
  const at = `scene ${i} (${s.id})`;
  if (!s.id || ids.has(s.id)) err.push(`${at}: missing or duplicate id`);
  ids.add(s.id);
  if (s.cam && (!Array.isArray(s.cam) || s.cam.length !== 4 || !(s.cam[0] < s.cam[2] && s.cam[1] < s.cam[3]))) err.push(`${at}: cam must be [west, south, east, north]`);
  if (!s.cam && i === 0) err.push(`${at}: the first scene needs a cam`);
  if (!s.credits) {
    if (!(s.b in branches) && s.b !== "all") err.push(`${at}: branch "${s.b}" not in branches.json`);
  }
  for (const k of ["places", "focus"]) for (const p of s[k] || []) {
    if (!places[p]) err.push(`${at}: ${k} "${p}" not in places.json`);
    used.places.add(p);
  }
  for (const f of s.focus || []) if (!(s.places || []).includes(f) && !story.slice(0, i).some((q) => (q.places || []).includes(f))) warn.push(`${at}: focus "${f}" was never introduced in places`);
  for (const [id, t0, t1] of s.routes || []) {
    if (!routes[id]) err.push(`${at}: route "${id}" not in routes.json`);
    if (!(t0 >= 0 && t1 <= 1 && t0 < t1)) err.push(`${at}: route "${id}" timing must be 0 <= t0 < t1 <= 1`);
    used.routes.add(id);
  }
  if (s.zone && !zones.has(s.zone)) err.push(`${at}: zone "${s.zone}" not in zones.json`);
  for (const [li, key, cap, span] of s.imgs || []) {
    if (!credits[key]) err.push(`${at}: image "${key}" not in credits.json (Commons: commons_fetch.py; family: npm run family)`);
    else if (!fs.existsSync(`public/img/${credits[key].file}`)) err.push(`${at}: public/img/${credits[key].file} missing`);
    if (li >= (s.say || []).length) err.push(`${at}: image "${key}" cued on line ${li} but the scene has ${(s.say || []).length} lines`);
    if ((cap || "").length > 70) warn.push(`${at}: caption for "${key}" is long (${cap.length} chars)`);
    used.imgs.add(key);
    void span;
  }
  if (s.origins) {
    const sum = s.origins.reduce((a, o) => a + o[1], 0);
    if (Math.abs(sum - 100) > 0.6) warn.push(`${at}: origins add up to ${sum}%`);
  }
  if ((s.facts || []).length > 8) warn.push(`${at}: ${s.facts.length} facts will crowd the right column (max ~8)`);
  for (const [k, l] of (s.say || []).entries()) if (l.length > 210) warn.push(`${at}: line ${k + 1} is ${l.length} chars; split it (subtitles wrap past ~2 lines)`);
  if (!s.credits && !(s.say || []).length && !s.dur) warn.push(`${at}: no narration and no dur`);
  if (s.era != null && !(s.era === "today" || typeof s.era === "number" || /^\d{4}-\d{2}-\d{2}$/.test(String(s.era)))) err.push(`${at}: era must be a year, "YYYY-MM-DD" or "today"`);
  if (VERTICAL && (s.facts || []).length > 5) warn.push(`${at}: ${s.facts.length} facts crowd the vertical video (max ~5)`);
});
// translations: same scenes, same number of lines
for (const [lang, v] of Object.entries(i18n)) {
  for (const s of story) {
    const tr = v.scenes?.[s.id]?.say || [];
    if (tr.length !== (s.say || []).length) err.push(`i18n ${lang}: scene "${s.id}" has ${tr.length} lines, story.json ${(s.say || []).length}; run npm run vo -- --lang ${lang}`);
  }
  const f = `${D}/lang/${lang}.json`;
  if (fs.existsSync(f) && fs.statSync(f).mtimeMs > fs.statSync(`${D}/i18n.json`).mtimeMs) warn.push(`i18n ${lang}: ${f} changed after the last npm run vo -- --lang ${lang}`);
}
for (const [k, c] of Object.entries(credits)) if (c.family && !fs.existsSync(`public/img/${c.file}`)) err.push(`family image "${k}": public/img/${c.file} missing (npm run family)`);
for (const p of Object.keys(places)) if (!used.places.has(p)) warn.push(`place "${p}" is never shown`);
for (const r of Object.keys(routes)) if (!used.routes.has(r)) warn.push(`route "${r}" is never drawn`);
for (const k of Object.keys(credits)) if (!used.imgs.has(k)) warn.push(`image "${k}" is credited but never shown`);
if (geo) {
  const { w, s, e, n } = geo.bb;
  for (const [id, p] of Object.entries(places)) if (p.c[0] < w || p.c[0] > e || p.c[1] < s || p.c[1] > n) err.push(`place "${id}" is outside geo.json: run npm run geo`);
  for (const c of ctx.labels || []) if (c.c[0] < w || c.c[0] > e || c.c[1] < s || c.c[1] > n) warn.push(`context label "${c.n}" is outside the map`);
  // framing: where does each focus place (dot + label) land on screen? Uses the video's own camera code.
  const S = geo.S || 1260 / (e - w);
  const merc = (lat) => (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180) / Math.PI;
  const P = ([lon, lat]) => [(lon - w) * S, (merc(n) - merc(lat)) * S];
  const GW = (e - w) * S, GH = (merc(n) - merc(s)) * S;
  const hit = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  const frames = [["wide", 16 / 9, 1920, 1080]];
  if (VERTICAL) frames.push(["vertical", 9 / 16, 1080, 1920]);
  if (VERTICAL && !geo.tall) warn.push("geo.json was built for the wide video only: run npm run geo -- --tall (or set \"vertical\": true in meta.json)");
  for (const [fname, aspect, PW, PH] of frames) {
    const tag = fname === "wide" ? "" : ` [${fname}]`;
    let cam = null;
    story.forEach((sc, i) => {
      if (sc.cam) cam = sc;
      if (!cam || sc.credits || sc.all) return;
      const [cw, cs, ce, cn] = cam.cam;
      const [cx, cy, W] = fitView(viewOf(P([cw, cn]), P([ce, cs]), aspect, (cam.facts || []).length > 0, aspect < 1 ? focusXOf(sc, places, P) : undefined), aspect, GW, GH);
      const H = W / aspect;
      const nf = (sc.facts || []).filter((f) => !f.startsWith("#")).length;
      // screen boxes as fractions of the frame: [x0, y0, x1, y1]
      const boxes = [];
      if (aspect >= 1) {
        boxes.push(["the header", [0, 0, 0.42, 0.25]], ["the subtitles", [0.11, 0.79, 0.89, 0.95]]);
        if ((sc.imgs || []).length) boxes.push(["the photo card", [0.04, 0.22, 0.45, 0.7]]);
        const y0 = (sc.facts || []).some((f) => f.startsWith("#")) ? 0.21 : 0.155; // a #Heading adds a kicker line above the chips
        (sc.facts || []).filter((f) => !f.startsWith("#")).forEach((f, k) => {
          const t = f.replace(/^W\|/, ""), y = y0 + 0.061 * k;
          boxes.push([`fact "${t.slice(0, 24)}…"`, [0.955 - 0.0083 * t.length - 0.03, y - 0.028, 0.96, y + 0.028]]);
        });
      } else {
        // the header column grows with the facts (they wrap, about two to a row)
        // (a photo card covers the map for a line or two in the vertical video; that is expected, not checked)
        boxes.push(["the header", [0, 0, 1, 0.3 + 0.035 * Math.ceil(nf / 2)]], ["the subtitles", [0.03, 0.68, 0.97, 0.8]], ["the app buttons", [0, 0.8, 1, 1]]);
      }
      for (const id of sc.focus || []) {
        const pl = places[id];
        if (!pl) continue;
        const [x, y] = P(pl.c), fx = 0.5 + (x - cx) / W, fy = 0.5 + (y - cy) / H;
        const zoom = W * (1920 / PW);
        const name = pl.zoomName && zoom < 90 ? pl.zoomName : pl.n, lw = (name.length * 16.3) / PW, dx = (pl.dx ?? 14) / PW, dy = (pl.dy ?? 0) / PH;
        const lx = pl.anchor === "end" ? fx + dx - lw : pl.anchor === "middle" ? fx + dx - lw / 2 : fx + dx;
        const box = [Math.min(fx, lx) - 0.006, Math.min(fy, fy + dy - 0.014), Math.max(fx, lx + lw) + 0.006, Math.max(fy, fy + dy + 0.014)];
        if (fx < 0.02 || fx > 0.98 || fy < 0.02 || fy > 0.98) { warn.push(`scene ${i} (${sc.id})${tag}: "${id}" is off screen; widen or move cam`); continue; }
        const over = boxes.filter(([, bx]) => hit(box, bx)).map(([nm]) => nm);
        if (over.length) warn.push(`scene ${i} (${sc.id})${tag}: "${id}" at ${fx.toFixed(2)},${fy.toFixed(2)} sits under ${over.join(", ")}; move cam (see video-pipeline.md, framing)`);
      }
    });
  }
} else err.push("src/data/geo.json missing: run npm run geo");
// timeline in sync with the text?
const stale = story.filter((s, i) => {
  const t = tl.scenes[i];
  return !t || t.id !== s.id || t.lines.length !== (s.say || []).length || t.lines.some((l, k) => l.text !== s.say[k]);
});
if (stale.length) warn.push(`timeline.json is out of date for: ${stale.map((s) => s.id).join(", ")} (run npm run vo)`);

for (const e of err) console.log("ERROR", e);
for (const w of warn) console.log("WARN ", w);
const lines = story.reduce((a, s) => a + (s.say || []).length, 0);
console.log(err.length ? `${err.length} errors` : "OK", `- ${story.length} scenes, ${lines} lines, ${Object.keys(credits).length} images, ${warn.length} warnings`);
process.exit(err.length ? 1 : 0);
