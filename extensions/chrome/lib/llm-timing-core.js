(function (global) {
  "use strict";

  const DEFAULT_NOISE_PATTERNS = [
    /\b(ChatGPT said:|You said:|Searching the web|Working)\b/gi
  ];
  const MIN_REPORTABLE_STALL_MS = 750;

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

  function percentileFromSorted(values, p) {
    if (!values.length) {
      return 0;
    }

    const index = Math.min(values.length - 1, Math.max(0, Math.ceil((p / 100) * values.length) - 1));
    return values[index];
  }

  function reportableStallMs(value) {
    const rounded = Math.max(0, Math.round(Number(value) || 0));
    return rounded >= MIN_REPORTABLE_STALL_MS ? rounded : 0;
  }

  function buildProgressMetrics(run) {
    const events = Array.isArray(run.visibleProgressEvents) ? run.visibleProgressEvents : [];
    if (events.length < 2) {
      return {
        longestStallMs: 0,
        stallCount500Ms: 0,
        stallCount1000Ms: 0,
        p95InterChunkGapMs: 0
      };
    }

    const rawGaps = [];
    const reportableGaps = [];
    for (let index = 1; index < events.length; index += 1) {
      const rawGap = Math.max(0, Math.round(events[index].idleGapMs || 0));
      rawGaps.push(rawGap);
      const reportableGap = reportableStallMs(rawGap);
      if (reportableGap > 0) {
        reportableGaps.push(reportableGap);
      }
    }

    const sortedReportableGaps = [...reportableGaps].sort((left, right) => left - right);
    return {
      longestStallMs: reportableGaps.length ? Math.max(...reportableGaps) : 0,
      stallCount500Ms: rawGaps.filter((gap) => gap >= 500).length,
      stallCount1000Ms: rawGaps.filter((gap) => gap >= 1000).length,
      p95InterChunkGapMs: percentileFromSorted(sortedReportableGaps, 95)
    };
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
    const progressMetrics = buildProgressMetrics(run);

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
      endToEndWordsPerSecond,
      longestStallMs: progressMetrics.longestStallMs,
      stallCount500Ms: progressMetrics.stallCount500Ms,
      stallCount1000Ms: progressMetrics.stallCount1000Ms,
      p95InterChunkGapMs: progressMetrics.p95InterChunkGapMs
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
        finalWordCount: 0,
        visibleProgressEvents: [],
        lastObservationAt: startedAt,
        stallIdleMsSinceProgress: 0
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
      const isActive = generationActive || candidateStreaming;
      const stallBlocked = observation.stallBlocked === undefined
        ? isActive
        : Boolean(observation.stallBlocked);

      if (observation.candidateId) {
        run.trackedCandidateId = observation.candidateId;
      }

      run.visibleWordCount = visibleWordCount;

      if (run.firstWordAt && observedAt > run.lastObservationAt && !stallBlocked) {
        run.stallIdleMsSinceProgress += observedAt - run.lastObservationAt;
      }
      run.lastObservationAt = observedAt;

      if (totalWordCount > run.lastObservedWordCount) {
        run.lastObservedWordCount = totalWordCount;
        run.lastContentChangeAt = observedAt;
      }

      if (visibleWordCount > run.lastVisibleWordCount) {
        const deltaWords = visibleWordCount - run.lastVisibleWordCount;
        run.lastVisibleWordCount = visibleWordCount;
        run.finalWordCount = visibleWordCount;
        run.lastContentChangeAt = observedAt;
        run.visibleProgressEvents.push({
          at: observedAt,
          visibleWordCount,
          deltaWords,
          idleGapMs: Math.round(run.stallIdleMsSinceProgress)
        });
        run.stallIdleMsSinceProgress = 0;
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
    reportableStallMs,
    stripMeasurementNoise,
    truncateText,
    wordMatches
  });
})(globalThis);
