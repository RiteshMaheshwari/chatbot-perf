# Privacy Policy for LLM Chat Benchmark

Last updated: March 28, 2026

LLM Chat Benchmark measures visible chat-response performance for supported AI chatbot websites, including ChatGPT, Claude, Gemini, and Perplexity.

## What the extension accesses

The extension reads chat page content on supported sites in order to measure:

- time to first word
- time to last word
- streaming speed
- stall / jitter metrics
- response word counts

The extension may also read limited page context needed to classify and display local benchmark results, such as site hostname and model name.

## What data is stored

This release stores benchmark data locally in the browser's extension storage on your device.

Stored data can include:

- timing metrics and derived performance statistics
- model and site name
- session identifier
- timestamp and session information
- prompt word count
- site hostname
- locale and timezone
- page visibility state at the start of a benchmark
- limited browser-reported connection context, when available
- optional imported benchmark data that you choose to load

## What data is sent off-device

This release does not send benchmark data, prompt content, or telemetry to a remote server.

## Data sharing

This release does not sell or transfer your data to third parties.

## User controls

You can control your local data through the extension UI:

- clear locally stored benchmark history
- export benchmark history as JSON
- import previously exported benchmark history
- inspect the raw locally stored data

Removing the extension will also remove its locally stored data from the browser profile, subject to browser behavior and sync settings.

## Changes

If future versions add remote data transmission, this policy will be updated before that functionality is enabled in a public release.

## Contact

For questions about this policy or the extension, use the support or contact information provided with the extension listing.
