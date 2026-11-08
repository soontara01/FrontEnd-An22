#!/usr/bin/env bash
# snap.sh <name> [seq] — copy a Claude in Chrome screenshot (given sequence number, else the newest) to img/<name>.<ext>
set -euo pipefail
list=$(ls /tmp/claude-chrome-screenshots-*/screenshot-* | awk -F- '{n=$NF; sub(/\..*/,"",n); print n"\t"$0}' | sort -n)
if [[ -n "${2:-}" ]]; then src=$(awk -F'\t' -v s="$2" '$1==s{print $2}' <<<"$list"); else src=$(tail -1 <<<"$list" | cut -f2); fi
cp "$src" "$(dirname "$0")/../img/$1.${src##*.}"
echo "$1.${src##*.} <- $(basename "$src")"
