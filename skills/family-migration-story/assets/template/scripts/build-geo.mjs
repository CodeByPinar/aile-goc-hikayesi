// Build src/data/geo.json: Natural Earth land + borders, cropped to the family's places, simplified,
// and projected (Mercator) into map units. Coastlines are kept finer around every family place.
//
// usage: node scripts/build-geo.mjs [--margin 0.18] [--bbox w,s,e,n] [--tall] [--no-eras]
//
//   --tall     make the map tall enough for the vertical (9:16) video too; on by default when
//              meta.json has "vertical": true
//   --no-eras  skip the period borders (also: "eras": false in meta.json)
//
// Period borders: every scene gets the borders of its own time (scene.era, or the first year in
// scene.years) from CShapes 2.0, which dates every border change. They are approximate; the
// script prints which state each family place falls in, so it can be checked against the research.
//
// Downloads once into ~/.cache/family-migration-story:
//   world-atlas@2.0.2 (Natural Earth 1:10m, public domain)
//   CShapes 2.0 (ETH Zurich ICR, state borders 1886-2019, 26 MB; non-commercial licence, see icr.ethz.ch/data/cshapes)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { firstYear, fitView, focusXOf, viewOf } from "../src/camera.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const DATA = "src/data";
const CACHE = path.join(os.homedir(), ".cache", "family-migration-story");

async function cached(dir, name, url) {
  const f = path.join(CACHE, dir, name);
  if (!fs.existsSync(f)) {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    console.log("downloading", url);
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  }
  return JSON.parse(fs.readFileSync(f, "utf8"));
}
const atlas = (name) => cached("world-atlas", name, `https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/${name}`);


// ---- collect every coordinate the video will show ----
const read = (f, d) => (fs.existsSync(path.join(DATA, f)) ? JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8")) : d);
const placesById = read("places.json", {});
const placeIds = Object.keys(placesById);
const places = Object.values(placesById);
const routes = read("routes.json", []);
const ctx = read("context.json", { labels: [], seas: [] });
const zones = read("zones.json", []);
const story = read("story.json", []);
const meta = read("meta.json", {});
const TALL = args.includes("--tall") || meta.vertical === true;
const ERAS = !args.includes("--no-eras") && meta.eras !== false;
const pts = [
  ...places.map((p) => p.c),
  ...routes.flatMap((r) => r.pts),
  ...zones.flatMap((z) => [...(z.fill || []), ...(z.line || [])]),
];
for (const s of story) if (s.cam) pts.push([s.cam[0], s.cam[1]], [s.cam[2], s.cam[3]]);
if (!pts.length) throw new Error("no places/routes yet: fill src/data/places.json first");

const R2D = 180 / Math.PI, D2R = Math.PI / 180;
const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * D2R) / 2)) * R2D;
const invMerc = (m) => (2 * Math.atan(Math.exp(m * D2R)) - Math.PI / 2) * R2D;

let BB;
if (opt("--bbox")) {
  const [w, s, e, n] = opt("--bbox").split(",").map(Number);
  BB = { w, s, e, n };
} else {
  const lons = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
  let w = Math.min(...lons), e = Math.max(...lons), s = Math.min(...lats), n = Math.max(...lats);
  const m = Number(opt("--margin", "0.18"));
  // keep a 16:9-ish frame with room to zoom out, and never smaller than ~6 degrees
  const span = Math.max(e - w, (n - s) * 1.6, 6);
  const cx = (w + e) / 2, cy = (s + n) / 2;
  const lonSpan = e - w;
  w = cx - (span / 2) * (1 + 2 * m); e = cx + (span / 2) * (1 + 2 * m);
  const hs = Math.max(n - s, span / 1.9) / 2 * (1 + 2 * m);
  let s1 = Math.max(-80, cy - hs), n1 = Math.min(84, cy + hs);
  if (TALL) {
    // a 9:16 frame that shows the full width of the family's places is about 2.2 times as tall (in
    // Mercator units) as those places are wide: grow the map north and south to cover it
    const half = (Math.max(lonSpan, 4) * 1.22 * (16 / 9) * 1.15) / 2;
    const mc = (merc(s) + merc(n)) / 2;
    s1 = Math.max(-80, Math.min(s1, invMerc(mc - half)));
    n1 = Math.min(84, Math.max(n1, invMerc(mc + half)));
  }
  BB = { w: +w.toFixed(2), e: +e.toFixed(2), s: +s1.toFixed(2), n: +n1.toFixed(2) };
}
// for the context labels, warn if any fall outside
for (const c of ctx.labels || []) if (c.c[0] < BB.w || c.c[0] > BB.e || c.c[1] < BB.s || c.c[1] > BB.n) console.warn("context label outside map:", c.n);

const span = BB.e - BB.w;
const S = +(1260 / span).toFixed(4); // ~1260 map units across, like the original 31.5 deg x 40
const proj = ([lon, lat]) => [(lon - BB.w) * S, (merc(BB.n) - merc(lat)) * S];
const W = (BB.e - BB.w) * S, H = (merc(BB.n) - merc(BB.s)) * S;

// detail boxes (+-0.7 deg) around every family place
const FOCUS = places.map(({ c: [lon, lat] }) => {
  const a = proj([lon - 0.7, lat + 0.5]), b = proj([lon + 0.7, lat - 0.5]);
  return [a[0], a[1], b[0], b[1]];
});
const inFocus = (p) => FOCUS.some((f) => p[0] >= f[0] && p[0] <= f[2] && p[1] >= f[1] && p[1] <= f[3]);
const TOL_FINE = 0.0015 * S, TOL_COARSE = 0.009 * S * Math.max(1, span / 31.5);

function decodeArcs(topo) {
  const { scale, translate } = topo.transform;
  return topo.arcs.map((arc) => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; });
  });
}
function ringFromArcs(arcs, idxs) {
  const out = [];
  idxs.forEach((i) => {
    let a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
    if (out.length) a = a.slice(1);
    out.push(...a);
  });
  return out;
}
// Sutherland-Hodgman clip of a ring to a rectangle [x0, y0, x1, y1]
function clipTo(ring, [x0, y0, x1, y1]) {
  let out = ring;
  const edges = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((x0 - a[0]) / (b[0] - a[0])) * (b[1] - a[1])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((x1 - a[0]) / (b[0] - a[0])) * (b[1] - a[1])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((y0 - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + ((y1 - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), y1]],
  ];
  for (const [inside, inter] of edges) {
    const inp = out; out = [];
    if (!inp.length) break;
    for (let i = 0; i < inp.length; i++) {
      const cur = inp[i], prev = inp[(i + inp.length - 1) % inp.length];
      if (inside(cur)) { if (!inside(prev)) out.push(inter(prev, cur)); out.push(cur); }
      else if (inside(prev)) out.push(inter(prev, cur));
    }
  }
  return out;
}
const M = 6;
const clipRing = (ring) => clipTo(ring, [-M, -M, W + M, H + M]);
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx - p[0], y = a[1] + t * dy - p[1];
  return Math.sqrt(x * x + y * y);
}
function simplify(p) {
  if (p.length < 4) return p;
  const keep = new Uint8Array(p.length); keep[0] = keep[p.length - 1] = 1;
  const stack = [[0, p.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let md = -1, mi = -1;
    for (let k = i + 1; k < j; k++) { const d = segDist(p[k], p[i], p[j]); if (d > md) { md = d; mi = k; } }
    if (mi > 0 && md > (inFocus(p[mi]) ? TOL_FINE : TOL_COARSE)) { keep[mi] = 1; stack.push([i, mi], [mi, j]); }
  }
  return p.filter((_, k) => keep[k]);
}
const f2 = (n) => Math.round(n * 100) / 100;
function ringToPath(ring, closed) {
  let s = "", px, py;
  ring.forEach((p, i) => {
    const x = f2(p[0]), y = f2(p[1]);
    if (i && x === px && y === py) return;
    s += (i ? "L" : "M") + x + "," + y; px = x; py = y;
  });
  return closed ? s + "Z" : s;
}
const ringArea = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); };

const land = await atlas("land-10m.json");
const larcs = decodeArcs(land);
let landPath = "";
const geoms = land.objects.land.geometries || [land.objects.land];
geoms.forEach((g) => {
  const polys = g.type === "Polygon" ? [g.arcs] : g.arcs;
  polys.forEach((poly) => poly.forEach((ringIdx) => {
    let ring = ringFromArcs(larcs, ringIdx);
    let w = 1e9, e = -1e9, s = 1e9, n = -1e9;
    ring.forEach(([x, y]) => { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); });
    if (e < BB.w - 1 || w > BB.e + 1 || n < BB.s - 1 || s > BB.n + 1) return;
    ring = clipRing(ring.map(proj));
    if (ring.length < 3) return;
    ring = simplify(ring.concat([ring[0]]));
    if (ring.length < 4 || ringArea(ring) < 0.02) return;
    landPath += ringToPath(ring.slice(0, -1), true);
  }));
});

const ctry = await atlas("countries-10m.json");
const carcs = decodeArcs(ctry);
const owners = new Map();
ctry.objects.countries.geometries.forEach((g, gi) => {
  const polys = g.type === "Polygon" ? [g.arcs] : g.type === "MultiPolygon" ? g.arcs : [];
  polys.forEach((poly) => poly.forEach((r) => r.forEach((i) => {
    const k = i < 0 ? ~i : i;
    if (!owners.has(k)) owners.set(k, new Set());
    owners.get(k).add(gi);
  })));
});
let borderPath = "";
owners.forEach((set, k) => {
  if (set.size < 2) return;
  const a = carcs[k];
  if (!a.some(([x, y]) => x > BB.w - 0.5 && x < BB.e + 0.5 && y > BB.s - 0.5 && y < BB.n + 0.5)) return;
  borderPath += ringToPath(simplify(a.map(proj)), false);
});

/* ================= period borders ================= */
// CShapes 2.0 gives every state's territory with the dates it was valid (1886-2019), so each scene
// can show the borders of its own date. Scenes before 1886 get the 1886 map and say so on screen.
const FIRST = 18860101, LAST = 20191231, TODAY_FROM = 2009;
const NAMES = JSON.parse(fs.readFileSync(new URL("./polity-names.json", import.meta.url), "utf8"));
const dict = NAMES[(meta.lang || "en").slice(0, 2)] || {};
// CShapes names one state through all its forms ("Turkey (Ottoman Empire)"): pick the name of the date
const canon = (n, d) => {
  const dated = NAMES.dated[n];
  if (dated) return dated.find(([, until]) => d <= until)[0];
  return NAMES.rename[n] || n.replace(/\s*\(.*\)$/, "");
};
const tname = (n, d) => { const c = canon(n, d); return dict[c] || c; };

// the date each scene shows: scene.era ("today", a year, or "YYYY-MM-DD"), else 1 July of the first
// year in scene.years; scenes without a year keep the date of the scene before them
const dateOf = (sc) => {
  if (sc.era === "today") return LAST;
  if (typeof sc.era === "number") return sc.era * 10000 + 701;
  if (typeof sc.era === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sc.era)) return Number(sc.era.replace(/-/g, ""));
  const y = firstYear(sc.years);
  return y == null ? null : y * 10000 + 701;
};
const sceneDate = {};
{
  let cur = null;
  for (const sc of story) {
    const d = dateOf(sc);
    if (d != null) cur = Math.max(FIRST, Math.min(LAST, d));
    if (sc.id && cur != null) sceneDate[sc.id] = cur;
  }
}

const boxOf = (ring) => {
  let w = 1e9, e = -1e9, s = 1e9, n = -1e9;
  for (const [x, y] of ring) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  return [w, s, e, n];
};
const boxHitsMap = ([w, s, e, n], pad = 1) => !(e < BB.w - pad || w > BB.e + pad || n < BB.s - pad || s > BB.n + pad);
const inRing = (x, y, ring) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
};
// a polity = { name, polys: [{ box, rings: [outer, hole, ...] }] } in lon/lat
const inPolity = (pl, x, y) => pl.polys.some((p) => x >= p.box[0] && x <= p.box[2] && y >= p.box[1] && y <= p.box[3] && p.rings.reduce((c, r) => (inRing(x, y, r) ? !c : c), false));
const polityAt = (pols, x, y) => { for (let i = 0; i < pols.length; i++) if (inPolity(pols[i], x, y)) return i; return -1; };
// harbour towns often fall just outside a generalised coastline: look a little way around them
const polityNear = (pols, x, y) => {
  for (const r of [0, 0.05, 0.12, 0.25, 0.45]) for (let k = 0; k < (r ? 8 : 1); k++) {
    const i = polityAt(pols, x + r * Math.cos((k * Math.PI) / 4), y + r * Math.sin((k * Math.PI) / 4));
    if (i >= 0) return i;
  }
  return -1;
};

// ---- where to write a state's name in a scene: the roomiest spot of the part of it that the scene shows ----
const thin = (ring, max) => (ring.length <= max ? ring : ring.filter((_, i) => i % Math.ceil(ring.length / max) === 0));
function labelSpot(pl, rect, avoid) {
  const viewArea = (rect[2] - rect[0]) * (rect[3] - rect[1]);
  let best = null;
  for (const p of pl.polys) {
    const ring = thin(clipTo(p.rings[0].map(proj), rect), 260);
    if (ring.length < 3) continue;
    const area = ringArea(ring);
    if (area < viewArea * 0.035) continue;
    const [bw, bs, be, bn] = boxOf(ring);
    for (let i = 1; i < 14; i++) for (let j = 1; j < 14; j++) {
      const x = bw + ((be - bw) * i) / 14, y = bs + ((bn - bs) * j) / 14;
      if (!inRing(x, y, ring)) continue;
      let d = 1e9;
      for (let k = 0; k < ring.length; k++) d = Math.min(d, segDist([x, y], ring[k], ring[(k + 1) % ring.length]));
      for (const q of avoid) d = Math.min(d, Math.hypot(x - q[0], y - q[1]) * 0.7);
      d *= 0.4 + 0.6 * Math.min(1, area / (viewArea * 0.15)); // prefer the larger piece when a state has several
      if (!best || d > best.d) best = { d, x, y };
    }
  }
  return best && best.d > (rect[2] - rect[0]) * 0.03 ? [pl.label, f2(best.x), f2(best.y)] : null;
}
function sceneLabels(pols, ids, aspect) {
  const out = {};
  let cam = null;
  for (const sc of story) {
    if (sc.cam) cam = sc;
    if (!cam || sc.credits || !ids.has(sc.id)) continue;
    const a = proj([cam.cam[0], cam.cam[3]]), b = proj([cam.cam[2], cam.cam[1]]);
    const v = fitView(viewOf(a, b, aspect, (cam.facts || []).length > 0, aspect < 1 ? focusXOf(sc, placesById, proj) : undefined), aspect, W, H);
    const vw = v[2], vh = vw / aspect;
    // the middle of the frame: the header, the fact chips and the subtitles cover the rest
    const rect = aspect >= 1 ? [v[0] - vw * 0.44, v[1] - vh * 0.22, v[0] + vw * 0.44, v[1] + vh * 0.27] : [v[0] - vw * 0.46, v[1] - vh * 0.12, v[0] + vw * 0.46, v[1] + vh * 0.2];
    const avoid = [...places.map((p) => proj(p.c)), ...(ctx.labels || []).map((c) => proj(c.c)), ...(ctx.seas || []).map((c) => proj(c.c))];
    const ls = pols.map((p) => labelSpot(p, rect, avoid)).filter(Boolean);
    if (ls.length) out[sc.id] = ls;
  }
  return out;
}

// ---- the map of one date: tinted areas, the border lines between states, labels ----
function buildEra(pols, ids) {
  // areas (clipped to the map and simplified); the video clips them to the coastline
  const areas = [];
  pols.forEach((pl, i) => {
    let d = "";
    for (const p of pl.polys) for (const r of p.rings) {
      let ring = clipRing(r.map(proj));
      if (ring.length < 3) continue;
      ring = simplify(ring.concat([ring[0]]));
      if (ring.length < 4 || ringArea(ring) < 0.5) continue;
      d += ringToPath(ring.slice(0, -1), true);
    }
    if (d) areas.push({ i, d });
  });
  // tints: neighbours (overlapping boxes) get different ones where six tints allow
  const tint = new Map();
  const touch = (i, j) => pols[i].polys.some((p) => pols[j].polys.some((q) => !(p.box[2] < q.box[0] || p.box[0] > q.box[2] || p.box[3] < q.box[1] || p.box[1] > q.box[3])));
  for (const { i } of areas) {
    const used = new Set();
    for (const [j, t] of tint) if (touch(i, j)) used.add(t);
    let t = 0;
    while (used.has(t) && t < 5) t++;
    tint.set(i, used.has(t) ? i % 6 : t);
  }
  // borders: the parts of each outline that have another state on the far side (the rest is coast)
  const EPS = 0.04;
  let borders = "";
  pols.forEach((pl, i) => {
    for (const p of pl.polys) for (const r of p.rings) {
      let run = [];
      const flush = () => {
        let part = [];
        const emit = () => { if (part.length > 1) borders += ringToPath(simplify(part), false); part = []; };
        if (run.length > 1) for (const q of run.map(proj)) { if (q[0] < -M || q[0] > W + M || q[1] < -M || q[1] > H + M) emit(); else part.push(q); }
        emit();
        run = [];
      };
      for (let k = 0; k < r.length - 1; k++) {
        const a = r[k], b = r[k + 1];
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        if (!L || mx < BB.w - 1 || mx > BB.e + 1 || my < BB.s - 1 || my > BB.n + 1) { flush(); continue; }
        const nx = (-dy / L) * EPS, ny = (dx / L) * EPS;
        const s1 = polityAt(pols, mx + nx, my + ny), s2 = polityAt(pols, mx - nx, my - ny);
        if (s1 >= 0 && s2 >= 0 && s1 !== s2 && Math.min(s1, s2) === i) { if (!run.length) run.push(a); run.push(b); }
        else flush();
      }
      flush();
    }
  });
  const at = Object.fromEntries(placeIds.map((id) => {
    const i = polityNear(pols, placesById[id].c[0], placesById[id].c[1]);
    return [id, i >= 0 ? pols[i].label : null];
  }).filter(([, n]) => n));
  const era = { areas: areas.map(({ i, d }) => ({ n: pols[i].label, t: tint.get(i), d })), borders, at, labels: sceneLabels(pols, ids, 16 / 9) };
  if (TALL) era.labelsV = sceneLabels(pols, ids, 9 / 16);
  return era;
}

const eras = [];
const sceneEra = {}; // scene id -> { e: index into eras, y: year of the borders shown, today: bool }
if (ERAS && Object.keys(sceneDate).length) {
  try {
    const cs = await cached("cshapes", "CShapes-2.0.geojson", "https://icr.ethz.ch/data/cshapes/CShapes-2.0.geojson");
    const num = (p, s) => p[`gw${s}year`] * 10000 + p[`gw${s}month`] * 100 + p[`gw${s}day`];
    const feats = cs.features.filter((f) => f.geometry).map((f, i) => {
      const polys = (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates)
        .map((rings) => ({ box: boxOf(rings[0]), rings })).filter((p) => boxHitsMap(p.box));
      return { i, name: f.properties.cntry_name, from: num(f.properties, "s"), to: num(f.properties, "e"), polys };
    }).filter((f) => f.polys.length);
    const byKey = new Map();
    for (const [id, d] of Object.entries(sceneDate)) {
      const act = feats.filter((f) => f.from <= d && d <= f.to);
      // two dates with the same set of territories and the same names are one map
      const key = act.map((f) => `${f.i}:${canon(f.name, d)}`).join(",");
      if (!byKey.has(key)) byKey.set(key, { d, act, ids: new Set() });
      byKey.get(key).ids.add(id);
    }
    for (const { d, act, ids } of byKey.values()) {
      const pols = act.map((f) => ({ name: f.name, label: tname(f.name, d), polys: f.polys }));
      eras.push(buildEra(pols, ids));
      for (const id of ids) {
        const y = Math.floor(sceneDate[id] / 10000);
        sceneEra[id] = { e: eras.length - 1, y, today: y >= TODAY_FROM };
      }
    }
  } catch (err) {
    console.warn(`WARN no period borders (${err.message}); the map shows today's borders`);
    eras.length = 0;
    for (const k of Object.keys(sceneEra)) delete sceneEra[k];
  }
}

const out = { bb: BB, S, W: f2(W), H: f2(H), tall: TALL, land: landPath, borders: borderPath, eras, sceneEra };
fs.writeFileSync(path.join(DATA, "geo.json"), JSON.stringify(out));
const kb = (s) => Math.round(s.length / 1024);
console.log("geo.json", { bbox: BB, W: f2(W), H: f2(H), tall: TALL, landKB: kb(landPath), borderKB: kb(borderPath), eras: eras.length, eraKB: kb(JSON.stringify(eras)) });
if (eras.length) {
  console.log("period borders (CShapes 2.0, approximate: check each line against the research; set scene.era to a year or YYYY-MM-DD when a border moved within the scene's year):");
  for (const sc of story) {
    const se = sceneEra[sc.id];
    if (!se || sc.credits) continue;
    const where = (sc.focus || []).map((id) => `${id}: ${eras[se.e].at[id] || "?"}`).join(", ");
    console.log(`  ${sc.id.padEnd(14)} ${String(sc.years || "").padEnd(14)} -> ${se.today ? "today" : se.y}${where ? "   " + where : ""}`);
  }
} else {
  console.log("note: borders are today's borders; say so on screen or in the credits when the story is set before them.");
}
