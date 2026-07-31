#!/bin/zsh
set -euo pipefail

cd -- "$(dirname "$0")"

PORT="${FRAMEPUZZLE_PORT:-5500}"
while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

URL="http://127.0.0.1:${PORT}/"

printf "\nFramePuzzle Studio for macOS\n"
printf "Serving: %s\n" "$PWD"
printf "Open: %s\n\n" "$URL"
printf "Keep this Terminal window open while using the app.\n"
printf "Press Control-C to stop the server.\n\n"

(sleep 0.8; open "$URL") &
python3 -m http.server "$PORT" --bind 127.0.0.1
