// Camera framing, shared by the video (MapStory.tsx), the checker (check-story.mjs) and the map
// builder (build-geo.mjs), so all three agree on what a scene shows. Plain JavaScript on purpose.

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/**
 * The view for a scene's `cam` box. a = projected [west, north], b = projected [east, south].
 * Returns [centreX, centreY, width] in map units.
 * Wide (16:9): fact chips sit top-right, so a scene with facts is pushed a little to the right.
 * Vertical (9:16): header and facts are on top, subtitles at the bottom; the places go in a band
 * between them. `focusX` (projected x of the scene's focus places) pulls a narrow vertical frame
 * towards the family, since a cam box drawn for the wide video often has them near one edge.
 */
export const viewOf = (a, b, aspect, hasFacts, focusX) => {
  const sw = b[0] - a[0], sh = b[1] - a[1];
  if (aspect >= 1) {
    let W = Math.max(sw, sh * aspect) * 1.28, cx = (a[0] + b[0]) / 2;
    if (hasFacts) { W *= 1.12; cx += W * 0.11; }
    return [cx, (a[1] + b[1]) / 2 + (W / aspect) * 0.045, W];
  }
  const band = hasFacts ? 0.28 : 0.36; // share of the height the cam box may fill
  const mid = hasFacts ? 0.52 : 0.48; // where the centre of that band sits (0 = top)
  const W = Math.max(sw * 1.22, (sh / band) * aspect);
  let cx = (a[0] + b[0]) / 2;
  if (focusX != null) cx = clamp((cx + focusX) / 2, focusX - W * 0.3, focusX + W * 0.3);
  return [cx, (a[1] + b[1]) / 2 - (W / aspect) * (mid - 0.5), W];
};

/** Keep a view inside the map (GW x GH map units), shrinking it when the map is too small for it. */
export const fitView = (v, aspect, GW, GH) => {
  const w = Math.min(v[2], GW - 4, (GH - 4) * aspect), h = w / aspect;
  return [clamp(v[0], w / 2 + 2, GW - w / 2 - 2), clamp(v[1], h / 2 + 2, GH - h / 2 - 2), w];
};

/** Mean projected x of a scene's focus places (for viewOf), or undefined. */
export const focusXOf = (scene, places, P) => {
  const xs = (scene.focus || []).filter((id) => places[id]).map((id) => P(places[id].c)[0]);
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : undefined;
};

/** First four-digit year in a scene's `years` text ("1923 – 1924" -> 1923), or null. */
export const firstYear = (years) => {
  const m = /\b(1[0-9]{3}|20[0-9]{2})\b/.exec(String(years || ""));
  return m ? Number(m[1]) : null;
};
