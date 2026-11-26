// Everything family-specific lives in src/data/*.json. This module only types it and adds geometry helpers.
import geo from "./data/geo.json";
import branchesJson from "./data/branches.json";
import placesJson from "./data/places.json";
import contextJson from "./data/context.json";
import routesJson from "./data/routes.json";
import zonesJson from "./data/zones.json";
import metaJson from "./data/meta.json";

export type LonLat = [number, number];
export type Branch = string; // a key of branches.json, or "all"

export const GEO = geo as {
  bb: { w: number; e: number; s: number; n: number };
  S: number;
  W: number;
  H: number;
  land: string;
  borders: string;
};

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * D2R) / 2)) * R2D;
export const P = ([lon, lat]: LonLat): [number, number] => [
  (lon - GEO.bb.w) * GEO.S,
  (merc(GEO.bb.n) - merc(lat)) * GEO.S,
];

export const BASE = {
  sea: "#0d1219",
  land: "#2a2a31",
  coast: "#4d4a56",
  border: "#46434f",
  ink: "#efece6",
  muted: "#a39e95",
  halo: "#15161b",
  zone: "#e9a25a",
  river: "#6fa8dc",
} as const;

// Lineage colours: readable on the dark map and distinct from each other.
const PALETTE = ["#7fb1e6", "#e9a25a", "#78cf95", "#bb98ea", "#e58f9c", "#d9c36a", "#6fc7c2", "#b4bcc6"];
export const BRANCHES = branchesJson as Record<string, { label?: string; color?: string }>;
const branchKeys = Object.keys(BRANCHES);
export const col = (b: Branch): string =>
  b === "all" ? BASE.ink : BRANCHES[b]?.color || PALETTE[Math.max(0, branchKeys.indexOf(b)) % PALETTE.length];

export type Meta = {
  lang: string; // BCP-47, used for upper-casing (Turkish needs "tr": i -> İ)
  title?: string;
  ui: { route: string; sources: string; publicDomain: string; noRestrictions: string; commons: string };
  sourcesText: string; // paragraph on the closing credits screen
};
export const META = metaJson as Meta;

export type Place = {
  n: string; // label
  c: LonLat;
  b: Branch;
  minor?: boolean; // only shown when zoomed in
  onlyFar?: boolean; // only shown when zoomed out (e.g. the city around a neighbourhood)
  dx: number;
  dy: number;
  anchor?: "start" | "middle" | "end";
  zoomName?: string; // label when zoomed in close
  farName?: string; // label when zoomed far out
};
export const PLACES = placesJson as unknown as Record<string, Place>;

export type Ctx = {
  n: string;
  c: LonLat;
  dx: number;
  dy: number;
  anchor?: "start" | "middle" | "end";
  minor?: boolean;
  onlyIn?: string[]; // scene ids
  hideIn?: string[];
};
export const CTX = (contextJson as unknown as { labels: Ctx[] }).labels;
export const SEAS = (contextJson as unknown as { seas: { n: string; c: LonLat }[] }).seas;

export type Route = { id: string; b: Branch; dotted?: boolean; boat?: boolean; bend?: number; pts: LonLat[] };
export const ROUTES = routesJson as unknown as Route[];

// Optional highlighted areas/lines (a border zone, a river, a front line), switched on by scene.zone = id.
export type Zone = {
  id: string;
  fill?: LonLat[];
  line?: LonLat[];
  fillColor?: string;
  lineColor?: string;
  labels?: [string, LonLat, number?][];
};
export const ZONES = zonesJson as unknown as Zone[];

/* ---- route geometry: smooth curve sampled into a polyline with cumulative lengths ---- */
export type Poly = { pts: [number, number][]; cum: number[]; len: number };

const bez = (p0: number[], c1: number[], c2: number[], p1: number[], t: number): [number, number] => {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
    u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1],
  ];
};

export const routePoly = (r: Route): Poly => {
  const pts = r.pts.map(P);
  const out: [number, number][] = [];
  const N = 28;
  if (pts.length === 2) {
    const [a, b] = pts;
    const k = r.bend ?? 0.18;
    const c = [(a[0] + b[0]) / 2 - (b[1] - a[1]) * k, (a[1] + b[1]) / 2 + (b[0] - a[0]) * k];
    for (let i = 0; i <= N * 2; i++) {
      const t = i / (N * 2), u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
    }
  } else {
    out.push(pts[0]);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      for (let j = 1; j <= N; j++) out.push(bez(p1, c1, c2, p2, j / N));
    }
  }
  const cum = [0];
  for (let i = 1; i < out.length; i++) cum.push(cum[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
  return { pts: out, cum, len: cum[cum.length - 1] };
};

export const pointAt = (p: Poly, L: number) => {
  const l = Math.max(0, Math.min(p.len, L));
  let i = 1;
  while (i < p.cum.length - 1 && p.cum[i] < l) i++;
  const a = p.pts[i - 1], b = p.pts[i];
  const seg = p.cum[i] - p.cum[i - 1] || 1;
  const t = (l - p.cum[i - 1]) / seg;
  return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) * R2D, i };
};

export const partialPath = (p: Poly, frac: number) => {
  if (frac <= 0) return "";
  const L = p.len * Math.min(1, frac);
  const end = pointAt(p, L);
  let d = `M${p.pts[0][0].toFixed(2)},${p.pts[0][1].toFixed(2)}`;
  for (let k = 1; k < end.i; k++) d += `L${p.pts[k][0].toFixed(2)},${p.pts[k][1].toFixed(2)}`;
  d += `L${end.x.toFixed(2)},${end.y.toFixed(2)}`;
  return d;
};

export const lineD = (pts: LonLat[], close = false) =>
  "M" + pts.map((q) => P(q).map((v) => v.toFixed(2)).join(",")).join("L") + (close ? "Z" : "");
