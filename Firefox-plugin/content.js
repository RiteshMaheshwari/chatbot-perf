(function () {
  "use strict";

  // ── Site Adapter ───────────────────────────────────────────────────
  // Provides site-specific selectors. Add new sites here.
  const SITE = window.location.hostname.includes("claude.ai")
    ? "claude"
    : "chatgpt";

  const ADAPTER = {
    chatgpt: {
      name: "ChatGPT",
      sendBtn:
        'button[data-testid="send-button"], button#composer-submit-button, button[aria-label="Send prompt"]',
      composer:
        '#prompt-textarea, textarea[name="prompt-textarea"], [contenteditable="true"], .ProseMirror',
      assistantSelector: '[data-message-author-role="assistant"]',
      idAttr: "data-message-id",
      markdownSel: ".markdown",
      // ChatGPT adds this class to the .markdown div while streaming
      streamingClass: "streaming-animation",
      getModel: (el) =>
        el?.getAttribute("data-message-model-slug") || "unknown",
    },
    claude: {
      name: "Claude",
      sendBtn:
        'button[aria-label="Send Message"], button[aria-label="Send message"], button[data-testid="send-button"]',
      composer:
        'div[contenteditable="true"][class*="ProseMirror"], div[contenteditable="true"]',
      // The active streaming response container has data-is-streaming="true".
      // We snapshot element *references* (not string IDs) so each turn is unique.
      assistantSelector: '[data-is-streaming]',
      idAttr: null, // Claude uses element-reference snapshots, not string IDs
      markdownSel: '.font-claude-response',
      streamingClass: null,
      // When this attribute becomes "false" the response is complete (like streaming-animation for ChatGPT)
      streamingAttr: 'data-is-streaming',
      // Only read text from the markdown container; avoids loading-spinner placeholder text
      requireMarkdown: true,
      getModel: () => "claude",
    },
  }[SITE];

  // ── State ──────────────────────────────────────────────────────────
  let sendTime = null;
  let firstWordTime = null;
  let lastWordTime = null;
  let wordCount = 0;
  let inputWords = 0;
  let capturedModel = null;
  let isWaiting = false;
  let isStreaming = false;
  let currentAssistantEl = null;
  let currentMarkdownEl = null;
  let completionTimer = null;
  let liveTimer = null;
  let pollTimer = null;
  let knownMessageIds = new Set();
  let knownElements = new Set(); // for Claude: element-reference snapshot
  const COMPLETION_DEBOUNCE_MS = 2000;
  const POLL_INTERVAL_MS = 150;

  // ── Overlay UI ─────────────────────────────────────────────────────
  function createOverlay() {
    if (document.getElementById("ttfw-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "ttfw-overlay";
    overlay.innerHTML = `
      <div id="ttfw-header">
        <span id="ttfw-title">${ADAPTER.name}</span>
        <span id="ttfw-status"></span>
        <button id="ttfw-minimize" title="Minimize">−</button>
      </div>
      <div id="ttfw-body">
        <div class="ttfw-row">
          <span class="ttfw-label">Time to First Word</span>
          <span class="ttfw-value" id="ttfw-val-ttfw">—</span>
        </div>
        <div class="ttfw-row">
          <span class="ttfw-label">Time to Last Word</span>
          <span class="ttfw-value" id="ttfw-val-ttlw">—</span>
        </div>
        <div class="ttfw-row">
          <span class="ttfw-label">Words/sec</span>
          <span class="ttfw-value" id="ttfw-val-wps">—</span>
        </div>
        <div class="ttfw-row">
          <span class="ttfw-label">Word count</span>
          <span class="ttfw-value" id="ttfw-val-wc">—</span>
        </div>
        <div class="ttfw-row">
          <span class="ttfw-label">Elapsed</span>
          <span class="ttfw-value" id="ttfw-val-elapsed">—</span>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById("ttfw-minimize").addEventListener("click", (e) => {
      e.stopPropagation();
      const body = document.getElementById("ttfw-body");
      const btn = document.getElementById("ttfw-minimize");
      if (body.style.display === "none") {
        body.style.display = "";
        btn.textContent = "−";
      } else {
        body.style.display = "none";
        btn.textContent = "+";
      }
    });

    makeDraggable(overlay);
  }

  function makeDraggable(el) {
    let isDragging = false;
    let startX, startY, origX, origY;
    const header = el.querySelector("#ttfw-header");

    header.addEventListener("mousedown", (e) => {
      if (e.target.id === "ttfw-minimize") return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = el.getBoundingClientRect();
      origX = rect.left;
      origY = rect.top;
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      el.style.left = origX + (e.clientX - startX) + "px";
      el.style.top = origY + (e.clientY - startY) + "px";
      el.style.right = "auto";
      el.style.bottom = "auto";
    });

    document.addEventListener("mouseup", () => { isDragging = false; });
  }

  function updateOverlay() {
    const elTTFW = document.getElementById("ttfw-val-ttfw");
    const elTTLW = document.getElementById("ttfw-val-ttlw");
    const elWPS = document.getElementById("ttfw-val-wps");
    const elWC = document.getElementById("ttfw-val-wc");
    const elElapsed = document.getElementById("ttfw-val-elapsed");
    const elStatus = document.getElementById("ttfw-status");
    if (!elTTFW) return;

    elTTFW.textContent = firstWordTime && sendTime
      ? ((firstWordTime - sendTime) / 1000).toFixed(2) + "s"
      : isWaiting ? "waiting…" : "—";

    if (lastWordTime && sendTime && !isStreaming) {
      elTTLW.textContent = ((lastWordTime - sendTime) / 1000).toFixed(2) + "s";
    } else {
      elTTLW.textContent = isStreaming ? "streaming…" : "—";
    }

    if (!isStreaming && lastWordTime && sendTime && wordCount > 0) {
      elWPS.textContent = (wordCount / ((lastWordTime - sendTime) / 1000)).toFixed(1);
    } else if (isStreaming && firstWordTime && wordCount > 0) {
      elWPS.textContent = "~" + (wordCount / ((performance.now() - sendTime) / 1000)).toFixed(1);
    } else {
      elWPS.textContent = "—";
    }

    elWC.textContent = wordCount > 0 ? wordCount : "—";

    if (sendTime && (isStreaming || isWaiting)) {
      elElapsed.textContent = ((performance.now() - sendTime) / 1000).toFixed(1) + "s";
    } else if (sendTime && lastWordTime) {
      elElapsed.textContent = ((lastWordTime - sendTime) / 1000).toFixed(2) + "s";
    } else {
      elElapsed.textContent = "—";
    }

    if (isWaiting && !isStreaming) {
      elStatus.textContent = "⏳"; elStatus.title = "Waiting";
    } else if (isStreaming) {
      elStatus.textContent = "⚡"; elStatus.title = "Streaming";
    } else if (lastWordTime) {
      elStatus.textContent = "✓"; elStatus.title = "Complete";
    } else {
      elStatus.textContent = ""; elStatus.title = "";
    }
  }

  function startLiveTimer() {
    stopLiveTimer();
    liveTimer = setInterval(updateOverlay, 100);
  }

  function stopLiveTimer() {
    if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
  }

  // ── Snapshot existing messages ─────────────────────────────────────
  // ChatGPT: snapshots string IDs (data-message-id).
  // Claude:  snapshots DOM element *references* so each new turn's element
  //          is distinguishable even if attribute values repeat across turns.

  function snapshotKnown() {
    knownMessageIds = new Set();
    knownElements = new Set();
    if (ADAPTER.streamingAttr) {
      // Claude path: record every current [data-is-streaming] element reference
      document.querySelectorAll(ADAPTER.assistantSelector)
        .forEach((el) => knownElements.add(el));
    } else {
      // ChatGPT path: record string IDs
      document.querySelectorAll(ADAPTER.assistantSelector).forEach((el) => {
        const id = el.getAttribute(ADAPTER.idAttr);
        if (id) knownMessageIds.add(id);
      });
    }
  }

  // ── Capture input text from composer ──────────────────────────────

  function captureInputWords() {
    const el = document.querySelector(ADAPTER.composer);
    if (!el) return 0;
    const text = el.textContent || el.value || "";
    return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
  }

  // ── Detect user send ───────────────────────────────────────────────

  function onUserSend() {
    if (isWaiting && sendTime && performance.now() - sendTime < 500) return;

    inputWords = captureInputWords();
    snapshotKnown();
    sendTime = performance.now();
    firstWordTime = null;
    lastWordTime = null;
    wordCount = 0;
    capturedModel = null;
    isWaiting = true;
    isStreaming = false;
    currentAssistantEl = null;
    currentMarkdownEl = null;
    clearTimeout(completionTimer);
    createOverlay();
    startLiveTimer();
    startPolling();
    updateOverlay();
    console.log(`[TTFW] ${ADAPTER.name} send detected. Input words: ${inputWords}`);
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest(ADAPTER.sendBtn)) onUserSend();
  }, true);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      if (e.target.closest(ADAPTER.composer)) {
        const text = e.target.textContent || e.target.value || "";
        if (text.trim().length > 0) onUserSend();
      }
    }
  }, true);

  // ── Thinking filter ────────────────────────────────────────────────

  function isThinkingElement(el) {
    let node = el;
    while (node && node !== document.body) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName.toLowerCase() === "details") return true;
        const cls = node.className || "";
        if (typeof cls === "string" &&
            (cls.includes("thought") || cls.includes("thinking") ||
             cls.includes("reasoning") || cls.includes("inner-monologue")))
          return true;
        if (node.getAttribute("data-message-author-role") === "tool") return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  // ── Text extraction ────────────────────────────────────────────────

  function getResponseText(el) {
    if (!el) return "";
    const clone = el.cloneNode(true);
    clone.querySelectorAll("details, .thought, .thinking, .reasoning")
      .forEach((n) => n.remove());
    return clone.textContent.trim();
  }

  function countWords(text) {
    if (!text) return 0;
    // Require at least one word character — filters out lone punctuation
    // tokens like "(", "–", ")" that ChatGPT emits as separate spans
    return text.split(/\s+/).filter((w) => /\w/.test(w)).length;
  }

  // ── Polling ────────────────────────────────────────────────────────

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(pollForResponse, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function pollForResponse() {
    if (!sendTime || (!isWaiting && !isStreaming)) {
      stopPolling();
      return;
    }

    // ── Strategy 1: streaming class (ChatGPT) ──
    if (!currentMarkdownEl && ADAPTER.streamingClass) {
      const streamingEl = document.querySelector(
        `.${ADAPTER.streamingClass}${ADAPTER.markdownSel}`
      );
      if (streamingEl) {
        currentMarkdownEl = streamingEl;
        currentAssistantEl = streamingEl.closest(ADAPTER.assistantSelector);
        console.log(`[TTFW] Found via streaming class`);
      }
    }

    // ── Strategy 1.5: data-is-streaming="true" (Claude) ──
    // Uses element-reference comparison so each new turn is detected even if
    // attribute values repeat across turns (data-test-render-count is not unique).
    if (!currentAssistantEl && ADAPTER.streamingAttr) {
      const streamingEl = document.querySelector(
        `[${ADAPTER.streamingAttr}="true"]`
      );
      if (streamingEl && !knownElements.has(streamingEl)) {
        currentAssistantEl = streamingEl;
        currentMarkdownEl = streamingEl.querySelector(ADAPTER.markdownSel);
        console.log(`[TTFW] Found via ${ADAPTER.streamingAttr}="true"`);
      }
    }

    // ── Strategy 2: new message-id not in snapshot (ChatGPT) ──
    if (!currentAssistantEl && ADAPTER.idAttr) {
      for (const el of document.querySelectorAll(ADAPTER.assistantSelector)) {
        const id = el.getAttribute(ADAPTER.idAttr);
        if (id && !knownMessageIds.has(id)) {
          currentAssistantEl = el;
          currentMarkdownEl = el.querySelector(ADAPTER.markdownSel);
          console.log(`[TTFW] Found via new ID: ${id}`);
          break;
        }
      }
    }

    // ── Strategy 3: markdown inside tracked element ──
    if (currentAssistantEl && !currentMarkdownEl) {
      currentMarkdownEl = currentAssistantEl.querySelector(ADAPTER.markdownSel);
    }

    // ── Capture model slug once we have the assistant element ──
    if (currentAssistantEl && !capturedModel) {
      capturedModel = ADAPTER.getModel(currentAssistantEl);
    }

    // ── Read text ──
    // When requireMarkdown is true (Claude) we only count words once the
    // dedicated response container exists — this avoids measuring placeholder
    // / loading-spinner text that would give a falsely short TTFW.
    const source = ADAPTER.requireMarkdown
      ? currentMarkdownEl
      : (currentMarkdownEl || currentAssistantEl);
    if (!source) return;

    const text = getResponseText(source);
    const wc = countWords(text);

    if (wc > 0) {
      if (!firstWordTime) {
        firstWordTime = performance.now();
        isStreaming = true;
        isWaiting = false;
        console.log(`[TTFW] ⚡ First word at ${((firstWordTime - sendTime) / 1000).toFixed(3)}s`);
      }

      // Only reset debounce when word count actually changes
      if (wc !== wordCount) {
        wordCount = wc;
        lastWordTime = performance.now();
        updateOverlay();
        clearTimeout(completionTimer);
        completionTimer = setTimeout(checkCompletion, COMPLETION_DEBOUNCE_MS);
      }
    }

    // ── ChatGPT-specific: streaming class removed = immediately done ──
    if (isStreaming && firstWordTime && ADAPTER.streamingClass && currentMarkdownEl) {
      if (!currentMarkdownEl.classList.contains(ADAPTER.streamingClass)) {
        processText();
        finalizeMetrics();
        return;
      }
    }

    // ── Claude-specific: data-is-streaming="false" = immediately done ──
    if (isStreaming && firstWordTime && ADAPTER.streamingAttr && currentAssistantEl) {
      if (currentAssistantEl.getAttribute(ADAPTER.streamingAttr) === 'false') {
        processText();
        finalizeMetrics();
        return;
      }
    }
  }

  function processText() {
    const source = currentMarkdownEl || currentAssistantEl;
    if (!source) return;
    const text = getResponseText(source);
    const wc = countWords(text);
    if (wc > 0) { wordCount = wc; lastWordTime = performance.now(); }
  }

  function checkCompletion() {
    if (!sendTime || !firstWordTime) return;

    // Signal 1: streaming class gone (ChatGPT)
    const streamingClassGone = ADAPTER.streamingClass && currentMarkdownEl
      ? !currentMarkdownEl.classList.contains(ADAPTER.streamingClass)
      : true; // sites without the class always pass this check

    // Signal 2: data-is-last-node appears
    const article = currentAssistantEl?.closest("article") || currentAssistantEl?.closest("[data-turn]");
    const markdownRoot = currentMarkdownEl || currentAssistantEl;
    const lastNode = markdownRoot?.querySelector("[data-is-last-node]");

    // Signal 3: copy/action button appeared
    const copyBtn = article?.querySelector('button[data-testid="copy-turn-action-button"]')
      || document.querySelector('button[aria-label="Copy response"], button[aria-label="Copy message"]');

    if (streamingClassGone || lastNode || copyBtn) {
      processText();
      finalizeMetrics();
    } else {
      completionTimer = setTimeout(checkCompletion, 500);
    }
  }

  function finalizeMetrics() {
    if (!sendTime || !firstWordTime) return;
    if (!isWaiting && !isStreaming) return;

    isWaiting = false;
    isStreaming = false;
    stopLiveTimer();
    stopPolling();
    updateOverlay();

    const ttfw = (firstWordTime - sendTime) / 1000;
    const ttlw = (lastWordTime - sendTime) / 1000;
    const metrics = {
      timestamp: Date.now(),
      site: SITE,
      model: capturedModel || ADAPTER.getModel(currentAssistantEl) || "unknown",
      ttfw,
      ttlw,
      wordCount,
      wps: ttlw > 0 ? wordCount / ttlw : 0,
      inputWords,
    };

    console.log("[TTFW] ✓ Final:", JSON.stringify(metrics, null, 2));
    browser.runtime.sendMessage({ type: "SAVE_METRICS", metrics });
  }

  // ── MutationObserver (fast path) ───────────────────────────────────
  const observer = new MutationObserver(() => {
    if (!sendTime || (!isWaiting && !isStreaming)) return;

    if (currentMarkdownEl || currentAssistantEl) {
      const source = ADAPTER.requireMarkdown
        ? currentMarkdownEl
        : (currentMarkdownEl || currentAssistantEl);
      if (!source) { pollForResponse(); return; }
      const text = getResponseText(source);
      const wc = countWords(text);

      if (wc > 0 && wc !== wordCount) {
        if (!firstWordTime) {
          firstWordTime = performance.now();
          isStreaming = true;
          isWaiting = false;
          console.log(`[TTFW] ⚡ First word at ${((firstWordTime - sendTime) / 1000).toFixed(3)}s (observer)`);
        }
        wordCount = wc;
        lastWordTime = performance.now();
        updateOverlay();
        clearTimeout(completionTimer);
        completionTimer = setTimeout(checkCompletion, COMPLETION_DEBOUNCE_MS);
      }
    } else {
      pollForResponse();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  // ── Init ───────────────────────────────────────────────────────────
  createOverlay();
  console.log(`[TTFW] v4 loaded on ${ADAPTER.name}`);
})();
