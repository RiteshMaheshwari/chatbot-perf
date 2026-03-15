(function () {
  "use strict";

  const STORAGE_KEY = "chatgpt_ttfw_samples";
  const OVERLAY_SETTINGS_KEY = "chatgpt_ttfw_overlay_settings";
  const MAX_SAMPLES = 200;
  const COMPLETION_SETTLE_MS = 120;
  const HARD_TIMEOUT_MS = 120000;
  const POLL_MS = 100;
  const DEBUG = false;
  const COMPOSER_SELECTOR =
    "textarea[name='prompt-textarea'], textarea.wcDTda_fallbackTextarea, div[contenteditable='true'][role='textbox'], div[contenteditable='true']";
  const SEND_BUTTON_SELECTOR =
    "#composer-submit-button, button[data-testid='send-button'], button[aria-label='Send prompt']";
  const ASSISTANT_TURN_SELECTOR =
    "article[data-turn='assistant'][data-testid^='conversation-turn-']";
  const USER_TURN_SELECTOR =
    "article[data-turn='user'][data-testid^='conversation-turn-']";
  const CONVERSATION_TURN_SELECTOR =
    "article[data-testid^='conversation-turn-'][data-turn]";
  const ASSISTANT_MESSAGE_SELECTOR =
    "[data-message-author-role='assistant']";
  const MARKDOWN_CONTENT_SELECTOR =
    "[data-message-author-role='assistant'] .markdown, [data-message-author-role='assistant'] .prose, .markdown, .prose";
  const STREAMING_CONTENT_SELECTOR =
    ".streaming-animation, [data-writing-block], .BZ_Pyq_root";
  const MIN_VISIBLE_OPACITY = 0.75;
  const DEFAULT_OVERLAY_SETTINGS = {
    enabled: false,
    left: null,
    top: 16
  };

  let activeRun = null;
  let processTimer = null;
  let pollTimer = null;
  let hardTimeoutTimer = null;
  let lastSubmitAt = 0;
  let lastComposerText = "";
  let latestSample = null;
  let overlaySettings = { ...DEFAULT_OVERLAY_SETTINGS };
  let overlayRoot = null;
  let overlayRefs = null;

  function debugLog(...args) {
    if (DEBUG) {
      console.debug("[ChatGPT TTFW]", ...args);
    }
  }

  function nowMs() {
    return performance.now();
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

  function truncateText(text, maxLength) {
    const normalized = normalizeText(text);
    if (normalized.length <= maxLength) {
      return normalized;
    }

    return `${normalized.slice(0, maxLength - 1)}...`;
  }

  function normalizeOverlaySettings(raw) {
    return {
      enabled: Boolean(raw?.enabled),
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

  function normalizeText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function wordMatches(text) {
    return normalizeText(text).match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || [];
  }

  function countWords(text) {
    return wordMatches(text).length;
  }

  async function saveOverlaySettings(patch) {
    overlaySettings = normalizeOverlaySettings({
      ...overlaySettings,
      ...patch
    });
    await getStorageArea().set({ [OVERLAY_SETTINGS_KEY]: overlaySettings });
  }

  function getVisibleComposer() {
    const candidates = Array.from(document.querySelectorAll(COMPOSER_SELECTOR))
      .filter(isVisible);

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
      text === "stop" ||
      testId.includes("stop")
    );
  }

  function isSendButton(button) {
    if (!button || !isVisible(button)) {
      return false;
    }

    if (button.disabled) {
      return false;
    }

    const text = buttonText(button);
    const testId = (button.getAttribute("data-testid") || "").toLowerCase();
    const type = (button.getAttribute("type") || "").toLowerCase();
    const id = (button.id || "").toLowerCase();

    return (
      button.matches(SEND_BUTTON_SELECTOR) ||
      id === "composer-submit-button" ||
      type === "submit" ||
      text.includes("send prompt") ||
      text.includes("send message") ||
      text.includes("submit") ||
      testId.includes("send")
    );
  }

  function generationLooksActive() {
    return Array.from(document.querySelectorAll(SEND_BUTTON_SELECTOR + ", button")).some(isStopButton);
  }

  function getAssistantContainers() {
    const turnArticles = Array.from(document.querySelectorAll(ASSISTANT_TURN_SELECTOR))
      .filter(isVisible);

    if (turnArticles.length > 0) {
      return turnArticles;
    }

    const explicitRole = Array.from(document.querySelectorAll(ASSISTANT_MESSAGE_SELECTOR))
      .filter(isVisible);

    if (explicitRole.length > 0) {
      return explicitRole;
    }

    const articleFallback = Array.from(document.querySelectorAll("article"))
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

    return articleFallback;
  }

  function getMessageText(message) {
    if (!message) {
      return "";
    }

    const messageRoot = getMessageRoot(message);

    const contentRoots = [
      "[data-testid='conversation-turn-content']",
      MARKDOWN_CONTENT_SELECTOR,
      "[class*='markdown']"
    ]
      .flatMap((selector) => Array.from(messageRoot.querySelectorAll(selector)))
      .filter(isVisible);

    let text = "";
    if (contentRoots.length > 0) {
      text = contentRoots.map((node) => node.innerText || node.textContent || "").join(" ");
    } else {
      text = message.innerText || message.textContent || "";
    }

    return normalizeText(text)
      .replace(/\b(ChatGPT said:|You said:)\b/gi, "")
      .trim();
  }

  function getMessageRoot(message) {
    if (!message) {
      return null;
    }

    return message.matches?.(ASSISTANT_TURN_SELECTOR)
      ? message.querySelector(ASSISTANT_MESSAGE_SELECTOR) || message
      : message;
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

  function getVisibleMessageText(message) {
    const messageRoot = getMessageRoot(message);
    if (!messageRoot) {
      return "";
    }

    const walker = document.createTreeWalker(messageRoot, NodeFilter.SHOW_TEXT);
    const parts = [];

    let currentNode = walker.nextNode();
    while (currentNode) {
      const parent = currentNode.parentElement;
      if (
        parent &&
        normalizeText(currentNode.textContent).length > 0 &&
        isVisible(parent) &&
        isElementActuallyVisible(parent, messageRoot) &&
        hasVisibleTextRect(currentNode)
      ) {
        parts.push(currentNode.textContent || "");
      }

      currentNode = walker.nextNode();
    }

    return normalizeText(parts.join(" "));
  }

  function candidateLooksStreaming(candidate) {
    if (!candidate || !(candidate instanceof Element)) {
      return false;
    }

    return Boolean(candidate.querySelector(STREAMING_CONTENT_SELECTOR));
  }

  function ensureOverlayStyles() {
    if (document.getElementById("chatgpt-ttfw-overlay-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "chatgpt-ttfw-overlay-style";
    style.textContent = `
      #chatgpt-ttfw-overlay {
        position: fixed;
        z-index: 2147483647;
        width: 320px;
        max-width: calc(100vw - 16px);
        color: #e8eef7;
        background:
          radial-gradient(circle at top left, rgba(94, 234, 212, 0.18), transparent 38%),
          linear-gradient(180deg, rgba(12, 18, 31, 0.96) 0%, rgba(20, 28, 43, 0.96) 100%);
        border: 1px solid rgba(148, 163, 184, 0.22);
        border-radius: 16px;
        box-shadow: 0 24px 56px rgba(2, 6, 23, 0.42);
        backdrop-filter: blur(16px);
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        overflow: hidden;
        user-select: none;
      }

      #chatgpt-ttfw-overlay * {
        box-sizing: border-box;
      }

      #chatgpt-ttfw-overlay[data-status="streaming"] {
        border-color: rgba(45, 212, 191, 0.55);
      }

      #chatgpt-ttfw-overlay[data-status="waiting"] {
        border-color: rgba(250, 204, 21, 0.45);
      }

      #chatgpt-ttfw-overlay .ttfw-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
        cursor: move;
        background: rgba(15, 23, 42, 0.36);
        border-bottom: 1px solid rgba(148, 163, 184, 0.12);
      }

      #chatgpt-ttfw-overlay .ttfw-title-wrap {
        min-width: 0;
      }

      #chatgpt-ttfw-overlay .ttfw-eyebrow {
        font-size: 10px;
        line-height: 1.3;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #8fb5d8;
      }

      #chatgpt-ttfw-overlay .ttfw-title {
        margin-top: 2px;
        font-size: 14px;
        line-height: 1.35;
        font-weight: 700;
        color: #f8fafc;
      }

      #chatgpt-ttfw-overlay .ttfw-hide {
        appearance: none;
        border: 0;
        background: rgba(148, 163, 184, 0.12);
        color: #dbe7f5;
        border-radius: 999px;
        padding: 7px 10px;
        font: inherit;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
      }

      #chatgpt-ttfw-overlay .ttfw-body {
        padding: 14px;
        display: grid;
        gap: 12px;
      }

      #chatgpt-ttfw-overlay .ttfw-status-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      #chatgpt-ttfw-overlay .ttfw-label {
        font-size: 10px;
        line-height: 1.3;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #8fb5d8;
      }

      #chatgpt-ttfw-overlay .ttfw-status-value {
        font-size: 13px;
        font-weight: 700;
        color: #f8fafc;
      }

      #chatgpt-ttfw-overlay .ttfw-prompt {
        font-size: 12px;
        line-height: 1.45;
        color: #dbe7f5;
        min-height: 34px;
      }

      #chatgpt-ttfw-overlay .ttfw-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }

      #chatgpt-ttfw-overlay .ttfw-card {
        background: rgba(148, 163, 184, 0.08);
        border: 1px solid rgba(148, 163, 184, 0.12);
        border-radius: 12px;
        padding: 10px;
      }

      #chatgpt-ttfw-overlay .ttfw-card-value {
        margin-top: 4px;
        font-size: 14px;
        line-height: 1.35;
        font-weight: 700;
        color: #f8fafc;
      }

      #chatgpt-ttfw-overlay .ttfw-section {
        display: grid;
        gap: 5px;
      }

      #chatgpt-ttfw-overlay .ttfw-summary {
        font-size: 12px;
        line-height: 1.45;
        color: #dbe7f5;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function clampOverlayPosition(left, top) {
    if (!overlayRoot) {
      return { left, top };
    }

    const width = overlayRoot.offsetWidth || 320;
    const height = overlayRoot.offsetHeight || 220;
    return {
      left: Math.min(Math.max(8, left), Math.max(8, window.innerWidth - width - 8)),
      top: Math.min(Math.max(8, top), Math.max(8, window.innerHeight - height - 8))
    };
  }

  function applyOverlayPosition() {
    if (!overlayRoot) {
      return;
    }

    const width = overlayRoot.offsetWidth || 320;
    const defaultLeft = Math.max(8, window.innerWidth - width - 16);
    const desiredLeft = overlaySettings.left ?? defaultLeft;
    const desiredTop = overlaySettings.top ?? DEFAULT_OVERLAY_SETTINGS.top;
    const position = clampOverlayPosition(desiredLeft, desiredTop);

    overlaySettings.left = position.left;
    overlaySettings.top = position.top;
    overlayRoot.style.left = `${position.left}px`;
    overlayRoot.style.top = `${position.top}px`;
  }

  function updateOverlay() {
    if (!overlayRoot || !overlayRefs) {
      return;
    }

    let status = "idle";
    let statusText = latestSample ? "Idle" : "Armed";
    let promptText = "Waiting for the next prompt on this page.";
    let elapsedText = "-";
    let firstWordText = "-";
    let wordCountText = "-";

    if (activeRun) {
      const elapsed = nowMs() - activeRun.startedAt;
      const firstWordDelay = activeRun.firstWordAt ? activeRun.firstWordAt - activeRun.startedAt : null;
      const candidateStreaming = candidateLooksStreaming(activeRun.trackedElement);
      status = activeRun.firstWordAt
        ? (generationLooksActive() || candidateStreaming ? "streaming" : "finishing")
        : "waiting";
      statusText =
        status === "streaming" ? "Streaming" :
        status === "finishing" ? "Finishing" :
        "Waiting for first word";
      promptText = truncateText(activeRun.promptPreview || "Prompt submitted.", 120);
      elapsedText = formatMs(elapsed);
      firstWordText = firstWordDelay ? formatMs(firstWordDelay) : "...";
      wordCountText = String(activeRun.visibleWordCount || 0);
    }

    const latestSummary = latestSample
      ? `Last run: TTFW ${formatMs(latestSample.ttfwMs)} | TTLW ${formatMs(latestSample.ttlwMs)} | ${latestSample.wordCount} words | ${formatNumber(latestSample.wordsPerSecond)} wps`
      : "No completed runs captured yet.";

    overlayRoot.dataset.status = status;
    overlayRefs.status.textContent = statusText;
    overlayRefs.prompt.textContent = promptText;
    overlayRefs.elapsed.textContent = elapsedText;
    overlayRefs.firstWord.textContent = firstWordText;
    overlayRefs.words.textContent = wordCountText;
    overlayRefs.latest.textContent = latestSummary;
  }

  function destroyOverlay() {
    overlayRoot?.remove();
    overlayRoot = null;
    overlayRefs = null;
  }

  function attachOverlayDrag(header) {
    let dragState = null;

    header.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }

      const target = event.target;
      if (target instanceof Element && target.closest("button")) {
        return;
      }

      if (!overlayRoot) {
        return;
      }

      dragState = {
        startX: event.clientX,
        startY: event.clientY,
        left: overlaySettings.left ?? overlayRoot.offsetLeft,
        top: overlaySettings.top ?? overlayRoot.offsetTop
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
      event.preventDefault();
    });

    function onPointerMove(event) {
      if (!dragState) {
        return;
      }

      const next = clampOverlayPosition(
        dragState.left + (event.clientX - dragState.startX),
        dragState.top + (event.clientY - dragState.startY)
      );

      overlaySettings.left = next.left;
      overlaySettings.top = next.top;
      applyOverlayPosition();
    }

    async function onPointerUp() {
      if (!dragState) {
        return;
      }

      dragState = null;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      await saveOverlaySettings({
        left: overlaySettings.left,
        top: overlaySettings.top
      });
    }
  }

  function ensureOverlay() {
    if (overlayRoot) {
      return;
    }

    ensureOverlayStyles();

    overlayRoot = document.createElement("section");
    overlayRoot.id = "chatgpt-ttfw-overlay";
    overlayRoot.innerHTML = `
      <div class="ttfw-header">
        <div class="ttfw-title-wrap">
          <div class="ttfw-eyebrow">ChatGPT UI Timing</div>
          <div class="ttfw-title">TTFW Overlay</div>
        </div>
        <button class="ttfw-hide" type="button">Hide</button>
      </div>
      <div class="ttfw-body">
        <div class="ttfw-status-row">
          <span class="ttfw-label">Status</span>
          <strong class="ttfw-status-value">Armed</strong>
        </div>
        <div class="ttfw-prompt">Waiting for the next prompt on this page.</div>
        <div class="ttfw-grid">
          <div class="ttfw-card">
            <div class="ttfw-label">Elapsed</div>
            <div class="ttfw-card-value" data-field="elapsed">-</div>
          </div>
          <div class="ttfw-card">
            <div class="ttfw-label">First Word</div>
            <div class="ttfw-card-value" data-field="first-word">-</div>
          </div>
          <div class="ttfw-card">
            <div class="ttfw-label">Words</div>
            <div class="ttfw-card-value" data-field="words">-</div>
          </div>
        </div>
        <div class="ttfw-section">
          <div class="ttfw-label">Latest Completed</div>
          <div class="ttfw-summary">No completed runs captured yet.</div>
        </div>
      </div>
    `;

    document.documentElement.appendChild(overlayRoot);
    overlayRefs = {
      status: overlayRoot.querySelector(".ttfw-status-value"),
      prompt: overlayRoot.querySelector(".ttfw-prompt"),
      elapsed: overlayRoot.querySelector("[data-field='elapsed']"),
      firstWord: overlayRoot.querySelector("[data-field='first-word']"),
      words: overlayRoot.querySelector("[data-field='words']"),
      latest: overlayRoot.querySelector(".ttfw-summary"),
      hide: overlayRoot.querySelector(".ttfw-hide"),
      header: overlayRoot.querySelector(".ttfw-header")
    };

    overlayRefs.hide.addEventListener("click", () => {
      void saveOverlaySettings({ enabled: false });
    });

    attachOverlayDrag(overlayRefs.header);
    applyOverlayPosition();
    updateOverlay();
  }

  function syncOverlayVisibility() {
    if (overlaySettings.enabled) {
      ensureOverlay();
      applyOverlayPosition();
      updateOverlay();
      return;
    }

    destroyOverlay();
  }

  function captureAssistantSnapshot() {
    return getAssistantContainers().map((element) => {
      const text = getMessageText(element);
      return {
        element,
        turnId: element.getAttribute("data-turn-id") || element.getAttribute("data-message-id") || "",
        textLength: text.length,
        wordCount: countWords(text)
      };
    });
  }

  function getBaselineRecord(run, element) {
    const turnId = element.getAttribute("data-turn-id") || element.getAttribute("data-message-id") || "";
    return (
      run.baselineAssistants.find((entry) => entry.element === element || (turnId && entry.turnId === turnId)) ||
      null
    );
  }

  function getLatestUserTurn() {
    const turns = Array.from(document.querySelectorAll(USER_TURN_SELECTOR)).filter(isVisible);
    return turns.at(-1) || null;
  }

  function getConversationTurns() {
    return Array.from(document.querySelectorAll(CONVERSATION_TURN_SELECTOR)).filter(isVisible);
  }

  function getAssistantTurnsAfterSubmittedUser(run) {
    const turns = getConversationTurns();
    let startIndex = 0;

    if (run.baselineUserTurnId) {
      const baselineIndex = turns.findIndex(
        (turn) => turn.getAttribute("data-turn") === "user" &&
          (turn.getAttribute("data-turn-id") || "") === run.baselineUserTurnId
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

      if (turnType === "user" && turnId && turnId !== run.baselineUserTurnId) {
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
    const hasTurnStructure = document.querySelector(CONVERSATION_TURN_SELECTOR) !== null;

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
      if (run.trackedElement === assistant) {
        return assistant;
      }

      const baseline = getBaselineRecord(run, assistant);
      if (!baseline) {
        return assistant;
      }

      const text = getMessageText(assistant);
      const words = countWords(text);
      if (words > baseline.wordCount || text.length > baseline.textLength) {
        return assistant;
      }
    }

    return null;
  }

  function resetActiveRun(reason) {
    debugLog("reset run", reason, activeRun);
    activeRun = null;
    clearTimeout(processTimer);
    clearTimeout(hardTimeoutTimer);
    processTimer = null;
    hardTimeoutTimer = null;
    updateOverlay();
  }

  async function persistSample(sample) {
    const storage = getStorageArea();
    const current = await storage.get(STORAGE_KEY);
    const items = Array.isArray(current[STORAGE_KEY]) ? current[STORAGE_KEY] : [];
    const next = [sample, ...items].slice(0, MAX_SAMPLES);
    await storage.set({ [STORAGE_KEY]: next });
  }

  async function finalizeRun(reason) {
    if (!activeRun) {
      return;
    }

    const run = activeRun;
    resetActiveRun(reason);

    if (!run.firstWordAt || !run.completedAt || run.finalWordCount === 0) {
      debugLog("discarding incomplete run", reason, run);
      return;
    }

    const ttfwMs = Math.round(run.firstWordAt - run.startedAt);
    const ttlwMs = Math.round(run.completedAt - run.startedAt);
    const streamingMs = Math.max(1, Math.round(run.completedAt - run.firstWordAt));
    const wordsPerSecond = Number((run.finalWordCount / (streamingMs / 1000)).toFixed(2));
    const endToEndWordsPerSecond = Number((run.finalWordCount / (ttlwMs / 1000)).toFixed(2));

    const sample = {
      id: run.id,
      url: location.href,
      title: document.title,
      startedAt: new Date(run.startedWallClock).toISOString(),
      promptPreview: run.promptPreview,
      ttfwMs,
      ttlwMs,
      streamingMs,
      wordCount: run.finalWordCount,
      wordsPerSecond,
      endToEndWordsPerSecond,
      reason
    };

    debugLog("persist sample", sample);
    latestSample = sample;
    updateOverlay();
    await persistSample(sample);
  }

  function scheduleProcess(delay = 0) {
    if (!activeRun) {
      return;
    }

    clearTimeout(processTimer);
    processTimer = setTimeout(processActiveRun, delay);
  }

  function processActiveRun() {
    if (!activeRun) {
      return;
    }

    const run = activeRun;
    const candidate = getRunCandidate(run);

    if (!candidate) {
      updateOverlay();
      return;
    }

    const text = getMessageText(candidate);
    const words = countWords(text);
    const visibleText = getVisibleMessageText(candidate);
    const visibleWords = countWords(visibleText);
    const candidateStreaming = candidateLooksStreaming(candidate);

    run.trackedElement = candidate;
    run.visibleWordCount = visibleWords;

    if (words > run.lastObservedWordCount) {
      run.lastContentChangeAt = nowMs();
      run.lastObservedWordCount = words;
      debugLog("content update", words, text.slice(0, 120));
    }

    if (visibleWords > run.lastVisibleWordCount) {
      run.lastContentChangeAt = nowMs();
      run.lastVisibleWordCount = visibleWords;
      run.finalWordCount = visibleWords;
    }

    if (!run.firstWordAt && visibleWords > 0) {
      run.firstWordAt = nowMs();
      run.lastContentChangeAt = run.firstWordAt;
      run.finalWordCount = visibleWords;
      debugLog("first visible word", visibleWords, run.firstWordAt - run.startedAt);
    }

    if (!run.firstWordAt) {
      updateOverlay();
      return;
    }

    const idleForMs = nowMs() - run.lastContentChangeAt;
    const isActive = generationLooksActive() || candidateStreaming;

    if (!isActive && idleForMs >= COMPLETION_SETTLE_MS) {
      run.completedAt = nowMs();
      void finalizeRun("complete");
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

    if (activeRun) {
      resetActiveRun("superseded");
    }

    const promptPreview = (getComposerText(composerElement) || lastComposerText).slice(0, 240);
    const latestUserTurn = getLatestUserTurn();

    activeRun = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      triggerType,
      startedAt: currentMs,
      startedWallClock: Date.now(),
      promptPreview,
      baselineAssistants: captureAssistantSnapshot(),
      baselineUserTurnId: latestUserTurn ? latestUserTurn.getAttribute("data-turn-id") || "" : "",
      firstWordAt: null,
      completedAt: null,
      trackedElement: null,
      lastContentChangeAt: currentMs,
      lastObservedWordCount: 0,
      lastVisibleWordCount: 0,
      visibleWordCount: 0,
      finalWordCount: 0
    };

    debugLog("start run", activeRun);
    const runId = activeRun.id;
    clearTimeout(hardTimeoutTimer);
    hardTimeoutTimer = setTimeout(() => {
      if (activeRun && activeRun.id === runId) {
        resetActiveRun("timeout");
      }
    }, HARD_TIMEOUT_MS);

    scheduleProcess(0);
    updateOverlay();
  }

  function handleSubmitEvent(event) {
    const form = event.target instanceof Element ? event.target.closest("form") : null;
    const composer = form ? form.querySelector(COMPOSER_SELECTOR) : getVisibleComposer();
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

    const composer = target.closest(COMPOSER_SELECTOR);
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

    const composer = getVisibleComposer();
    startRun("click", composer);
  }

  function handleComposerInput(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (!target.matches(COMPOSER_SELECTOR)) {
      return;
    }

    lastComposerText = getComposerText(target);
  }

  function handleMutation(mutations) {
    if (!activeRun) {
      return;
    }

    for (const mutation of mutations) {
      if (!(mutation.target instanceof Element || mutation.target instanceof Text)) {
        continue;
      }

      const node = mutation.target instanceof Text ? mutation.target.parentElement : mutation.target;
      const turn = node?.closest?.(CONVERSATION_TURN_SELECTOR);
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
      syncOverlayVisibility();
    }

    if (changes[STORAGE_KEY]) {
      const samples = Array.isArray(changes[STORAGE_KEY].newValue) ? changes[STORAGE_KEY].newValue : [];
      latestSample = samples[0] || null;
      updateOverlay();
    }
  }

  async function loadInitialState() {
    const storage = getStorageArea();
    const data = await storage.get([STORAGE_KEY, OVERLAY_SETTINGS_KEY]);
    const samples = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
    latestSample = samples[0] || null;
    overlaySettings = normalizeOverlaySettings(data[OVERLAY_SETTINGS_KEY]);
    syncOverlayVisibility();
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
      if (activeRun) {
        processActiveRun();
      }
    }, POLL_MS);
  }

  function init() {
    document.addEventListener("submit", handleSubmitEvent, true);
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("click", handleClick, true);
    document.addEventListener("input", handleComposerInput, true);
    window.addEventListener("resize", applyOverlayPosition);
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
