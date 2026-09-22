#!/usr/bin/env bash
#
# Example: bulk-insert projects into your local DevOS SQLite database.
#
# Useful when you have 20+ projects and don't want to click "New Project"
# twenty times. Edit the paths below to point at *your* projects, then run.
#
# Close DevOS first — the DB is locked while the app is running.

set -euo pipefail

DB="$HOME/.local/share/dev.devos.app/devos.db"
[ -f "$DB" ] || { echo "No DB at $DB — launch DevOS once, close it, rerun."; exit 1; }

add() {
  local name="$1" path="$2" kind="$3" color="$4" tags="$5"
  sqlite3 "$DB" "INSERT OR IGNORE INTO projects (id, name, path, kind, color, tags, favorite, last_opened_at, created_at)
                 VALUES (lower(hex(randomblob(16))), '$name', '$path', '$kind', '$color', '$tags', 0, NULL, datetime('now'));"
  printf '  + %-32s %s\n' "$name" "$path"
}

# ---- edit these ----------------------------------------------------------
add "my-api"      "$HOME/code/my-api"      node   "#5b8cff" '["backend"]'
add "my-frontend" "$HOME/code/my-frontend" node   "#a479ff" '["frontend"]'
# --------------------------------------------------------------------------

echo "Done."
