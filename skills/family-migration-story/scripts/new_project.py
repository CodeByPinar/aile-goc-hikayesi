# Copy the Remotion template into a new project folder and install it. Works on Windows, macOS and Linux.
# usage: python -I new_project.py <dir>
import sys as _sys; [s.reconfigure(encoding="utf-8", errors="replace") for s in (_sys.stdout, _sys.stderr) if hasattr(s, "reconfigure")]  # Windows consoles default to a legacy code page
import os, shutil, subprocess, sys

here = os.path.dirname(os.path.abspath(__file__))
if len(sys.argv) < 2:
    sys.exit("usage: python -I new_project.py <dir>")
dst = os.path.abspath(sys.argv[1])
if os.path.exists(os.path.join(dst, "package.json")):
    sys.exit(f"{dst} already has a project")
if not shutil.which("npm"):
    sys.exit("npm not found: install Node.js 20 or newer (https://nodejs.org)")
os.makedirs(dst, exist_ok=True)
shutil.copytree(os.path.join(here, "..", "assets", "template"), dst, dirs_exist_ok=True,
                ignore=shutil.ignore_patterns("node_modules", "out", ".vo-tmp"))
# npm is a .cmd shim on Windows, so it has to go through the shell there
r = subprocess.run("npm ci --loglevel=error --no-audit --no-fund", shell=True, cwd=dst)
if r.returncode:
    sys.exit(r.returncode)
print(f"project ready: {dst}  (fill src/data/*.json, then: npm run geo && npm run check)")
