# Contributing

Thanks for your interest in LLM Chat Benchmark.
This repository is open source under the [MIT License](./LICENSE).

## What is useful right now

- bug reports with reproduction steps
- issues describing site breakage after chatbot UI changes
- suggestions for metrics, UX, or documentation improvements
- focused pull requests that stay within the supported surface

## Repo layout

- [extensions/chrome](./extensions/chrome): Chrome / Edge extension
- [extensions/firefox](./extensions/firefox): Firefox extension
- [shared](./shared): canonical shared timing and sample-transfer source
- [docs](./docs): supporting documentation and manual smoke-test checklist
- [fixtures](./fixtures): narrow development fixtures used for adapters and tests

## Local setup

From the repo root:

```bash
npm run sync:shared
npm run check:shared
npm run test:shared-core
npm run verify:extensions
```

If you are changing extension-facing behavior, also run through the relevant parts of:

- [docs/SMOKE_TESTS.md](./docs/SMOKE_TESTS.md)

## Before sending changes

- confirm whether the change belongs to the supported surface:
  - Chrome extension
  - Firefox extension
  - shared timing library
- avoid coupling browser-specific behavior into the shared timing core
- keep privacy-sensitive behavior conservative by default
- discuss larger refactors or new product directions in an issue first

## Development expectations

- verify both browser packages still parse after shared-source changes
- keep the shared source as the canonical implementation
- use the sync script before packaging browser builds
- update docs when behavior, metrics, or packaging changes
- prefer narrowly scoped changes over wide cleanups

## Change boundaries

The shared timing source should stay focused on:

- text normalization and noise stripping
- word counting
- timing and stall metric calculation
- import/export normalization that is genuinely shared

Keep these in the browser extensions, not in [shared](./shared):

- DOM selectors and site adapters
- browser storage and extension messaging
- overlay rendering
- popup UI and store-specific packaging logic

## Issues

The preferred way to start is to open a well-scoped issue for bugs, site breakage, or larger proposed changes:

- use `Bug report` for general defects
- use `Site breakage` when a chatbot UI change breaks capture behavior

Please include browser, browser version, site, repro steps, and screenshots or sample data when possible.

## Pull requests

- keep changes narrowly scoped
- update docs when behavior, metrics, or packaging changes
- avoid mixing product changes with broad repo cleanup
- mention any manual browser verification you ran

Small targeted fixes are preferred over large speculative changes.
