#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "$script_dir/.." && pwd)"
shared_dir="$repo_dir/shared/lib"

targets=(
  "$repo_dir/Chrome-plugin-codex/lib"
  "$repo_dir/Firefox-plugin-codex/lib"
)

for target in "${targets[@]}"; do
  mkdir -p "$target"
  cp "$shared_dir/llm-timing-core.js" "$target/llm-timing-core.js"
  cp "$shared_dir/sample-transfer.js" "$target/sample-transfer.js"
done

printf 'Synced shared libs to browser extensions.\n'
