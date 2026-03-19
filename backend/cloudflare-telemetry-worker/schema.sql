CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,
  extension_version TEXT,
  session_id TEXT,
  site TEXT NOT NULL,
  model TEXT,
  hostname TEXT,
  started_at TEXT NOT NULL,
  timezone TEXT,
  locale TEXT,
  utc_offset_minutes INTEGER,
  visibility_state_at_start TEXT,
  was_page_visible_at_start INTEGER,
  online_at_start INTEGER,
  connection_effective_type TEXT,
  connection_rtt_ms INTEGER,
  connection_downlink_mbps REAL,
  connection_save_data INTEGER,
  input_words INTEGER,
  ttfw_ms INTEGER NOT NULL,
  ttlw_ms INTEGER NOT NULL,
  streaming_ms INTEGER,
  longest_stall_ms INTEGER,
  stall_count_500_ms INTEGER,
  stall_count_1000_ms INTEGER,
  p95_inter_chunk_gap_ms INTEGER,
  word_count INTEGER NOT NULL,
  words_per_second REAL NOT NULL,
  end_to_end_words_per_second REAL,
  reason TEXT,
  country TEXT,
  ip_hash TEXT,
  user_agent_hash TEXT,
  schema_version INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_received_at ON events (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_started_at ON events (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_site_model ON events (site, model);

CREATE TABLE IF NOT EXISTS rejected_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL,
  event_id TEXT,
  reason TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  window_key TEXT PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  window_started_at TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  event_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
