#!/bin/zsh
# Copy the Remotion template into a new project folder and install it.
# usage: zsh new_project.sh <dir>
set -euo pipefail
here=${0:A:h}
dst=$1
[[ -e $dst/package.json ]] && { echo "$dst already has a project"; exit 1; }
mkdir -p $dst
cp -R $here/../assets/template/. $dst/
cd $dst && npm ci --loglevel=error --no-audit --no-fund
echo "project ready: $dst  (fill src/data/*.json, then: npm run geo && npm run check)"
