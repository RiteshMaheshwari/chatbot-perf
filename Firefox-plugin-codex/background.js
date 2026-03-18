"use strict";

if (typeof importScripts === "function") {
  importScripts("lib/telemetry.js");
}

const telemetry = globalThis.LlmTelemetry;
const ext = typeof browser !== "undefined" ? browser : chrome;
const storage = ext.storage.local;
const runtime = ext.runtime;
const alarms = ext.alarms;

let flushInFlight = false;

function manifestVersion() {
  return runtime.getManifest()?.version || null;
}

async function readTelemetryBundle() {
  const data = await storage.get([
    telemetry.TELEMETRY_QUEUE_KEY,
    telemetry.TELEMETRY_SETTINGS_KEY,
    telemetry.TELEMETRY_STATE_KEY
  ]);

  return {
    queue: Array.isArray(data[telemetry.TELEMETRY_QUEUE_KEY]) ? data[telemetry.TELEMETRY_QUEUE_KEY] : [],
    settings: telemetry.normalizeTelemetrySettings(data[telemetry.TELEMETRY_SETTINGS_KEY]),
    state: telemetry.normalizeTelemetryState(data[telemetry.TELEMETRY_STATE_KEY])
  };
}

async function writeTelemetryState(patch) {
  const current = await storage.get(telemetry.TELEMETRY_STATE_KEY);
  const next = {
    ...telemetry.normalizeTelemetryState(current[telemetry.TELEMETRY_STATE_KEY]),
    ...patch
  };
  await storage.set({ [telemetry.TELEMETRY_STATE_KEY]: next });
}

async function updateQueue(queue) {
  await storage.set({
    [telemetry.TELEMETRY_QUEUE_KEY]: queue,
    [telemetry.TELEMETRY_STATE_KEY]: {
      ...(await readTelemetryBundle()).state,
      queueSize: queue.length
    }
  });
}

async function ensureAlarm() {
  const existing = await alarms.get(telemetry.TELEMETRY_FLUSH_ALARM);
  if (existing) {
    return;
  }

  alarms.create(telemetry.TELEMETRY_FLUSH_ALARM, {
    periodInMinutes: 15
  });
}

async function enqueueTelemetryEvent(event) {
  if (!event || typeof event.eventId !== "string") {
    return;
  }

  const { queue, settings, state } = await readTelemetryBundle();
  if (!settings.enabled || !settings.endpointUrl) {
    return;
  }

  const nextQueue = telemetry.appendQueueItems(queue, [event]);
  await storage.set({
    [telemetry.TELEMETRY_QUEUE_KEY]: nextQueue,
    [telemetry.TELEMETRY_STATE_KEY]: {
      ...state,
      queueSize: nextQueue.length
    }
  });
}

async function flushTelemetryQueue() {
  if (flushInFlight) {
    return { skipped: true, reason: "in_flight" };
  }

  flushInFlight = true;

  try {
    const { queue, settings, state } = await readTelemetryBundle();
    if (!settings.enabled || !settings.endpointUrl) {
      await writeTelemetryState({
        queueSize: queue.length,
        lastError: settings.enabled ? "Missing endpoint URL." : ""
      });
      return { skipped: true, reason: settings.enabled ? "missing_endpoint" : "disabled" };
    }

    if (!queue.length) {
      await writeTelemetryState({
        queueSize: 0,
        lastError: ""
      });
      return { skipped: true, reason: "empty" };
    }

    const batch = queue.slice(0, telemetry.MAX_BATCH_SIZE);
    await writeTelemetryState({
      ...state,
      lastAttemptAt: new Date().toISOString(),
      lastError: "",
      queueSize: queue.length
    });

    const response = await fetch(settings.endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(telemetry.buildIngestRequest(batch))
    });

    if (!response.ok) {
      await writeTelemetryState({
        queueSize: queue.length,
        lastError: `Upload failed: HTTP ${response.status}`
      });
      return { skipped: false, reason: "http_error", status: response.status };
    }

    const payload = await response.json();
    const processedIds = Array.isArray(payload?.processedEventIds)
      ? new Set(payload.processedEventIds.filter((value) => typeof value === "string"))
      : null;

    if (!processedIds || processedIds.size === 0) {
      await writeTelemetryState({
        queueSize: queue.length,
        lastError: "Upload failed: response did not include processedEventIds."
      });
      return { skipped: false, reason: "invalid_response" };
    }

    const remainingQueue = queue.filter((item) => !processedIds.has(item.eventId));
    await storage.set({
      [telemetry.TELEMETRY_QUEUE_KEY]: remainingQueue,
      [telemetry.TELEMETRY_STATE_KEY]: {
        ...state,
        lastAttemptAt: new Date().toISOString(),
        lastSuccessAt: new Date().toISOString(),
        lastError: "",
        lastUploadedCount: processedIds.size,
        queueSize: remainingQueue.length
      }
    });

    if (remainingQueue.length > 0) {
      void flushTelemetryQueue();
    }

    return {
      skipped: false,
      uploadedCount: processedIds.size,
      remainingQueueSize: remainingQueue.length
    };
  } catch (error) {
    const { queue } = await readTelemetryBundle();
    await writeTelemetryState({
      queueSize: queue.length,
      lastError: `Upload failed: ${error.message || "unknown error"}`
    });
    return { skipped: false, reason: "exception", message: error.message || "unknown error" };
  } finally {
    flushInFlight = false;
  }
}

runtime.onMessage.addListener((message) => {
  if (message?.type === "telemetry/queue-event") {
    return enqueueTelemetryEvent(message.event);
  }

  if (message?.type === "telemetry/flush-now") {
    return flushTelemetryQueue();
  }

  return undefined;
});

alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name === telemetry.TELEMETRY_FLUSH_ALARM) {
    void flushTelemetryQueue();
  }
});

runtime.onInstalled.addListener(() => {
  void ensureAlarm();
  void flushTelemetryQueue();
});

runtime.onStartup?.addListener(() => {
  void ensureAlarm();
  void flushTelemetryQueue();
});

ext.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (changes[telemetry.TELEMETRY_SETTINGS_KEY]) {
    const nextSettings = telemetry.normalizeTelemetrySettings(changes[telemetry.TELEMETRY_SETTINGS_KEY].newValue);
    if (!nextSettings.enabled) {
      void storage.set({
        [telemetry.TELEMETRY_QUEUE_KEY]: [],
        [telemetry.TELEMETRY_STATE_KEY]: {
          ...telemetry.DEFAULT_TELEMETRY_STATE,
          queueSize: 0
        }
      });
      return;
    }
    void flushTelemetryQueue();
  }
});

void ensureAlarm();
