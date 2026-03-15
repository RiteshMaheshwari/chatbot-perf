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
