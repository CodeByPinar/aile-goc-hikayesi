# Encode the delivery copies from the Remotion master with broadcast loudness (-16 LUFS, -1.5 dBTP):
#   <name>.mp4       full size (1080p wide, or 1080x1920 for a vertical master), for desktop / YouTube
#   <name>-720p.mp4  small enough for messaging apps (aim under ~30 MB for a 10-minute film)
# loudnorm resamples internally (to 192 kHz); -ar 48000 brings the audio back to a rate every player
# and upload site (X, WhatsApp, YouTube, Instagram) accepts.
# usage: python -I deliver.py out/master.mp4 out/<name>
import sys as _sys; [s.reconfigure(encoding="utf-8", errors="replace") for s in (_sys.stdout, _sys.stderr) if hasattr(s, "reconfigure")]  # Windows consoles default to a legacy code page
import os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fftools import has_filter, need, run  # noqa: E402

if len(sys.argv) < 3:
    sys.exit("usage: python -I deliver.py out/master.mp4 out/<name>")
src, base = sys.argv[1], sys.argv[2]
ffmpeg, ffprobe = need("ffmpeg", src), need("ffprobe", src)
_, dim = run([ffprobe, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", src])
w, h = (int(x) for x in dim.strip().split(",")[:2])
vertical = h > w
loud = ["-af", "loudnorm=I=-16:TP=-1.5:LRA=11"] if has_filter(ffmpeg, "loudnorm") else []
if not loud:
    print("WARN this ffmpeg has no loudnorm filter: the audio is copied at its original level")
common = ["-pix_fmt", "yuv420p", "-movflags", "+faststart"] + loud + ["-ar", "48000", "-c:a", "aac"]
small = "scale=720:1280:flags=lanczos" if vertical else "scale=1280:720:flags=lanczos"
jobs = [
    (base + ".mp4", ["-c:v", "libx264", "-preset", "slow", "-crf", "20"] + common + ["-b:a", "160k"]),
    (base + "-720p.mp4", ["-vf", small, "-c:v", "libx264", "-preset", "slow", "-crf", "27"] + common + ["-b:a", "96k"]),
]
for out, args in jobs:
    code, log = run([ffmpeg, "-y", "-v", "error", "-nostats", "-i", src] + args + [out])
    if code:
        sys.exit(log)
    print(f"{os.path.getsize(out) / 1e6:6.1f} MB  {out}")
