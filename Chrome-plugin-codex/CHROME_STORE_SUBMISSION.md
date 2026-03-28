# Chrome Web Store Submission

This package is prepared for Chrome Web Store submission with local-only storage and no remote telemetry.

Official docs:

- [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish/)
- [Fill out the privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy/)
- [Privacy Policies](https://developer.chrome.com/docs/webstore/program-policies/privacy)

Privacy policy file for publishing:

- [PRIVACY_POLICY.md](/Users/rndm/Code/chatbot-perf/Chrome-plugin-codex/PRIVACY_POLICY.md)

## Current State

- Supported sites: ChatGPT, Claude, Gemini, Perplexity
- Storage: local only
- Remote telemetry: removed from the shipped extension
- Manifest version: MV3
- Extension name: `LLM Chat Benchmark`

## Packaging

Run:

```bash
./scripts/package-cws.sh
```

The script writes a zip to `../dist/llm-chat-benchmark-chrome.zip` by default.

## Privacy / Review Answers

Suggested single purpose:

`Measure real user chat performance for AI chatbot web apps like ChatGPT, Claude, Gemini, and Perplexity.`

Suggested permission justification:

- `storage`: stores timing history, overlay settings, and imported/exported benchmark data locally on the user's device.
- host permissions for supported sites: required to measure visible response timing directly in the chat UI on those supported domains.

Suggested remote code answer:

- `No, I am not using remote code.`

Suggested privacy posture:

- The extension stores timing history locally in extension storage.
- It does not send prompt content or telemetry to a remote server in this release.

## Remaining Submission Checks

1. Build the release zip with `./scripts/package-cws.sh`.
2. Verify the zip does not contain junk files such as `.DS_Store` or `icons/icon.svg.png`.
3. Upload the zip in the Chrome Web Store Developer Dashboard.
4. Fill in the Store Listing, Privacy, and Distribution tabs.
5. Add screenshots and a privacy policy URL if the dashboard requires one for your declared data handling.

## Suggested Store Description

`LLM Chat Benchmark measures real user performance for AI chat apps like ChatGPT, Claude, Gemini, and Perplexity directly in the browser UI. It tracks time to first word, time to last word, stall, word count, and streaming speed, then shows results in a floating overlay and local dashboard with charts, model breakdowns, import/export, and raw-data inspection. All data stays local in this release; no remote telemetry is sent.`
