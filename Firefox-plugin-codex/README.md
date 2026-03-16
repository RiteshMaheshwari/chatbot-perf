# ChatGPT TTFW Tracker

Firefox extension that measures ChatGPT UI latency:

- Time to first word (TTFW): from user send/submit to the first visible response word.
- Time to last word (TTLW): from user send/submit to the completed response in the UI.
- Words per second (WPS): response word count divided by streaming time.
- Optional floating overlay: always-visible in-page panel with live timing state and the latest completed run.

## How it works

The content script runs on `chatgpt.com` and `chat.openai.com`.

- It detects a prompt send from form submit, Enter on the composer, or clicking a visible send button.
- It snapshots the current assistant message count at submit time.
- It watches for the next assistant message and only starts timing once actual response words appear.
- It ignores intermediate UI churn such as "thinking" states because no words are counted until rendered text exists.
- It marks completion when the response stops changing and ChatGPT is no longer showing an active stop button.

## Load in Firefox

1. Open `about:debugging`.
2. Choose `This Firefox`.
3. Click `Load Temporary Add-on...`.
4. Select [`manifest.json`](/Users/rndm/Code/Firefox/codex-ttfw/manifest.json).

## Notes

- The DOM heuristics are written to be resilient, but ChatGPT changes its markup frequently.
- Enable the overlay from the popup to keep a draggable live panel visible while you use ChatGPT.
- If you can provide a live HTML snapshot or screenshot from your account, the selectors can be tightened further.

## Current State

- Main implementation lives in [`content.js`](/Users/rndm/Code/Firefox/codex-ttfw/content.js).
- Popup UI and charts live in [`popup.html`](/Users/rndm/Code/Firefox/codex-ttfw/popup.html), [`popup.js`](/Users/rndm/Code/Firefox/codex-ttfw/popup.js), and [`popup.css`](/Users/rndm/Code/Firefox/codex-ttfw/popup.css).
- Samples are stored in extension local storage under `chatgpt_ttfw_samples`.
- Overlay settings are stored under `chatgpt_ttfw_overlay_settings`.
- Local retention cap is `10000` samples.

## DOM Assumptions

- Composer: `textarea[name="prompt-textarea"]`
- Send button: `#composer-submit-button`, `button[data-testid="send-button"]`
- User turns: `article[data-turn="user"][data-testid^="conversation-turn-"]`
- Assistant turns: `article[data-turn="assistant"][data-testid^="conversation-turn-"]`
- Assistant message root: `[data-message-author-role="assistant"]`
- Answer content roots: `.markdown`, `.prose`, `[data-testid="conversation-turn-content"]`
- Streaming markers: `.streaming-animation`, `[data-writing-block]`, `.BZ_Pyq_root`

## Timing Heuristics

- TTFW uses only visible text, not raw DOM text.
- Visible text requires non-hidden layout, a rendered text rect, and effective opacity of at least `0.75`.
- For structured ChatGPT assistant turns, the tracker now requires a real answer-content root before counting words.
- TTLW currently finalizes when the tracked assistant turn is no longer streaming and content has been stable for `120ms`.
- Poll interval is `100ms`.

## Web Search Caveat

- A known failure mode was counting search-status UI like "Searching the web" as the first word.
- The current fix is to avoid falling back to whole-turn text for structured assistant turns and only count words from `.markdown` / `.prose` style answer roots.
- If web-search TTFW is still early, the next debugging input needed is the live HTML for the assistant turn while ChatGPT is in the search phase. The key question is whether the search-status text is rendered inside the same markdown/prose root as the final answer.
