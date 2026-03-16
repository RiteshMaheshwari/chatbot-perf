(function () {
  "use strict";

  // ── Site Adapter ───────────────────────────────────────────────────
  // Provides site-specific selectors. Add new sites here.
  const SITE = window.location.hostname.includes("claude.ai")
    ? "claude"
    : window.location.hostname.includes("perplexity.ai")
    ? "perplexity"
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
      streamingAttr: null,
      requireMarkdown: false,
      settleMs: 500,
      getModel: (el) =>
        el?.closest?.('[data-message-model-slug]')?.getAttribute('data-message-model-slug')
        || el?.getAttribute("data-message-model-slug") || "unknown",
    },
    perplexity: {
      name: "Perplexity",
      sendBtn: [
        'button[aria-label="Submit"]',
        'button[aria-label="Ask"]',
        'button[aria-label="Ask Perplexity"]',
        'button[aria-label="Search"]',
        'button[data-testid="submit-button"]',
        'form button[type="submit"]',
      ].join(', '),
      composer: 'textarea, div[contenteditable="true"]',
      assistantSelector: '[id^="markdown-content-"]',
      idAttr: 'id',
      markdownSel: '.prose',
      streamingAttr: null,
      requireMarkdown: false,
      settleMs: 1500,
      getModel: () => 'perplexity',
    },
    claude: {
      name: "Claude",
      sendBtn:
        'button[aria-label="Send Message"], button[aria-label="Send message"], button[data-testid="send-button"]',
      composer:
        'div[contenteditable="true"][class*="ProseMirror"], div[contenteditable="true"]',
      assistantSelector: '[data-is-streaming]',
      idAttr: null,
      markdownSel: '.font-claude-response',
      streamingAttr: 'data-is-streaming',
      requireMarkdown: true,
      settleMs: 600,
      getModel: () => "claude",
    },
  }[SITE];

  // ── State ──────────────────────────────────────────────────────────
  let sendTime = null;
  let firstWordTime = null;
  let lastWordTime = null;
  let lastContentChangeAt = 0;
  let wordCount = 0;
  let inputWords = 0;
  let capturedModel = null;
  let inputPreview = "";
  let isWaiting = false;
  let isStreaming = false;
  let currentAssistantEl = null;
  let currentMarkdownEl = null;
  let liveTimer = null;
  let pollTimer = null;
  let knownMessageIds = new Set();
<<<<<<< HEAD
  let knownElements = new Set();
  const POLL_INTERVAL_MS = 100;
=======
  let knownElements = new Set(); // for Claude: element-reference snapshot
  let lastSendApproxTime = null; // best-effort timestamp from keydown/click, used by autoDetect()
  const COMPLETION_DEBOUNCE_MS = 2000;
  const POLL_INTERVAL_MS = 150;
>>>>>>> a021b09f7cbf093abea32d4969094f7c0f281434

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
    const overlay = document.getElementById("ttfw-overlay");
    if (overlay) {
      overlay.dataset.status = isWaiting ? "waiting" : isStreaming ? "streaming" : "idle";
    }
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

    if (!isStreaming && lastWordTime && firstWordTime && wordCount > 0) {
      elWPS.textContent = (wordCount / ((lastWordTime - firstWordTime) / 1000)).toFixed(1);
    } else if (isStreaming && firstWordTime && wordCount > 0) {
      elWPS.textContent = "~" + (wordCount / ((performance.now() - firstWordTime) / 1000)).toFixed(1);
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
    return countWords(text);
  }

  function captureInputPreview() {
    const el = document.querySelector(ADAPTER.composer);
    if (!el) return "";
    return (el.textContent || el.value || "").trim().slice(0, 240);
  }

  // ── Detect user send ───────────────────────────────────────────────

  function onUserSend() {
    if (isWaiting && sendTime && performance.now() - sendTime < 500) return;

    inputWords = captureInputWords();
    inputPreview = captureInputPreview();
    snapshotKnown();
    sendTime = performance.now();
    firstWordTime = null;
    lastWordTime = null;
    lastContentChangeAt = 0;
    wordCount = 0;
    capturedModel = null;
    isWaiting = true;
    isStreaming = false;
    currentAssistantEl = null;
    currentMarkdownEl = null;
    createOverlay();
    startLiveTimer();
    startPolling();
    updateOverlay();
    console.log(`[TTFW] ${ADAPTER.name} send detected. Input words: ${inputWords}`);
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest(ADAPTER.sendBtn)) {
      lastSendApproxTime = performance.now();
      onUserSend();
    }
  }, true);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const composerEl = e.target.closest(ADAPTER.composer);
      if (composerEl) {
        // Use the composer root's text, not e.target — e.target may be a
        // focused child <p> that is empty when the real content is in siblings.
        const text = composerEl.textContent || composerEl.value || "";
        if (text.trim().length > 0) {
          lastSendApproxTime = performance.now();
          onUserSend();
        }
      }
    }
  }, true);

  // Fallback: catch native form submissions (some sites submit via <form>)
  document.addEventListener("submit", () => onUserSend(), true);

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
    // Unicode-aware: handles CJK, contractions, hyphenated words
    return (text.match(/[\p{L}\p{N}]+(?:[''\-][\p{L}\p{N}]+)*/gu) || []).length;
  }

  // ── Visibility helpers (for precise TTFW detection) ────────────────
  // Adapted from Firefox-plugin-codex: avoids counting hidden spinners/
  // placeholder text that would give a falsely-short TTFW.

  const MIN_VISIBLE_OPACITY = 0.75;

  function hasVisibleTextRect(textNode) {
    const range = document.createRange();
    range.selectNodeContents(textNode);
    const rects = Array.from(range.getClientRects());
    range.detach?.();
    return rects.some((r) => r.width > 0 && r.height > 0);
  }

  function isElementActuallyVisible(el, root) {
    let current = el;
    while (current && current !== root) {
      const style = window.getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden" ||
          Number(style.opacity) < MIN_VISIBLE_OPACITY) return false;
      current = current.parentElement;
    }
    return true;
  }

  function getVisibleText(source) {
    if (!source) return "";
    const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT);
    const parts = [];
    let node = walker.nextNode();
    while (node) {
      const parent = node.parentElement;
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (parent && text.length > 0 &&
          isElementActuallyVisible(parent, source) &&
          hasVisibleTextRect(node)) {
        parts.push(node.textContent);
      }
      node = walker.nextNode();
    }
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  function getVisibleWordCount(source) {
    return countWords(getVisibleText(source));
  }

  // ── Generation-active check (codex approach) ──────────────────────
  // Checks if the LLM is still generating by looking for a stop button in the UI.
  // This is more reliable than any streaming class or attribute.
  function generationLooksActive() {
    for (const btn of document.querySelectorAll('button')) {
      if (!btn.offsetParent) continue; // not in layout → not visible
      const label = (
        btn.getAttribute('aria-label') ||
        btn.getAttribute('title') ||
        btn.textContent || ''
      ).toLowerCase().trim();
      const id = (btn.id || '').toLowerCase();
      if (
        label.includes('stop generating') ||
        label.includes('stop streaming') ||
        label.includes('stop response') ||
        label === 'stop' ||
        (id === 'composer-submit-button' && label.includes('stop'))
      ) return true;
    }
    // Claude: streaming attribute still present
    if (ADAPTER.streamingAttr) {
      return !!document.querySelector(`[${ADAPTER.streamingAttr}="true"]`);
    }
    return false;
  }

  // ── Find the active response source element ────────────────────────
  // Re-evaluated on every tick so we never get stuck on a stale reference.
  function findActiveSource() {
    // Claude: track via data-is-streaming attribute
    if (ADAPTER.streamingAttr) {
      const el = document.querySelector(`[${ADAPTER.streamingAttr}="true"]`);
      if (el && !knownElements.has(el)) {
        currentAssistantEl = el;
        currentMarkdownEl = el.querySelector(ADAPTER.markdownSel) || null;
        if (!capturedModel) capturedModel = ADAPTER.getModel(el);
      }
      if (!currentAssistantEl) return null;
      const md = currentAssistantEl.querySelector(ADAPTER.markdownSel) || currentMarkdownEl;
      currentMarkdownEl = md;
      return ADAPTER.requireMarkdown ? md : (md || currentAssistantEl);
    }

    // ChatGPT / Perplexity: find latest assistant element not in snapshot
    const all = Array.from(document.querySelectorAll(ADAPTER.assistantSelector));
    for (let i = all.length - 1; i >= 0; i--) {
      const el = all[i];
      const id = ADAPTER.idAttr ? el.getAttribute(ADAPTER.idAttr) : null;
      if (id && !knownMessageIds.has(id)) {
        currentAssistantEl = el;
        currentMarkdownEl = el.querySelector(ADAPTER.markdownSel) || null;
        if (!capturedModel || capturedModel === 'unknown') {
          capturedModel = ADAPTER.getModel(el);
        }
        break;
      }
    }

    if (!currentAssistantEl) return null;
    // Always re-query markdown in case it was added after the element was found
    const md = currentAssistantEl.querySelector(ADAPTER.markdownSel) || currentMarkdownEl;
    currentMarkdownEl = md;
    return ADAPTER.requireMarkdown ? md : (md || currentAssistantEl);
  }

  // ── Core process step ──────────────────────────────────────────────
  function processStep() {
    if (!sendTime || (!isWaiting && !isStreaming)) return;

    const source = findActiveSource();
    if (!source) return;

    const text = getResponseText(source);
    const wc = countWords(text);

    if (wc > 0) {
      const now = performance.now();
      if (!firstWordTime) {
        firstWordTime = now;
        lastContentChangeAt = now;
        isStreaming = true;
        isWaiting = false;
        console.log(`[TTFW] ⚡ First word at ${((now - sendTime) / 1000).toFixed(3)}s wc=${wc}`);
      }
      if (wc !== wordCount) {
        wordCount = wc;
        lastWordTime = now;
        lastContentChangeAt = now;
        updateOverlay();
      }

      // Completion: generation not active + text idle for settleMs
      if (!generationLooksActive()) {
        const idleMs = performance.now() - lastContentChangeAt;
        if (idleMs >= ADAPTER.settleMs) {
          console.log(`[TTFW] 🏁 Complete: idle=${idleMs.toFixed(0)}ms wc=${wordCount}`);
          finalizeMetrics();
        }
      }
    }
  }

  // ── Polling ────────────────────────────────────────────────────────

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(processStep, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // ── Persist metrics directly to storage (no background script needed) ──
  function persistMetrics(metrics) {
    browser.storage.local.get("ttfw_history").then((result) => {
      const history = result.ttfw_history || [];
      history.push(metrics);
      if (history.length > 10000) history.splice(0, history.length - 10000);
      return browser.storage.local.set({ ttfw_history: history }).then(() => {
        console.log(`[TTFW] 💾 Saved entry #${history.length} wc=${metrics.wordCount} wps=${metrics.wps.toFixed(1)}`);
      });
    }).catch((err) => console.error("[TTFW] ❌ Storage error:", err));
  }

  function finalizeMetrics() {
    if (!sendTime || !firstWordTime || (!isWaiting && !isStreaming)) return;

    isWaiting = false;
    isStreaming = false;
    stopLiveTimer();
    stopPolling();
    updateOverlay();

    const ttfw = (firstWordTime - sendTime) / 1000;
    const ttlw = lastWordTime ? (lastWordTime - sendTime) / 1000 : ttfw;
    const streamingMs = lastWordTime ? lastWordTime - firstWordTime : 0;
    const metrics = {
      timestamp: Date.now(),
      site: SITE,
      model: capturedModel || "unknown",
      ttfw,
      ttlw,
      streamingMs,
      wordCount,
      wps: streamingMs > 0 ? wordCount / (streamingMs / 1000) : 0,
      inputWords,
      promptPreview: inputPreview,
    };

<<<<<<< HEAD
    console.log(`[TTFW] ✓ Final: ttfw=${ttfw.toFixed(2)}s wc=${wordCount} wps=${metrics.wps.toFixed(1)}`);
    persistMetrics(metrics);
  }

  // ── MutationObserver (fast path) ───────────────────────────────────
  const observer = new MutationObserver(() => { processStep(); });
=======
    console.log("[TTFW] ✓ Final:", JSON.stringify(metrics, null, 2));
    browser.runtime.sendMessage({ type: "SAVE_METRICS", metrics });

    // Refresh snapshot so autoDetect() can see the NEXT new element.
    snapshotKnown();
  }

  // ── Auto-detect: pick up responses when the send event was missed ──
  // Handles sites (e.g. Perplexity) where button/keydown detection is
  // unreliable.  The init + post-finalize snapshotKnown() calls ensure
  // pre-existing content never triggers this.
  function autoDetect() {
    let found = null;

    if (ADAPTER.streamingAttr) {
      // Claude: look for data-is-streaming="true" not in knownElements
      const el = document.querySelector(`[${ADAPTER.streamingAttr}="true"]`);
      if (el && !knownElements.has(el)) found = el;
    } else if (ADAPTER.idAttr) {
      // Perplexity / ChatGPT: find first element with an unseen ID
      for (const el of document.querySelectorAll(ADAPTER.assistantSelector)) {
        const id = el.getAttribute(ADAPTER.idAttr);
        if (id && !knownMessageIds.has(id)) { found = el; break; }
      }
    }

    if (!found) return;

    // Use the last recorded keydown/click time as sendTime so TTFW is meaningful.
    // Fall back to now() only if there's no recent timestamp (shouldn't happen normally).
    const approxAge = lastSendApproxTime ? performance.now() - lastSendApproxTime : Infinity;
    const estimatedSend = approxAge < 30_000 ? lastSendApproxTime : performance.now();
    console.log(`[TTFW] Auto-detected new response (send event ${approxAge < 30_000 ? "~" + (approxAge / 1000).toFixed(1) + "s ago" : "missed entirely"})`);
    sendTime = estimatedSend;
    firstWordTime = null;
    lastWordTime = null;
    wordCount = 0;
    capturedModel = null;
    inputWords = 0;
    isWaiting = true;
    isStreaming = false;
    currentAssistantEl = found;
    currentMarkdownEl = found.querySelector(ADAPTER.markdownSel) || null;
    clearTimeout(completionTimer);
    createOverlay();
    startLiveTimer();
    startPolling();
    updateOverlay();
  }

  // ── MutationObserver (fast path) ───────────────────────────────────
  const observer = new MutationObserver(() => {
    if (!sendTime || (!isWaiting && !isStreaming)) {
      // Not measuring — run auto-detect to catch missed sends
      if (!isWaiting && !isStreaming) autoDetect();
      return;
    }

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
>>>>>>> a021b09f7cbf093abea32d4969094f7c0f281434

  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  // ── Init ───────────────────────────────────────────────────────────
  // Baseline snapshot so autoDetect() ignores content already on the page.
  snapshotKnown();
  createOverlay();
  console.log(`[TTFW] v5 loaded on ${ADAPTER.name}`);
})();
