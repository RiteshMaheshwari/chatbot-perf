# Shared Timing Source

This directory is the canonical shared source for code that is intentionally duplicated into both browser extensions.

Current shared modules:

- [llm-timing-core.js](./lib/llm-timing-core.js): browser-agnostic measurement lifecycle and metric computation
- [sample-transfer.js](./lib/sample-transfer.js): import/export normalization and local sample transfer helpers

Generated extension copies live at:

- [extensions/chrome/lib](../extensions/chrome/lib)
- [extensions/firefox/lib](../extensions/firefox/lib)

Use the root sync script before packaging browser builds:

```bash
./scripts/sync-shared-libs.sh
```

## Purpose

The shared timing core owns:

- text normalization
- noise stripping
- word counting
- run lifecycle
- TTFW / TTLW / WPS calculations
- stall / jitter metric calculation

It does **not** own:

- browser storage
- DOM selectors
- site-specific adapters
- overlay rendering
- popup UI
- browser manifest or packaging logic

## Public API

`llm-timing-core.js` exports `globalThis.LlmTimingCore` with:

- `MeasurementTracker`
- `createMeasurementTracker(options)`
- `buildRunMetrics(run)`
- `countWords(text)`
- `normalizeText(text)`
- `stripMeasurementNoise(text, patterns?)`
- `truncateText(text, maxLength)`
- `wordMatches(text)`
- `createId()`
- `createSessionId()`

`sample-transfer.js` exports `globalThis.LlmSampleTransfer` with:

- `downloadSamples(samples, filenamePrefix?)`
- `importSamplesFromFile(file, options)`

## Example Lifecycle

```js
const tracker = globalThis.LlmTimingCore.createMeasurementTracker({
  completionSettleMs: 120,
  hardTimeoutMs: 120000
});

tracker.startRun({
  triggerType: "submit",
  promptText: "Explain TTFW",
  inputWordCount: 2,
  metadata: { context: { hostname: "chatgpt.com" } }
});

tracker.observe({
  now: performance.now(),
  totalWordCount: 12,
  visibleWordCount: 3,
  generationActive: true,
  candidateStreaming: true,
  candidateId: "assistant-turn-1",
  modelSlug: "gpt-5"
});

const result = tracker.observe({
  now: performance.now() + 300,
  totalWordCount: 12,
  visibleWordCount: 12,
  generationActive: false,
  candidateStreaming: false
});

if (result?.type === "complete") {
  console.log(result.metrics.ttfwMs, result.metrics.ttlwMs);
}
```
