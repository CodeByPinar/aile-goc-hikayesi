// Check src/data/story.json against the other data files before spending time on TTS or rendering.
// usage: node scripts/check-story.mjs
import fs from "node:fs";

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
    if (!credits[key]) err.push(`${at}: image "${key}" not in credits.json`);
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
});
for (const p of Object.keys(places)) if (!used.places.has(p)) warn.push(`place "${p}" is never shown`);
for (const r of Object.keys(routes)) if (!used.routes.has(r)) warn.push(`route "${r}" is never drawn`);
for (const k of Object.keys(credits)) if (!used.imgs.has(k)) warn.push(`image "${k}" is credited but never shown`);
if (geo) {
  const { w, s, e, n } = geo.bb;
  for (const [id, p] of Object.entries(places)) if (p.c[0] < w || p.c[0] > e || p.c[1] < s || p.c[1] > n) err.push(`place "${id}" is outside geo.json: run npm run geo`);
  for (const c of ctx.labels || []) if (c.c[0] < w || c.c[0] > e || c.c[1] < s || c.c[1] > n) warn.push(`context label "${c.n}" is outside the map`);
  // framing: where does each focus place (dot + label) land on screen? Mirrors camOf() in MapStory.tsx.
  // Photo cards sit on the left, the header top-left, fact chips top-right, subtitles at the bottom.
  const S = geo.S || 1260 / (e - w), aspect = 16 / 9;
  const merc = (lat) => (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180) / Math.PI;
  const P = ([lon, lat]) => [(lon - w) * S, (merc(n) - merc(lat)) * S];
  const GW = (e - w) * S, GH = (merc(n) - merc(s)) * S;
  const hit = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  let cam = null;
  story.forEach((sc, i) => {
    if (sc.cam) cam = sc;
    if (!cam || sc.credits || sc.all) return;
    const [cw, cs, ce, cn] = cam.cam, a = P([cw, cn]), b = P([ce, cs]);
    let W = Math.max(b[0] - a[0], (b[1] - a[1]) * aspect) * 1.28, cx = (a[0] + b[0]) / 2;
    if ((cam.facts || []).length) { W *= 1.12; cx += W * 0.11; }
    W = Math.min(W, GW - 4);
    let H = W / aspect, cy = (a[1] + b[1]) / 2 + H * 0.045;
    cx = Math.min(Math.max(cx, W / 2 + 2), GW - W / 2 - 2); cy = Math.min(Math.max(cy, H / 2 + 2), GH - H / 2 - 2);
    const boxes = [["the header", [0, 0, 0.42, 0.25]], ["the subtitles", [0.11, 0.79, 0.89, 0.95]]];
    if ((sc.imgs || []).length) boxes.push(["the photo card", [0.04, 0.22, 0.45, 0.7]]);
    const y0 = (sc.facts || []).some((f) => f.startsWith("#")) ? 0.21 : 0.155; // a #Heading adds a kicker line above the chips
    (sc.facts || []).filter((f) => !f.startsWith("#")).forEach((f, k) => {
      const t = f.replace(/^W\|/, ""), y = y0 + 0.061 * k;
      boxes.push([`fact "${t.slice(0, 24)}…"`, [0.955 - 0.0083 * t.length - 0.03, y - 0.028, 0.96, y + 0.028]]);
    });
    for (const id of sc.focus || []) {
      const pl = places[id];
      if (!pl) continue;
      const [x, y] = P(pl.c), fx = 0.5 + (x - cx) / W, fy = 0.5 + (y - cy) / H;
      const name = pl.zoomName && W < 90 ? pl.zoomName : pl.n, lw = name.length * 0.0085, dx = (pl.dx ?? 14) / 1920, dy = (pl.dy ?? 0) / 1080;
      const lx = pl.anchor === "end" ? fx + dx - lw : pl.anchor === "middle" ? fx + dx - lw / 2 : fx + dx;
      const box = [Math.min(fx, lx) - 0.006, Math.min(fy, fy + dy - 0.014), Math.max(fx, lx + lw) + 0.006, Math.max(fy, fy + dy + 0.014)];
      if (fx < 0.02 || fx > 0.98 || fy < 0.02 || fy > 0.98) { warn.push(`scene ${i} (${sc.id}): "${id}" is off screen; widen or move cam`); continue; }
      const over = boxes.filter(([, bx]) => hit(box, bx)).map(([nm]) => nm);
      if (over.length) warn.push(`scene ${i} (${sc.id}): "${id}" at ${fx.toFixed(2)},${fy.toFixed(2)} sits under ${over.join(", ")}; move cam (see video-pipeline.md, framing)`);
    }
  });
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
