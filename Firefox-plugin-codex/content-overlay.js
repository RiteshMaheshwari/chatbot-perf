(function (global) {
  "use strict";

  const STYLE_ID = "chatgpt-ttfw-overlay-style";

  function normalizeSettings(raw, defaults) {
    return {
      enabled: raw?.enabled === undefined ? defaults.enabled : Boolean(raw.enabled),
      left: Number.isFinite(raw?.left) ? raw.left : null,
      top: Number.isFinite(raw?.top) ? raw.top : defaults.top
    };
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #chatgpt-ttfw-overlay {
        position: fixed;
        z-index: 2147483647;
        width: 272px;
        max-width: calc(100vw - 16px);
        color: #e0e0e0;
        background: rgba(26, 26, 46, 0.78);
        border: 1px solid rgba(58, 58, 92, 0.82);
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        overflow: hidden;
        user-select: none;
        opacity: 0.92;
        transition: opacity 0.15s, border-color 0.15s, box-shadow 0.15s;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
      }

      #chatgpt-ttfw-overlay:hover {
        opacity: 1;
      }

      #chatgpt-ttfw-overlay * {
        box-sizing: border-box;
      }

      #chatgpt-ttfw-overlay[data-status="streaming"] {
        border-color: rgba(45, 212, 191, 0.7);
      }

      #chatgpt-ttfw-overlay[data-status="waiting"] {
        border-color: rgba(250, 204, 21, 0.6);
      }

      #chatgpt-ttfw-overlay[data-status="complete"] {
        border-color: rgba(127, 219, 202, 0.45);
      }

      #chatgpt-ttfw-overlay .ttfw-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding: 6px 10px;
        cursor: move;
        background: rgba(22, 33, 62, 0.72);
        border-radius: 8px 8px 0 0;
      }

      #chatgpt-ttfw-overlay .ttfw-title-wrap {
        display: grid;
        gap: 2px;
        min-width: 0;
        flex: 1;
      }

      #chatgpt-ttfw-overlay .ttfw-eyebrow {
        color: #7fdbca;
        font-size: 11px;
        line-height: 1.2;
        font-weight: 700;
        letter-spacing: 1.5px;
        text-transform: uppercase;
      }

      #chatgpt-ttfw-overlay .ttfw-title {
        font-size: 11px;
        line-height: 1.2;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #888;
      }

      #chatgpt-ttfw-overlay .ttfw-controls {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
      }

      #chatgpt-ttfw-overlay .ttfw-status-indicator {
        min-width: 14px;
        text-align: center;
        font-size: 13px;
        line-height: 1;
        font-weight: 700;
        color: #dbe5f5;
      }

      #chatgpt-ttfw-overlay[data-status="streaming"] .ttfw-status-indicator {
        color: #2dd4bf;
      }

      #chatgpt-ttfw-overlay[data-status="waiting"] .ttfw-status-indicator {
        color: #facc15;
      }

      #chatgpt-ttfw-overlay[data-status="complete"] .ttfw-status-indicator {
        color: #c3e88d;
      }

      #chatgpt-ttfw-overlay .ttfw-minimize,
      #chatgpt-ttfw-overlay .ttfw-hide {
        appearance: none;
        border: 0;
        background: transparent;
        color: #888;
        border-radius: 4px;
        width: 18px;
        height: 18px;
        font: inherit;
        font-size: 16px;
        font-weight: 700;
        cursor: pointer;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      #chatgpt-ttfw-overlay .ttfw-body {
        padding: 8px 10px;
      }

      #chatgpt-ttfw-overlay .ttfw-body[hidden] {
        display: none;
      }

      #chatgpt-ttfw-overlay .ttfw-status-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 6px;
      }

      #chatgpt-ttfw-overlay .ttfw-label {
        font-size: 11px;
        line-height: 1.2;
        font-weight: 400;
        letter-spacing: 0;
        text-transform: uppercase;
        color: #999;
      }

      #chatgpt-ttfw-overlay .ttfw-status-value {
        font-size: 12px;
        font-weight: 600;
        color: #e0e0e0;
        text-align: right;
        font-variant-numeric: tabular-nums;
      }

      #chatgpt-ttfw-overlay .ttfw-context {
        font-size: 12px;
        line-height: 1.35;
        color: #cfcfcf;
        min-height: 18px;
        margin-bottom: 8px;
      }

      #chatgpt-ttfw-overlay .ttfw-metrics {
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      }

      #chatgpt-ttfw-overlay .ttfw-metric-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 10px;
        padding: 3px 0;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
      }

      #chatgpt-ttfw-overlay .ttfw-metric-row:first-child {
        border-top: 0;
      }

      #chatgpt-ttfw-overlay .ttfw-metric-label {
        color: #999;
        font-size: 11px;
        line-height: 1.2;
      }

      #chatgpt-ttfw-overlay .ttfw-metric-value {
        flex-shrink: 0;
        color: #c2e57b;
        font-size: 13px;
        line-height: 1.2;
        font-weight: 600;
        letter-spacing: 0;
        text-align: right;
        min-width: 6ch;
        font-variant-numeric: tabular-nums;
      }

      #chatgpt-ttfw-overlay .ttfw-metric-value.is-pending {
        color: #f0f3fa;
        font-size: 12px;
      }

      #chatgpt-ttfw-overlay .ttfw-metric-value.is-muted {
        color: #888;
      }

      #chatgpt-ttfw-overlay .ttfw-section {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        display: grid;
        gap: 4px;
      }

      #chatgpt-ttfw-overlay .ttfw-summary {
        font-size: 11px;
        line-height: 1.35;
        color: #cfcfcf;
        font-variant-numeric: tabular-nums;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function createOverlayController(options) {
    const defaultSettings = normalizeSettings(options.defaultSettings || {}, {
      enabled: true,
      top: 16
    });

    let settings = { ...defaultSettings };
    let root = null;
    let refs = null;
    let collapsed = false;

    function clampPosition(left, top) {
      if (!root) {
        return { left, top };
      }

      const width = root.offsetWidth || 320;
      const height = root.offsetHeight || 220;
      return {
        left: Math.min(Math.max(8, left), Math.max(8, window.innerWidth - width - 8)),
        top: Math.min(Math.max(8, top), Math.max(8, window.innerHeight - height - 8))
      };
    }

    function applyPosition() {
      if (!root) {
        return;
      }

      const width = root.offsetWidth || 320;
      const defaultLeft = Math.max(8, window.innerWidth - width - 16);
      const desiredLeft = settings.left ?? defaultLeft;
      const desiredTop = settings.top ?? defaultSettings.top;
      const next = clampPosition(desiredLeft, desiredTop);

      settings.left = next.left;
      settings.top = next.top;
      root.style.left = `${next.left}px`;
      root.style.top = `${next.top}px`;
    }

    function destroy() {
      root?.remove();
      root = null;
      refs = null;
    }

    function attachDrag(header) {
      let dragState = null;

      header.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
          return;
        }

        const target = event.target;
        if (target instanceof Element && target.closest("button")) {
          return;
        }

        if (!root) {
          return;
        }

        dragState = {
          startX: event.clientX,
          startY: event.clientY,
          left: settings.left ?? root.offsetLeft,
          top: settings.top ?? root.offsetTop
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

        const next = clampPosition(
          dragState.left + (event.clientX - dragState.startX),
          dragState.top + (event.clientY - dragState.startY)
        );

        settings.left = next.left;
        settings.top = next.top;
        applyPosition();
      }

      function onPointerUp() {
        if (!dragState) {
          return;
        }

        dragState = null;
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
        options.onPositionChange?.({
          left: settings.left,
          top: settings.top
        });
      }
    }

    function ensure() {
      if (root) {
        return;
      }

      ensureStyles();

      root = document.createElement("section");
      root.id = "chatgpt-ttfw-overlay";
      root.innerHTML = `
        <div class="ttfw-header">
          <div class="ttfw-title-wrap">
            <div class="ttfw-eyebrow">${options.siteName || "LLM"} UI Timing</div>
            <div class="ttfw-title">${options.title || "TTFW Overlay"}</div>
          </div>
          <div class="ttfw-controls">
            <span class="ttfw-status-indicator" aria-hidden="true">•</span>
            <button class="ttfw-minimize" type="button" aria-label="Minimize overlay">−</button>
            <button class="ttfw-hide" type="button" aria-label="Hide overlay">×</button>
          </div>
        </div>
        <div class="ttfw-body">
          <div class="ttfw-status-row">
            <span class="ttfw-label">Status</span>
            <strong class="ttfw-status-value">Armed</strong>
          </div>
          <div class="ttfw-context">Waiting for the next prompt on this page.</div>
          <div class="ttfw-metrics">
            <div class="ttfw-metric-row">
              <span class="ttfw-metric-label">Time to First Word</span>
              <span class="ttfw-metric-value" data-field="first-word">-</span>
            </div>
            <div class="ttfw-metric-row">
              <span class="ttfw-metric-label">Time to Last Word</span>
              <span class="ttfw-metric-value" data-field="last-word">-</span>
            </div>
            <div class="ttfw-metric-row">
              <span class="ttfw-metric-label">Stall</span>
              <span class="ttfw-metric-value" data-field="stall">-</span>
            </div>
            <div class="ttfw-metric-row">
              <span class="ttfw-metric-label">Words/sec</span>
              <span class="ttfw-metric-value" data-field="wps">-</span>
            </div>
            <div class="ttfw-metric-row">
              <span class="ttfw-metric-label">Word count</span>
              <span class="ttfw-metric-value" data-field="words">-</span>
            </div>
            <div class="ttfw-metric-row">
              <span class="ttfw-metric-label">Elapsed</span>
              <span class="ttfw-metric-value" data-field="elapsed">-</span>
            </div>
          </div>
          <div class="ttfw-section">
            <div class="ttfw-label">Latest Completed</div>
            <div class="ttfw-summary">No completed runs captured yet.</div>
          </div>
        </div>
      `;

      document.documentElement.appendChild(root);
      refs = {
        indicator: root.querySelector(".ttfw-status-indicator"),
        status: root.querySelector(".ttfw-status-value"),
        context: root.querySelector(".ttfw-context"),
        elapsed: root.querySelector("[data-field='elapsed']"),
        firstWord: root.querySelector("[data-field='first-word']"),
        lastWord: root.querySelector("[data-field='last-word']"),
        stall: root.querySelector("[data-field='stall']"),
        wps: root.querySelector("[data-field='wps']"),
        words: root.querySelector("[data-field='words']"),
        latest: root.querySelector(".ttfw-summary"),
        minimize: root.querySelector(".ttfw-minimize"),
        hide: root.querySelector(".ttfw-hide"),
        header: root.querySelector(".ttfw-header"),
        body: root.querySelector(".ttfw-body")
      };

      refs.minimize.addEventListener("click", () => {
        collapsed = !collapsed;
        refs.body.hidden = collapsed;
        refs.minimize.textContent = collapsed ? "+" : "−";
        refs.minimize.setAttribute("aria-label", collapsed ? "Expand overlay" : "Minimize overlay");
        applyPosition();
      });

      refs.hide.addEventListener("click", () => {
        options.onHide?.();
      });

      attachDrag(refs.header);
      applyPosition();
    }

    function syncVisibility() {
      if (settings.enabled) {
        ensure();
        applyPosition();
        return;
      }

      destroy();
    }

    function setSettings(nextSettings) {
      settings = normalizeSettings(nextSettings, defaultSettings);
      syncVisibility();
    }

    function render(snapshot) {
      if (!settings.enabled) {
        return;
      }

      ensure();
      root.dataset.status = snapshot.status || "idle";
      refs.indicator.textContent = snapshot.statusIcon || "•";
      refs.status.textContent = snapshot.statusText || "Armed";
      refs.context.textContent = snapshot.promptText || "Waiting for the next prompt on this page.";
      refs.elapsed.textContent = snapshot.elapsedText || "-";
      refs.firstWord.textContent = snapshot.firstWordText || "-";
      refs.lastWord.textContent = snapshot.lastWordText || "-";
      refs.stall.textContent = snapshot.stallText || "-";
      refs.wps.textContent = snapshot.wpsText || "-";
      refs.words.textContent = snapshot.wordCountText || "-";
      refs.latest.textContent = snapshot.latestSummary || "No completed runs captured yet.";

      [refs.elapsed, refs.firstWord, refs.lastWord, refs.stall, refs.wps, refs.words].forEach((element) => {
        const text = element.textContent || "";
        element.classList.toggle("is-pending", text.includes("..."));
        element.classList.toggle("is-muted", text === "-" || text === "—");
      });
    }

    window.addEventListener("resize", applyPosition);

    return {
      applyPosition,
      destroy,
      getSettings: () => ({ ...settings }),
      render,
      setSettings,
      syncVisibility
    };
  }

  global.LlmTimingOverlay = Object.freeze({
    createOverlayController
  });
})(globalThis);
