# LLM Chat Benchmark

LLM Chat Benchmark is a browser-based benchmarking project for measuring real user chat performance on AI chatbot web apps such as ChatGPT, Claude, Gemini, and Perplexity.

This repo is being prepared for an eventual open-source release of the browser plugins and the shared timing library. It is **not open source yet** and remains **All Rights Reserved** for now. A future relicense may happen after the repo structure and public surface are finalized.

## Supported Surface

The public supported surface for this preparation pass is:

- [Chrome-plugin-codex](/Users/rndm/Code/chatbot-perf/Chrome-plugin-codex): Chrome / Edge extension
- [Firefox-plugin-codex](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex): Firefox extension
- [shared](/Users/rndm/Code/chatbot-perf/shared): canonical shared timing and sample-transfer source
- [assets](/Users/rndm/Code/chatbot-perf/assets): diagrams and explanatory assets directly related to the extensions
- [docs](/Users/rndm/Code/chatbot-perf/docs): supporting explainer pages and repo-facing documentation
- [fixtures](/Users/rndm/Code/chatbot-perf/fixtures): narrow development fixtures used to validate adapters and timing behavior

Out of scope for the first public pass:

- [backend/cloudflare-telemetry-worker](/Users/rndm/Code/chatbot-perf/backend/cloudflare-telemetry-worker): experimental backend scaffold, not part of the supported client surface
- [dist](/Users/rndm/Code/chatbot-perf/dist): generated release artifacts only, not source of truth
- any future datasets, hosted services, or internal analysis tooling

## Repo Map

- [Chrome-plugin-codex](/Users/rndm/Code/chatbot-perf/Chrome-plugin-codex): Chrome / Edge extension source, store docs, screenshots, and packaging script
- [Firefox-plugin-codex](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex): Firefox extension source, AMO docs, screenshots, and packaging script
- [shared](/Users/rndm/Code/chatbot-perf/shared): single canonical source for code duplicated into both browser extensions
- [assets/ttfw-diagrams](/Users/rndm/Code/chatbot-perf/assets/ttfw-diagrams): diagrams explaining TTFW, TTLW, WPS, and request/response flow
- [docs](/Users/rndm/Code/chatbot-perf/docs): standalone explainer/dashboard HTML docs kept outside the extension packages
- [fixtures/site-captures](/Users/rndm/Code/chatbot-perf/fixtures/site-captures): captured development fixtures such as Gemini markup samples
- [backend/cloudflare-telemetry-worker](/Users/rndm/Code/chatbot-perf/backend/cloudflare-telemetry-worker): optional experimental ingest scaffold, intentionally unsupported for the public client release path

## Current Status

- Browser extensions are local-only in their shipped configuration.
- The current shared-source extraction uses a simple sync script instead of a bundler.
- The backend scaffold is intentionally excluded from the supported public client story.
- Packaging scripts exist per browser for store-ready artifacts.

## Development Commands

The repo uses Node's built-in tooling and simple shell scripts for verification.

```bash
npm run sync:shared
npm run check:shared
npm run test:shared-core
npm run verify:extensions
```

Browser packaging remains per extension:

- [Chrome-plugin-codex/scripts/package-cws.sh](/Users/rndm/Code/chatbot-perf/Chrome-plugin-codex/scripts/package-cws.sh)
- [Firefox-plugin-codex/scripts/package-amo.sh](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/scripts/package-amo.sh)

## Verification

For major repo changes, verify:

- both extensions still pass syntax checks
- shared-source sync produces identical generated copies in both browser packages
- packaging scripts still build upload artifacts
- manual browser smoke tests still pass before publishing

## TODO

- Add browser name and browser version to stored/exported benchmark samples in a future schema revision so cross-browser analysis is easier after import/export.
