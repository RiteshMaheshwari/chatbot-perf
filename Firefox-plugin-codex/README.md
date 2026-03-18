# LLM Performance Tracker

Firefox extension for measuring LLM UI performance on:

- ChatGPT
- Claude
- Perplexity

It captures:

- Time to first word (TTFW)
- Time to last word (TTLW)
- Streaming speed in words per second (WPS)
- Prompt input size
- Basic page/runtime context such as site, model, timezone, and visibility state

## Features

- Floating in-page overlay with live timing state and the latest completed run
- Popup dashboard with summary metrics, charts, model grouping, and recent runs
- JSON export and import for restoring history after reinstall
- Privacy-safe telemetry queue with optional background upload to a backend
- Multi-site DOM adapters on top of a reusable timing core library

## Architecture

The extension is split into layers:

- Measurement core: [llm-timing-core.js](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/lib/llm-timing-core.js)
- Overlay UI: [content-overlay.js](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/content-overlay.js)
- Site adapter and local persistence: [content.js](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/content.js)
- Popup UI: [popup.html](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/popup.html), [popup.js](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/popup.js), [popup.css](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/popup.css)
- Import flow: [import.html](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/import.html), [import.js](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/import.js), [import.css](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/import.css)
- Background telemetry queue/uploader: [background.js](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/background.js), [telemetry.js](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/lib/telemetry.js)

## Load In Firefox

1. Open `about:debugging`.
2. Choose `This Firefox`.
3. Click `Load Temporary Add-on...`.
4. Select [manifest.json](/Users/rndm/Code/chatbot-perf/Firefox-plugin-codex/manifest.json).

If you already had the add-on loaded, reload it after manifest or background-script changes.

## Storage Keys

- Samples: `chatgpt_ttfw_samples`
- Overlay settings: `chatgpt_ttfw_overlay_settings`
- Telemetry settings: `llm_perf_telemetry_settings`
- Telemetry queue: `llm_perf_telemetry_queue`
- Telemetry state: `llm_perf_telemetry_state`

## Import And Export

- Export is available from the popup.
- Import opens a dedicated extension page so Firefox popup teardown does not interrupt file selection.
- Exported files exclude confidential fields such as prompt preview, page URL, and page title.

## Telemetry Upload

Telemetry upload is opt-in.

- The popup lets you enable upload and set a Worker endpoint URL.
- Completed runs are still stored locally first.
- A background script batches sanitized samples and uploads them separately.
- If telemetry is disabled, queued uploads are cleared.

Sanitized telemetry excludes:

- `promptPreview`
- `url`
- `title`

## Backend Scaffold

A free-tier Cloudflare backend scaffold lives in:

- [backend/cloudflare-telemetry-worker](/Users/rndm/Code/chatbot-perf/backend/cloudflare-telemetry-worker)

That project includes:

- Worker ingest endpoint
- D1 schema
- Basic validation, dedupe, and rate limiting
- Setup instructions in its own [README.md](/Users/rndm/Code/chatbot-perf/backend/cloudflare-telemetry-worker/README.md)

## Timing Notes

- TTFW uses visible rendered text, not raw DOM text.
- Placeholder/search-status phrases such as `Searching the web` and `Working` are ignored.
- For structured responses, timing waits for actual answer content rather than generic assistant wrappers.
- TTLW finalizes after streaming stops and content has settled for a site-specific delay.

## Caveats

- DOM heuristics can break when ChatGPT, Claude, or Perplexity change markup.
- The overlay and popup should continue working even if telemetry upload fails.
- The Cloudflare backend scaffold is implemented, but live deployment and end-to-end upload verification still need to be done in your account.
