const MAX_BATCH_SIZE = 25;
const MAX_REQUESTS_PER_HOUR = 120;
const MAX_EVENTS_PER_HOUR = 2000;
const MAX_TTLW_MS = 10 * 60 * 1000;
const MAX_WORD_COUNT = 50000;
const JSON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: JSON_HEADERS
      });
    }

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "llm-performance-tracker" });
    }

    if (request.method === "POST" && url.pathname === "/ingest") {
      return handleIngest(request, env);
    }

    return json({ ok: false, error: "Not found." }, 404);
  }
};

async function handleIngest(request, env) {
  let body;

  try {
    body = await request.json();
  } catch (_error) {
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }

  const events = Array.isArray(body?.events) ? body.events : null;
  if (!events) {
    return json({ ok: false, error: "Body must include an events array." }, 400);
  }

  if (events.length === 0) {
    return json({ ok: true, processedEventIds: [], acceptedCount: 0, rejectedCount: 0, duplicateCount: 0 });
  }

  if (events.length > MAX_BATCH_SIZE) {
    return json({ ok: false, error: `Batch exceeds max size of ${MAX_BATCH_SIZE}.` }, 400);
  }

  const nowIso = new Date().toISOString();
  const requestMeta = await buildRequestMeta(request);
  const limit = await incrementRateLimit(env.DB, requestMeta.ipHash, events.length, nowIso);
  if (limit.requestCount > MAX_REQUESTS_PER_HOUR || limit.eventCount > MAX_EVENTS_PER_HOUR) {
    return json({ ok: false, error: "Rate limit exceeded." }, 429);
  }

  const processedEventIds = [];
  let acceptedCount = 0;
  let duplicateCount = 0;
  let rejectedCount = 0;

  for (const event of events) {
    const validation = validateEvent(event);
    if (!validation.ok) {
      rejectedCount += 1;
      if (typeof event?.eventId === "string") {
        processedEventIds.push(event.eventId);
      }
      await storeRejectedEvent(env.DB, nowIso, event?.eventId || null, validation.error, event);
      continue;
    }

    const payload = validation.value;
    const inserted = await insertEvent(env.DB, {
      ...payload,
      receivedAt: nowIso,
      country: requestMeta.country,
      ipHash: requestMeta.ipHash,
      userAgentHash: requestMeta.userAgentHash
    });

    processedEventIds.push(payload.eventId);
    if (inserted) {
      acceptedCount += 1;
    } else {
      duplicateCount += 1;
    }
  }

  return json({
    ok: true,
    processedEventIds,
    acceptedCount,
    duplicateCount,
    rejectedCount
  });
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS
  });
}

async function buildRequestMeta(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const userAgent = request.headers.get("User-Agent") || "";

  return {
    country: request.headers.get("CF-IPCountry") || "unknown",
    ipHash: await sha256Hex(ip),
    userAgentHash: await sha256Hex(userAgent)
  };
}

async function incrementRateLimit(db, ipHash, eventCount, nowIso) {
  const windowStartedAt = nowIso.slice(0, 13) + ":00:00.000Z";
  const windowKey = `${ipHash}:${windowStartedAt}`;

  const result = await db.prepare(`
    INSERT INTO rate_limits (window_key, ip_hash, window_started_at, request_count, event_count, updated_at)
    VALUES (?, ?, ?, 1, ?, ?)
    ON CONFLICT(window_key) DO UPDATE SET
      request_count = request_count + 1,
      event_count = event_count + excluded.event_count,
      updated_at = excluded.updated_at
    RETURNING request_count, event_count
  `).bind(windowKey, ipHash, windowStartedAt, eventCount, nowIso).first();

  return {
    requestCount: Number(result?.request_count) || 0,
    eventCount: Number(result?.event_count) || 0
  };
}

function validateEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return { ok: false, error: "Event must be an object." };
  }

  const requiredString = (value) => typeof value === "string" && value.trim().length > 0;
  if (!requiredString(event.eventId)) {
    return { ok: false, error: "eventId is required." };
  }
  if (!requiredString(event.site)) {
    return { ok: false, error: "site is required." };
  }
  if (!requiredString(event.startedAt) || Number.isNaN(new Date(event.startedAt).getTime())) {
    return { ok: false, error: "startedAt must be a valid ISO timestamp." };
  }

  const ttfwMs = parseFiniteNumber(event.ttfwMs);
  const ttlwMs = parseFiniteNumber(event.ttlwMs);
  const wordCount = parseFiniteNumber(event.wordCount);
  const wordsPerSecond = parseFiniteNumber(event.wordsPerSecond);
  const streamingMs = parseOptionalFiniteNumber(event.streamingMs);
  const longestStallMs = parseOptionalFiniteNumber(event.longestStallMs);
  const stallCount500Ms = parseOptionalFiniteNumber(event.stallCount500Ms);
  const stallCount1000Ms = parseOptionalFiniteNumber(event.stallCount1000Ms);
  const p95InterChunkGapMs = parseOptionalFiniteNumber(event.p95InterChunkGapMs);
  const inputWords = parseOptionalFiniteNumber(event.inputWords);
  const endToEndWordsPerSecond = parseOptionalFiniteNumber(event.endToEndWordsPerSecond);

  if (ttfwMs === null || ttlwMs === null || wordCount === null || wordsPerSecond === null) {
    return { ok: false, error: "Missing required numeric metrics." };
  }
  if (ttfwMs < 0 || ttlwMs < ttfwMs || ttlwMs > MAX_TTLW_MS) {
    return { ok: false, error: "Timing metrics are out of range." };
  }
  if (streamingMs !== null && streamingMs < 0) {
    return { ok: false, error: "streamingMs cannot be negative." };
  }
  if (longestStallMs !== null && longestStallMs < 0) {
    return { ok: false, error: "longestStallMs cannot be negative." };
  }
  if (stallCount500Ms !== null && stallCount500Ms < 0) {
    return { ok: false, error: "stallCount500Ms cannot be negative." };
  }
  if (stallCount1000Ms !== null && stallCount1000Ms < 0) {
    return { ok: false, error: "stallCount1000Ms cannot be negative." };
  }
  if (p95InterChunkGapMs !== null && p95InterChunkGapMs < 0) {
    return { ok: false, error: "p95InterChunkGapMs cannot be negative." };
  }
  if (wordCount < 0 || wordCount > MAX_WORD_COUNT) {
    return { ok: false, error: "wordCount is out of range." };
  }
  if (inputWords !== null && inputWords < 0) {
    return { ok: false, error: "inputWords cannot be negative." };
  }
  if (wordsPerSecond < 0 || wordsPerSecond > 10000) {
    return { ok: false, error: "wordsPerSecond is out of range." };
  }
  if (endToEndWordsPerSecond !== null && (endToEndWordsPerSecond < 0 || endToEndWordsPerSecond > 10000)) {
    return { ok: false, error: "endToEndWordsPerSecond is out of range." };
  }

  return {
    ok: true,
    value: {
      eventId: event.eventId,
      extensionVersion: optionalString(event.extensionVersion),
      sessionId: optionalString(event.sessionId),
      site: event.site,
      model: optionalString(event.model),
      hostname: optionalString(event.hostname),
      startedAt: new Date(event.startedAt).toISOString(),
      timezone: optionalString(event.timezone),
      locale: optionalString(event.locale),
      utcOffsetMinutes: parseOptionalFiniteNumber(event.utcOffsetMinutes),
      visibilityStateAtStart: optionalString(event.visibilityStateAtStart),
      wasPageVisibleAtStart: optionalBooleanToInt(event.wasPageVisibleAtStart),
      onlineAtStart: optionalBooleanToInt(event.onlineAtStart),
      connectionEffectiveType: optionalString(event.connectionEffectiveType),
      connectionRttMs: parseOptionalFiniteNumber(event.connectionRttMs),
      connectionDownlinkMbps: parseOptionalFiniteNumber(event.connectionDownlinkMbps),
      connectionSaveData: optionalBooleanToInt(event.connectionSaveData),
      inputWords,
      ttfwMs,
      ttlwMs,
      streamingMs,
      longestStallMs,
      stallCount500Ms,
      stallCount1000Ms,
      p95InterChunkGapMs,
      wordCount,
      wordsPerSecond,
      endToEndWordsPerSecond,
      reason: optionalString(event.reason),
      schemaVersion: parseFiniteNumber(event.schemaVersion) || 1
    }
  };
}

function parseFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalFiniteNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return parseFiniteNumber(value);
}

function optionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalBooleanToInt(value) {
  if (typeof value !== "boolean") {
    return null;
  }
  return value ? 1 : 0;
}

async function insertEvent(db, event) {
  const result = await db.prepare(`
    INSERT OR IGNORE INTO events (
      event_id,
      received_at,
      extension_version,
      session_id,
      site,
      model,
      hostname,
      started_at,
      timezone,
      locale,
      utc_offset_minutes,
      visibility_state_at_start,
      was_page_visible_at_start,
      online_at_start,
      connection_effective_type,
      connection_rtt_ms,
      connection_downlink_mbps,
      connection_save_data,
      input_words,
      ttfw_ms,
      ttlw_ms,
      streaming_ms,
      longest_stall_ms,
      stall_count_500_ms,
      stall_count_1000_ms,
      p95_inter_chunk_gap_ms,
      word_count,
      words_per_second,
      end_to_end_words_per_second,
      reason,
      country,
      ip_hash,
      user_agent_hash,
      schema_version
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    event.eventId,
    event.receivedAt,
    event.extensionVersion,
    event.sessionId,
    event.site,
    event.model,
    event.hostname,
    event.startedAt,
    event.timezone,
    event.locale,
    event.utcOffsetMinutes,
    event.visibilityStateAtStart,
    event.wasPageVisibleAtStart,
    event.onlineAtStart,
    event.connectionEffectiveType,
    event.connectionRttMs,
    event.connectionDownlinkMbps,
    event.connectionSaveData,
    event.inputWords,
    event.ttfwMs,
    event.ttlwMs,
    event.streamingMs,
    event.longestStallMs,
    event.stallCount500Ms,
    event.stallCount1000Ms,
    event.p95InterChunkGapMs,
    event.wordCount,
    event.wordsPerSecond,
    event.endToEndWordsPerSecond,
    event.reason,
    event.country,
    event.ipHash,
    event.userAgentHash,
    event.schemaVersion
  ).run();

  return Number(result?.meta?.changes) > 0;
}

async function storeRejectedEvent(db, receivedAt, eventId, reason, payload) {
  await db.prepare(`
    INSERT INTO rejected_events (received_at, event_id, reason, payload_json)
    VALUES (?, ?, ?, ?)
  `).bind(receivedAt, eventId, reason, JSON.stringify(payload)).run();
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
