# LLM Chat Benchmark

Firefox extension for real user monitoring of LLM based chatbots like:

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

Real user monitoring for LLM based chatbots like ChatGPT, Gemini, Perplexity and Claude.

## Features

- Floating in-page overlay with live timing state, top-level stall metric, and the latest completed run
- Popup dashboard with summary metrics, charts, model grouping, and recent runs
- JSON export and import for restoring history after reinstall
- Dedicated raw-data page for inspecting full local sample JSON without exporting
- Multi-site DOM adapters on top of a reusable timing core library

## Architecture

The extension is split into layers:

- Canonical shared source: [shared/README.md](/Users/rndm/Code/chatbot-perf/shared/README.md)
- Generated shared libs: [llm-timing-core.js](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/lib/llm-timing-core.js), [sample-transfer.js](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/lib/sample-transfer.js)
- Overlay UI: [content-overlay.js](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/content-overlay.js)
- Site adapter and local persistence: [content.js](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/content.js)
- Popup UI: [popup.html](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/popup.html), [popup.js](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/popup.js), [popup.css](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/popup.css)
- Import flow: [import.html](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/import.html), [import.js](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/import.js), [import.css](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/import.css)
- Raw-data viewer: [raw-data.html](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/raw-data.html), [raw-data.js](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/raw-data.js), [raw-data.css](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/raw-data.css)

## Load In Firefox

1. Open `about:debugging`.
2. Choose `This Firefox`.
3. Click `Load Temporary Add-on...`.
4. Select [manifest.json](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/manifest.json).

If you already had the add-on loaded, reload it after manifest or shared-lib changes.

## Release Prep

- AMO submission checklist: [AMO_SUBMISSION.md](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/AMO_SUBMISSION.md)
- Privacy policy: [PRIVACY_POLICY.md](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/PRIVACY_POLICY.md)
- Packaging script: [scripts/package-amo.sh](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/scripts/package-amo.sh)
- Shared-source sync: [scripts/sync-shared-libs.sh](/Users/rndm/Code/chatbot-perf/scripts/sync-shared-libs.sh)

## Storage Keys

- Samples: `chatgpt_ttfw_samples`
- Overlay settings: `chatgpt_ttfw_overlay_settings`

## Import And Export

- Export is available from the popup.
- Import opens a dedicated extension page so Firefox popup teardown does not interrupt file selection.
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

## Caveats

- DOM heuristics can break when ChatGPT, Claude, Gemini, or Perplexity change markup.
- Remote telemetry collection is intentionally removed from the shipped extension for now.
