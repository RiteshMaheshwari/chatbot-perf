# LLM Chat Benchmark

Chrome and Edge extension for real user monitoring of LLM-based chatbots such as:

- ChatGPT
- Claude
- Gemini
- Perplexity

It captures:

- Time to first word (TTFW)
- Time to last word (TTLW)
- Streaming speed in words per second (WPS)
- Prompt input size
- Basic page/runtime context such as site, model, timezone, and visibility state

## Features

- Floating in-page overlay with live timing state, top-level stall metric, and the latest completed run
- Popup dashboard with summary metrics, charts, model grouping, and recent runs
- JSON export and import for restoring history after reinstall
- Dedicated raw-data page for inspecting full local sample JSON without exporting
- Multi-site DOM adapters on top of a reusable timing core library

## Architecture

The extension is split into layers:

- Canonical shared source: [shared/README.md](../../shared/README.md)
- Generated shared libs: [llm-timing-core.js](./lib/llm-timing-core.js), [sample-transfer.js](./lib/sample-transfer.js)
- Overlay UI: [content-overlay.js](./content-overlay.js)
- Site adapter and local persistence: [content.js](./content.js)
- Popup UI: [popup.html](./popup.html), [popup.js](./popup.js), [popup.css](./popup.css)
- Import flow: [import.html](./import.html), [import.js](./import.js), [import.css](./import.css)
- Raw-data viewer: [raw-data.html](./raw-data.html), [raw-data.js](./raw-data.js), [raw-data.css](./raw-data.css)

## Load In Chrome

1. Open `chrome://extensions`.
2. Turn on `Developer mode`.
3. Click `Load unpacked`.
4. Select the [chrome](./) extension directory.

Reload the unpacked extension after manifest or shared-lib changes.

## Release Prep

- Chrome Web Store checklist: [CHROME_STORE_SUBMISSION.md](./CHROME_STORE_SUBMISSION.md)
- Privacy policy: [PRIVACY_POLICY.md](./PRIVACY_POLICY.md)
- Packaging script: [scripts/package-cws.sh](./scripts/package-cws.sh)
- Shared-source sync: [scripts/sync-shared-libs.sh](../../scripts/sync-shared-libs.sh)

## Storage Keys

- Samples: `chatgpt_ttfw_samples`
- Overlay settings: `chatgpt_ttfw_overlay_settings`

## Import And Export

- Export is available from the popup.
- Import opens a dedicated extension page so the popup closing does not interrupt file selection.
- Raw Data opens a dedicated extension page that shows the full locally stored JSON.
- Exported files exclude sensitive fields such as prompt preview, page URL, and page title when present in older stored or imported samples.

## Timing Notes

- TTFW uses visible rendered text, not raw DOM text.
- Placeholder/search-status phrases such as `Searching the web` and `Working` are ignored.
- For structured responses, timing waits for actual answer content rather than generic assistant wrappers.
- TTLW finalizes after streaming stops and content has settled for a site-specific delay.
- Stall/jitter metrics are captured as `longestStallMs`, `stallCount500Ms`, `stallCount1000Ms`, and `p95InterChunkGapMs`.
- Stall only counts true idle pauses after the first visible word. Time where the model is still actively thinking, searching, or otherwise working is excluded.
- The overlay surfaces live `Waiting...`, `Streaming`, and `Finishing` states, plus a top-level `Stall` value.
- This build stores timing history locally only. It does not upload remote telemetry.

## Chrome Notes

- This clone uses a Chrome-native MV3 manifest.

## Caveats

- DOM heuristics can break when ChatGPT, Claude, Gemini, or Perplexity change markup.
- Remote telemetry collection is intentionally removed from the shipped extension for now.
