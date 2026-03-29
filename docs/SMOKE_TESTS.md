# Manual Smoke Tests

Use this checklist after shared-source changes, release-prep changes, or any modification to timing behavior.

## Chrome / Edge

Load [extensions/chrome](../extensions/chrome) as an unpacked extension and verify:

1. The extension popup opens and shows existing history.
2. `Export` downloads a JSON file with browser name and timestamp in the filename.
3. `Import` accepts a previously exported file without creating duplicates.
4. `Raw Data` opens and shows the local sample JSON.
5. The overlay appears on a supported site when enabled.
6. A new chat run records:
   - waiting state before first word
   - streaming state while content is arriving
   - complete state after settle
7. A new completed run appears in popup history.

## Firefox

Load [extensions/firefox](../extensions/firefox) as a temporary add-on and verify:

1. The extension popup opens and shows existing history.
2. `Export` downloads a JSON file with browser name and timestamp in the filename.
3. `Import` accepts a previously exported file without creating duplicates.
4. `Raw Data` opens and shows the local sample JSON.
5. The overlay appears on a supported site when enabled.
6. A new chat run records:
   - waiting state before first word
   - streaming state while content is arriving
   - complete state after settle
7. A new completed run appears in popup history.

## Cross-browser checks

1. Export from Chrome and import into Firefox.
2. Export from Firefox and import into Chrome.
3. Confirm imported samples merge without duplicate rows when the same file is imported twice.

## Shared library checks

Run:

```bash
npm run check:shared
npm run test:shared-core
npm run verify:extensions
```
