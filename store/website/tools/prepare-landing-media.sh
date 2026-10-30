#!/usr/bin/env bash
# Reuses the real, fictional-data loop recording. Never opens the user's browser.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="$ROOT/store/website/media"
mkdir -p "$OUT"
# Full v4 loop (cursor included): inventory → ⌘K palette → “design” → results → click.
# Starts on the crisp inventory view, not on a blurred frame.
cp "$ROOT/store/v4/gifs/pk-web-memory-large.gif" "$OUT/demo.gif"
ffmpeg -y -v error -i "$OUT/demo.gif" -frames:v 1 "$OUT/demo-poster.png"
# Crop blank left margins only, preserve source resolution and real UI.
magick "$ROOT/store/website/screenshots/06-sessions.png" -crop 1250x900+190+0 +repage "$OUT/sessions.png"
magick "$ROOT/store/website/screenshots/01-inventaire.png" -crop 1250x900+190+0 +repage "$OUT/bookmarks.png"
rm -f "$OUT/search.gif" "$OUT/search-poster.png"
echo "Landing media: $OUT"
