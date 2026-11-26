# Batch Turkish TTS with yazgi-tts-1 (Apache-2.0, runs locally; model is downloaded once from Hugging Face).
# usage: python -I tts_yazgi.py lines.json outdir voice
#   lines.json: [{"base": "giris-1", "text": "...", "seed": 7}, ...]
#   voices: male-01 ... male-04, female-01 ... female-04 (male-01 sounded most natural for long narration)
import json, os, sys, time

import soundfile as sf
from yazgi_tts import RATE, YazgiTTS

lines = json.load(open(sys.argv[1], encoding="utf-8"))
out, voice = sys.argv[2], sys.argv[3]
tts = YazgiTTS()
for L in lines:
    t = time.time()
    a = tts.say(L["text"], voice=voice, seed=L.get("seed", 7))
    sf.write(os.path.join(out, L["base"] + ".wav"), a, RATE)
    print(f'{L["base"]}\t{len(a) / RATE:.2f}s\t({time.time() - t:.1f}s)', flush=True)
