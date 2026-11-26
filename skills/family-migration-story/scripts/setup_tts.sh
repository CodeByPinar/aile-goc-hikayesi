#!/bin/zsh
# One-time setup of the local speech tools in a durable venv (~/.cache/family-migration-story/venv):
#   yazgi-tts-1  Turkish TTS, Apache-2.0, ~81M params; weights (~1.2 GB) download from Hugging Face on first use
#   faster-whisper  local speech recognition, used to check every narrated line
# usage: zsh setup_tts.sh            (needs uv: https://docs.astral.sh/uv/)
set -euo pipefail
V=~/.cache/family-migration-story/venv
if [[ -x $V/bin/python ]] && $V/bin/python -c "import yazgi_tts, faster_whisper" 2>/dev/null; then
  echo "already set up: $V"; exit 0
fi
command -v uv >/dev/null || { echo "uv is required (brew install uv)"; exit 1; }
mkdir -p ~/.cache/family-migration-story
uv venv --python 3.12 $V
uv pip install --python $V/bin/python \
  "yazgi-tts[hub] @ https://huggingface.co/erkamk/yazgi-tts-1/resolve/main/dist/yazgi_tts-0.1.0-py3-none-any.whl" \
  soundfile faster-whisper numpy
$V/bin/python -c "import yazgi_tts, faster_whisper; print('ok')"
echo "venv ready: $V   (the first synthesis downloads the model)"
