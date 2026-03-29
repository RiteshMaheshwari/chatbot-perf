# Browser Extensions

This directory contains the two supported browser-extension apps:

- [chrome](./chrome): Chrome / Edge extension
- [firefox](./firefox): Firefox extension

Both extensions consume generated shared libraries from [shared](../shared) via the root sync script:

```bash
./scripts/sync-shared-libs.sh
```
