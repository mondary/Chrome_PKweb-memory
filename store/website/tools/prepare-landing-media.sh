#!/usr/bin/env bash
# Reuses a real, fictional-data recording. Never opens the user's browser.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="$ROOT/store/website/media"
mkdir -p "$OUT"
SOURCE="$ROOT/store/v4/videos/pk-web-memory-promo.mp4"
# Focus on the search palette instead of scaling the entire 1280 px UI down.
ffmpeg -y -v error -ss 1.4 -t 2.6 -i "$SOURCE" \
  -vf "crop=960:720:160:40,setpts=1.25*PTS,tpad=stop_mode=clone:stop_duration=1.5,fps=12,split[a][b];[a]palettegen=max_colors=192[p];[b][p]paletteuse=dither=bayer:bayer_scale=3" \
  -loop 0 "$OUT/search.gif"
ffmpeg -y -v error -ss 2.8 -i "$SOURCE" -frames:v 1 \
  -vf "crop=960:720:160:40" "$OUT/search-poster.png"
# Crop blank left margins only, preserve source resolution and real UI.
magick "$ROOT/store/website/screenshots/06-sessions.png" -crop 1250x900+190+0 +repage "$OUT/sessions.png"
magick "$ROOT/store/website/screenshots/01-inventaire.png" -crop 1250x900+190+0 +repage "$OUT/bookmarks.png"
echo "Landing media: $OUT"
