(function (global) {
  "use strict";

  const TELEMETRY_SETTINGS_KEY = "llm_perf_telemetry_settings";
  const TELEMETRY_QUEUE_KEY = "llm_perf_telemetry_queue";
  const TELEMETRY_STATE_KEY = "llm_perf_telemetry_state";
  const TELEMETRY_FLUSH_ALARM = "llm_perf_telemetry_flush";
  const MAX_QUEUE_ITEMS = 500;
  const MAX_BATCH_SIZE = 25;
  const SCHEMA_VERSION = 1;
  const DEFAULT_TELEMETRY_SETTINGS = Object.freeze({
    enabled: false,
    endpointUrl: ""
  });
  const DEFAULT_TELEMETRY_STATE = Object.freeze({
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: "",
    lastUploadedCount: 0,
    queueSize: 0
  });

  function normalizeUrl(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) {
      return "";
    }

    try {
      const url = new URL(trimmed);
      return url.href.replace(/\/+$/, "");
    } catch (_error) {
      return "";
    }
  }

  function normalizeTelemetrySettings(raw) {
    return {
      enabled: Boolean(raw?.enabled),
      endpointUrl: normalizeUrl(raw?.endpointUrl)
    };
  }

  function normalizeTelemetryState(raw) {
    return {
      lastAttemptAt: typeof raw?.lastAttemptAt === "string" ? raw.lastAttemptAt : null,
      lastSuccessAt: typeof raw?.lastSuccessAt === "string" ? raw.lastSuccessAt : null,
      lastError: typeof raw?.lastError === "string" ? raw.lastError : "",
      lastUploadedCount: Number.isFinite(raw?.lastUploadedCount) ? raw.lastUploadedCount : 0,
      queueSize: Number.isFinite(raw?.queueSize) ? raw.queueSize : 0
    };
  }

  function sanitizeSampleForTelemetry(sample, extensionVersion) {
    if (!sample || typeof sample !== "object") {
      return null;
    }

    if (typeof sample.id !== "string" || !sample.id.trim()) {
      return null;
    }

    return {
      eventId: sample.id,
      sessionId: typeof sample.sessionId === "string" ? sample.sessionId : null,
      extensionVersion: extensionVersion || null,
      schemaVersion: SCHEMA_VERSION,
      site: typeof sample.site === "string" ? sample.site : "unknown",
      model: typeof sample.model === "string" ? sample.model : "unknown",
      hostname: typeof sample.hostname === "string" ? sample.hostname : null,
      startedAt: typeof sample.startedAt === "string" ? sample.startedAt : null,
      locale: typeof sample.locale === "string" ? sample.locale : null,
      timezone: typeof sample.timezone === "string" ? sample.timezone : null,
      utcOffsetMinutes: Number.isFinite(sample.utcOffsetMinutes) ? sample.utcOffsetMinutes : null,
      visibilityStateAtStart:
        typeof sample.visibilityStateAtStart === "string" ? sample.visibilityStateAtStart : null,
      wasPageVisibleAtStart:
        typeof sample.wasPageVisibleAtStart === "boolean" ? sample.wasPageVisibleAtStart : null,
      onlineAtStart: typeof sample.onlineAtStart === "boolean" ? sample.onlineAtStart : null,
      connectionEffectiveType:
        typeof sample.connectionEffectiveType === "string" ? sample.connectionEffectiveType : null,
      connectionRttMs: Number.isFinite(sample.connectionRttMs) ? sample.connectionRttMs : null,
      connectionDownlinkMbps:
        Number.isFinite(sample.connectionDownlinkMbps) ? sample.connectionDownlinkMbps : null,
      connectionSaveData:
        typeof sample.connectionSaveData === "boolean" ? sample.connectionSaveData : null,
      inputWords: Number.isFinite(sample.inputWords) ? sample.inputWords : null,
      ttfwMs: Number(sample.ttfwMs) || 0,
      ttlwMs: Number(sample.ttlwMs) || 0,
      streamingMs: Number.isFinite(sample.streamingMs) ? sample.streamingMs : null,
      wordCount: Number(sample.wordCount) || 0,
      wordsPerSecond: Number(sample.wordsPerSecond) || 0,
      endToEndWordsPerSecond:
        Number.isFinite(sample.endToEndWordsPerSecond) ? sample.endToEndWordsPerSecond : null,
      longestStallMs: Number.isFinite(sample.longestStallMs) ? sample.longestStallMs : null,
      stallCount500Ms: Number.isFinite(sample.stallCount500Ms) ? sample.stallCount500Ms : null,
      stallCount1000Ms: Number.isFinite(sample.stallCount1000Ms) ? sample.stallCount1000Ms : null,
      p95InterChunkGapMs: Number.isFinite(sample.p95InterChunkGapMs) ? sample.p95InterChunkGapMs : null,
      reason: typeof sample.reason === "string" ? sample.reason : "complete",
      queuedAt: new Date().toISOString()
    };
  }

  function appendQueueItems(existingItems, newItems) {
    const deduped = new Map();

    [...existingItems, ...newItems].forEach((item) => {
      if (!item || typeof item !== "object" || typeof item.eventId !== "string") {
        return;
      }
      deduped.set(item.eventId, item);
    });

    const values = Array.from(deduped.values());
    values.sort((left, right) => {
      const leftTime = new Date(left.startedAt || left.queuedAt || 0).getTime();
      const rightTime = new Date(right.startedAt || right.queuedAt || 0).getTime();
      return leftTime - rightTime;
    });
    return values.slice(-MAX_QUEUE_ITEMS);
  }

  function buildIngestRequest(events) {
    return {
      schemaVersion: SCHEMA_VERSION,
      sentAt: new Date().toISOString(),
      events
    };
  }

  global.LlmTelemetry = Object.freeze({
    DEFAULT_TELEMETRY_SETTINGS,
    DEFAULT_TELEMETRY_STATE,
    MAX_BATCH_SIZE,
    MAX_QUEUE_ITEMS,
    SCHEMA_VERSION,
    TELEMETRY_FLUSH_ALARM,
    TELEMETRY_QUEUE_KEY,
    TELEMETRY_SETTINGS_KEY,
    TELEMETRY_STATE_KEY,
    appendQueueItems,
    buildIngestRequest,
    normalizeTelemetrySettings,
    normalizeTelemetryState,
    sanitizeSampleForTelemetry
  });
})(globalThis);
