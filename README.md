# LLM Chat Benchmark

LLM Chat Benchmark is a browser-based benchmarking project for measuring real user chat performance on AI chatbot web apps such as ChatGPT, Claude, Gemini, and Perplexity.

This repo is being prepared for an eventual open-source release of the browser plugins and the shared timing library. It is **not open source yet** and remains **All Rights Reserved** for now. A future relicense may happen after the repo structure and public surface are finalized.

## Supported Surface

The public supported surface for this preparation pass is:

- [extensions/chrome](./extensions/chrome): Chrome / Edge extension
- [extensions/firefox](./extensions/firefox): Firefox extension
- [shared](./shared): canonical shared timing and sample-transfer source
- [assets](./assets): diagrams and explanatory assets directly related to the extensions
- [docs](./docs): supporting explainer pages and repo-facing documentation
- [fixtures](./fixtures): narrow development fixtures used to validate adapters and timing behavior

Out of scope for the first public pass:

- [backend/cloudflare-telemetry-worker](./backend/cloudflare-telemetry-worker): experimental backend scaffold, not part of the supported client surface
- `dist/`: generated release artifacts only, not source of truth
- any future datasets, hosted services, or internal analysis tooling

## Repo Map

- [extensions/chrome](./extensions/chrome): Chrome / Edge extension source, store docs, screenshots, and packaging script
- [extensions/firefox](./extensions/firefox): Firefox extension source, AMO docs, screenshots, and packaging script
- [shared](./shared): single canonical source for code duplicated into both browser extensions
- [assets/ttfw-diagrams](./assets/ttfw-diagrams): diagrams explaining TTFW, TTLW, WPS, and request/response flow
- [docs](./docs): standalone explainer/dashboard HTML docs kept outside the extension packages
- [fixtures/site-captures](./fixtures/site-captures): captured development fixtures such as Gemini markup samples
- [backend/cloudflare-telemetry-worker](./backend/cloudflare-telemetry-worker): optional experimental ingest scaffold, intentionally unsupported for the public client release path

## Current Status

- Browser extensions are local-only in their shipped configuration.
- The current shared-source extraction uses a simple sync script instead of a bundler.
- The backend scaffold is intentionally excluded from the supported public client story.
- Packaging scripts exist per browser for store-ready artifacts.

## Quick Start

1. Sync the shared library copies into both extensions.
2. Run the shared checks and tests.
3. Load either browser extension from the `extensions/` directory.

```bash
npm run sync:shared
npm run check:shared
npm run test:shared-core
```

For browser-specific packaging and smoke testing, see:

- [extensions/chrome/README.md](./extensions/chrome/README.md)
- [extensions/firefox/README.md](./extensions/firefox/README.md)
- [docs/SMOKE_TESTS.md](./docs/SMOKE_TESTS.md)

## Development Commands

The repo uses Node's built-in tooling and simple shell scripts for verification.

```bash
npm run sync:shared
npm run check:shared
npm run test:shared-core
npm run verify:extensions
```

Browser packaging remains per extension:

- [extensions/chrome/scripts/package-cws.sh](./extensions/chrome/scripts/package-cws.sh)
- [extensions/firefox/scripts/package-amo.sh](./extensions/firefox/scripts/package-amo.sh)
- [docs/SMOKE_TESTS.md](./docs/SMOKE_TESTS.md): manual browser verification checklist

## Verification

For major repo changes, verify:

- both extensions still pass syntax checks
- shared-source sync produces identical generated copies in both browser packages
- packaging scripts still build upload artifacts
- manual browser smoke tests still pass before publishing

## TODO

- Add browser name and browser version to stored/exported benchmark samples in a future schema revision so cross-browser analysis is easier after import/export.
