#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "$script_dir/.." && pwd)"

cmp -s "$repo_dir/shared/lib/llm-timing-core.js" "$repo_dir/extensions/chrome/lib/llm-timing-core.js"
cmp -s "$repo_dir/shared/lib/llm-timing-core.js" "$repo_dir/extensions/firefox/lib/llm-timing-core.js"
cmp -s "$repo_dir/shared/lib/sample-transfer.js" "$repo_dir/extensions/chrome/lib/sample-transfer.js"
cmp -s "$repo_dir/shared/lib/sample-transfer.js" "$repo_dir/extensions/firefox/lib/sample-transfer.js"

printf 'Shared libs match generated extension copies.\n'
