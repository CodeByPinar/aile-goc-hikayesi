import React, { useMemo } from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import storyJson from "./data/story.json";
import timelineJson from "./data/timeline.json";
import creditsJson from "./data/credits.json";
import i18nJson from "./data/i18n.json";
import { fitView, focusXOf, viewOf } from "./camera.mjs";
import {
  BASE, CTX, GEO, META, PLACES, P, ROUTES, SEAS, TINTS, ZONES,
  col, lineD, partialPath, pointAt, routePoly, type Branch, type Meta,
} from "./mapData";

type ImgCue = [number, string, string, number?];
type StoryScene = {
  id: string; part: string; b: Branch; years: string; title: string;
  cam: [number, number, number, number];
  places?: string[]; focus?: string[];
  routes?: [string, number, number][];
  zone?: string; all?: boolean; card?: string; cardSub?: string; cardKick?: string;
  say: string[]; facts?: string[]; imgs?: ImgCue[]; credits?: boolean;
  origins?: [string, number, string][]; // [label, percent, branch key or #colour]: ancestry bar
  era?: number | string; // borders to show: a year, "YYYY-MM-DD" or "today" (default: first year in `years`)
};
type Line = { file: string; text: string; from: number; frames: number };
type TScene = { id: string; from: number; frames: number; lines: Line[] };
type Timeline = { fps: number; total: number; scenes: TScene[] };
type Credit = { file: string; title: string; author: string; license: string; page: string; w: number; h: number; family?: boolean; kind?: string };
// A second language: translated text over the same scenes (written by `npm run vo -- --lang xx`).
type Variant = {
  lang: string; subsOnly?: boolean; timeline: Timeline;
  meta?: Partial<Meta>; labels?: Record<string, string>;
  scenes?: Record<string, Partial<StoryScene> & { captions?: string[] }>;
};
export type StoryProps = { lang?: string; subs?: boolean };

const BASE_STORY = storyJson as StoryScene[];
const CREDITS = creditsJson as Record<string, Credit>;
const I18N = i18nJson as unknown as Record<string, Variant>;
const FONT = 'system-ui, -apple-system, "SF Pro Display", "Segoe UI", "Helvetica Neue", Arial, sans-serif';
const CAM_FRAMES = 54;
const DRIFT = 0.075; // slow push-in during each scene

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = Easing.inOut(Easing.cubic);
const easeOut = Easing.out(Easing.cubic);
const sine = Easing.inOut(Easing.sin);
const HALO = "0 0 3px rgba(12,13,17,.95), 0 0 6px rgba(12,13,17,.9), 0 0 12px rgba(12,13,17,.7)";

// On-screen words the project's meta.json may not have yet.
const UI_DEFAULT: Record<string, Record<string, string>> = {
  tr: { bordersOf: "{y} sınırları", bordersToday: "bugünkü sınırlar", familyArchive: "Aile arşivi" },
  en: { bordersOf: "borders of {y}", bordersToday: "today's borders", familyArchive: "Family archive" },
};

const placeFirst: Record<string, number> = {};
const routeAt: Record<string, { i: number; t0: number; t1: number }> = {};
BASE_STORY.forEach((s, i) => {
  (s.places || []).concat(s.focus || []).forEach((id) => { if (placeFirst[id] == null) placeFirst[id] = i; });
  (s.routes || []).forEach(([id, t0, t1]) => { routeAt[id] = { i, t0, t1 }; });
});

// The story in one language: the base files, or a variant laid over them.
const prepared = new Map<string, { STORY: StoryScene[]; TL: Timeline; meta: Meta; T: (s: string) => string }>();
const prepare = (lang?: string) => {
  const key = lang && I18N[lang] ? lang : "";
  const hit = prepared.get(key);
  if (hit) return hit;
  const v = key ? I18N[key] : undefined;
  const out = v
    ? {
        STORY: BASE_STORY.map((s) => {
          const o = v.scenes?.[s.id];
          if (!o) return s;
          const { captions, ...rest } = o;
          const imgs = s.imgs?.map((im, k) => (captions?.[k] ? ([im[0], im[1], captions[k], im[3]] as ImgCue) : im));
          return { ...s, ...rest, imgs };
        }),
        TL: v.timeline,
        meta: { ...META, ...v.meta, lang: v.lang, ui: { ...META.ui, ...v.meta?.ui } } as Meta,
        T: (s: string) => v.labels?.[s] ?? s,
      }
    : { STORY: BASE_STORY, TL: timelineJson as Timeline, meta: META, T: (s: string) => s };
  prepared.set(key, out);
  return out;
};

// Split a narration line into subtitle-sized chunks; each gets a share of the line's time in proportion
// to its length. scripts/lib.mjs has the same function for the .srt export; keep the two in step.
const chunkLine = (text: string, max: number) => {
  if (text.length <= max) return [{ text, t0: 0, t1: 1 }];
  const words = text.split(/\s+/).filter(Boolean);
  const n = Math.ceil(text.length / max), target = text.length / n;
  const out: string[] = [];
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
};

type View = [number, number, number];
const zoomInterp = (p0: View, p1: View) => {
  const rho = Math.SQRT2, rho2 = 2, rho4 = 4;
  const [ux0, uy0, w0] = p0, [ux1, uy1, w1] = p1;
  const dx = ux1 - ux0, dy = uy1 - uy0, d2 = dx * dx + dy * dy;
  if (d2 < 1e-9) {
    const S = Math.log(w1 / w0) / rho;
    return (t: number): View => [ux0 + t * dx, uy0 + t * dy, w0 * Math.exp(rho * t * S)];
  }
  const d1 = Math.sqrt(d2);
  const b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1);
  const b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1);
  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0), r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
  const S = (r1 - r0) / rho;
  return (t: number): View => {
    const s = t * S, c0 = Math.cosh(r0);
    const u = (w0 / (rho2 * d1)) * (c0 * Math.tanh(rho * s + r0) - Math.sinh(r0));
    return [ux0 + u * dx, uy0 + u * dy, (w0 * c0) / Math.cosh(rho * s + r0)];
  };
};

export const MapStory: React.FC<StoryProps> = ({ lang, subs }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const aspect = width / height;
  const V = height > width; // vertical (9:16) layout
  const { STORY, TL, meta, T } = prepare(lang);
  const lang2 = (meta.lang || "en").slice(0, 2);
  const ui = (k: string) => (meta.ui as Record<string, string>)[k] ?? UI_DEFAULT[lang2]?.[k] ?? UI_DEFAULT.en[k] ?? "";
  const UP = (s: string) => s.toLocaleUpperCase(meta.lang);
  const subsOn = subs ?? meta.subtitles ?? true;
  const polys = useMemo(() => Object.fromEntries(ROUTES.map((r) => [r.id, routePoly(r)])), []);

  const creditLine = (c: Credit) => {
    if (c.family) return `${ui("familyArchive")}${c.author ? " · " + c.author : ""}`;
    const author = c.author.replace(/Unknown author/gi, "").replace(/Unknown photographer/gi, "").trim();
    const lic = /public domain|^pd/i.test(c.license) ? meta.ui.publicDomain : /no restrictions/i.test(c.license) ? meta.ui.noRestrictions : c.license === "Attribution" ? "CC BY" : c.license;
    return `${author ? author + " · " : ""}${lic} · ${meta.ui.commons}`;
  };

  let i = 0;
  while (i < TL.scenes.length - 1 && frame >= TL.scenes[i + 1].from) i++;
  const ts = TL.scenes[i];
  const sc = STORY[i];
  if (!ts || !sc) {
    // no data yet: fill src/data and run `npm run geo` and `npm run vo`
    return <AbsoluteFill style={{ backgroundColor: BASE.sea, color: BASE.muted, fontFamily: FONT, fontSize: 40, justifyContent: "center", alignItems: "center" }}>src/data is empty</AbsoluteFill>;
  }
  const lt = frame - ts.from;

  /* ---------------- layout: wide (16:9) or vertical (9:16) ---------------- */
  // Vertical leaves the top ~150 px and the bottom ~400 px free: phone apps draw their own buttons there.
  const L = V
    ? { pad: 60, years: 112, title: 46, chip: 26, fact: 27, sub: 54, subBottom: 420, subMax: width - 120, subChars: 64,
        photoW: width - 120, photoH: 540, card: 104, cardKick: 34, cardSub: 40 }
    : { pad: 90, years: 104, title: 44, chip: 28, fact: 30, sub: 44, subBottom: 74, subMax: 1480, subChars: 9999,
        photoW: 1120, photoH: 500, card: 140, cardKick: 40, cardSub: 46 };
  const zw = (vw: number) => vw * (1920 / width); // view width as it would be on the wide frame: zoom thresholds use it

  /* ---------------- camera: flight between scenes, then a slow drift ---------------- */
  const camOf = (k: number): View => {
    let j = k;
    while (j > 0 && !STORY[j].cam) j--; // scenes without a camera (e.g. credits) keep the previous view
    const [w, s, e, n] = STORY[j].cam || [GEO.bb.w, GEO.bb.s, GEO.bb.e, GEO.bb.n];
    return viewOf(P([w, n]), P([e, s]), aspect, (STORY[j].facts || []).length > 0, V ? focusXOf(STORY[k], PLACES, P) : undefined);
  };
  const fit = (v: View): View => fitView(v, aspect, GEO.W, GEO.H);
  const drift = (k: number, p: number): View => {
    const v = fit(camOf(k));
    const dir = k % 2 === 0 ? 1 : -1;
    const q = sine(clamp(p));
    return fit([v[0] + dir * v[2] * 0.018 * q, v[1] - v[2] * 0.006 * q, v[2] * (1 + DRIFT * 0.5 - DRIFT * q)]);
  };
  let z: View;
  if (lt < CAM_FRAMES && i > 0) {
    z = fit(zoomInterp(drift(i - 1, 1), drift(i, 0))(ease(lt / CAM_FRAMES)));
  } else {
    const p = i === 0 ? lt / ts.frames : (lt - CAM_FRAMES) / Math.max(1, ts.frames - CAM_FRAMES);
    z = drift(i, p);
  }
  const vw = z[2], vh = vw / aspect;
  const u = vw / width;
  const zoom = zw(vw);
  const vx0 = z[0] - vw / 2, vy0 = z[1] - vh / 2;
  const viewBox = `${vx0} ${vy0} ${vw} ${vh}`;
  const toScreen = (x: number, y: number) => [((x - vx0) / vw) * width, ((y - vy0) / vh) * height];
  const sceneFrac = (k: number, f: number) => TL.scenes[k].from + f * TL.scenes[k].frames;

  /* ---------------- photos ---------------- */
  type Shown = { key: string; caption: string; op: number; t: number; n: number };
  const shown: Shown[] = [];
  (sc.imgs || []).forEach(([li, key, caption, span], n) => {
    const l0 = ts.lines[li];
    if (!l0 || !CREDITS[key]) return;
    const lastIdx = Math.min(ts.lines.length - 1, li + (span || 1) - 1);
    const next = ts.lines[lastIdx + 1];
    const st = l0.from - 6;
    const en = next ? next.from - 2 : Math.min(ts.frames - 4, ts.lines[lastIdx].from + ts.lines[lastIdx].frames + 14);
    if (lt < st || lt > en) return;
    const op = Math.min(easeOut(clamp((lt - st) / 14)), easeOut(clamp((en - lt) / 12)));
    shown.push({ key, caption, op, t: (lt - st) / Math.max(1, en - st), n });
  });
  const photoOp = shown.reduce((m, s) => Math.max(m, s.op), 0);

  /* ---------------- routes ---------------- */
  let mover: { x: number; y: number; ang: number; b: Branch; boat?: boolean } | null = null;
  const routeEls = ROUTES.map((r) => {
    const a = routeAt[r.id];
    if (!a) return null;
    const st = sceneFrac(a.i, a.t0), en = sceneFrac(a.i, a.t1);
    const pr = clamp((frame - st) / Math.max(1, en - st));
    if (pr <= 0) return null;
    const pe = ease(pr);
    const poly = polys[r.id];
    const d = partialPath(poly, pe);
    const active = a.i === i || sc.all;
    const op = active ? 1 : zoom < 140 ? 0.16 : 0.4;
    if (pr < 1) mover = { ...pointAt(poly, poly.len * pe), b: r.b, boat: r.boat };
    const w = (active ? 6 : 4.5) * u;
    return (
      <g key={r.id} opacity={op}>
        {!r.dotted && <path d={d} fill="none" stroke={BASE.halo} strokeWidth={w + 4 * u} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />}
        <path d={d} fill="none" stroke={col(r.b)} strokeLinecap="round" strokeLinejoin="round"
          strokeWidth={r.dotted ? 7.5 * u : w} strokeDasharray={r.dotted ? `${0.1 * u} ${15 * u}` : undefined} />
      </g>
    );
  });

  /* ---------------- period borders: the map of the scene's own date ---------------- */
  const eraOf = (k: number) => (STORY[k] ? GEO.sceneEra?.[STORY[k].id] : undefined);
  const eNow = eraOf(i), ePrev = i > 0 ? eraOf(i - 1) : undefined;
  const eraSwap = !!(eNow && ePrev && eNow.e !== ePrev.e);
  const eraIn = eraSwap ? clamp(lt / 30) : 1;
  const eraLayers: { e: number; op: number }[] = [];
  if (eNow && GEO.eras?.[eNow.e]) eraLayers.push({ e: eNow.e, op: eraIn });
  if (eraSwap && ePrev && eraIn < 1 && GEO.eras?.[ePrev.e]) eraLayers.push({ e: ePrev.e, op: 1 - eraIn });
  const era = eNow ? GEO.eras?.[eNow.e] : undefined;
  let eraTag = "";
  if (eNow && era && !sc.credits) {
    eraTag = eNow.today ? ui("bordersToday") : ui("bordersOf").replace("{y}", String(eNow.y));
    const f = !sc.all && !eNow.today ? (sc.focus || []).find((id) => era.at[id]) : undefined;
    if (f) eraTag += ` · ${T(PLACES[f].n)}: ${T(era.at[f])}`;
  }

  /* ---------------- places (dots in SVG, labels in HTML) ---------------- */
  type Label = { key: string; text: string; x: number; y: number; dx: number; dy: number; anchor: string; size: number; weight: number; color: string; italic?: boolean; op: number; spacing?: number };
  const labels: Label[] = [];
  const focus = new Set(sc.focus || []);
  const placeDots = Object.entries(PLACES).map(([id, p]) => {
    const f = placeFirst[id];
    if (f == null || i < f) return null;
    const fade = i === f ? easeOut(clamp((lt - 20) / 24)) : 1;
    const isF = focus.has(id) && !sc.all;
    let op = fade * (isF || sc.all ? 1 : 0.55);
    if (p.onlyFar) op *= clamp((zoom - 140) / 60);
    if (p.minor) op *= clamp(1 - (zoom - 170) / 60);
    if (op <= 0.01) return null;
    const [x, y] = P(p.c);
    const pulse = isF ? (Math.sin(frame / 7) + 1) / 2 : 0;
    const name = p.zoomName && zoom < 90 ? p.zoomName : p.farName && zoom > 500 ? p.farName : p.n;
    labels.push({ key: id, text: T(name), x, y, dx: p.dx, dy: p.dy, anchor: p.anchor || "start", size: isF ? 30 : 25, weight: 650, color: BASE.ink, op });
    return (
      <g key={id} opacity={op}>
        {isF && <circle cx={x} cy={y} r={(14 + 14 * pulse) * u} fill={col(p.b)} opacity={0.3 * (1 - pulse * 0.7)} />}
        <circle cx={x} cy={y} r={(isF ? 9 : 7) * u} fill={col(p.b)} stroke={BASE.halo} strokeWidth={2.5 * u} />
      </g>
    );
  });
  const ctxDots = CTX.map((c) => {
    if (c.onlyIn && !c.onlyIn.includes(sc.id)) return null;
    if (c.hideIn && c.hideIn.includes(sc.id)) return null;
    if (!(c.minor ? zoom < 260 : zoom < 900)) return null;
    const [x, y] = P(c.c);
    labels.push({ key: "c-" + c.n, text: T(c.n), x, y, dx: c.dx, dy: c.dy, anchor: c.anchor || "start", size: 22, weight: 500, color: BASE.muted, italic: true, op: 0.85 });
    return <circle key={c.n} cx={x} cy={y} r={3.5 * u} fill={BASE.muted} opacity={0.85} />;
  });
  SEAS.forEach((s) => {
    const [x, y] = P(s.c);
    labels.push({ key: "s-" + s.n, text: UP(T(s.n)), x, y, dx: 0, dy: 0, anchor: "middle", size: 20, weight: 500, color: BASE.muted, italic: true, op: 0.55, spacing: 5 });
  });
  // state names of the period, placed by build-geo for this scene's view
  if (era && eNow && !sc.credits) {
    const stateIn = i === 0 ? easeOut(clamp((lt - 10) / 24)) : easeOut(clamp((lt - CAM_FRAMES * 0.75) / 22));
    const stateOut = clamp((ts.frames - lt) / 12);
    ((V && era.labelsV ? era.labelsV : era.labels)[sc.id] || []).forEach(([n, x, y]) => {
      labels.push({ key: "p-" + n, text: UP(T(n)), x, y, dx: 0, dy: 0, anchor: "middle", size: 23, weight: 650, color: BASE.state, op: 0.62 * stateIn * stateOut * (1 - photoOp * 0.6), spacing: 7 });
    });
  }

  const zoneOn = sc.zone ? easeOut(clamp((lt - CAM_FRAMES * 0.7) / 30)) : 0;
  const prevZone = i > 0 ? STORY[i - 1].zone : undefined;
  const zonePrev = prevZone && prevZone !== sc.zone ? 1 - clamp(lt / 20) : 0;
  const zoneLayers = ZONES.map((zn) => ({ zn, op: zn.id === sc.zone ? zoneOn : zn.id === prevZone ? zonePrev : 0 })).filter((q) => q.op > 0);
  zoneLayers.forEach(({ zn, op }) => {
    (zn.labels || []).forEach(([t, c, size], k) => {
      const [x, y] = P(c);
      const color = k === 0 ? zn.fillColor || BASE.zone : zn.lineColor || BASE.river;
      labels.push({ key: `z-${zn.id}-${k}`, text: T(t), x, y, dx: 0, dy: 0, anchor: "middle", size: size || 26, weight: 750, color, op });
    });
  });

  /* ---------------- subtitles, facts, header, cards ---------------- */
  const line = ts.lines.find((l, k) => {
    const next = ts.lines[k + 1];
    const end = next ? next.from : l.from + l.frames + 18;
    return lt >= l.from - 4 && lt < end;
  });
  const lineK = line ? ts.lines.indexOf(line) : -1;
  const subOp = line ? clamp((lt - line.from + 4) / 6) * (ts.lines[lineK + 1] ? 1 : clamp((line.from + line.frames + 18 - lt) / 8)) : 0;
  let subText = "";
  if (line) {
    const chunks = chunkLine(line.text, L.subChars);
    const p = clamp((lt - line.from) / Math.max(1, line.frames), 0, 0.9999);
    subText = (chunks.find((c) => p >= c.t0 && p < c.t1) || chunks[chunks.length - 1]).text;
  }

  const facts = sc.facts || [];
  const firstLine = ts.lines[0]?.from ?? 0;
  const lastLineEnd = ts.lines.length ? ts.lines[ts.lines.length - 1].from + ts.lines[ts.lines.length - 1].frames : ts.frames;
  const factStep = facts.length ? Math.min(40, Math.max(10, (lastLineEnd - firstLine - 20) / facts.length)) : 0;
  const headIn = easeOut(clamp((lt - 6) / 18));
  const cardLen = Math.round(2.9 * fps);
  const cardOp = sc.card ? interpolate(lt, [0, 10, cardLen - 18, cardLen], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  const globalOp = interpolate(frame, [0, 18, TL.total - 30, TL.total - 1], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const branchColor = col(sc.b);
  const hasDotted = (sc.routes || []).some(([id]) => ROUTES.find((r) => r.id === id)?.dotted);
  const creditsOp = sc.credits ? easeOut(clamp((lt - 10) / 20)) : 0;

  const chip = (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: V ? "10px 20px" : "12px 24px", borderRadius: 999, background: "rgba(20,21,27,.82)", border: `2px solid ${branchColor}`, fontSize: L.chip, fontWeight: 750, letterSpacing: 2, textTransform: "uppercase" }}>
      <span style={{ width: 16, height: 16, borderRadius: 99, background: branchColor }} />
      {UP(sc.part || "")}
    </div>
  );
  const factEls = facts.map((raw, k) => {
    const o = easeOut(clamp((lt - (firstLine + k * factStep)) / 12));
    const isHead = raw.startsWith("#"), isWorld = raw.startsWith("W|");
    const f = isHead ? raw.slice(1) : isWorld ? raw.slice(2) : raw;
    const many = facts.length > 6;
    return (
      <div key={k} style={{
        opacity: o, transform: `translate3d(${((1 - o) * (V ? -24 : 24)).toFixed(2)}px, 0, 0)`, willChange: "transform",
        display: "flex", alignItems: "center", gap: 12, padding: isHead ? "4px 6px" : V ? "7px 16px" : "9px 20px", borderRadius: 14,
        background: isHead ? "transparent" : isWorld ? "rgba(239,236,230,.92)" : "rgba(20,21,27,.8)",
        borderLeft: isHead || isWorld ? "none" : `5px solid ${branchColor}`,
        fontSize: isHead ? L.fact - 6 : many ? L.fact - 3 : L.fact, fontWeight: isHead ? 700 : isWorld ? 650 : 560,
        color: isHead ? BASE.muted : isWorld ? "#16171c" : BASE.ink,
        textTransform: isHead ? "uppercase" : "none", letterSpacing: isHead ? 2 : 0, fontVariantNumeric: "tabular-nums",
      }}>
        {isWorld && (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#16171c" strokeWidth="2" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="9.5" /><path d="M2.5 12h19M12 2.5c3 3.2 3 15.8 0 19M12 2.5c-3 3.2-3 15.8 0 19" />
          </svg>
        )}
        {f}
      </div>
    );
  });
  const dottedNote = hasDotted && photoOp < 0.5 && (
    <div style={{ marginTop: 14, fontSize: 26, color: BASE.muted, display: "flex", alignItems: "center", gap: 12, textShadow: "0 1px 8px rgba(0,0,0,.8)" }}>
      <span style={{ letterSpacing: 6, color: branchColor, fontWeight: 900 }}>• • •</span> {ui("route")}
    </div>
  );
  const eraNote = eraTag && (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: V ? 24 : 22, fontWeight: 560, color: BASE.muted, textShadow: "0 1px 8px rgba(0,0,0,.85)", opacity: 0.95 * eraIn }}>
      <svg width="34" height="10" viewBox="0 0 34 10"><path d="M1 5h32" stroke={BASE.state} strokeWidth="2.4" strokeDasharray="6 5" /></svg>
      {eraTag}
    </div>
  );
  const originsBar = sc.origins && (() => {
    const t0 = ts.lines[0]?.from ?? 30;
    const o = easeOut(clamp((lt - t0 + 6) / 20));
    const seg = sc.origins.map(([n, v, c]) => [T(n), v, c.startsWith("#") ? c : col(c)] as [string, number, string]);
    const pct = (v: number) => (Math.round(v * 100) / 100).toLocaleString(meta.lang);
    return (
      <div style={V ? { width: "100%", marginTop: 26, opacity: o } : { position: "absolute", left: 800, right: 90, top: 168, opacity: o }}>
        <div style={{ display: "flex", height: 46, borderRadius: 12, overflow: "hidden", boxShadow: "0 6px 30px rgba(0,0,0,.5)" }}>
          {seg.map(([n, v, c], k) => <div key={n} style={{ width: `${v * clamp((lt - t0 - k * 5) / 18)}%`, background: c }} />)}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "6px 22px", marginTop: 12, fontSize: 26, fontWeight: 600, textShadow: HALO }}>
          {seg.map(([n, v, c]) => (
            <span key={n} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 14, height: 14, borderRadius: 4, background: c }} />{lang2 === "tr" ? `%${pct(v)}` : `${pct(v)}%`} {n}
            </span>
          ))}
        </div>
      </div>
    );
  })();

  return (
    <AbsoluteFill style={{ backgroundColor: BASE.sea, fontFamily: FONT, color: BASE.ink }}>
      {TL.scenes.map((s) => s.lines.map((l) => <Audio key={l.file} src={staticFile(l.file)} from={s.from + l.from} />))}

      <AbsoluteFill style={{ opacity: globalOp }}>
        {/* map */}
        <svg width={width} height={height} viewBox={viewBox} style={{ position: "absolute", inset: 0 }}>
          <defs><clipPath id="landclip"><path d={GEO.land} /></clipPath></defs>
          <rect x={-3000} y={-3000} width={GEO.W + 6000} height={GEO.H + 6000} fill={BASE.sea} />
          <path d={GEO.land} fill={BASE.land} stroke={BASE.coast} strokeWidth={1.4 * u} />
          {eraLayers.length === 0 && <path d={GEO.borders} fill="none" stroke={BASE.border} strokeWidth={1.2 * u} strokeDasharray={`${5 * u} ${5 * u}`} />}
          {eraLayers.map(({ e, op }) => (
            <g key={e} opacity={op}>
              <g clipPath="url(#landclip)">
                {GEO.eras![e].areas.map((a, k) => <path key={k} d={a.d} fill={TINTS[a.t % TINTS.length]} fillRule="evenodd" opacity={0.2} />)}
              </g>
              <path d={GEO.eras![e].borders} fill="none" stroke={BASE.state} strokeWidth={1.7 * u} strokeDasharray={`${6 * u} ${5 * u}`} strokeLinejoin="round" opacity={0.75} />
            </g>
          ))}
          {zoneLayers.map(({ zn, op }) => (
            <g key={zn.id} opacity={op}>
              {zn.fill && <path d={lineD(zn.fill, true)} fill={zn.fillColor || BASE.zone} opacity={0.24} clipPath="url(#landclip)" />}
              {zn.line && <path d={lineD(zn.line)} fill="none" stroke={zn.lineColor || BASE.river} strokeWidth={5 * u} strokeLinecap="round" strokeLinejoin="round" />}
            </g>
          ))}
          {routeEls}
          {ctxDots}
          {placeDots}
          {mover && (() => {
            const m = mover as { x: number; y: number; ang: number; b: Branch; boat?: boolean };
            if (m.boat) {
              const flip = Math.abs(m.ang) > 90 ? -1 : 1;
              const ang = flip < 0 ? m.ang + 180 : m.ang;
              return <path d="M-7,-2 L7,-2 L4,3 L-4,3 Z M-2,-2 L-2,-7 L3,-2 Z" fill={BASE.ink} stroke={BASE.halo} strokeWidth={0.6}
                transform={`translate(${m.x},${m.y}) rotate(${ang}) scale(${u * 2.6 * flip},${u * 2.6})`} />;
            }
            return <circle cx={m.x} cy={m.y} r={9 * u} fill={col(m.b)} stroke={BASE.ink} strokeWidth={3 * u} />;
          })()}
        </svg>

        {/* map labels: fixed-size HTML text moved with sub-pixel transforms (no per-frame font rescaling) */}
        <AbsoluteFill style={{ pointerEvents: "none" }}>
          {labels.map((l) => {
            const [sx, sy] = toScreen(l.x, l.y);
            if (sx < -400 || sx > width + 400 || sy < -100 || sy > height + 100) return null;
            const ax = l.anchor === "end" ? "-100%" : l.anchor === "middle" ? "-50%" : "0%";
            return (
              <div key={l.key} style={{
                position: "absolute", left: 0, top: 0, whiteSpace: "nowrap", willChange: "transform",
                transform: `translate3d(${(sx + l.dx).toFixed(2)}px, ${(sy + l.dy).toFixed(2)}px, 0) translate(${ax}, -78%)`,
                fontSize: l.size, fontWeight: l.weight, color: l.color, fontStyle: l.italic ? "italic" : "normal",
                letterSpacing: l.spacing || 0, lineHeight: 1, opacity: l.op, textShadow: HALO,
              }}>{l.text}</div>
            );
          })}
        </AbsoluteFill>

        <AbsoluteFill style={{ background: V
          ? "linear-gradient(180deg, rgba(8,10,14,.7) 0%, rgba(8,10,14,0) 32%, rgba(8,10,14,0) 62%, rgba(8,10,14,.7) 100%)"
          : "linear-gradient(180deg, rgba(8,10,14,.55) 0%, rgba(8,10,14,0) 26%, rgba(8,10,14,0) 70%, rgba(8,10,14,.6) 100%)" }} />

        {/* photo card with a slow Ken Burns move */}
        {photoOp > 0 && <AbsoluteFill style={{ background: `rgba(8,10,14,${0.55 * photoOp})` }} />}
        {shown.map((s) => {
          const c = CREDITS[s.key];
          const doc = c.kind === "document"; // a scanned paper: show all of it, a little larger, without cropping
          const maxW = L.photoW, maxH = L.photoH + (doc ? 60 : 0);
          const r = c.w / c.h;
          let w = Math.min(maxW, maxH * r), h = w / r;
          if (c.w < 700) { w = Math.min(w, c.w * 1.6); h = w / r; }
          const boxW = Math.max(w, Math.min(560, maxW));
          const dir = s.n % 2 === 0 ? 1 : -1;
          const scale = doc ? 1 + 0.03 * s.t : 1.04 + 0.08 * s.t;
          const tx = doc ? 0 : dir * 18 * (s.t - 0.5), ty = doc ? 0 : -8 * (s.t - 0.5);
          const inS = 0.97 + 0.03 * s.op;
          const pos = V
            ? { left: (width - boxW) / 2, top: Math.round(height * (facts.length ? 0.36 : 0.32)) - (doc ? 40 : 0), transformOrigin: "center center" }
            : { left: L.pad, top: 250, transformOrigin: "left center" };
          return (
            <div key={s.key} style={{ position: "absolute", ...pos, opacity: s.op, transform: `scale(${inS.toFixed(4)})` }}>
              <div style={{ position: "relative", width: boxW, height: h, overflow: "hidden", borderRadius: 10, boxShadow: "0 18px 60px rgba(0,0,0,.65)", outline: "1px solid rgba(255,255,255,.12)", background: "#0b0c10" }}>
                <Img src={staticFile("img/" + c.file)} style={{ position: "absolute", left: (boxW - w) / 2, top: 0, width: w, height: h, objectFit: doc ? "contain" : "cover", transform: `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`, willChange: "transform" }} />
                <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "40px 18px 12px", background: "linear-gradient(180deg, rgba(8,10,14,0), rgba(8,10,14,.88))" }}>
                  <div style={{ fontSize: 26, fontWeight: 650, lineHeight: 1.2 }}>{s.caption}</div>
                  <div style={{ fontSize: 16, color: "#bdb8ae", marginTop: 4 }}>{creditLine(c)}</div>
                </div>
              </div>
            </div>
          );
        })}

        {/* wide: header top-left, chip and facts top-right, borders note bottom-left */}
        {!sc.credits && !V && (
          <>
            <div style={{ position: "absolute", left: L.pad, top: 64, opacity: headIn, transform: `translateY(${((1 - headIn) * 16).toFixed(2)}px)` }}>
              <div style={{ fontSize: L.years, fontWeight: 800, letterSpacing: -2, lineHeight: 1, fontVariantNumeric: "tabular-nums", textShadow: "0 2px 18px rgba(0,0,0,.6)" }}>{sc.years}</div>
              <div style={{ marginTop: 14, fontSize: L.title, fontWeight: 650, textShadow: "0 2px 12px rgba(0,0,0,.7)" }}>{sc.title}</div>
              {dottedNote}
            </div>
            <div style={{ position: "absolute", right: L.pad, top: 72, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12, opacity: headIn }}>
              {chip}
              {factEls}
            </div>
            {originsBar}
            <div style={{ position: "absolute", left: L.pad, bottom: 24, opacity: headIn * (1 - cardOp) }}>{eraNote}</div>
          </>
        )}

        {/* vertical: one column on top (chip, year, title, notes, facts), the map below it */}
        {!sc.credits && V && (
          <div style={{ position: "absolute", left: L.pad, right: L.pad, top: 150, display: "flex", flexDirection: "column", alignItems: "flex-start", opacity: headIn, transform: `translateY(${((1 - headIn) * 16).toFixed(2)}px)` }}>
            {chip}
            <div style={{ marginTop: 20, fontSize: L.years, fontWeight: 800, letterSpacing: -2, lineHeight: 1, fontVariantNumeric: "tabular-nums", textShadow: "0 2px 18px rgba(0,0,0,.6)" }}>{sc.years}</div>
            <div style={{ marginTop: 12, fontSize: L.title, fontWeight: 650, lineHeight: 1.15, textShadow: "0 2px 12px rgba(0,0,0,.7)" }}>{sc.title}</div>
            {dottedNote}
            {eraNote && <div style={{ marginTop: 12 }}>{eraNote}</div>}
            {facts.length > 0 && <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 10 }}>{factEls}</div>}
            {originsBar}
          </div>
        )}

        {/* closing credits */}
        {sc.credits && (
          <AbsoluteFill style={{ background: `rgba(8,10,14,${0.95 * creditsOp})`, opacity: creditsOp, padding: V ? "190px 70px 420px" : "80px 110px" }}>
            <div style={{ fontSize: 54, fontWeight: 800, marginBottom: 10 }}>{ui("sources")}</div>
            <div style={{ fontSize: 24, color: BASE.muted, marginBottom: 28, lineHeight: 1.45, whiteSpace: "pre-line" }}>{meta.sourcesText}</div>
            <div style={{ columnCount: V ? 1 : 2, columnGap: 60, fontSize: 19, lineHeight: 1.5, color: "#d9d5cd" }}>
              {Object.values(CREDITS).map((c) => (
                <div key={c.file} style={{ breakInside: "avoid", marginBottom: 6 }}>
                  <span style={{ color: BASE.ink, fontWeight: 600 }}>{c.title.replace(/^File:/, "").replace(/\.(jpg|png)$/i, "")}</span>
                  <span style={{ color: BASE.muted }}> — {creditLine(c)}</span>
                </div>
              ))}
            </div>
          </AbsoluteFill>
        )}

        {/* subtitles */}
        {subsOn && (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: L.subBottom, display: "flex", justifyContent: "center", opacity: subOp }}>
            {line && (
              <div style={{ maxWidth: L.subMax, padding: V ? "16px 28px" : "18px 34px", borderRadius: 18, background: "rgba(10,11,15,.82)", fontSize: L.sub, lineHeight: 1.32, fontWeight: V ? 620 : 520, textAlign: "center" }}>
                {subText}
              </div>
            )}
          </div>
        )}

        {/* chapter card */}
        {cardOp > 0 && (
          <AbsoluteFill style={{ background: `rgba(8,10,14,${0.72 * cardOp})`, justifyContent: "center", alignItems: "center", opacity: cardOp, padding: `0 ${L.pad}px` }}>
            <div style={{ textAlign: "center", transform: `scale(${(0.96 + 0.04 * cardOp).toFixed(4)})` }}>
              {sc.cardKick && <div style={{ fontSize: L.cardKick, fontWeight: 700, letterSpacing: 10, color: BASE.muted, marginBottom: 26 }}>{UP(sc.cardKick)}</div>}
              <div style={{ width: 120, height: 8, borderRadius: 4, background: sc.cardKick ? BASE.ink : branchColor, margin: "0 auto 34px" }} />
              <div style={{ fontSize: L.card, fontWeight: 850, letterSpacing: -3, lineHeight: 1 }}>{sc.card}</div>
              {sc.cardSub && <div style={{ marginTop: 28, fontSize: L.cardSub, color: BASE.muted, fontWeight: 560 }}>{sc.cardSub}</div>}
            </div>
          </AbsoluteFill>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
