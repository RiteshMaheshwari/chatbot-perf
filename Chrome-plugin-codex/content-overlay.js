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

  function createOverlayController(options) {
    const defaultSettings = normalizeSettings(options.defaultSettings || {}, {
      enabled: true,
      top: 16
    });

    let settings = { ...defaultSettings };
    let root = null;
    let refs = null;

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

      document.documentElement.appendChild(root);
      refs = {
        status: root.querySelector(".ttfw-status-value"),
        prompt: root.querySelector(".ttfw-prompt"),
        elapsed: root.querySelector("[data-field='elapsed']"),
        firstWord: root.querySelector("[data-field='first-word']"),
        words: root.querySelector("[data-field='words']"),
        latest: root.querySelector(".ttfw-summary"),
        hide: root.querySelector(".ttfw-hide"),
        header: root.querySelector(".ttfw-header")
      };

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
      refs.status.textContent = snapshot.statusText || "Armed";
      refs.prompt.textContent = snapshot.promptText || "Waiting for the next prompt on this page.";
      refs.elapsed.textContent = snapshot.elapsedText || "-";
      refs.firstWord.textContent = snapshot.firstWordText || "-";
      refs.words.textContent = snapshot.wordCountText || "-";
      refs.latest.textContent = snapshot.latestSummary || "No completed runs captured yet.";
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
