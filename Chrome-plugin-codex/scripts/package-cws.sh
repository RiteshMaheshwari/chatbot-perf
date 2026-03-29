#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
package_dir="$(cd "$script_dir/.." && pwd)"
output_dir="${1:-"$package_dir/../dist"}"
output_file="$output_dir/llm-chat-benchmark-chrome.zip"
temp_dir="$(mktemp -d)"

"$package_dir/../scripts/sync-shared-libs.sh"

cleanup() {
  rm -rf "$temp_dir"
}

trap cleanup EXIT

mkdir -p "$output_dir"

rsync -a \
  --exclude '.DS_Store' \
  --exclude 'icon.svg.png' \
  --exclude 'CHROME_STORE_SUBMISSION.md' \
  --exclude 'scripts' \
  --exclude 'web-ext-artifacts' \
  "$package_dir"/ \
  "$temp_dir"/

(cd "$temp_dir" && zip -qr "$output_file" .)

printf '%s\n' "$output_file"
