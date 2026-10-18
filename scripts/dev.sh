#!/usr/bin/env bash
# Synchronise extension/ vers le dossier de développement stable chargé par Chrome.
#
# Pourquoi : chargée depuis ce dépôt, l'extension non empaquetée voit ses
# fichiers bouger à chaque git/test/modification — Chrome la marque « modifiée »
# et la désactive ou l'oublie au redémarrage. Le dossier stable, lui, ne change
# que quand ce script tourne, juste avant un rechargement volontaire.
#
# Usage :
#   bash scripts/dev.sh              # synchronise et rappelle la procédure
#   bash scripts/dev.sh --path       # affiche seulement le chemin à charger
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/extension"
DEST="${PK_WEB_MEMORY_DEV_DIR:-$HOME/dev/pk-web-memory-extension}"

if [[ "${1:-}" == "--path" ]]; then
  echo "$DEST"
  exit 0
fi

mkdir -p "$DEST"
rsync -a --delete \
  --exclude 'tests/' \
  --exclude 'release.zip' \
  --exclude '.DS_Store' \
  "$SRC/" "$DEST/"

VERSION="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['version_name'])" "$DEST/manifest.json")"
FILES="$(find "$DEST" -type f | wc -l | tr -d ' ')"

echo "✅ $DEST"
echo "   version $VERSION · $FILES fichiers synchronisés (tests et zip exclus)"
echo
echo "→ chrome://extensions → bouton ↻ sur PK Web Memory. Pas besoin de quitter Chrome."
echo "  Premier chargement seulement : « Charger l'extension non empaquetée » → ⌘⇧G → $DEST"
