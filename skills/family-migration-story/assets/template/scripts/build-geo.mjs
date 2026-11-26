// Build src/data/geo.json: Natural Earth land + borders, cropped to the family's places, simplified,
// and projected (Mercator) into map units. Coastlines are kept finer around every family place.
//
// usage: node scripts/build-geo.mjs [--margin 0.18] [--bbox w,s,e,n]
//
// Downloads world-atlas@2.0.2 (Natural Earth 1:10m, public domain) once into ~/.cache/family-migration-story.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const DATA = "src/data";
const CACHE = path.join(os.homedir(), ".cache", "family-migration-story", "world-atlas");

async function atlas(name) {
  const f = path.join(CACHE, name);
  if (!fs.existsSync(f)) {
    fs.mkdirSync(CACHE, { recursive: true });
    const url = `https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/${name}`;
    console.log("downloading", url);
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  }
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

// ---- collect every coordinate the video will show ----
const read = (f, d) => (fs.existsSync(path.join(DATA, f)) ? JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8")) : d);
const places = Object.values(read("places.json", {}));
const routes = read("routes.json", []);
const ctx = read("context.json", { labels: [], seas: [] });
const zones = read("zones.json", []);
const story = read("story.json", []);
const pts = [
  ...places.map((p) => p.c),
  ...routes.flatMap((r) => r.pts),
  ...zones.flatMap((z) => [...(z.fill || []), ...(z.line || [])]),
];
for (const s of story) if (s.cam) pts.push([s.cam[0], s.cam[1]], [s.cam[2], s.cam[3]]);
if (!pts.length) throw new Error("no places/routes yet: fill src/data/places.json first");

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
  w = cx - (span / 2) * (1 + 2 * m); e = cx + (span / 2) * (1 + 2 * m);
  const hs = Math.max(n - s, span / 1.9) / 2 * (1 + 2 * m);
  s = Math.max(-80, cy - hs); n = Math.min(84, cy + hs);
  BB = { w: +w.toFixed(2), e: +e.toFixed(2), s: +s.toFixed(2), n: +n.toFixed(2) };
}
// for the context labels, warn if any fall outside
for (const c of ctx.labels || []) if (c.c[0] < BB.w || c.c[0] > BB.e || c.c[1] < BB.s || c.c[1] > BB.n) console.warn("context label outside map:", c.n);

const span = BB.e - BB.w;
const S = +(1260 / span).toFixed(4); // ~1260 map units across, like the original 31.5 deg x 40
const R2D = 180 / Math.PI, D2R = Math.PI / 180;
const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * D2R) / 2)) * R2D;
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
const M = 6;
function clipRing(ring) {
  let out = ring;
  const edges = [
    [(p) => p[0] >= -M, (a, b) => { const t = (-M - a[0]) / (b[0] - a[0]); return [-M, a[1] + t * (b[1] - a[1])]; }],
    [(p) => p[0] <= W + M, (a, b) => { const t = (W + M - a[0]) / (b[0] - a[0]); return [W + M, a[1] + t * (b[1] - a[1])]; }],
    [(p) => p[1] >= -M, (a, b) => { const t = (-M - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), -M]; }],
    [(p) => p[1] <= H + M, (a, b) => { const t = (H + M - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), H + M]; }],
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

fs.writeFileSync(path.join(DATA, "geo.json"), JSON.stringify({ bb: BB, S, W: f2(W), H: f2(H), land: landPath, borders: borderPath }));
console.log("geo.json", { bbox: BB, W: f2(W), H: f2(H), landKB: Math.round(landPath.length / 1024), borderKB: Math.round(borderPath.length / 1024) });
console.log("note: borders are today's borders; say so on screen or in the credits when the story is set before them.");
