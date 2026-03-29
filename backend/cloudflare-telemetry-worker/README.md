# Cloudflare Telemetry Backend

This scaffold is experimental and intentionally **out of scope** for the supported public client surface described in the repo root README.

This Worker was originally built as a possible ingest path for sanitized timing batches from the browser extensions. The current shipped Chrome and Firefox extensions are local-only and do **not** use this backend.

## What this backend does

- exposes `POST /ingest` for extension uploads
- validates event payloads server-side
- rate-limits requests per IP hash in hourly windows
- deduplicates by `event_id`
- stores accepted events in D1
- stores invalid payloads in `rejected_events`

## Cloudflare setup

1. Install dependencies:

```bash
cd /Users/rndm/Code/chatbot-perf/backend/cloudflare-telemetry-worker
npm install
```

2. Authenticate Wrangler:

```bash
npx wrangler login
```

3. Create the D1 database:

```bash
npx wrangler d1 create llm-performance-tracker
```

Copy the returned `database_id` into [wrangler.toml](/Users/rndm/Code/chatbot-perf/backend/cloudflare-telemetry-worker/wrangler.toml) in the `database_id` field.

4. Apply the schema to the remote database:

```bash
npx wrangler d1 execute llm-performance-tracker --remote --file=./schema.sql
```

5. Deploy the Worker:

```bash
npx wrangler deploy
```

Wrangler will print a URL like:

```text
https://llm-performance-tracker.<subdomain>.workers.dev
```

The extension endpoint should be:

```text
https://llm-performance-tracker.<subdomain>.workers.dev/ingest
```

## Local development

Run the Worker locally:

```bash
npx wrangler dev
```

For local testing in the extension popup, use:

```text
http://127.0.0.1:8787/ingest
```

## Health check

The Worker exposes:

```text
GET /health
```

Expected response:

```json
{"ok":true,"service":"llm-performance-tracker"}
```

## Notes

- The current shipped extensions do not upload anything to this backend.
- If remote telemetry is reintroduced in a future release, the browser-side integration and privacy/docs story should be revalidated before using this scaffold.
- The rate limiter is intentionally simple for the free tier. If abuse becomes real, move rate limiting into a Durable Object.
