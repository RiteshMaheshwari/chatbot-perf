# Contributing

Thanks for your interest in LLM Chat Benchmark.

This repository is currently in a public-readiness phase and remains **All Rights Reserved**. The code is being organized for a possible future open-source release, but external contributions are not being accepted as pull requests yet.

## What is useful right now

- bug reports with reproduction steps
- issues describing site breakage after chatbot UI changes
- suggestions for metrics, UX, or documentation improvements

## Before sending changes

- confirm whether the change belongs to the supported surface:
  - Chrome extension
  - Firefox extension
  - shared timing library
- avoid coupling browser-specific behavior into the shared timing core
- keep privacy-sensitive behavior conservative by default

## Development expectations

- verify both browser packages still parse after shared-source changes
- keep the shared source as the canonical implementation
- use the sync script before packaging browser builds
- update docs when behavior, metrics, or packaging changes

If contribution policy changes in the future, this file will be updated.
