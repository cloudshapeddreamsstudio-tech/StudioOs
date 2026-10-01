-- StudioOS sessions. See docs/adr/0003-how-sessions-are-stored.md.
--
-- Apply with:
--   bun run db:migrate:local     (local .wrangler state)
--   bun run db:migrate:remote    (the real D1 database)
--
-- D1 enforces foreign keys, so ON DELETE CASCADE operates: to delete a user
-- deletes the sessions of that user, and to delete a session deletes its
-- ERPNext tokens.

-- One studio: one ERPNext site. `host` is the key of the tenant registry in KV
-- (lib/tenants.ts). The client secret stays in KV, not here. SEAM section 8.
CREATE TABLE studio (
  id         TEXT PRIMARY KEY,
  host       TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

-- One ERPNext user on one studio. The same person on two studios is two rows
-- until Phase 8 decides otherwise. ADR-0003 condition 7.
CREATE TABLE user (
  id         TEXT PRIMARY KEY,
  studio_id  TEXT NOT NULL REFERENCES studio(id) ON DELETE CASCADE,
  erp_user   TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (studio_id, erp_user)
);

-- One signed-in browser. `id_hash` is the SHA-256 of the cookie value, never
-- the value. To delete the row cancels the session. ADR-0003 conditions 3, 6.
CREATE TABLE session (
  id_hash    TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_session_user ON session (user_id);

-- The ERPNext tokens of one session, encrypted with SESSION_KEY. One sign-in
-- gets its own token from ERPNext, so sign-out revokes only that token.
CREATE TABLE erp_token (
  session_id_hash   TEXT PRIMARY KEY REFERENCES session(id_hash) ON DELETE CASCADE,
  access_token_enc  TEXT NOT NULL,
  refresh_token_enc TEXT,
  access_expires_at INTEGER NOT NULL
);
