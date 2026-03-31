(function () {
  "use strict";

  const core = globalThis.LlmTimingCore;
  const overlayApi = globalThis.LlmTimingOverlay;

  if (!core || !overlayApi) {
    console.error("[LLM TTFW Tracker] Missing content dependencies.");
    return;
  }

  const {
    countWords,
    createMeasurementTracker,
    createSessionId,
    normalizeText,
    reportableStallMs,
    stripMeasurementNoise,
    truncateText
  } = core;
  const { createOverlayController } = overlayApi;

  const STORAGE_KEY = "chatgpt_ttfw_samples";
  const OVERLAY_SETTINGS_KEY = "chatgpt_ttfw_overlay_settings";
  const MAX_SAMPLES = 10000;
  const HARD_TIMEOUT_MS = 120000;
  const DEBUG = false;
  const SESSION_ID = createSessionId();
  const SITE = window.location.hostname.includes("claude.ai")
    ? "claude"
    : window.location.hostname.includes("perplexity.ai")
    ? "perplexity"
    : window.location.hostname.includes("gemini.google.com")
    ? "gemini"
    : "chatgpt";
  const SITE_CONFIG = {
    chatgpt: {
      name: "ChatGPT",
      composerSelector:
        "textarea[name='prompt-textarea'], textarea.wcDTda_fallbackTextarea, div[contenteditable='true'][role='textbox'], div[contenteditable='true']",
      sendButtonSelector:
        "#composer-submit-button, button[data-testid='send-button'], button[aria-label='Send prompt']",
      assistantTurnSelector:
        "article[data-turn='assistant'][data-testid^='conversation-turn-']",
      userTurnSelector:
        "article[data-turn='user'][data-testid^='conversation-turn-']",
      conversationTurnSelector:
        "article[data-testid^='conversation-turn-'][data-turn]",
      assistantMessageSelector:
        "[data-message-author-role='assistant']",
      markdownContentSelector:
        "[data-message-author-role='assistant'] .markdown, [data-message-author-role='assistant'] .prose, .markdown, .prose",
      streamingContentSelector:
        ".streaming-animation, [data-writing-block], .BZ_Pyq_root",
      streamingAttribute: null,
      requireMarkdownRoot: true,
      defaultModel: "unknown",
      completionSettleMs: 120
    },
    claude: {
      name: "Claude",
      composerSelector:
        "div[contenteditable='true'][class*='ProseMirror'], div[contenteditable='true']",
      sendButtonSelector:
        "button[aria-label='Send Message'], button[aria-label='Send message'], button[data-testid='send-button']",
      assistantTurnSelector: null,
      userTurnSelector: null,
      conversationTurnSelector: null,
      assistantMessageSelector: "[data-is-streaming]",
      markdownContentSelector: ".font-claude-response, [class*='font-claude-response']",
      streamingContentSelector: null,
      streamingAttribute: "data-is-streaming",
      requireMarkdownRoot: true,
      defaultModel: "claude",
      completionSettleMs: 600
    },
    perplexity: {
      name: "Perplexity",
      composerSelector: "textarea, div[contenteditable='true']",
      sendButtonSelector:
        "button[aria-label='Submit'], button[aria-label='Ask'], button[aria-label='Ask Perplexity'], button[aria-label='Search'], button[data-testid='submit-button'], form button[type='submit']",
      assistantTurnSelector: null,
      userTurnSelector: null,
      conversationTurnSelector: null,
      assistantMessageSelector: "[id^='markdown-content-']",
      markdownContentSelector: ".prose, [class*='prose'], [id^='markdown-content-']",
      streamingContentSelector: null,
      streamingAttribute: null,
      requireMarkdownRoot: false,
      defaultModel: "perplexity",
      completionSettleMs: 1500
    },
    gemini: {
      name: "Gemini",
      composerSelector:
        "rich-textarea .ql-editor[contenteditable='true'][role='textbox'], rich-textarea .ql-editor[contenteditable='true'], div.ql-editor[contenteditable='true'][role='textbox'], div.ql-editor[contenteditable='true']",
      sendButtonSelector:
        "button.send-button.submit, button[aria-label='Send message']",
      assistantTurnSelector: "model-response",
      userTurnSelector: null,
      conversationTurnSelector: null,
      assistantMessageSelector:
        "message-content, structured-content-container, .response-content",
      markdownContentSelector:
        "message-content .markdown, .markdown-main-panel, .markdown",
      streamingContentSelector:
        "[aria-busy='true'], .thoughts-container:not(:empty), .avatar_spinner_animation[style*='visibility: visible']",
      streamingAttribute: null,
      requireMarkdownRoot: true,
      defaultModel: "gemini",
      completionSettleMs: 700
    }
  }[SITE];
  const DEFAULT_OVERLAY_SETTINGS = {
    enabled: true,
    left: null,
    top: 16
  };
  const MIN_VISIBLE_OPACITY = 0.75;
  const POLL_MS = 100;

  const tracker = createMeasurementTracker({
    completionSettleMs: SITE_CONFIG.completionSettleMs,
    hardTimeoutMs: HARD_TIMEOUT_MS,
    now: nowMs
  });

  let processTimer = null;
  let pollTimer = null;
  let lastSubmitAt = 0;
  let lastComposerText = "";
  let latestSample = null;
  let overlaySample = null;
  let overlaySettings = { ...DEFAULT_OVERLAY_SETTINGS };

  const overlay = createOverlayController({
    siteName: SITE_CONFIG.name,
    title: "TTFW Overlay",
    defaultSettings: DEFAULT_OVERLAY_SETTINGS,
    onHide: () => {
      void saveOverlaySettings({ enabled: false });
    },
    onPositionChange: (position) => {
      void saveOverlaySettings(position);
    }
  });

  function debugLog(...args) {
    if (DEBUG) {
      console.debug("[LLM TTFW Tracker]", ...args);
    }
  }

  function nowMs() {
    return performance.now();
  }

  function queryAll(selector, root = document) {
    if (!selector) {
      return [];
    }

    return Array.from(root.querySelectorAll(selector));
  }

  function queryOne(selector, root = document) {
    if (!selector) {
      return null;
    }

    return root.querySelector(selector);
  }

  function getStorageArea() {
    return typeof browser !== "undefined" ? browser.storage.local : chrome.storage.local;
  }

  function getStorageEvents() {
    return typeof browser !== "undefined" ? browser.storage : chrome.storage;
  }

  function formatMs(value) {
    if (!value && value !== 0) {
      return "-";
    }

    if (value >= 1000) {
      return `${(value / 1000).toFixed(2)} s`;
    }

    return `${Math.round(value)} ms`;
  }

  function formatNumber(value) {
    if (!value && value !== 0) {
      return "-";
    }

    return Number(value).toFixed(2);
  }

  function formatRate(value) {
    if (!value && value !== 0) {
      return "-";
    }

    return Number(value).toFixed(1);
  }

  function liveLongestStallMs(run, now = nowMs()) {
    if (!run?.firstWordAt) {
      return null;
    }

    const events = Array.isArray(run.visibleProgressEvents) ? run.visibleProgressEvents : [];
    let longest = 0;

    for (let index = 1; index < events.length; index += 1) {
      longest = Math.max(longest, reportableStallMs(events[index].idleGapMs));
    }

    const currentIdleGap = reportableStallMs(run.stallIdleMsSinceProgress);
    return Math.max(longest, currentIdleGap);
  }

  function normalizeOverlaySettings(raw) {
    return {
      enabled: raw?.enabled === undefined ? DEFAULT_OVERLAY_SETTINGS.enabled : Boolean(raw?.enabled),
      left: Number.isFinite(raw?.left) ? raw.left : null,
      top: Number.isFinite(raw?.top) ? raw.top : DEFAULT_OVERLAY_SETTINGS.top
    };
  }

  function isVisible(element) {
    if (!element || !(element instanceof Element)) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none"
    );
  }

  function getMessageRoot(message) {
    if (!message) {
      return null;
    }

    return SITE_CONFIG.assistantTurnSelector && message.matches?.(SITE_CONFIG.assistantTurnSelector)
      ? queryOne(SITE_CONFIG.assistantMessageSelector, message) || message
      : message;
  }

  function getMeasurementRoot(message) {
    const messageRoot = getMessageRoot(message);
    if (!messageRoot) {
      return null;
    }

    if (!SITE_CONFIG.requireMarkdownRoot) {
      return messageRoot;
    }

    return queryOne(SITE_CONFIG.markdownContentSelector, messageRoot);
  }

  function getModelSlug(message) {
    const messageRoot = getMessageRoot(message);
    if (!messageRoot) {
      return SITE_CONFIG.defaultModel;
    }

    const directAttr =
      messageRoot.getAttribute("data-message-model-slug") ||
      messageRoot.closest?.("[data-message-model-slug]")?.getAttribute("data-message-model-slug");
    if (directAttr) {
      return directAttr;
    }

    const nestedAttr = messageRoot.querySelector?.("[data-message-model-slug]");
    return nestedAttr?.getAttribute("data-message-model-slug") || SITE_CONFIG.defaultModel;
  }

  function getConnectionInfo() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return {
      connectionEffectiveType: connection?.effectiveType || null,
      connectionRttMs: Number.isFinite(connection?.rtt) ? connection.rtt : null,
      connectionDownlinkMbps: Number.isFinite(connection?.downlink) ? connection.downlink : null,
      connectionSaveData: typeof connection?.saveData === "boolean" ? connection.saveData : null
    };
  }

  function getRunContext(startedWallClock) {
    const startedDate = new Date(startedWallClock);
    return {
      hostname: window.location.hostname,
      locale: navigator.language || null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      utcOffsetMinutes: startedDate.getTimezoneOffset() * -1,
      visibilityStateAtStart: document.visibilityState,
      wasPageVisibleAtStart: document.visibilityState === "visible",
      onlineAtStart: navigator.onLine,
      ...getConnectionInfo()
    };
  }

  async function saveOverlaySettings(patch) {
    overlaySettings = normalizeOverlaySettings({
      ...overlaySettings,
      ...patch
    });
    overlay.setSettings(overlaySettings);
    await getStorageArea().set({ [OVERLAY_SETTINGS_KEY]: overlaySettings });
  }

  function getVisibleComposer() {
    const candidates = queryAll(SITE_CONFIG.composerSelector).filter(isVisible);
    candidates.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);
    return candidates[0] || null;
  }

  function getComposerText(element) {
    if (!element) {
      return "";
    }

    if (typeof element.value === "string") {
      return normalizeText(element.value);
    }

    return normalizeText(element.innerText || element.textContent || "");
  }

  function buttonText(button) {
    return normalizeText(
      [
        button.getAttribute("aria-label"),
        button.getAttribute("title"),
        button.innerText,
        button.textContent
      ]
        .filter(Boolean)
        .join(" ")
    ).toLowerCase();
  }

  function isStopButton(button) {
    if (!button || !isVisible(button)) {
      return false;
    }

    const text = buttonText(button);
    const testId = (button.getAttribute("data-testid") || "").toLowerCase();
    const id = (button.id || "").toLowerCase();

    return (
      (id === "composer-submit-button" && text.includes("stop")) ||
      text.includes("stop generating") ||
      text.includes("stop streaming") ||
      text.includes("stop response") ||
      text === "stop" ||
      testId.includes("stop")
    );
  }

  function isSendButton(button) {
    if (!button || !isVisible(button) || button.disabled) {
      return false;
    }

    const text = buttonText(button);
    const testId = (button.getAttribute("data-testid") || "").toLowerCase();
    const type = (button.getAttribute("type") || "").toLowerCase();
    const id = (button.id || "").toLowerCase();

    return (
      button.matches(SITE_CONFIG.sendButtonSelector) ||
      id === "composer-submit-button" ||
      type === "submit" ||
      text.includes("send prompt") ||
      text.includes("send message") ||
      text.includes("ask perplexity") ||
      text.includes("ask") ||
      text.includes("submit") ||
      testId.includes("send")
    );
  }

  function generationLooksActive() {
    const selector = SITE_CONFIG.sendButtonSelector
      ? `${SITE_CONFIG.sendButtonSelector}, button`
      : "button";
    if (queryAll(selector).some(isStopButton)) {
      return true;
    }

    if (SITE_CONFIG.streamingAttribute) {
      return queryAll(`[${SITE_CONFIG.streamingAttribute}="true"]`).some(isVisible);
    }

    return false;
  }

  function getAssistantContainers() {
    const turnArticles = queryAll(SITE_CONFIG.assistantTurnSelector).filter(isVisible);
    if (turnArticles.length > 0) {
      return turnArticles;
    }

    const explicitRole = queryAll(SITE_CONFIG.assistantMessageSelector).filter(isVisible);
    if (explicitRole.length > 0) {
      return explicitRole;
    }

    return Array.from(document.querySelectorAll("article"))
      .filter(isVisible)
      .filter((article) => {
        const labels = normalizeText(
          [
            article.getAttribute("aria-label"),
            article.getAttribute("data-testid"),
            article.querySelector("button[aria-label*='Copy'], button[title*='Copy']")
              ? "copy"
              : ""
          ]
            .filter(Boolean)
            .join(" ")
        ).toLowerCase();

        return labels.includes("assistant") || labels.includes("copy");
      });
  }

  function getMeasuredText(message) {
    const measurementRoot = getMeasurementRoot(message);
    if (!measurementRoot) {
      return "";
    }

    const contentRoots = [
      "[data-testid='conversation-turn-content']",
      SITE_CONFIG.markdownContentSelector,
      "[class*='markdown']"
    ]
      .flatMap((selector) => Array.from(measurementRoot.querySelectorAll(selector)))
      .filter(isVisible);

    let text = "";
    if (contentRoots.length > 0) {
      text = contentRoots.map((node) => node.innerText || node.textContent || "").join(" ");
    } else if (SITE_CONFIG.requireMarkdownRoot) {
      text = measurementRoot.innerText || measurementRoot.textContent || "";
    } else {
      text = message.innerText || message.textContent || "";
    }

    return stripMeasurementNoise(text);
  }

  function hasVisibleTextRect(textNode) {
    const range = document.createRange();
    range.selectNodeContents(textNode);
    const rects = Array.from(range.getClientRects());
    range.detach?.();
    return rects.some((rect) => rect.width > 0 && rect.height > 0);
  }

  function isElementActuallyVisible(element, root) {
    let current = element;

    while (current && current !== root) {
      const style = window.getComputedStyle(current);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) < MIN_VISIBLE_OPACITY
      ) {
        return false;
      }

      current = current.parentElement;
    }

    return true;
  }

  function getVisibleMeasuredText(message) {
    const measurementRoot = getMeasurementRoot(message);
    if (!measurementRoot) {
      return "";
    }

    const walker = document.createTreeWalker(measurementRoot, NodeFilter.SHOW_TEXT);
    const parts = [];

    let currentNode = walker.nextNode();
    while (currentNode) {
      const parent = currentNode.parentElement;
      if (
        parent &&
        normalizeText(currentNode.textContent).length > 0 &&
        isVisible(parent) &&
        isElementActuallyVisible(parent, measurementRoot) &&
        hasVisibleTextRect(currentNode)
      ) {
        parts.push(currentNode.textContent || "");
      }

      currentNode = walker.nextNode();
    }

    return stripMeasurementNoise(parts.join(" "));
  }

  function candidateLooksStreaming(candidate) {
    if (!candidate || !(candidate instanceof Element)) {
      return false;
    }

    if (SITE_CONFIG.streamingAttribute) {
      return candidate.getAttribute(SITE_CONFIG.streamingAttribute) === "true";
    }

    return Boolean(queryOne(SITE_CONFIG.streamingContentSelector, candidate));
  }

  function shouldBlockStall(run, candidate, observation) {
    if (!run?.firstWordAt) {
      return Boolean(observation.generationActive || observation.candidateStreaming);
    }

    if (SITE !== "gemini") {
      return false;
    }

    const visibleWordCount = Number(observation.visibleWordCount) || 0;
    if (visibleWordCount === 0) {
      return true;
    }

    const measurementRoot = getMeasurementRoot(candidate);
    const visibleBusyIndicator = measurementRoot
      ? queryAll(
          "[aria-busy='true'], .thoughts-container:not(:empty), .avatar_spinner_animation[style*='visibility: visible']",
          measurementRoot
        ).some(isVisible)
      : false;

    return visibleBusyIndicator;
  }

  function captureAssistantSnapshot() {
    return getAssistantContainers().map((element) => {
      const text = getMeasuredText(element);
      return {
        element,
        turnId: element.getAttribute("data-turn-id") || element.getAttribute("data-message-id") || "",
        textLength: text.length,
        wordCount: countWords(text)
      };
    });
  }

  function getBaselineRecord(run, element) {
    const baselineAssistants = run.metadata?.baselineAssistants || [];
    const turnId = element.getAttribute("data-turn-id") || element.getAttribute("data-message-id") || "";
    return baselineAssistants.find((entry) => entry.element === element || (turnId && entry.turnId === turnId)) || null;
  }

  function getLatestUserTurn() {
    return queryAll(SITE_CONFIG.userTurnSelector).filter(isVisible).at(-1) || null;
  }

  function getConversationTurns() {
    return queryAll(SITE_CONFIG.conversationTurnSelector).filter(isVisible);
  }

  function getAssistantTurnsAfterSubmittedUser(run) {
    const turns = getConversationTurns();
    const baselineUserTurnId = run.metadata?.baselineUserTurnId || "";
    let startIndex = 0;

    if (baselineUserTurnId) {
      const baselineIndex = turns.findIndex(
        (turn) => turn.getAttribute("data-turn") === "user" &&
          (turn.getAttribute("data-turn-id") || "") === baselineUserTurnId
      );
      if (baselineIndex >= 0) {
        startIndex = baselineIndex + 1;
      }
    }

    let sawNewUserTurn = false;
    const assistants = [];

    for (const turn of turns.slice(startIndex)) {
      const turnType = turn.getAttribute("data-turn");
      const turnId = turn.getAttribute("data-turn-id") || "";

      if (turnType === "user" && turnId && turnId !== baselineUserTurnId) {
        sawNewUserTurn = true;
        continue;
      }

      if (sawNewUserTurn && turnType === "assistant") {
        assistants.push(turn);
      }
    }

    return {
      sawNewUserTurn,
      assistants
    };
  }

  function getRunCandidate(run) {
    const turnAwareCandidates = getAssistantTurnsAfterSubmittedUser(run);
    const hasTurnStructure = Boolean(SITE_CONFIG.conversationTurnSelector) &&
      queryOne(SITE_CONFIG.conversationTurnSelector) !== null;

    let candidates = [];
    if (hasTurnStructure) {
      if (!turnAwareCandidates.sawNewUserTurn) {
        return null;
      }
      candidates = turnAwareCandidates.assistants;
    } else {
      candidates = getAssistantContainers();
    }

    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const assistant = candidates[index];
      if (run.metadata?.trackedElement === assistant) {
        return assistant;
      }

      const baseline = getBaselineRecord(run, assistant);
      if (!baseline) {
        return assistant;
      }

      const text = getMeasuredText(assistant);
      const words = countWords(text);
      if (words > baseline.wordCount || text.length > baseline.textLength) {
        return assistant;
      }
    }

    return null;
  }

  function buildObservation(candidate) {
    const text = getMeasuredText(candidate);
    const visibleText = getVisibleMeasuredText(candidate);

    return {
      candidateId: candidate.getAttribute("data-turn-id") || candidate.getAttribute("data-message-id") || "",
      totalWordCount: countWords(text),
      visibleWordCount: countWords(visibleText),
      modelSlug: getModelSlug(candidate),
      candidateStreaming: candidateLooksStreaming(candidate)
    };
  }

  function buildPersistedSample(run, metrics, reason) {
    const context = run.metadata?.context || {};

    return {
      id: metrics.id,
      sessionId: SESSION_ID,
      site: SITE,
      model: metrics.modelSlug || "unknown",
      hostname: context.hostname || window.location.hostname,
      startedAt: new Date(metrics.startedWallClock).toISOString(),
      locale: context.locale || null,
      timezone: context.timezone || null,
      utcOffsetMinutes: context.utcOffsetMinutes ?? null,
      visibilityStateAtStart: context.visibilityStateAtStart || null,
      wasPageVisibleAtStart: context.wasPageVisibleAtStart ?? null,
      onlineAtStart: context.onlineAtStart ?? null,
      connectionEffectiveType: context.connectionEffectiveType ?? null,
      connectionRttMs: context.connectionRttMs ?? null,
      connectionDownlinkMbps: context.connectionDownlinkMbps ?? null,
      connectionSaveData: context.connectionSaveData ?? null,
      inputWords: run.inputWordCount,
      ttfwMs: metrics.ttfwMs,
      ttlwMs: metrics.ttlwMs,
      streamingMs: metrics.streamingMs,
      wordCount: metrics.wordCount,
      wordsPerSecond: metrics.wordsPerSecond,
      endToEndWordsPerSecond: metrics.endToEndWordsPerSecond,
      longestStallMs: metrics.longestStallMs,
      stallCount500Ms: metrics.stallCount500Ms,
      stallCount1000Ms: metrics.stallCount1000Ms,
      p95InterChunkGapMs: metrics.p95InterChunkGapMs,
      reason
    };
  }

  function updateOverlay() {
    const activeRun = tracker.getActiveRun();
    let status = "idle";
    let statusText = latestSample ? "Idle" : "Armed";
    let statusIcon = latestSample ? "✓" : "•";
    let promptText = "Waiting for the next prompt on this page.";
    let elapsedText = "-";
    let firstWordText = "-";
    let lastWordText = "-";
    let stallText = "-";
    let wpsText = "-";
    let wordCountText = "-";

    if (activeRun) {
      const elapsed = nowMs() - activeRun.startedAt;
      const firstWordDelay = activeRun.firstWordAt ? activeRun.firstWordAt - activeRun.startedAt : null;
      const candidateStreaming = candidateLooksStreaming(activeRun.metadata?.trackedElement);
      const visibleWordCount = Number(activeRun.visibleWordCount) || 0;
      const liveStreamingMs = activeRun.firstWordAt ? Math.max(1, nowMs() - activeRun.firstWordAt) : 0;
      const liveWps = activeRun.firstWordAt && visibleWordCount > 0
        ? (visibleWordCount / (liveStreamingMs / 1000))
        : null;

      status = activeRun.firstWordAt
        ? (generationLooksActive() || candidateStreaming ? "streaming" : "finishing")
        : "waiting";
      statusText =
        status === "streaming" ? "Streaming" :
        status === "finishing" ? "Finishing" :
        "Waiting...";
      statusIcon =
        status === "streaming" ? "⚡" :
        status === "finishing" ? "…" :
        "⏳";
      promptText = truncateText(activeRun.promptPreview || "Prompt submitted.", 96);
      elapsedText = formatMs(elapsed);
      firstWordText = firstWordDelay ? formatMs(firstWordDelay) : "waiting...";
      lastWordText =
        status === "streaming" ? "streaming..." :
        status === "finishing" ? "finishing..." :
        "waiting...";
      stallText = activeRun.firstWordAt ? formatMs(liveLongestStallMs(activeRun, nowMs())) : "waiting...";
      wpsText = liveWps !== null ? `~${formatRate(liveWps)}` : "—";
      wordCountText = visibleWordCount > 0 ? String(visibleWordCount) : "—";
    } else if (overlaySample) {
      status = "complete";
      statusText = "Complete";
      statusIcon = "✓";
      promptText = "Last completed run.";
      elapsedText = formatMs(overlaySample.ttlwMs);
      firstWordText = formatMs(overlaySample.ttfwMs);
      lastWordText = formatMs(overlaySample.ttlwMs);
      stallText = formatMs(overlaySample.longestStallMs);
      wpsText = formatRate(overlaySample.wordsPerSecond);
      wordCountText = String(overlaySample.wordCount || 0);
    }

    const latestSummary = latestSample
      ? truncateText(
          `Last run: ${latestSample.site || SITE} | ${latestSample.model || "unknown"} | TTFW ${formatMs(latestSample.ttfwMs)} | TTLW ${formatMs(latestSample.ttlwMs)} | ${latestSample.wordCount} words | ${formatNumber(latestSample.wordsPerSecond)} wps`,
          108
        )
      : "No completed runs captured yet.";

    overlay.render({
      status,
      statusText,
      statusIcon,
      promptText,
      elapsedText,
      firstWordText,
      lastWordText,
      stallText,
      wpsText,
      wordCountText,
      latestSummary
    });
  }

  async function persistSample(sample) {
    const storage = getStorageArea();
    const current = await storage.get(STORAGE_KEY);
    const items = Array.isArray(current[STORAGE_KEY]) ? current[STORAGE_KEY] : [];
    const next = [sample, ...items].slice(0, MAX_SAMPLES);
    await storage.set({ [STORAGE_KEY]: next });
  }

  async function handleCompletedRun(result) {
    if (!result.metrics) {
      updateOverlay();
      return;
    }

    const sample = buildPersistedSample(result.run, result.metrics, result.reason);
    debugLog("persist sample", sample);
    overlaySample = sample;
    latestSample = sample;
    updateOverlay();
    await persistSample(sample);
  }

  function scheduleProcess(delay = 0) {
    if (!tracker.getActiveRun()) {
      return;
    }

    clearTimeout(processTimer);
    processTimer = setTimeout(processActiveRun, delay);
  }

  function processActiveRun() {
    const timeoutResult = tracker.checkTimeout();
    if (timeoutResult) {
      debugLog("discarding incomplete run", timeoutResult.reason, timeoutResult.run);
      updateOverlay();
      return;
    }

    const run = tracker.getActiveRun();
    if (!run) {
      return;
    }

    const candidate = getRunCandidate(run);
    if (!candidate) {
      updateOverlay();
      return;
    }

    run.metadata.trackedElement = candidate;

    const observation = buildObservation(candidate);
    observation.generationActive = generationLooksActive();
    observation.stallBlocked = shouldBlockStall(run, candidate, observation);

    const result = tracker.observe(observation);

    if (result?.type === "complete") {
      void handleCompletedRun(result);
      return;
    }

    updateOverlay();
  }

  function startRun(triggerType, composerElement) {
    const currentMs = nowMs();
    if (currentMs - lastSubmitAt < 250) {
      return;
    }
    lastSubmitAt = currentMs;

    const previousRun = tracker.resetRun("superseded");
    if (previousRun) {
      debugLog("reset run", previousRun.reason, previousRun.run);
    }

    overlaySample = null;

    const fullPromptText = getComposerText(composerElement) || lastComposerText;
    const promptPreview = fullPromptText.slice(0, 240);
    const latestUserTurn = getLatestUserTurn();
    const startedWallClock = Date.now();

    const run = tracker.startRun({
      triggerType,
      promptText: fullPromptText,
      promptPreview,
      inputWordCount: countWords(fullPromptText),
      startedWallClock,
      metadata: {
        context: getRunContext(startedWallClock),
        baselineAssistants: captureAssistantSnapshot(),
        baselineUserTurnId: latestUserTurn ? latestUserTurn.getAttribute("data-turn-id") || "" : "",
        trackedElement: null
      }
    });

    debugLog("start run", run);
    scheduleProcess(0);
    updateOverlay();
  }

  function handleSubmitEvent(event) {
    const form = event.target instanceof Element ? event.target.closest("form") : null;
    const composer = form ? queryOne(SITE_CONFIG.composerSelector, form) : getVisibleComposer();
    if (!composer || !isVisible(composer)) {
      return;
    }

    startRun("submit", composer);
  }

  function handleKeyDown(event) {
    if (event.defaultPrevented || event.isComposing) {
      return;
    }

    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const composer = target.closest(SITE_CONFIG.composerSelector);
    if (!composer || !isVisible(composer)) {
      return;
    }

    startRun("enter", composer);
  }

  function handleClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const button = target.closest("button");
    if (!button || !isSendButton(button)) {
      return;
    }

    startRun("click", getVisibleComposer());
  }

  function handleComposerInput(event) {
    const target = event.target;
    if (!(target instanceof Element) || !target.matches(SITE_CONFIG.composerSelector)) {
      return;
    }

    lastComposerText = getComposerText(target);
  }

  function handleMutation(mutations) {
    if (!tracker.getActiveRun()) {
      return;
    }

    for (const mutation of mutations) {
      if (!(mutation.target instanceof Element || mutation.target instanceof Text)) {
        continue;
      }

      const node = mutation.target instanceof Text ? mutation.target.parentElement : mutation.target;
      const turn = SITE_CONFIG.conversationTurnSelector
        ? node?.closest?.(SITE_CONFIG.conversationTurnSelector)
        : null;
      if (turn && (turn.getAttribute("data-turn") === "assistant" || turn.getAttribute("data-turn") === "user")) {
        scheduleProcess(25);
        return;
      }
    }

    scheduleProcess(50);
  }

  function handleStorageChange(changes, areaName) {
    if (areaName !== "local") {
      return;
    }

    if (changes[OVERLAY_SETTINGS_KEY]) {
      overlaySettings = normalizeOverlaySettings(changes[OVERLAY_SETTINGS_KEY].newValue);
      overlay.setSettings(overlaySettings);
      updateOverlay();
    }

    if (changes[STORAGE_KEY]) {
      const samples = Array.isArray(changes[STORAGE_KEY].newValue) ? changes[STORAGE_KEY].newValue : [];
      latestSample = samples[0] || null;
      updateOverlay();
    }
  }

  function sanitizeStoredSamples(samples) {
    let changed = false;
    const sanitized = samples.map((sample) => {
      if (!sample || typeof sample !== "object" || Array.isArray(sample)) {
        return sample;
      }

      const next = { ...sample };
      if ("promptPreview" in next) {
        delete next.promptPreview;
        changed = true;
      }
      if ("url" in next) {
        delete next.url;
        changed = true;
      }
      if ("title" in next) {
        delete next.title;
        changed = true;
      }
      return next;
    });

    return { sanitized, changed };
  }

  async function loadInitialState() {
    const storage = getStorageArea();
    const data = await storage.get([STORAGE_KEY, OVERLAY_SETTINGS_KEY]);
    const storedSamples = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
    const { sanitized: samples, changed } = sanitizeStoredSamples(storedSamples);

    if (changed) {
      await storage.set({ [STORAGE_KEY]: samples });
    }

    latestSample = samples[0] || null;
    overlaySettings = normalizeOverlaySettings(data[OVERLAY_SETTINGS_KEY]);
    overlay.setSettings(overlaySettings);
    updateOverlay();
  }

  function initMutationObserver() {
    const observer = new MutationObserver(handleMutation);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function initPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (tracker.getActiveRun()) {
        processActiveRun();
      }
    }, POLL_MS);
  }

  function init() {
    document.addEventListener("submit", handleSubmitEvent, true);
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("click", handleClick, true);
    document.addEventListener("input", handleComposerInput, true);
    initMutationObserver();
    initPolling();

    const storageEvents = getStorageEvents();
    if (storageEvents.onChanged && typeof storageEvents.onChanged.addListener === "function") {
      storageEvents.onChanged.addListener(handleStorageChange);
    }

    void loadInitialState();
    debugLog("initialized");
  }

  init();
})();
