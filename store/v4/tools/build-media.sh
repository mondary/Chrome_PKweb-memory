#!/usr/bin/env bash
# PK Web Memory — kit v4 : assemblage des GIF + MP4 depuis anim/frames-fixed/
# (frames déjà compositées avec le curseur par capture-v4.mjs).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."   # -> store/v4
mkdir -p gifs videos assets
FRAMES=anim/frames-fixed
[ -f "$FRAMES/frame_0001.png" ] || { echo "Frames absentes : lancer d'abord node store/v4/tools/capture-v4.mjs" >&2; exit 1; }

ffmpeg -y -loglevel error -framerate 12 -i "$FRAMES/frame_%04d.png" \
  -c:v libx264 -pix_fmt yuv420p -crf 19 -preset slow -movflags +faststart \
  videos/pk-web-memory-promo.mp4

ffmpeg -y -loglevel error -framerate 12 -i "$FRAMES/frame_%04d.png" \
  -vf "fps=11,scale=1024:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=192[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" \
  -loop 0 gifs/pk-web-memory-large.gif

ffmpeg -y -loglevel error -framerate 12 -i "$FRAMES/frame_%04d.png" \
  -vf "fps=10,scale=560:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=160[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" \
  -loop 0 gifs/pk-web-memory-compact.gif

magick ../../extension/icons/icon128.png -resize 128x128 assets/icon128.png

echo "— Livrables —"
du -h gifs/*.gif videos/*.mp4 assets/*.png | sort
for f in assets/*.png; do printf "%s " "$f"; sips -g pixelWidth -g pixelHeight "$f" | awk '/pixelWidth|pixelHeight/{printf "%s ", $2}'; echo; done
