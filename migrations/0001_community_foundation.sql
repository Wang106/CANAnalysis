PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 210000,
  email_verified_at TEXT,
  display_name TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  avatar_file_id TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  consent_version TEXT NOT NULL,
  cross_border_consent_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  ip_hash TEXT,
  user_agent_hash TEXT
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE email_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX email_tokens_user_idx ON email_tokens(user_id, purpose);

CREATE TABLE files (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  object_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('avatar', 'comment_attachment')),
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('pending', 'ready', 'blocked', 'deleted')),
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX files_owner_idx ON files(owner_user_id, created_at);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  author_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX comments_visible_idx ON comments(status, created_at DESC);
CREATE INDEX comments_author_idx ON comments(author_user_id, created_at DESC);

CREATE TABLE comment_files (
  comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  PRIMARY KEY (comment_id, file_id)
);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  reporter_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  comment_snapshot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'investigating', 'actioned', 'dismissed', 'closed')),
  resolution TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX reports_status_idx ON reports(status, created_at);

CREATE TABLE appeals (
  id TEXT PRIMARY KEY,
  appellant_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'upheld', 'reversed')),
  resolution TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX appeals_status_idx ON appeals(status, created_at);

CREATE TABLE moderation_actions (
  id TEXT PRIMARY KEY,
  admin_email TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX moderation_target_idx ON moderation_actions(target_type, target_id, created_at);

CREATE TABLE outbox (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  recipient TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX outbox_status_idx ON outbox(status, created_at);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_admin_email TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  ip_hash TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX audit_created_idx ON audit_logs(created_at DESC);

CREATE TABLE rate_limits (
  scope TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (scope, subject_hash, bucket)
);

CREATE TABLE consent_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  policy_version TEXT NOT NULL,
  cross_border INTEGER NOT NULL CHECK (cross_border IN (0, 1)),
  ip_hash TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX consent_user_idx ON consent_records(user_id, created_at DESC);

CREATE TABLE export_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed', 'expired')),
  object_key TEXT,
  expires_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX export_user_idx ON export_jobs(user_id, created_at DESC);
