#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IGNORE_FILE="$ROOT_DIR/scripts/metrics-ignore.txt"

if [[ ! -f "$IGNORE_FILE" ]]; then
  echo "Missing metrics ignore file at $IGNORE_FILE" >&2
  exit 1
fi

mapfile -t IGNORE_DIRS < <(grep -vE '^\s*(#|$)' "$IGNORE_FILE")
if [[ ${#IGNORE_DIRS[@]} -eq 0 ]]; then
  echo "No ignore entries found in $IGNORE_FILE" >&2
  exit 1
fi

EXCLUDE_DIRS=$(IFS=,; echo "${IGNORE_DIRS[*]}")

echo "== scc (size) =="
scc --exclude-dir "$EXCLUDE_DIRS" "$ROOT_DIR"

echo "== lizard (complexity) =="
LIZARD_EXCLUDES=()
for dir in "${IGNORE_DIRS[@]}"; do
  LIZARD_EXCLUDES+=("-x" "*/${dir}/*")
done

lizard -C 25 -L 300 "${LIZARD_EXCLUDES[@]}" "$ROOT_DIR"
