# AMO Submission

This package is ready to submit to Firefox Add-ons with local-only storage and no remote telemetry.

## Current State

- Supported sites: ChatGPT, Claude, Gemini, Perplexity
- Storage: local only
- Remote telemetry: removed from the shipped extension
- Add-on ID: `llm-performance-tracker@riteshmaheshwari.com`

## Remaining Submission Checks

1. Build the release zip with `./scripts/package-amo.sh`.
2. Verify the zip does not contain junk files such as `.DS_Store` or `icons/icon.svg.png`.
3. Upload the zip to AMO from the Developer Hub.
4. Fill in the listing fields:
   - name
   - summary
   - description
   - screenshots
   - support and privacy URLs if you want them
5. If AMO asks for source code, upload this repo or the relevant source package with build instructions.

## Packaging

Run:

```bash
./scripts/package-amo.sh
```

The script writes a zip to `../dist/llm-performance-tracker-firefox.zip` by default.

## Review Notes

- The extension does not transmit prompt text or any telemetry data.
- The overlay, import flow, and raw-data viewer all work locally from extension storage.
- If remote telemetry is added later, update the privacy policy and AMO listing before release.

## Submission Steps

1. Log in to the [AMO Developer Hub](https://addons.mozilla.org/en-US/developers/).
2. Choose `Submit a New Add-on`.
3. Upload `dist/llm-performance-tracker-firefox.zip`.
4. Select Firefox compatibility.
5. Complete the listing details and submit.
