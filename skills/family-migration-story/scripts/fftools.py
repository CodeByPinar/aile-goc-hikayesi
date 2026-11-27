# Locate ffmpeg / ffprobe on any platform, and a few shared helpers for the cross-platform scripts.
#
# Order: FMS_FFMPEG / FMS_FFPROBE environment variables, then PATH, then the binaries that Remotion ships
# inside the video project (node_modules/@remotion/compositor-*). The last one means a Windows machine
# without a system ffmpeg can still build, deliver and check a video.
import glob, os, shutil, subprocess, sys

EXE = ".exe" if os.name == "nt" else ""
CACHE = os.path.join(os.path.expanduser("~"), ".cache", "family-migration-story")
VENV = os.path.join(CACHE, "venv")
VENV_PY = os.path.join(VENV, "Scripts", "python.exe") if os.name == "nt" else os.path.join(VENV, "bin", "python")


def _project_dirs(start):
    """The start folder and its parents: the video project is usually one of them."""
    d = os.path.abspath(start or os.getcwd())
    if os.path.isfile(d):
        d = os.path.dirname(d)
    seen = []
    while d and d not in seen:
        seen.append(d)
        d = os.path.dirname(d)
    return seen


def find(tool, near=None):
    """Path of ffmpeg or ffprobe, or None."""
    env = os.environ.get("FMS_" + tool.upper())
    if env and os.path.exists(env):
        return env
    hit = shutil.which(tool)
    if hit:
        return hit
    for d in _project_dirs(near) + _project_dirs(os.getcwd()):
        for f in glob.glob(os.path.join(d, "node_modules", "@remotion", "compositor-*", tool + EXE)):
            return f
    return None


def need(tool, near=None):
    f = find(tool, near)
    if not f:
        sys.exit(f"{tool} not found. Install ffmpeg (Windows: winget install Gyan.FFmpeg, macOS: brew install ffmpeg) "
                 f"or run this from inside a video project whose node_modules are installed.")
    return f


def run(cmd, **kw):
    """Run and return (returncode, stdout+stderr as text)."""
    r = subprocess.run(cmd, capture_output=True, **kw)
    return r.returncode, (r.stdout + r.stderr).decode("utf-8", "replace")


def has_filter(ffmpeg, name):
    _, out = run([ffmpeg, "-hide_banner", "-filters"])
    return any(len(l.split()) > 1 and l.split()[1] == name for l in out.splitlines())


def utf8_stdout():
    """Windows consoles default to a legacy code page; Turkish text needs UTF-8."""
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
