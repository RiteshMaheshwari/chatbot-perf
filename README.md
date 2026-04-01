# LLM Chat Benchmark

LLM Chat Benchmark measures real user chat performance for AI chatbot web apps such as ChatGPT, Claude, Gemini, and Perplexity.

It includes:

- a Chrome / Edge extension
- a Firefox extension
- a shared browser-agnostic timing core used by both extensions

The repository is open source under the [MIT License](./LICENSE).

## What It Measures

The extensions focus on the chat UI experience, not backend-only model timings.

Core metrics include:

- `TTFW` (time to first word)
- `TTLW` (time to last word)
- `WPS` (streaming words per second)
- `longestStallMs`
- response word count
- prompt word count

The project also captures enough context to compare runs across:

- ChatGPT
- Claude
- Gemini
- Perplexity

If you want a clearer walkthrough of what these metrics mean, read the hosted explainer:

- [Metrics Explainer](https://riteshmaheshwari.github.io/chatbot-perf/metrics-explainer.html)

## What The Code In This Repo Is For

- [extensions/chrome](./extensions/chrome): Chrome / Edge extension source
- [extensions/firefox](./extensions/firefox): Firefox extension source
- [shared](./shared): canonical timing core and shared sample-transfer logic
- [docs](./docs): hosted explainer and dashboard pages plus smoke-test docs

## Install And Use

### Chrome / Edge

1. Open `chrome://extensions` or `edge://extensions`.
2. Turn on `Developer mode`.
3. Click `Load unpacked`.
4. Select [extensions/chrome](./extensions/chrome).

More details:
- [extensions/chrome/README.md](./extensions/chrome/README.md)

### Firefox

1. Open `about:debugging`.
2. Choose `This Firefox`.
3. Click `Load Temporary Add-on...`.
4. Select [manifest.json](./extensions/firefox/manifest.json).

More details:
- [extensions/firefox/README.md](./extensions/firefox/README.md)

### What You’ll See

After loading the extension on a supported chatbot site, you get:

- a floating in-page overlay with live status and top-level metrics
- a popup dashboard with recent runs and summary stats
- JSON export/import for restoring local history
- a raw-data viewer for inspecting locally stored samples

## Hosted Docs

This repo includes two standalone docs pages:

- [Metrics Explainer](./docs/metrics-explainer.html)
- [Metric Dashboard](./docs/ttfw-dashboard.html)

Once GitHub Pages is enabled for the `docs/` folder, these can also be hosted publicly from:

- `/metrics-explainer.html`
- `/ttfw-dashboard.html`

A simple docs landing page is available at:

- [docs/index.html](./docs/index.html)

## Development

From the repo root:

```bash
npm run sync:shared
npm run check:shared
npm run test:shared-core
npm run verify:extensions
```

Packaging scripts:

- [extensions/chrome/scripts/package-cws.sh](./extensions/chrome/scripts/package-cws.sh)
- [extensions/firefox/scripts/package-amo.sh](./extensions/firefox/scripts/package-amo.sh)

Manual smoke-test checklist:

- [docs/SMOKE_TESTS.md](./docs/SMOKE_TESTS.md)

## Contributing And Security

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [SECURITY.md](./SECURITY.md)

## TODO

- Add browser name and browser version to stored/exported benchmark samples in a future schema revision so cross-browser analysis is easier after import/export.
