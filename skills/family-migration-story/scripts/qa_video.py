# Technical checks on a rendered video: duration, loudness, long silences, and text jitter.
# usage: python -I qa_video.py out/<name>.mp4 [t1 t2 ...]   (t = seconds to sample for the jitter check; default 20 60)
# Uses only filters that Remotion's bundled ffmpeg has too, so it runs without a system ffmpeg.
import sys as _sys; [s.reconfigure(encoding="utf-8", errors="replace") for s in (_sys.stdout, _sys.stderr) if hasattr(s, "reconfigure")]  # Windows consoles default to a legacy code page
import json, math, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fftools import need, run  # noqa: E402

if len(sys.argv) < 2:
    sys.exit("usage: python -I qa_video.py out/<name>.mp4 [t1 t2 ...]")
f = sys.argv[1]
ts = [float(x) for x in sys.argv[2:]] or [20.0, 60.0]
ffmpeg, ffprobe = need("ffmpeg", f), need("ffprobe", f)

print("==", os.path.basename(f))
_, info = run([ffprobe, "-v", "error", "-show_entries", "format=duration,size:stream=codec_name,width,height,r_frame_rate", "-of", "json", f])
info = json.loads(info)
v = next(s for s in info["streams"] if s.get("width"))
W, H = v["width"], v["height"]
print(f'{W}x{H}  {v["r_frame_rate"]} fps  {float(info["format"]["duration"]):.1f} s  {int(info["format"]["size"]) / 1e6:.1f} MB  '
      + "/".join(s["codec_name"] for s in info["streams"]))

print("== loudness (target: integrated -16 LUFS, true peak below -1 dBTP)")
# audio only, to the null muxer through a PCM encoder: Remotion's ffmpeg has no default null video encoder
AUDIO_NULL = ["-vn", "-c:a", "pcm_s16le", "-f", "null", "-"]
_, log = run([ffmpeg, "-nostats", "-hide_banner", "-i", f, "-af", "loudnorm=print_format=json"] + AUDIO_NULL)
m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", log)
if m:
    j = json.loads(m.group(0))
    print(f'  I: {j["input_i"]} LUFS   peak: {j["input_tp"]} dBTP   range: {j["input_lra"]} LU')
else:
    print("  could not measure:", (log.strip().splitlines() or ["no output"])[-1])

print("== silences over 3.5 s (expected only at chapter cards and the end)")
_, log = run([ffmpeg, "-nostats", "-hide_banner", "-i", f, "-af", "silencedetect=n=-45dB:d=3.5"] + AUDIO_NULL)
for s_ in re.findall(r"silence_start: ([0-9.]+)", log) or []:
    print("  at", s_)


def png_gray(data):
    """Pixels of an 8-bit grayscale PNG (what ffmpeg writes for -pix_fmt gray), as bytes."""
    import struct, zlib
    pos, w, h, idat = 8, 0, 0, b""
    while pos < len(data):
        ln, typ = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + ln]
        if typ == b"IHDR":
            w, h = struct.unpack(">II", body[:8])
            if body[8] != 8 or body[9] != 0:
                raise ValueError("expected 8-bit grayscale")
        elif typ == b"IDAT":
            idat += body
        pos += 12 + ln
    raw, out, prev = zlib.decompress(idat), bytearray(), bytearray(w)
    for r in range(h):
        ft, row = raw[r * (w + 1)], bytearray(raw[r * (w + 1) + 1:(r + 1) * (w + 1)])
        for i in range(w):
            a = row[i - 1] if i else 0
            b, c = prev[i], prev[i - 1] if i else 0
            if ft == 1: row[i] = (row[i] + a) & 255
            elif ft == 2: row[i] = (row[i] + b) & 255
            elif ft == 3: row[i] = (row[i] + (a + b) // 2) & 255
            elif ft == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                row[i] = (row[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        out += row
        prev = row
    return bytes(out)


# The subtitle band sits lower on a wide video than on a vertical one (which leaves room for the app's own buttons).
band = (0.11, 0.79, 0.78, 0.14) if W >= H else (0.06, 0.66, 0.88, 0.12)
x, y, w, h = int(W * band[0]), int(H * band[1]), int(W * band[2]) // 2 * 2, int(H * band[3]) // 2 * 2
print("== jitter: subtitle band of consecutive frames (inf or > 45 dB = steady text)")
import subprocess, tempfile  # noqa: E402
for t in ts:
    with tempfile.TemporaryDirectory() as tmp:
        # PNG, not raw video: Remotion's ffmpeg has no rawvideo encoder
        subprocess.run([ffmpeg, "-v", "error", "-ss", str(t), "-i", f, "-frames:v", "2", "-vf", f"crop={w}:{h}:{x}:{y},format=gray",
                        "-c:v", "png", os.path.join(tmp, "f%d.png")], capture_output=True)
        fs_ = [os.path.join(tmp, f"f{k}.png") for k in (1, 2)]
        if not all(os.path.exists(q) for q in fs_):
            print(f"  t={t:g}s  (past the end)")
            continue
        a, b = (png_gray(open(q, "rb").read()) for q in fs_)
    mse = sum((p - q) * (p - q) for p, q in zip(a, b)) / max(1, len(a))
    print(f"  t={t:g}s  average:{'inf' if mse == 0 else f'{10 * math.log10(255 * 255 / mse):.1f}'}")
