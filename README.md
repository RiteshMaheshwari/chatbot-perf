# LLM Chat Benchmark

LLM Chat Benchmark is a browser-based benchmarking project for measuring real user chat performance on AI chatbot web apps such as ChatGPT, Claude, Gemini, and Perplexity.
It includes:

- a Chrome / Edge extension
- a Firefox extension
- a shared browser-agnostic timing core used by both extensions

The repository is open source under the [MIT License](./LICENSE).

## Supported Surface

The supported public surface is:

- [extensions/chrome](./extensions/chrome): Chrome / Edge extension
- [extensions/firefox](./extensions/firefox): Firefox extension
- [shared](./shared): canonical shared timing and sample-transfer source
- [docs](./docs): supporting explainer pages and repo-facing documentation

Out of scope for the first public pass:

- `dist/`: generated release artifacts only, not source of truth
- any future datasets, hosted services, or internal analysis tooling

## Repo Map

- [extensions/chrome](./extensions/chrome): Chrome / Edge extension source, store docs, screenshots, and packaging script
- [extensions/firefox](./extensions/firefox): Firefox extension source, AMO docs, screenshots, and packaging script
- [shared](./shared): single canonical source for code duplicated into both browser extensions
- [docs](./docs): standalone explainer/dashboard HTML docs kept outside the extension packages

## Current Status

- Browser extensions are local-only in their shipped configuration.
- The current shared-source extraction uses a simple sync script instead of a bundler.
- Packaging scripts exist per browser for store-ready artifacts.
- The repository is MIT-licensed, while any future hosted backend/data pipeline remains intentionally separate from this repo.

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

## Reporting And Contributions

- [CONTRIBUTING.md](./CONTRIBUTING.md): setup, boundaries, and issue guidance
- [SECURITY.md](./SECURITY.md): how to report security-sensitive issues safely
- [docs/SMOKE_TESTS.md](./docs/SMOKE_TESTS.md): manual smoke-test checklist for browser verification

## TODO

- Add browser name and browser version to stored/exported benchmark samples in a future schema revision so cross-browser analysis is easier after import/export.
- Revisit whether `Apache-2.0` would be a better long-term fit if the shared library becomes a larger standalone project with broader outside contribution.
