const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadTimingCore() {
  const code = fs.readFileSync(path.join(__dirname, "..", "lib", "llm-timing-core.js"), "utf8");
  const context = {
    console,
    Date,
    Math,
    JSON,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    performance: { now: () => 0 },
    crypto: { randomUUID: () => "test-session-id" }
  };
  context.globalThis = context;
  vm.runInNewContext(code, context);
  return context.LlmTimingCore;
}

function runFixture(core, fixtureName, trackerOptions = {}) {
  const fixturePath = path.join(__dirname, "fixtures", fixtureName);
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const tracker = new core.MeasurementTracker({
    completionSettleMs: 120,
    hardTimeoutMs: 5000,
    ...trackerOptions
  });

  tracker.startRun(fixture.startRun);

  let result = null;
  for (const step of fixture.steps) {
    result = tracker.observe(step);
  }

  return result;
}

test("normalizes text, strips measurement noise, and counts words", () => {
  const core = loadTimingCore();

  assert.equal(core.normalizeText("  hello   there \n world "), "hello there world");
  assert.equal(core.stripMeasurementNoise("Working... Searching the web... final answer"), "... ... final answer");
  assert.equal(core.countWords("Hello, benchmark-world! It's working."), 4);
});

test("records first word and completion timing", () => {
  const core = loadTimingCore();
  const tracker = new core.MeasurementTracker({
    completionSettleMs: 120,
    hardTimeoutMs: 1000
  });

  tracker.startRun({
    triggerType: "submit",
    startedWallClock: 1000,
    promptText: "Explain TTFW"
  });

  let result = tracker.observe({
    now: 40,
    totalWordCount: 0,
    visibleWordCount: 0,
    generationActive: true,
    candidateStreaming: true,
    candidateId: "turn-1"
  });
  assert.equal(result.type, "waiting");

  result = tracker.observe({
    now: 120,
    totalWordCount: 1,
    visibleWordCount: 1,
    generationActive: true,
    candidateStreaming: true,
    candidateId: "turn-1",
    modelSlug: "gpt-test"
  });
  assert.equal(result.type, "streaming");

  result = tracker.observe({
    now: 170,
    totalWordCount: 3,
    visibleWordCount: 3,
    generationActive: true,
    candidateStreaming: true,
    candidateId: "turn-1"
  });
  assert.equal(result.type, "streaming");

  result = tracker.observe({
    now: 320,
    totalWordCount: 3,
    visibleWordCount: 3,
    generationActive: false,
    candidateStreaming: false,
    candidateId: "turn-1"
  });

  assert.equal(result.type, "complete");
  assert.equal(result.metrics.ttfwMs, 120);
  assert.equal(result.metrics.ttlwMs, 320);
  assert.equal(result.metrics.streamingMs, 200);
  assert.equal(result.metrics.wordCount, 3);
  assert.equal(result.metrics.modelSlug, "gpt-test");
});

test("can start TTFW from a first-word signal before visible answer words are counted", () => {
  const core = loadTimingCore();
  const tracker = new core.MeasurementTracker({
    completionSettleMs: 120,
    hardTimeoutMs: 1000
  });

  tracker.startRun({
    triggerType: "submit",
    startedWallClock: 1000,
    promptText: "Read uploaded file"
  });

  let result = tracker.observe({
    now: 80,
    totalWordCount: 0,
    visibleWordCount: 0,
    firstWordDetected: true,
    generationActive: true,
    candidateStreaming: true,
    candidateId: "turn-1"
  });
  assert.equal(result.type, "streaming");

  result = tracker.observe({
    now: 200,
    totalWordCount: 4,
    visibleWordCount: 4,
    generationActive: true,
    candidateStreaming: true,
    candidateId: "turn-1"
  });
  assert.equal(result.type, "streaming");

  result = tracker.observe({
    now: 340,
    totalWordCount: 4,
    visibleWordCount: 4,
    generationActive: false,
    candidateStreaming: false,
    candidateId: "turn-1"
  });

  assert.equal(result.type, "complete");
  assert.equal(result.metrics.ttfwMs, 80);
  assert.equal(result.metrics.wordCount, 4);
});

test("computes stall metrics from fixture progress events", () => {
  const core = loadTimingCore();
  const result = runFixture(core, "progress-observations.json", {
    completionSettleMs: 1000
  });

  assert.equal(result.type, "complete");
  assert.equal(result.metrics.ttfwMs, 100);
  assert.equal(result.metrics.ttlwMs, 2600);
  assert.equal(result.metrics.wordCount, 6);
  assert.equal(result.metrics.longestStallMs, 0);
  assert.equal(result.metrics.stallCount500Ms, 1);
  assert.equal(result.metrics.stallCount1000Ms, 0);
  assert.equal(result.metrics.p95InterChunkGapMs, 0);
});

test("ignores sub-threshold gaps for reported stall while preserving raw stall counts", () => {
  const core = loadTimingCore();
  const tracker = new core.MeasurementTracker({
    completionSettleMs: 120,
    hardTimeoutMs: 5000
  });

  tracker.startRun({
    triggerType: "submit",
    startedWallClock: 1000,
    promptText: "Short pauses"
  });

  let result = tracker.observe({
    now: 100,
    totalWordCount: 1,
    visibleWordCount: 1,
    generationActive: false,
    candidateStreaming: false,
    stallBlocked: false,
    candidateId: "turn-1"
  });
  assert.equal(result.type, "finishing");

  result = tracker.observe({
    now: 700,
    totalWordCount: 3,
    visibleWordCount: 3,
    generationActive: false,
    candidateStreaming: false,
    stallBlocked: false,
    candidateId: "turn-1"
  });
  assert.equal(result.type, "finishing");

  result = tracker.observe({
    now: 900,
    totalWordCount: 3,
    visibleWordCount: 3,
    generationActive: false,
    candidateStreaming: false,
    stallBlocked: false,
    candidateId: "turn-1"
  });

  assert.equal(result.type, "complete");
  assert.equal(result.metrics.longestStallMs, 0);
  assert.equal(result.metrics.stallCount500Ms, 1);
  assert.equal(result.metrics.stallCount1000Ms, 0);
  assert.equal(result.metrics.p95InterChunkGapMs, 0);
});

test("can accumulate stall while generation remains active", () => {
  const core = loadTimingCore();
  const tracker = new core.MeasurementTracker({
    completionSettleMs: 120,
    hardTimeoutMs: 5000
  });

  tracker.startRun({
    triggerType: "submit",
    startedWallClock: 1000,
    promptText: "Explain Gemini stalls"
  });

  let result = tracker.observe({
    now: 100,
    totalWordCount: 1,
    visibleWordCount: 1,
    generationActive: true,
    candidateStreaming: true,
    stallBlocked: false,
    candidateId: "turn-1"
  });
  assert.equal(result.type, "streaming");

  result = tracker.observe({
    now: 900,
    totalWordCount: 3,
    visibleWordCount: 3,
    generationActive: true,
    candidateStreaming: true,
    stallBlocked: false,
    candidateId: "turn-1"
  });
  assert.equal(result.type, "streaming");

  result = tracker.observe({
    now: 1100,
    totalWordCount: 3,
    visibleWordCount: 3,
    generationActive: false,
    candidateStreaming: false,
    stallBlocked: false,
    candidateId: "turn-1"
  });

  assert.equal(result.type, "complete");
  assert.equal(result.metrics.longestStallMs, 800);
  assert.equal(result.metrics.stallCount500Ms, 1);
  assert.equal(result.metrics.p95InterChunkGapMs, 800);
});

test("resets timed-out runs", () => {
  const core = loadTimingCore();
  const tracker = new core.MeasurementTracker({
    completionSettleMs: 120,
    hardTimeoutMs: 250
  });

  tracker.startRun({
    triggerType: "submit",
    startedWallClock: 1000,
    promptText: "slow response"
  });

  const timeout = tracker.checkTimeout(300);
  assert.equal(timeout.type, "reset");
  assert.equal(timeout.reason, "timeout");
  assert.equal(tracker.getActiveRun(), null);
});
