# Listen to every narrated line with a local speech recogniser and flag lines whose transcript drifts
# from the script (swallowed words, wrong stress on a name, a garbled date).
#
# usage: ~/.cache/family-migration-story/venv/bin/python -I asr_check.py <project-dir> [--lang tr] [--model small] [--min 0.86]
# Flagged lines: regenerate them with another seed (scripts/seeds.json) via `node scripts/gen-vo.mjs --only id-n`.
import difflib, json, os, re, subprocess, sys

import numpy as np
from faster_whisper import WhisperModel

a = sys.argv[1:]
opt = lambda k, d: a[a.index(k) + 1] if k in a else d
proj, lang, model, thr = a[0], opt("--lang", "tr"), opt("--model", "small"), float(opt("--min", "0.86"))

# Numbers are written as digits in the script but spoken as words: drop both sides' numbers before comparing.
NUMW = {
    "tr": "sıfır bir iki üç dört beş altı yedi sekiz dokuz on yirmi otuz kırk elli altmış yetmiş seksen doksan yüz bin milyon",
    "en": "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million",
}.get(lang, "").split()


def norm(s):
    if lang == "tr":
        s = s.replace("I", "ı").replace("İ", "i")
    s = s.lower().replace("'", "").replace("’", "")
    s = re.sub(r"[^\w\s]", " ", s)
    out = []
    for w in s.split():
        if any(ch.isdigit() for ch in w) or w in NUMW:
            continue
        if any(w.startswith(n) and len(w) - len(n) <= 4 for n in NUMW if len(n) > 2):
            continue
        out.append(w)
    return " ".join(out)


def load16(f):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", f, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


lines = json.load(open(os.path.join(proj, ".vo-tmp/all-lines.json"), encoding="utf-8"))
m = WhisperModel(model, device="cpu", compute_type="int8")
bad, worst = [], 1.0
for L in lines:
    segs, _ = m.transcribe(load16(os.path.join(proj, "public/vo", L["base"] + ".wav")), language=lang, beam_size=5)
    hyp = " ".join(s.text.strip() for s in segs)
    r = difflib.SequenceMatcher(None, norm(L["text"]), norm(hyp)).ratio()
    worst = min(worst, r)
    if r < thr:
        bad.append(L["base"])
        print(f'{L["base"]:18s} {r:.2f}  <-- CHECK\n   script: {L["text"]}\n   heard:  {hyp}', flush=True)
    else:
        print(f'{L["base"]:18s} {r:.2f}', flush=True)
print(f"lowest {worst:.2f}; FLAGGED: {' '.join(bad) if bad else 'none'}")
