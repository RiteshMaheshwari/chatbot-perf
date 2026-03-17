(function (global) {
  "use strict";

  const DEFAULT_NOISE_PATTERNS = [
    /\b(ChatGPT said:|You said:|Searching the web|Working)\b/gi
  ];

  function nowMs() {
    return typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  }

  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function stripMeasurementNoise(text, patterns = DEFAULT_NOISE_PATTERNS) {
    let normalized = normalizeText(text);
    for (const pattern of patterns) {
      normalized = normalized.replace(pattern, " ");
    }
    return normalized.replace(/\s+/g, " ").trim();
  }

  function truncateText(text, maxLength) {
    const normalized = normalizeText(text);
    if (normalized.length <= maxLength) {
      return normalized;
    }

    return `${normalized.slice(0, maxLength - 1)}...`;
  }

  function wordMatches(text) {
    return normalizeText(text).match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || [];
  }

  function countWords(text) {
    return wordMatches(text).length;
  }

  function createId() {
    const randomPart = Math.random().toString(36).slice(2, 8);
    return `${Date.now()}-${randomPart}`;
  }

  function createSessionId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    return createId();
  }

  function buildRunMetrics(run) {
    if (!run || !run.firstWordAt || !run.completedAt || run.finalWordCount === 0) {
      return null;
    }

    const ttfwMs = Math.round(run.firstWordAt - run.startedAt);
    const ttlwMs = Math.round(run.completedAt - run.startedAt);
    const streamingMs = Math.max(1, Math.round(run.completedAt - run.firstWordAt));
    const wordsPerSecond = Number((run.finalWordCount / (streamingMs / 1000)).toFixed(2));
    const endToEndWordsPerSecond = Number((run.finalWordCount / (ttlwMs / 1000)).toFixed(2));

    return {
      id: run.id,
      triggerType: run.triggerType,
      startedAtMs: run.startedAt,
      startedWallClock: run.startedWallClock,
      promptPreview: run.promptPreview,
      inputWordCount: run.inputWordCount,
      modelSlug: run.modelSlug || "unknown",
      ttfwMs,
      ttlwMs,
      streamingMs,
      wordCount: run.finalWordCount,
      wordsPerSecond,
      endToEndWordsPerSecond
    };
  }

  class MeasurementTracker {
    constructor(options = {}) {
      this.now = typeof options.now === "function" ? options.now : nowMs;
      this.completionSettleMs = Number.isFinite(options.completionSettleMs)
        ? options.completionSettleMs
        : 120;
      this.hardTimeoutMs = Number.isFinite(options.hardTimeoutMs)
        ? options.hardTimeoutMs
        : 120000;
      this.activeRun = null;
    }

    getActiveRun() {
      return this.activeRun;
    }

    startRun(options = {}) {
      const startedAt = this.now();

      this.activeRun = {
        id: createId(),
        triggerType: options.triggerType || "unknown",
        startedAt,
        startedWallClock: Number.isFinite(options.startedWallClock)
          ? options.startedWallClock
          : Date.now(),
        promptText: options.promptText || "",
        promptPreview: options.promptPreview || "",
        inputWordCount: Number.isFinite(options.inputWordCount)
          ? options.inputWordCount
          : countWords(options.promptText || ""),
        modelSlug: options.modelSlug || "unknown",
        metadata: options.metadata || {},
        firstWordAt: null,
        completedAt: null,
        trackedCandidateId: null,
        lastContentChangeAt: startedAt,
        lastObservedWordCount: 0,
        lastVisibleWordCount: 0,
        visibleWordCount: 0,
        finalWordCount: 0
      };

      return this.activeRun;
    }

    resetRun(reason) {
      if (!this.activeRun) {
        return null;
      }

      const run = this.activeRun;
      this.activeRun = null;
      return {
        type: "reset",
        reason,
        run
      };
    }

    checkTimeout(now = this.now()) {
      if (!this.activeRun) {
        return null;
      }

      if (now - this.activeRun.startedAt < this.hardTimeoutMs) {
        return null;
      }

      return this.resetRun("timeout");
    }

    observe(observation = {}) {
      const run = this.activeRun;
      if (!run) {
        return null;
      }

      const observedAt = Number.isFinite(observation.now) ? observation.now : this.now();
      const totalWordCount = Number.isFinite(observation.totalWordCount)
        ? observation.totalWordCount
        : 0;
      const visibleWordCount = Number.isFinite(observation.visibleWordCount)
        ? observation.visibleWordCount
        : 0;
      const generationActive = Boolean(observation.generationActive);
      const candidateStreaming = Boolean(observation.candidateStreaming);

      if (observation.candidateId) {
        run.trackedCandidateId = observation.candidateId;
      }

      run.visibleWordCount = visibleWordCount;

      if (totalWordCount > run.lastObservedWordCount) {
        run.lastObservedWordCount = totalWordCount;
        run.lastContentChangeAt = observedAt;
      }

      if (visibleWordCount > run.lastVisibleWordCount) {
        run.lastVisibleWordCount = visibleWordCount;
        run.finalWordCount = visibleWordCount;
        run.lastContentChangeAt = observedAt;
      }

      if (observation.modelSlug && (!run.modelSlug || run.modelSlug === "unknown")) {
        run.modelSlug = observation.modelSlug;
      }

      if (!run.firstWordAt && visibleWordCount > 0) {
        run.firstWordAt = observedAt;
        run.finalWordCount = visibleWordCount;
        run.lastContentChangeAt = observedAt;
      }

      const idleForMs = observedAt - run.lastContentChangeAt;
      const isActive = generationActive || candidateStreaming;

      if (run.firstWordAt && !isActive && idleForMs >= this.completionSettleMs) {
        run.completedAt = observedAt;
        const metrics = buildRunMetrics(run);
        this.activeRun = null;

        return {
          type: "complete",
          reason: "complete",
          run,
          metrics,
          idleForMs,
          isActive
        };
      }

      return {
        type: run.firstWordAt
          ? (isActive ? "streaming" : "finishing")
          : "waiting",
        run,
        idleForMs,
        isActive
      };
    }
  }

  function createMeasurementTracker(options) {
    return new MeasurementTracker(options);
  }

  global.LlmTimingCore = Object.freeze({
    MeasurementTracker,
    buildRunMetrics,
    countWords,
    createId,
    createMeasurementTracker,
    createSessionId,
    normalizeText,
    stripMeasurementNoise,
    truncateText,
    wordMatches
  });
})(globalThis);
