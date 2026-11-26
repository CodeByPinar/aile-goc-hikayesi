#!/bin/zsh
# Encode the delivery copies from the Remotion master with broadcast loudness (-16 LUFS, -1.5 dBTP):
#   <name>.mp4      1080p, for desktop / YouTube
#   <name>-720p.mp4 small enough for messaging apps (aim under ~30 MB for a 10-minute film)
# usage: zsh deliver.sh out/master.mp4 out/<name>
set -euo pipefail
src=$1; base=$2
ffmpeg -y -v error -nostats -i "$src" -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -movflags +faststart \
  -af loudnorm=I=-16:TP=-1.5:LRA=11 -c:a aac -b:a 160k "$base.mp4"
ffmpeg -y -v error -nostats -i "$src" -vf scale=1280:720:flags=lanczos -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p \
  -movflags +faststart -af loudnorm=I=-16:TP=-1.5:LRA=11 -c:a aac -b:a 96k "$base-720p.mp4"
ls -lh "$base.mp4" "$base-720p.mp4"
