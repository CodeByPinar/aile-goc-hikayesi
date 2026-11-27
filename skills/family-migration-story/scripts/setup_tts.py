# One-time setup of the local speech tools in a durable venv (~/.cache/family-migration-story/venv):
#   yazgi-tts-1     Turkish TTS, Apache-2.0, ~81M params; weights (~1.2 GB) download from Hugging Face on first use
#   faster-whisper  local speech recognition, used to check every narrated line
# usage: python -I setup_tts.py            (needs uv: https://docs.astral.sh/uv/)
# Works on Windows, macOS and Linux. Prints the venv's python, which gen-vo.mjs and asr_check.py use.
import sys as _sys; [s.reconfigure(encoding="utf-8", errors="replace") for s in (_sys.stdout, _sys.stderr) if hasattr(s, "reconfigure")]  # Windows consoles default to a legacy code page
import os, shutil, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fftools import CACHE, VENV, VENV_PY  # noqa: E402

WHEEL = "yazgi-tts[hub] @ https://huggingface.co/erkamk/yazgi-tts-1/resolve/main/dist/yazgi_tts-0.1.0-py3-none-any.whl"
PROBE = "import yazgi_tts, faster_whisper; print('ok')"

if os.path.exists(VENV_PY) and subprocess.run([VENV_PY, "-c", PROBE], capture_output=True).returncode == 0:
    print("already set up:", VENV_PY)
    sys.exit(0)
if not shutil.which("uv"):
    sys.exit("uv is required: https://docs.astral.sh/uv/  (Windows: winget install astral-sh.uv, macOS: brew install uv)")
free = shutil.disk_usage(os.path.expanduser("~")).free / 1e9
if free < 5:
    sys.exit(f"only {free:.1f} GB free; the speech models need about 5 GB")
os.makedirs(CACHE, exist_ok=True)
# Python 3.12 is the tested version. If uv cannot provide it (no network, or a damaged uv Python install,
# seen on Windows as "Missing expected target directory for Python minor version link"), use the
# Python running this script when it is recent enough.
if subprocess.run(["uv", "venv", "--clear", "--python", "3.12", VENV]).returncode != 0:
    if sys.version_info[:2] < (3, 10):
        sys.exit("uv could not provide Python 3.12, and this Python is older than 3.10")
    print(f"uv could not provide Python 3.12; using this Python ({sys.version.split()[0]}) instead")
    subprocess.run(["uv", "venv", "--clear", "--python", sys.executable, VENV], check=True)
subprocess.run(["uv", "pip", "install", "--python", VENV_PY, WHEEL, "soundfile", "faster-whisper", "numpy"], check=True)
subprocess.run([VENV_PY, "-c", PROBE], check=True)
print("venv ready:", VENV_PY, "  (the first synthesis downloads the model)")
