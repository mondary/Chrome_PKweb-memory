#!/usr/bin/env bash
set -euo pipefail

# Publication Chrome Web Store (API v2) — même protocole que Chrome_PKshortcuts.
# Identifiants dans secrets/.env (jamais commité). Usage :
#   ./scripts/publish-cws.sh                     # upload + publish + statut
#   CWS_SKIP_PUBLISH=1 ./scripts/publish-cws.sh  # upload seul

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$ROOT_DIR/extension"
ARTIFACT_DIR="$ROOT_DIR/release"
cd "$ROOT_DIR"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Commande manquante : $1" >&2
    exit 1
  fi
}

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Variable manquante : $name (remplir secrets/.env)" >&2
    exit 1
  fi
}

parse_json_field() {
  local field="$1"
  node -e "
let input = '';
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const value = data['$field'];
    if (value === undefined || value === null || value === '') process.exit(2);
    process.stdout.write(String(value));
  } catch (err) {
    process.exit(3);
  }
});
"
}

require_cmd curl
require_cmd zip
require_cmd node

if [[ ! -f "$SOURCE_DIR/manifest.json" ]]; then
  echo "Manifest introuvable : $SOURCE_DIR/manifest.json" >&2
  exit 1
fi

if [[ -f secrets/.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source secrets/.env
  set +a
fi

require_var CWS_PUBLISHER_ID
require_var CWS_EXTENSION_ID
require_var CWS_CLIENT_ID
require_var CWS_CLIENT_SECRET
require_var CWS_REFRESH_TOKEN

CWS_PUBLISH_TYPE="${CWS_PUBLISH_TYPE:-DEFAULT_PUBLISH}"
CWS_SKIP_PUBLISH="${CWS_SKIP_PUBLISH:-0}"

EXT_VERSION="$(node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('$SOURCE_DIR/manifest.json','utf8'));process.stdout.write(m.version_name || m.version)")"
mkdir -p "$ARTIFACT_DIR"
ZIP_FILE="${CWS_ZIP_FILE:-release/${CWS_EXTENSION_ID}-${EXT_VERSION}.zip}"
ZIP_FILE_ABS="$ROOT_DIR/$ZIP_FILE"

echo "Empaquetage de extension/ : $ZIP_FILE_ABS"
cd "$SOURCE_DIR"
rm -f "$ZIP_FILE_ABS"
zip -r -q "$ZIP_FILE_ABS" . -x 'tests/*' -x '*.DS_Store' -x 'release.zip'
cd "$ROOT_DIR"

echo "Demande de jeton OAuth..."
TOKEN_RESPONSE="$(
  curl -sS "https://oauth2.googleapis.com/token" \
    -d "client_id=$CWS_CLIENT_ID" \
    -d "client_secret=$CWS_CLIENT_SECRET" \
    -d "refresh_token=$CWS_REFRESH_TOKEN" \
    -d "grant_type=refresh_token"
)"

if ! ACCESS_TOKEN="$(printf '%s' "$TOKEN_RESPONSE" | parse_json_field access_token)"; then
  echo "Échec du jeton d'accès. Réponse OAuth :" >&2
  echo "$TOKEN_RESPONSE" >&2
  exit 1
fi

UPLOAD_URL="https://chromewebstore.googleapis.com/upload/v2/publishers/${CWS_PUBLISHER_ID}/items/${CWS_EXTENSION_ID}:upload"
echo "Upload du ZIP ($EXT_VERSION)..."
UPLOAD_RESPONSE="$(
  curl -sS -w $'\n%{http_code}' \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/zip" \
    -X POST \
    -T "$ZIP_FILE_ABS" \
    "$UPLOAD_URL"
)"

UPLOAD_HTTP="${UPLOAD_RESPONSE##*$'\n'}"
UPLOAD_BODY="${UPLOAD_RESPONSE%$'\n'*}"
if [[ ! "$UPLOAD_HTTP" =~ ^2 ]]; then
  echo "Échec de l'upload (HTTP $UPLOAD_HTTP) :" >&2
  echo "$UPLOAD_BODY" >&2
  exit 1
fi
echo "Upload OK."
echo "$UPLOAD_BODY"

if [[ "$CWS_SKIP_PUBLISH" == "1" ]]; then
  echo "CWS_SKIP_PUBLISH=1 -> upload seul, publication ignorée."
  exit 0
fi

PUBLISH_URL="https://chromewebstore.googleapis.com/v2/publishers/${CWS_PUBLISHER_ID}/items/${CWS_EXTENSION_ID}:publish"
echo "Publication..."
PUBLISH_RESPONSE="$(
  curl -sS -w $'\n%{http_code}' \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -X POST \
    -d "{\"publishType\":\"${CWS_PUBLISH_TYPE}\"}" \
    "$PUBLISH_URL"
)"

PUBLISH_HTTP="${PUBLISH_RESPONSE##*$'\n'}"
PUBLISH_BODY="${PUBLISH_RESPONSE%$'\n'*}"
if [[ ! "$PUBLISH_HTTP" =~ ^2 ]]; then
  echo "Échec de la publication (HTTP $PUBLISH_HTTP) :" >&2
  echo "$PUBLISH_BODY" >&2
  exit 1
fi
echo "Publication OK."
echo "$PUBLISH_BODY"

STATUS_URL="https://chromewebstore.googleapis.com/v2/publishers/${CWS_PUBLISHER_ID}/items/${CWS_EXTENSION_ID}:fetchStatus"
echo "Statut :"
curl -sS \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$STATUS_URL"
echo
