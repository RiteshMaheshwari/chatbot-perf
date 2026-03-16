# LLM Speed Monitor — Firefox Extension

Measures **Time to First Word (TTFW)**, **Time to Last Word (TTLW)**, and **Words/sec** for ChatGPT, Claude, and Perplexity responses.
Shows a live floating overlay while the response streams, and persists history in a toolbar popup.

---

## Supported Sites

| Site | URL | Detection strategy |
|---|---|---|
| ChatGPT | `chatgpt.com` | `streaming-animation` class on `.markdown` div; `data-message-id` ID snapshot for multi-turn |
| Claude | `claude.ai` | `data-is-streaming="true"` attribute; element-reference snapshot for multi-turn |
| Perplexity | `perplexity.ai`, `www.perplexity.ai` | `id="markdown-content-N"` sequential IDs; ID snapshot for multi-turn; `autoDetect()` fallback because send detection is unreliable |

---

## File Layout

```
Firefox-plugin/
├── manifest.json     MV2 manifest — matches chatgpt.com, claude.ai, perplexity.ai (+ www)
├── content.js        Content script: measurement logic + floating overlay
├── content.css       Styles for the floating overlay
├── popup.html        Toolbar popup UI
├── popup.js          Popup: stats, charts, per-model breakdown, history list, export
├── popup.css         Popup styles
├── background.js     Storage management (save / get / clear via browser.storage.local)
└── icons/
    ├── icon-48.png
    └── icon-96.png
```

---

## Architecture

### Site Adapter pattern (`content.js`)

A single `ADAPTER` object (selected by `SITE`) holds all site-specific selectors.
Adding a new site = add one entry to the `ADAPTER` map at the top of `content.js`.

```js
{
  name,                // display name
  sendBtn,             // CSS selector(s) for the send button
  composer,            // CSS selector for the text input / contenteditable
  assistantSelector,   // root element for each AI response turn
  idAttr,              // attribute holding a unique-per-turn string ID (null for Claude)
  markdownSel,         // child element that contains the actual response text
  streamingClass,      // class present on markdownEl while streaming (ChatGPT only)
  streamingAttr,       // attribute "true" while streaming, "false" when done (Claude only)
  requireMarkdown,     // if true, only count words once markdownEl exists (Claude —
                       //   avoids measuring loading-spinner placeholder text)
  getModel(el),        // extracts model slug from the assistant element
}
```

### Multi-turn detection — two snapshot strategies

`snapshotKnown()` records what is already on the page so new responses can be identified:

- **Element-reference snapshot** (`knownElements` Set) — **Claude**
  Used when `ADAPTER.streamingAttr` is set. Stores DOM object references; each new
  `[data-is-streaming]` element is distinguishable even if attribute values repeat across turns.

- **String-ID snapshot** (`knownMessageIds` Set) — **ChatGPT / Perplexity**
  Used when `ADAPTER.idAttr` is set. Records string IDs (`data-message-id`,
  `id="markdown-content-N"`) at send time; any new ID after that is the new response.

`snapshotKnown()` is called at three points:
1. **Init** — pre-existing content is never treated as new.
2. **`onUserSend()`** — snapshot is fresh at send time.
3. **End of `finalizeMetrics()`** — so `autoDetect()` can see the *next* new element.

### Response detection strategies (inside `pollForResponse`)

1. **Strategy 1** — `streamingClass` (ChatGPT): find `.streaming-animation.markdown`
2. **Strategy 1.5** — `streamingAttr` (Claude): find `[data-is-streaming="true"]` not in `knownElements`
3. **Strategy 2** — `idAttr` snapshot (ChatGPT, Perplexity): find first element with an unseen ID
4. **Strategy 3** — fall-through: find `markdownSel` inside already-found `currentAssistantEl`

### `autoDetect()` — missed-send fallback

Called by the `MutationObserver` whenever the DOM changes while we are *not* currently
measuring. Looks for a new response element (same logic as strategies 1.5 / 2) and
starts measurement automatically.

**`lastSendApproxTime`** — both the click and keydown handlers always record
`lastSendApproxTime = performance.now()` before calling `onUserSend()`. `autoDetect()`
uses this as `sendTime` if it is within 30 s, giving a real TTFW. Without it, `sendTime`
would be set to the moment the response element appeared, making TTFW ≈ 0.

**Keydown handler** uses `composerEl = e.target.closest(ADAPTER.composer)` and reads
`composerEl.textContent || composerEl.value`. Reading `e.target.textContent` was a bug —
`e.target` can be a focused child `<p>` that is empty even though the composer has text.

### Completion detection

- **ChatGPT**: `streaming-animation` class removed from `.markdown` → immediate finalize.
- **Claude**: `data-is-streaming` flips to `"false"` → immediate finalize.
- **Perplexity / fallback**: 2 s debounce (`COMPLETION_DEBOUNCE_MS`) with no new
  word-count change. Also checks `[data-is-last-node]` and copy-action buttons as
  early-exit signals.

---

## Storage

- `browser.storage.local` key: `ttfw_history` (array, capped at **10,000 entries**).
- Schema per entry:
  ```json
  {
    "timestamp": 1710000000000,
    "site": "perplexity",
    "model": "perplexity",
    "ttfw": 1.23,
    "ttlw": 8.45,
    "wordCount": 312,
    "wps": 36.9,
    "inputWords": 14
  }
  ```
- **Export**: popup "Export JSON" button downloads `llm-speed-monitor-YYYY-MM-DD.json`
  via Blob URL — no extra `downloads` permission needed.

---

## Known Issues / Watch Points

| Area | Notes |
|---|---|
| Perplexity send detection | `sendBtn` is a broad 6-selector fallback. If it stops working, inspect the send button's HTML and add a tighter selector. `autoDetect()` + `lastSendApproxTime` is the safety net. |
| Perplexity model name | Always recorded as `"perplexity"` — no model slug exposed in DOM. |
| Claude model name | Always `"claude"` — model slug not surfaced in DOM. |
| ChatGPT model | Read from `data-message-model-slug` on the assistant turn element. |
| TTFW stuck at "waiting…" | `sendTime` was set but no new assistant element appeared. Check `assistantSelector` / `markdownSel` are still valid for current site HTML. |
| Thinking / reasoning blocks | Filtered by `isThinkingElement()` (skips `<details>`, `.thought`, `.thinking`, `.reasoning`, `.inner-monologue`, `data-message-author-role="tool"`) and stripped in `getResponseText()`. |

---

## Loading the Extension in Firefox

1. Go to `about:debugging` → **This Firefox** → **Load Temporary Add-on**.
2. Select any file inside `Firefox-plugin/` (e.g. `manifest.json`).
3. Navigate to a supported site and send a message — the overlay appears automatically.

For a permanent install, sign the extension via [AMO](https://addons.mozilla.org/developers/)
or use Firefox Developer Edition / Nightly with `xpinstall.signatures.required = false`.

---

## Commit History (summary)

| Commit | Change |
|---|---|
| `71c9fb7` | Initial Claude multi-turn + TTFW fix (element-ref snapshot, `.font-claude-response`, `requireMarkdown`) |
| `1cc076e` | Add Perplexity.ai support (adapter, popup colors/labels) |
| `c0e6457` | Fix manifest: add `www.perplexity.ai` match |
| `fea852b` | Broaden Perplexity send/composer selectors; add `form submit` fallback |
| `f77fff7` | Raise storage cap 500 → 10,000; add JSON export button |
| `82a0efe` | Fix multi-turn + TTFW=0 on subsequent Perplexity requests (`autoDetect`, `lastSendApproxTime`, keydown `composerEl` fix) |
