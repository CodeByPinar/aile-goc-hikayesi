#!/bin/zsh
# Technical checks on a rendered video: duration, loudness, long silences, and text jitter.
# usage: zsh qa_video.sh out/master.mp4 [t1 t2 ...]   (t = seconds to sample for the jitter check; default 20 60)
set -uo pipefail
f=$1; shift
if (( $# )); then ts=("$@"); else ts=(20 60); fi
echo "== $(basename $f)"
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate -of compact=p=0 "$f"
echo "== loudness (target: integrated -16 LUFS, true peak below -1 dBTP)"
ffmpeg -nostats -i "$f" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I:|Peak:)" | tail -2
echo "== silences over 3.5 s (expected only at chapter cards and the end)"
ffmpeg -nostats -i "$f" -af silencedetect=n=-45dB:d=3.5 -f null - 2>&1 | grep -o "silence_start: [0-9.]*" | sed 's/silence_start: /  at /'
echo "== jitter: subtitle band of consecutive frames (inf or > 45 dB = steady text)"
tmp=$(mktemp -d)
for t in $ts; do
  ffmpeg -v error -ss $t -i "$f" -frames:v 2 -vf "crop=iw*0.78:ih*0.14:iw*0.11:ih*0.79" "$tmp/f%d.png"
  p=$(ffmpeg -hide_banner -i "$tmp/f1.png" -i "$tmp/f2.png" -lavfi psnr -f null - 2>&1 | grep -o "average:[a-z0-9.]*")
  echo "  t=${t}s  $p"
done
rm -rf "$tmp"
