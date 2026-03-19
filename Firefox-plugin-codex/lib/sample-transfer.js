(function (global) {
  "use strict";

  function downloadSamples(samples, filenamePrefix = "llm-performance-tracker-samples") {
    const date = new Date().toISOString().slice(0, 10);
    const filename = `${filenamePrefix}-${date}.json`;
    const exportedSamples = samples.map((sample) => ({
      id: sample.id,
      sessionId: sample.sessionId,
      site: sample.site,
      model: sample.model,
      hostname: sample.hostname,
      startedAt: sample.startedAt,
      locale: sample.locale,
      timezone: sample.timezone,
      utcOffsetMinutes: sample.utcOffsetMinutes,
      visibilityStateAtStart: sample.visibilityStateAtStart,
      wasPageVisibleAtStart: sample.wasPageVisibleAtStart,
      onlineAtStart: sample.onlineAtStart,
      connectionEffectiveType: sample.connectionEffectiveType,
      connectionRttMs: sample.connectionRttMs,
      connectionDownlinkMbps: sample.connectionDownlinkMbps,
      connectionSaveData: sample.connectionSaveData,
      inputWords: sample.inputWords,
      ttfwMs: sample.ttfwMs,
      ttlwMs: sample.ttlwMs,
      streamingMs: sample.streamingMs,
      wordCount: sample.wordCount,
      wordsPerSecond: sample.wordsPerSecond,
      endToEndWordsPerSecond: sample.endToEndWordsPerSecond,
      longestStallMs: sample.longestStallMs,
      stallCount500Ms: sample.stallCount500Ms,
      stallCount1000Ms: sample.stallCount1000Ms,
      p95InterChunkGapMs: sample.p95InterChunkGapMs,
      reason: sample.reason
    }));

    const blob = new Blob([JSON.stringify(exportedSamples, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function readFileText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Failed to read file."));
      reader.readAsText(file);
    });
  }

  function finiteNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeDate(value) {
    if (!value) {
      return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date.toISOString();
  }

  function sampleIdentity(sample) {
    return sample.id || [
      sample.startedAt,
      sample.site,
      sample.model,
      sample.ttlwMs,
      sample.wordCount
    ].join(":");
  }

  function normalizeImportedSample(sample, index) {
    if (!sample || typeof sample !== "object" || Array.isArray(sample)) {
      return null;
    }

    const startedAt = normalizeDate(sample.startedAt);
    const ttfwMs = finiteNumber(sample.ttfwMs);
    const ttlwMs = finiteNumber(sample.ttlwMs);
    const wordCount = finiteNumber(sample.wordCount);
    const wordsPerSecond = finiteNumber(sample.wordsPerSecond);

    if (!startedAt || ttfwMs === null || ttlwMs === null || wordCount === null || wordsPerSecond === null) {
      return null;
    }

    return {
      id: typeof sample.id === "string" && sample.id.trim() ? sample.id.trim() : `imported-${startedAt}-${index}`,
      sessionId: typeof sample.sessionId === "string" && sample.sessionId.trim() ? sample.sessionId.trim() : null,
      site: typeof sample.site === "string" && sample.site.trim() ? sample.site.trim() : "unknown",
      model: typeof sample.model === "string" && sample.model.trim() ? sample.model.trim() : "unknown",
      hostname: typeof sample.hostname === "string" && sample.hostname.trim() ? sample.hostname.trim() : null,
      startedAt,
      locale: typeof sample.locale === "string" && sample.locale.trim() ? sample.locale.trim() : null,
      timezone: typeof sample.timezone === "string" && sample.timezone.trim() ? sample.timezone.trim() : null,
      utcOffsetMinutes: finiteNumber(sample.utcOffsetMinutes),
      visibilityStateAtStart:
        typeof sample.visibilityStateAtStart === "string" && sample.visibilityStateAtStart.trim()
          ? sample.visibilityStateAtStart.trim()
          : null,
      wasPageVisibleAtStart:
        typeof sample.wasPageVisibleAtStart === "boolean" ? sample.wasPageVisibleAtStart : null,
      onlineAtStart: typeof sample.onlineAtStart === "boolean" ? sample.onlineAtStart : null,
      connectionEffectiveType:
        typeof sample.connectionEffectiveType === "string" && sample.connectionEffectiveType.trim()
          ? sample.connectionEffectiveType.trim()
          : null,
      connectionRttMs: finiteNumber(sample.connectionRttMs),
      connectionDownlinkMbps: finiteNumber(sample.connectionDownlinkMbps),
      connectionSaveData: typeof sample.connectionSaveData === "boolean" ? sample.connectionSaveData : null,
      inputWords: finiteNumber(sample.inputWords),
      ttfwMs,
      ttlwMs,
      streamingMs: finiteNumber(sample.streamingMs),
      wordCount,
      wordsPerSecond,
      endToEndWordsPerSecond: finiteNumber(sample.endToEndWordsPerSecond),
      longestStallMs: finiteNumber(sample.longestStallMs),
      stallCount500Ms: finiteNumber(sample.stallCount500Ms),
      stallCount1000Ms: finiteNumber(sample.stallCount1000Ms),
      p95InterChunkGapMs: finiteNumber(sample.p95InterChunkGapMs),
      reason: typeof sample.reason === "string" && sample.reason.trim() ? sample.reason.trim() : "complete"
    };
  }

  function mergeSamples(existingSamples, importedSamples, maxSamples) {
    const merged = new Map();

    [...importedSamples, ...existingSamples].forEach((sample) => {
      const key = sampleIdentity(sample);
      if (!merged.has(key)) {
        merged.set(key, sample);
      }
    });

    return Array.from(merged.values())
      .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime())
      .slice(0, maxSamples);
  }

  async function importSamplesFromFile(file, options) {
    const storage = options.storage;
    const storageKey = options.storageKey;
    const maxSamples = options.maxSamples;

    const rawText = await readFileText(file);
    const parsed = JSON.parse(rawText);
    const rawSamples = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.samples) ? parsed.samples : null;
    if (!rawSamples) {
      throw new Error("Expected a JSON array of samples.");
    }

    const normalizedSamples = rawSamples
      .map((sample, index) => normalizeImportedSample(sample, index))
      .filter(Boolean);

    if (!normalizedSamples.length) {
      throw new Error("No valid samples found in the file.");
    }

    const current = await storage.get(storageKey);
    const existingSamples = Array.isArray(current[storageKey]) ? current[storageKey] : [];
    const existingKeys = new Set(existingSamples.map(sampleIdentity));
    const mergedSamples = mergeSamples(existingSamples, normalizedSamples, maxSamples);
    const addedCount = normalizedSamples.filter((sample) => !existingKeys.has(sampleIdentity(sample))).length;

    await storage.set({ [storageKey]: mergedSamples });

    return {
      rawCount: rawSamples.length,
      validCount: normalizedSamples.length,
      addedCount,
      totalCount: mergedSamples.length
    };
  }

  global.LlmSampleTransfer = Object.freeze({
    downloadSamples,
    importSamplesFromFile
  });
})(globalThis);
