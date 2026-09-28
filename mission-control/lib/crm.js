const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const https = require("https");
const net = require("net");
const tls = require("tls");
const { execFileSync } = require("child_process");
const Database = require("better-sqlite3");

const HOME = process.env.HOME || os.homedir() || path.resolve(process.cwd(), "../..");
const CRM_INSTALL_STATE = path.join(process.cwd(), ".allsorted-crm-install.json");
function installedWorkspacePath() { try { const state = JSON.parse(fs.readFileSync(CRM_INSTALL_STATE, "utf8")); if (typeof state.workspaceRoot === "string" && state.workspaceRoot) return path.resolve(state.workspaceRoot); } catch {} return path.resolve(process.cwd()); }
const WORKSPACE_PATH = process.env.CRM_WORKSPACE_PATH || process.env.ALLSORTED_WORKSPACE || installedWorkspacePath();
const WORKSPACE_ENV_PATH = path.join(WORKSPACE_PATH, ".env");
const DB_PATH = path.join(WORKSPACE_PATH, "data", "crm.db");
const CRM_JSON_PATH = path.join(WORKSPACE_PATH, "data", "crm.json");
const INSTAGRAM_DB_PATH = path.join(WORKSPACE_PATH, "data", "instagram.db");
const GOOGLE_AGENT = process.env.CRM_GOOGLE_SENDER_COMMAND || "";

const STATUSES = [
  "new",
  "reviewed",
  "contacted",
  "nurture",
  "qualified",
  "archived",
];

const PRIMARY_PROJECT_DEFAULT = "pipeline";

const PIPELINE_PROJECT = "pipeline";
const PIPELINE_PROJECT_DISPLAY_NAME = "Pipeline";
const DEFAULT_CRM_PRODUCTS = [
  { key: PIPELINE_PROJECT, display_name: "Pipeline", active: 1, sort_order: 10 },
];
const DEFAULT_PIPELINE_AFFILIATE_ID = "pipeline-affiliate-example";
const PIPELINE_SETTING_KEYS = {
  statusesPrefix: "crm.pipeline.statuses.",
  boardStatusesPrefix: "crm.pipeline.board_statuses.",
};

const PIPELINE_PIPELINE_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "negotiating",
  "won",
  "stale",
  "lost",
];

// Higher rank = further along in pipeline = wins in dedup conflicts
const PIPELINE_STATUS_RANK = Object.fromEntries(
  PIPELINE_PIPELINE_STATUSES.map((s, i) => [s, i])
);

const PIPELINE_BOARD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "negotiating",
  "won",
  "stale",
  "lost",
];

const PIPELINE_DECLINED_REASONS = ["fit", "fit_not_ready", "timing", "price", "other"];
const COMMUNICATION_CHANNELS = ["whatsapp", "email", "instagram", "tiktok"];
const AUTOMATION_TRIGGER_TYPES = ["stage_changed"];
const AUTOMATION_CHANNELS = ["email", "instagram", "whatsapp"];
const AUTOMATION_RUN_STATUSES = [
  "pending",
  "invalidated",
  "awaiting_approval",
  "approved",
  "queued",
  "executed",
  "failed",
  "cancelled",
];
const AUTOMATION_APPROVAL_STATUSES = ["pending_review", "approved", "cancelled"];
const AUTOMATION_DELIVERY_STATUSES = ["queued", "blocked", "sending", "sent", "failed"];
const AUTOMATION_DEFAULT_DELAY_MINUTES = 3;
const RESEND_API_URL = "https://api.resend.com/emails";
const AUTOMATION_EMAIL_FROM = process.env.RESEND_FROM_EMAIL || "";

const AUTOMATION_SETTING_KEYS = {
  defaultDelayMinutes: "crm.automation.default_delay_minutes",
  emailLiveEnabled: "crm.automation.email.live_enabled",
  emailFromAddress: "crm.automation.email.from_address",
  emailProvider: "crm.automation.email.provider",
  emailMarketingProvider: "crm.email.marketing_provider",
  instagramLiveEnabled: "crm.automation.instagram.live_enabled",
  whatsappLiveEnabled: "crm.automation.whatsapp.live_enabled",
};

const SORT_OPTIONS = new Set([
  "updated_desc",
  "created_desc",
  "untouched_asc",
  "priority_desc",
  "source_asc",
  "owner_asc",
  "status_asc",
  "sync_state_asc",
]);

const APPROVED_LABELS = {
  "custom.website": { role: "source", displayName: "Website" },
  "custom.referral": { role: "source", displayName: "Referral" },
  "custom.event": { role: "source", displayName: "Event" },
  "custom.newsletter": { role: "source", displayName: "Newsletter" },
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS crm_contacts (
  id TEXT PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  primary_project TEXT,
  primary_email TEXT,
  primary_phone TEXT,
  location TEXT,
  location_source TEXT,
  location_is_manual INTEGER NOT NULL DEFAULT 0,
  industry TEXT,
  industry_source TEXT,
  industry_is_manual INTEGER NOT NULL DEFAULT 0,
  business_description TEXT,
  business_description_source TEXT,
  business_description_is_manual INTEGER NOT NULL DEFAULT 0,
  biggest_needs TEXT,
  biggest_needs_source TEXT,
  biggest_needs_is_manual INTEGER NOT NULL DEFAULT 0,
  instagram_handle TEXT,
  instagram_profile_url TEXT,
  tiktok_url TEXT,
  source_first TEXT,
  source_latest TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  priority INTEGER NOT NULL DEFAULT 0,
  owner TEXT,
  notes TEXT,
  next_step TEXT,
  willing_to_pay REAL,
  pipeline_affiliate_id TEXT,
  communication_channel TEXT,
  lost_reason TEXT,
  funnel_label_key TEXT,
  review_needed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS crm_contact_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id TEXT NOT NULL,
  alias_type TEXT NOT NULL,
  alias_value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(contact_id, alias_type, alias_value)
);

CREATE TABLE IF NOT EXISTS crm_contact_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  reason TEXT
);

CREATE TABLE IF NOT EXISTS crm_lead_events (
  id TEXT PRIMARY KEY,
  contact_id TEXT,
  source TEXT NOT NULL,
  source_subtype TEXT,
  external_event_id TEXT,
  campaign TEXT,
  keyword TEXT,
  raw_payload TEXT,
  captured_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS crm_pipeline_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id TEXT NOT NULL,
  project_name TEXT,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  changed_by TEXT,
  reason TEXT
);

CREATE TABLE IF NOT EXISTS crm_contact_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  pipeline_status TEXT NOT NULL DEFAULT 'new',
  sort_order REAL,
  last_touched_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(contact_id, project_name)
);

CREATE TABLE IF NOT EXISTS crm_products (
  key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS crm_sync_destinations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id TEXT NOT NULL,
  destination TEXT NOT NULL,
  external_id TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  last_payload_json TEXT,
  email_subscription_status TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(contact_id, destination)
);

CREATE TABLE IF NOT EXISTS crm_contact_funnel_labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id TEXT NOT NULL,
  label_key TEXT NOT NULL,
  label_role TEXT NOT NULL,
  assigned_by_rule TEXT NOT NULL DEFAULT 'rule',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(contact_id, label_key)
);

CREATE TABLE IF NOT EXISTS crm_contact_enrichments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  handle TEXT,
  full_name TEXT,
  bio TEXT,
  external_url TEXT,
  profile_url TEXT,
  photo_url TEXT,
  photo_local_path TEXT,
  followers INTEGER NOT NULL DEFAULT 0,
  following INTEGER NOT NULL DEFAULT 0,
  post_count INTEGER NOT NULL DEFAULT 0,
  posts_fetched INTEGER NOT NULL DEFAULT 0,
  is_verified INTEGER NOT NULL DEFAULT 0,
  raw_payload_json TEXT NOT NULL,
  enriched_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(contact_id, source)
);

CREATE TABLE IF NOT EXISTS crm_pipeline_affiliates (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT,
  commission_percentage REAL NOT NULL DEFAULT 0,
  paypal_email TEXT,
  wise_url TEXT,
  bank_transfer_info TEXT,
  preferred_payment_method TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS crm_affiliate_payouts (
  id           TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL REFERENCES crm_pipeline_affiliates(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  paid_at      TEXT NOT NULL,
  note         TEXT,
  status       TEXT NOT NULL DEFAULT 'paid' CHECK(status IN ('pending','paid')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_crm_payouts_affiliate
  ON crm_affiliate_payouts(affiliate_id, paid_at DESC);

CREATE TABLE IF NOT EXISTS crm_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS crm_contact_communications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'outbound',
  note TEXT,
  contacted_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_crm_comms_contact
  ON crm_contact_communications(contact_id, contacted_at DESC);

CREATE TABLE IF NOT EXISTS crm_automation_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  channel TEXT NOT NULL,
  subject_template TEXT,
  body_template TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS crm_automation_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  trigger_type TEXT NOT NULL,
  project_name TEXT NOT NULL,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  delay_minutes INTEGER,
  channel TEXT NOT NULL,
  template_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS crm_automation_runs (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  triggered_from_stage TEXT,
  triggered_to_stage TEXT NOT NULL,
  triggered_at TEXT NOT NULL,
  execute_after TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  rendered_payload_json TEXT,
  invalidated_at TEXT,
  approved_at TEXT,
  executed_at TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS crm_automation_approval_queue (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient_identity TEXT,
  scheduled_send_at TEXT NOT NULL,
  rendered_payload_json TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending_review',
  reviewed_at TEXT,
  reviewer_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS crm_automation_delivery_queue (
  id TEXT PRIMARY KEY,
  approval_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient_identity TEXT,
  scheduled_send_at TEXT NOT NULL,
  jitter_minutes INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  blocked_reason TEXT,
  external_queue_id TEXT,
  released_at TEXT,
  executed_at TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS crm_automation_delivery_attempts (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL,
  attempted_at TEXT NOT NULL,
  status TEXT NOT NULL,
  response_json TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_email ON crm_contacts(primary_email);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_phone ON crm_contacts(primary_phone);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_status ON crm_contacts(status);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_updated ON crm_contacts(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_aliases_lookup ON crm_contact_aliases(alias_type, alias_value);
CREATE INDEX IF NOT EXISTS idx_crm_events_contact ON crm_lead_events(contact_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_events_source ON crm_lead_events(source, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_sync_lookup ON crm_sync_destinations(contact_id, destination);
CREATE INDEX IF NOT EXISTS idx_crm_enrichments_lookup ON crm_contact_enrichments(contact_id, source, enriched_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_projects_lookup ON crm_contact_projects(contact_id, project_name);
CREATE INDEX IF NOT EXISTS idx_crm_projects_status ON crm_contact_projects(project_name, pipeline_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_automation_rules_project ON crm_automation_rules(project_name, trigger_type, enabled, channel);
CREATE INDEX IF NOT EXISTS idx_crm_automation_runs_execute_after ON crm_automation_runs(status, execute_after, contact_id, project_name, triggered_to_stage);
CREATE INDEX IF NOT EXISTS idx_crm_automation_approval_review ON crm_automation_approval_queue(review_status, scheduled_send_at, channel);
CREATE INDEX IF NOT EXISTS idx_crm_automation_delivery_status ON crm_automation_delivery_queue(status, scheduled_send_at, channel);
CREATE INDEX IF NOT EXISTS idx_crm_automation_attempts_delivery ON crm_automation_delivery_attempts(delivery_id, attempted_at DESC);
`;

function getDb(readonly = false) {
  const exists = fs.existsSync(DB_PATH);
  if (readonly && !exists) {
    return null;
  }
  if (!readonly) {
    // A fresh install has no data/ folder yet; SQLite cannot create parent directories.
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }
  const db = new Database(DB_PATH, readonly ? { readonly: true } : { timeout: 5000 });
  if (!readonly) {
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA);
  }
  return db;
}

function nowIso() {
  return new Date().toISOString();
}

function emptyToNull(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function collapseWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function stripControlChars(value) {
  return value.replace(/[\u0000-\u001f\u007f]/g, "");
}

function normalizeMachineText(value) {
  const raw = emptyToNull(value);
  if (!raw) return null;
  return collapseWhitespace(stripControlChars(raw));
}

function normalizeLongText(value) {
  const raw = emptyToNull(value);
  if (!raw) return null;
  return stripControlChars(String(raw)).replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeEmail(value) {
  const raw = emptyToNull(value);
  if (!raw) return null;
  const email = stripControlChars(String(raw)).replace(/\s+/g, "").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

// Lenient versions for user-typed fields: clean but never reject
function lenientEmail(value) {
  const raw = emptyToNull(value);
  if (!raw) return null;
  return stripControlChars(String(raw)).replace(/\s+/g, "").toLowerCase();
}

function lenientUrl(value) {
  const raw = normalizeMachineText(value);
  return raw;
}

function normalizePhone(value) {
  const raw = normalizeMachineText(value);
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits ? `+${digits}` : null;
}

function normalizeHandle(value) {
  const raw = normalizeMachineText(value);
  if (!raw) return null;
  const instagramMatch = raw.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  const candidate = instagramMatch?.[1] || raw;
  return candidate.toLowerCase().replace(/^@+/, "").replace(/[^a-z0-9._]/g, "") || null;
}

function normalizeOptionalUrl(value) {
  const raw = normalizeMachineText(value);
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : null;
}

function buildInstagramProfileUrl(handle) {
  const normalizedHandle = normalizeHandle(handle);
  return normalizedHandle ? `https://instagram.com/${normalizedHandle}` : null;
}

function normalizeInstagramFields(handleValue, urlValue) {
  const normalizedUrlCandidate = normalizeOptionalUrl(urlValue);
  const normalizedHandle = normalizeHandle(handleValue || normalizedUrlCandidate);
  const normalizedUrl = normalizedUrlCandidate || buildInstagramProfileUrl(normalizedHandle);
  return {
    instagram_handle: normalizedHandle,
    instagram_profile_url: normalizedUrl,
  };
}

function normalizeInteger(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.floor(num)) : fallback;
}

function normalizeMoneyNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  const raw = normalizeMachineText(value);
  if (!raw) return null;
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeNamePart(value) {
  const raw = normalizeMachineText(value);
  if (!raw) return null;
  const cleaned = raw.replace(/[^\p{L}\p{M}' -]/gu, "");
  if (!cleaned.trim()) return null;
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((part) =>
      part
        .split(/([-'])/)
        .map((chunk) =>
          chunk === "-" || chunk === "'"
            ? chunk
            : chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase()
        )
        .join("")
    )
    .join(" ");
}

function splitFullName(fullName, explicitFirst, explicitLast) {
  const first = normalizeNamePart(explicitFirst);
  const last = normalizeNamePart(explicitLast);
  if (first || last) {
    return {
      firstName: first,
      lastName: last,
      fullName: [first, last].filter(Boolean).join(" ") || null,
    };
  }

  const normalized = normalizeNamePart(fullName);
  if (!normalized) {
    return { firstName: null, lastName: null, fullName: null };
  }

  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null, fullName: parts[0] };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
    fullName: normalized,
  };
}

function normalizePayload(input = {}) {
  const requestedPipelineStatus =
    input.project_state && typeof input.project_state === "object"
      ? input.project_state.status || input.project_state.pipeline_status
      : input.pipeline_status;
  const names = splitFullName(input.full_name, input.first_name, input.last_name);
  const instagram = normalizeInstagramFields(input.instagram_handle, input.instagram_profile_url);
  const payload = {
    source: normalizeMachineText(input.source) || "manual",
    source_subtype: normalizeMachineText(input.source_subtype),
    external_event_id: normalizeMachineText(input.external_event_id),
    email: normalizeEmail(input.email),
    phone: normalizePhone(input.phone),
    instagram_handle: instagram.instagram_handle,
    instagram_profile_url: instagram.instagram_profile_url,
    tiktok_url: normalizeOptionalUrl(input.tiktok_url),
    campaign: normalizeMachineText(input.campaign),
    keyword: normalizeMachineText(input.keyword),
    primary_project: normalizeProjectName(input.primary_project || input.project),
    next_step: normalizeLongText(input.next_step),
    willing_to_pay: normalizeMoneyNumber(input.willing_to_pay),
    pipeline_affiliate_id: normalizeAffiliateId(input.pipeline_affiliate_id),
    communication_channel: inferCommunicationChannel(input.communication_channel, input.source),
    lost_reason: normalizeMachineText(input.lost_reason),
    pipeline_status: requestedPipelineStatus
      ? normalizePipelineStatus(requestedPipelineStatus)
      : null,
    first_name: names.firstName,
    last_name: names.lastName,
    full_name: names.fullName,
    captured_at: normalizeMachineText(input.captured_at) || nowIso(),
    owner: normalizeMachineText(input.owner),
    notes: normalizeMachineText(input.notes),
    raw_payload: input.raw_payload || input,
  };
  return payload;
}

function inferTopLevelLabel(payload) {
  const source = [payload.source, payload.source_subtype, payload.campaign, payload.keyword]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const sources = [
    { pattern: /\bwebsite\b/, labelKey: "custom.website" },
    { pattern: /\breferral\b/, labelKey: "custom.referral" },
    { pattern: /\bevent\b/, labelKey: "custom.event" },
    { pattern: /\bnewsletter\b/, labelKey: "custom.newsletter" },
  ];
  const match = sources.find(({ pattern }) => pattern.test(source));
  return match ? { labelKey: match.labelKey, reviewNeeded: false } : { labelKey: null, reviewNeeded: true };
}

function inferSecondaryLabelKeys(payload) {
  const source = [payload.source, payload.source_subtype, payload.campaign, payload.keyword, JSON.stringify(payload.raw_payload || {})]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const labels = [
    { pattern: /\bwebsite\b/, labelKey: "custom.website" },
    { pattern: /\breferral\b/, labelKey: "custom.referral" },
    { pattern: /\bevent\b/, labelKey: "custom.event" },
    { pattern: /\bnewsletter\b/, labelKey: "custom.newsletter" },
  ];
  return labels.filter(({ pattern }) => pattern.test(source)).map(({ labelKey }) => labelKey);
}

function ensureSetting(db, key, value) {
  db.prepare(
    "INSERT INTO crm_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING"
  ).run(key, JSON.stringify(value));
}

function bootstrapSettings(db) {
  ensureSetting(db, "crm.default_sort", "updated_desc");
  ensureSetting(db, AUTOMATION_SETTING_KEYS.defaultDelayMinutes, AUTOMATION_DEFAULT_DELAY_MINUTES);
  ensureSetting(db, AUTOMATION_SETTING_KEYS.emailLiveEnabled, false);
  ensureSetting(db, AUTOMATION_SETTING_KEYS.emailFromAddress, getDefaultAutomationEmailFrom());
  ensureSetting(db, AUTOMATION_SETTING_KEYS.instagramLiveEnabled, false);
  ensureSetting(db, AUTOMATION_SETTING_KEYS.whatsappLiveEnabled, false);
  ensureSetting(db, getPipelineStatusesSettingKey(PIPELINE_PROJECT), PIPELINE_PIPELINE_STATUSES);
  ensureSetting(db, getPipelineBoardStatusesSettingKey(PIPELINE_PROJECT), PIPELINE_BOARD_STATUSES);
  // Always merge APPROVED_LABELS keys into the DB setting so newly added labels are immediately active.
  const existingLabelKeys = getSetting(db, "crm.approved_label_keys", []);
  const mergedLabelKeys = [
    ...new Set([
      ...(Array.isArray(existingLabelKeys) ? existingLabelKeys : []),
      ...Object.keys(APPROVED_LABELS),
    ]),
  ];
  db.prepare(
    "INSERT INTO crm_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run("crm.approved_label_keys", JSON.stringify(mergedLabelKeys));
  ensureSchemaColumn(db, "crm_contacts", "primary_project", "TEXT");
  ensureSchemaColumn(db, "crm_contacts", "next_step", "TEXT");
  ensureSchemaColumn(db, "crm_contacts", "willing_to_pay", "REAL");
  ensureSchemaColumn(db, "crm_contacts", "pipeline_affiliate_id", "TEXT");
  ensureSchemaColumn(db, "crm_contacts", "communication_channel", "TEXT");
  ensureSchemaColumn(db, "crm_contacts", "lost_reason", "TEXT");
  ensureSchemaColumn(db, "crm_contacts", "location", "TEXT");
  ensureSchemaColumn(db, "crm_contacts", "location_source", "TEXT");
  ensureSchemaColumn(db, "crm_contacts", "location_is_manual", "INTEGER NOT NULL DEFAULT 0");
  ensureSchemaColumn(db, "crm_contacts", "industry", "TEXT");
  ensureSchemaColumn(db, "crm_contacts", "industry_source", "TEXT");
  ensureSchemaColumn(db, "crm_contacts", "industry_is_manual", "INTEGER NOT NULL DEFAULT 0");
  ensureSchemaColumn(db, "crm_contacts", "business_description", "TEXT");
  ensureSchemaColumn(db, "crm_contacts", "business_description_source", "TEXT");
  ensureSchemaColumn(
    db,
    "crm_contacts",
    "business_description_is_manual",
    "INTEGER NOT NULL DEFAULT 0"
  );
  ensureSchemaColumn(db, "crm_contacts", "biggest_needs", "TEXT");
  ensureSchemaColumn(db, "crm_contacts", "biggest_needs_source", "TEXT");
  ensureSchemaColumn(db, "crm_contacts", "biggest_needs_is_manual", "INTEGER NOT NULL DEFAULT 0");
  ensureSchemaColumn(db, "crm_contacts", "instagram_profile_url", "TEXT");
  ensureSchemaColumn(db, "crm_contacts", "tiktok_url", "TEXT");
  ensureSchemaColumn(db, "crm_pipeline_history", "project_name", "TEXT");
  ensureSchemaColumn(db, "crm_contact_projects", "pipeline_status", "TEXT");
  ensureSchemaColumn(db, "crm_contact_projects", "sort_order", "REAL");
  ensureSchemaColumn(db, "crm_contact_projects", "last_touched_at", "TEXT");
  ensureSchemaColumn(db, "crm_contact_projects", "created_at", "TEXT");
  ensureSchemaColumn(db, "crm_contact_projects", "updated_at", "TEXT");
  ensureSchemaColumn(db, "crm_products", "active", "INTEGER NOT NULL DEFAULT 1");
  ensureSchemaColumn(db, "crm_products", "sort_order", "REAL");
  ensureSchemaColumn(db, "crm_products", "created_at", "TEXT");
  ensureSchemaColumn(db, "crm_products", "updated_at", "TEXT");
  ensureSchemaColumn(db, "crm_contact_enrichments", "photo_url", "TEXT");
  ensureSchemaColumn(db, "crm_contact_enrichments", "photo_local_path", "TEXT");
  ensureSchemaColumn(db, "crm_pipeline_affiliates", "paypal_email", "TEXT");
  ensureSchemaColumn(db, "crm_pipeline_affiliates", "wise_url", "TEXT");
  ensureSchemaColumn(db, "crm_pipeline_affiliates", "bank_transfer_info", "TEXT");
  ensureSchemaColumn(db, "crm_pipeline_affiliates", "preferred_payment_method", "TEXT");
  ensureSchemaColumn(db, "crm_contacts", "last_contacted_at", "TEXT");
  ensureSchemaColumn(db, "crm_sync_destinations", "email_subscription_status", "TEXT");
  ensureSchemaColumn(db, "crm_sync_destinations", "created_at", "TEXT");
  ensureSchemaColumn(db, "crm_sync_destinations", "updated_at", "TEXT");
  db.exec(`
    UPDATE crm_sync_destinations
    SET created_at = COALESCE(created_at, datetime('now')),
        updated_at = COALESCE(updated_at, created_at, datetime('now'))
    WHERE created_at IS NULL OR updated_at IS NULL
  `);
  seedDefaultCrmProducts(db);
  seedDefaultPipelineAffiliates(db);
  try {
    bootstrapPipelineDefaults(db);
  } catch (error) {
    console.error("[crm] bootstrapPipelineDefaults skipped after malformed data", error);
  }
}

function seedDefaultCrmProducts(db) {
  const timestamp = nowIso();
  for (const product of DEFAULT_CRM_PRODUCTS) {
    db.prepare(
      `
      INSERT INTO crm_products (key, display_name, active, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        display_name = excluded.display_name,
        active = COALESCE(crm_products.active, excluded.active),
        sort_order = COALESCE(crm_products.sort_order, excluded.sort_order),
        updated_at = crm_products.updated_at
    `
    ).run(product.key, product.display_name, product.active, product.sort_order, timestamp, timestamp);
  }
}

function seedDefaultPipelineAffiliates(db) {
  db.prepare(
    `
    INSERT OR IGNORE INTO crm_pipeline_affiliates (
      id, first_name, last_name, email, commission_percentage, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    DEFAULT_PIPELINE_AFFILIATE_ID,
    "Example Affiliate",
    null,
    null,
    10,
    nowIso(),
    nowIso()
  );
}

function normalizeAffiliateId(value) {
  const raw = normalizeMachineText(value);
  return raw || null;
}

function normalizePreferredPaymentMethod(value) {
  const raw = normalizeMachineText(value);
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  if (normalized === "paypal") return "paypal";
  if (normalized === "wise") return "wise";
  if (
    normalized === "bank_transfer" ||
    normalized === "bank transfer" ||
    normalized === "bank"
  ) {
    return "bank_transfer";
  }
  return null;
}

function bootstrapPipelineDefaults(db) {
  const canonicalStatuses = ["new", "contacted", "qualified", "negotiating", "won", "stale", "lost"];
  const statusCase = "CASE %COLUMN% WHEN 'unreviewed' THEN 'new' WHEN 'possible_candidate' THEN 'new' WHEN 'expressed_interest' THEN 'contacted' WHEN 'interested' THEN 'contacted' WHEN 'in_conversation' THEN 'qualified' WHEN 'strong_interest' THEN 'qualified' WHEN 'awaiting_payment' THEN 'negotiating' WHEN 'registered' THEN 'won' WHEN 'future_cohort' THEN 'qualified' WHEN 'future_interest' THEN 'qualified' WHEN 'cant_afford_it' THEN 'lost' WHEN 'declined' THEN 'lost' ELSE %COLUMN% END";
  db.exec("BEGIN;");
  try {
    db.prepare("UPDATE crm_contact_projects SET project_name = ? WHERE project_name IN (?, ?)").run(PIPELINE_PROJECT, "mastermind", "consulting");
    db.prepare("UPDATE crm_contact_projects SET pipeline_status = " + statusCase.replace(/%COLUMN%/g, "pipeline_status") + " WHERE project_name = ?").run(PIPELINE_PROJECT);
    db.prepare("UPDATE crm_pipeline_history SET from_status = " + statusCase.replace(/%COLUMN%/g, "from_status") + ", to_status = " + statusCase.replace(/%COLUMN%/g, "to_status") + " WHERE project_name = ?").run(PIPELINE_PROJECT);
    const statusKey = getPipelineStatusesSettingKey(PIPELINE_PROJECT);
    const boardKey = getPipelineBoardStatusesSettingKey(PIPELINE_PROJECT);
    db.prepare("DELETE FROM crm_settings WHERE key IN (?, ?, ?, ?)").run(getPipelineStatusesSettingKey("mastermind"), getPipelineBoardStatusesSettingKey("mastermind"), getPipelineStatusesSettingKey("consulting"), getPipelineBoardStatusesSettingKey("consulting"));
    db.prepare("INSERT INTO crm_settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(statusKey, JSON.stringify(canonicalStatuses));
    db.prepare("INSERT INTO crm_settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(boardKey, JSON.stringify(canonicalStatuses));
    db.exec("COMMIT;");
  } catch (error) { db.exec("ROLLBACK;"); throw error; }
  db.prepare(
    `
    UPDATE crm_contact_projects
    SET pipeline_status = 'contacted'
    WHERE project_name = ? AND pipeline_status = 'expressed_interest'
  `
  ).run(PIPELINE_PROJECT);
  const contacts = db
    .prepare(
      `
      SELECT id, full_name, primary_project
      FROM crm_contacts
      WHERE id IS NOT NULL AND trim(id) != ''
    `
    )
    .all();
  for (const contact of contacts) {
    const contactId = normalizeContactId(contact.id);
    if (!contactId) continue;
    const primaryProject = contact.primary_project || PRIMARY_PROJECT_DEFAULT;
    if (!contact.primary_project) {
      db.prepare("UPDATE crm_contacts SET primary_project = ? WHERE id = ?").run(
        primaryProject,
        contactId
      );
    }
    if (primaryProject === PIPELINE_PROJECT) {
      ensurePipelineProjectState(db, contactId, getPipelineDefaultStatus(contact.full_name));
    }
  }
}

function normalizePipelineStatus(value) {
  const normalized = normalizePipelineStatusToken(value);
  if (!normalized) return "new";
  if (normalized === "expressed_interest") return "contacted";
  return normalized;
}

function normalizeDeclinedReason(value) {
  const raw = normalizeMachineText(value);
  if (!raw) return null;
  const normalized = raw.toLowerCase().replace(/\s+/g, "_");
  return PIPELINE_DECLINED_REASONS.includes(normalized) ? normalized : "other";
}

function normalizeCommunicationChannel(value) {
  const raw = normalizeMachineText(value);
  if (!raw) return null;
  const normalized = raw.toLowerCase().replace(/\s+/g, "_");
  return COMMUNICATION_CHANNELS.includes(normalized) ? normalized : null;
}

function inferCommunicationChannel(explicitChannel, source) {
  const normalizedExplicit = normalizeCommunicationChannel(explicitChannel);
  if (normalizedExplicit) return normalizedExplicit;
  const normalizedSource = normalizeMachineText(source)?.toLowerCase() || "";
  if (normalizedSource.includes("chat widget")) return "instagram";
  if (normalizedSource === "manual") return "whatsapp";
  return null;
}

function formatProjectDisplayName(value) {
  const raw = normalizeProjectName(value);
  if (!raw) return null;
  if (raw === PIPELINE_PROJECT) return PIPELINE_PROJECT_DISPLAY_NAME;
  if (raw === "connection_map") return "Connection Map";
  if (raw === "mentorships") return "Mentorships";
  if (raw === "all-sorted") return "All Sorted";
  return raw.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

function formatPipelineStatusLabel(value) {
  const raw = normalizeMachineText(value);
  if (!raw) return "this stage";
  return raw
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getPipelineDefaultStatus() {
  return "new";
}

function ensurePrimaryProject(db, contactId, projectName) {
  const normalizedProject = normalizeProjectName(projectName);
  if (!normalizedProject) return;
  db.prepare("UPDATE crm_contacts SET primary_project = ? WHERE id = ?").run(
    normalizedProject,
    contactId
  );
}

function getNextSortOrder(db, projectName, pipelineStatus) {
  const row = db
    .prepare(
      `
      SELECT MAX(sort_order) AS max_sort_order
      FROM crm_contact_projects
      WHERE project_name = ? AND pipeline_status = ?
    `
    )
    .get(projectName, pipelineStatus);
  return Number.isFinite(Number(row?.max_sort_order)) ? Number(row.max_sort_order) + 1024 : 1024;
}

function calculateSortOrderBetween(beforeOrder, afterOrder) {
  if (Number.isFinite(beforeOrder) && Number.isFinite(afterOrder)) {
    return (beforeOrder + afterOrder) / 2;
  }
  if (Number.isFinite(beforeOrder)) return beforeOrder + 1024;
  if (Number.isFinite(afterOrder)) return afterOrder / 2;
  return 1024;
}

function reorderProjectCard(db, contactId, projectName, pipelineStatus, options = {}) {
  const normalizedProject = normalizeProjectName(projectName);
  if (!normalizedProject) return null;
  const normalizedStatus =
    normalizedProject === PIPELINE_PROJECT
      ? normalizePipelineStatus(pipelineStatus)
      : pipelineStatus;
  const beforeContactId = normalizeMachineText(options.beforeContactId);
  const afterContactId = normalizeMachineText(options.afterContactId);

  const beforeRow = beforeContactId
    ? db
        .prepare(
          "SELECT sort_order FROM crm_contact_projects WHERE contact_id = ? AND project_name = ? AND pipeline_status = ?"
        )
        .get(beforeContactId, normalizedProject, normalizedStatus)
    : null;
  const afterRow = afterContactId
    ? db
        .prepare(
          "SELECT sort_order FROM crm_contact_projects WHERE contact_id = ? AND project_name = ? AND pipeline_status = ?"
        )
        .get(afterContactId, normalizedProject, normalizedStatus)
    : null;

  const nextSortOrder =
    beforeRow || afterRow
      ? calculateSortOrderBetween(
          Number(beforeRow?.sort_order),
          Number(afterRow?.sort_order)
        )
      : getNextSortOrder(db, normalizedProject, normalizedStatus);

  db.prepare(
    `
    UPDATE crm_contact_projects
    SET sort_order = ?, updated_at = ?, last_touched_at = ?
    WHERE contact_id = ? AND project_name = ?
  `
  ).run(nextSortOrder, nowIso(), nowIso(), contactId, normalizedProject);

  return nextSortOrder;
}

function ensurePipelineProjectState(db, contactId, explicitStatus = null) {
  const normalizedContactId = normalizeContactId(contactId);
  if (!normalizedContactId) return null;
  const existing = db
    .prepare(
      "SELECT * FROM crm_contact_projects WHERE contact_id = ? AND project_name = ?"
    )
    .get(normalizedContactId, PIPELINE_PROJECT);
  if (existing) return existing;
  const contact = db.prepare("SELECT * FROM crm_contacts WHERE id = ?").get(normalizedContactId);
  if (!contact) return null;
  const nextStatus = normalizePipelineStatus(
    explicitStatus || getPipelineDefaultStatus(contact?.full_name)
  );
  upsertProjectState(db, normalizedContactId, PIPELINE_PROJECT, nextStatus, {
    touchedAt: nowIso(),
  });
  return db
    .prepare(
      "SELECT * FROM crm_contact_projects WHERE contact_id = ? AND project_name = ?"
    )
    .get(normalizedContactId, PIPELINE_PROJECT);
}

function ensureSchemaColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (columns.some((entry) => entry.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function getSetting(db, key, fallback = null) {
  const row = db.prepare("SELECT value FROM crm_settings WHERE key = ?").get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

function findContactIdByAlias(db, aliasType, aliasValue) {
  if (!aliasValue) return null;
  const contact = db
    .prepare(
      `
      SELECT c.id
      FROM crm_contacts c
      LEFT JOIN crm_contact_aliases a
        ON a.contact_id = c.id AND a.alias_type = ?
      WHERE (CASE WHEN ? = 'email' THEN c.primary_email ELSE c.primary_phone END) = ?
         OR a.alias_value = ?
      ORDER BY c.updated_at DESC
      LIMIT 2
    `
    )
    .all(aliasType, aliasType, aliasValue, aliasValue);

  if (contact.length === 1) return contact[0].id;
  return null;
}

// When multiple contact IDs match (ambiguous dedup), pick the one furthest along in the pipeline.
// This prevents creating a new duplicate instead of updating the best existing record.
function pickBestContactId(db, contactIds) {
  if (!contactIds || contactIds.length === 0) return null;
  if (contactIds.length === 1) return contactIds[0];
  const pipelineStatusRank = getProjectStatusRank(db, PIPELINE_PROJECT);

  let bestId = contactIds[0];
  let bestRank = -1;

  for (const id of contactIds) {
    const row = db
      .prepare("SELECT pipeline_status FROM crm_contact_projects WHERE contact_id = ? AND project_name = ? LIMIT 1")
      .get(id, PIPELINE_PROJECT);
    const rank = pipelineStatusRank[row?.pipeline_status] ?? -1;
    if (rank > bestRank) {
      bestRank = rank;
      bestId = id;
    }
  }
  return bestId;
}

function snapshotContact(db, contactId, reason) {
  const row = db.prepare("SELECT * FROM crm_contacts WHERE id = ?").get(contactId);
  if (!row) return;
  db.prepare(
    "INSERT INTO crm_contact_versions (contact_id, snapshot_json, reason) VALUES (?, ?, ?)"
  ).run(contactId, JSON.stringify(row), reason || null);
}

function insertAlias(db, contactId, aliasType, aliasValue) {
  if (!aliasValue) return;
  db.prepare(
    `
    INSERT INTO crm_contact_aliases (contact_id, alias_type, alias_value)
    VALUES (?, ?, ?)
    ON CONFLICT(contact_id, alias_type, alias_value) DO NOTHING
  `
  ).run(contactId, aliasType, aliasValue);
}

function normalizeProjectName(value) {
  const raw = normalizeMachineText(value);
  if (!raw) return null;
  if (raw === "all_sorted" || raw === "all sorted") return "all-sorted";
  return raw;
}

function normalizeContactId(value) {
  return normalizeMachineText(value);
}

function getDefaultCrmProductCatalog() {
  return DEFAULT_CRM_PRODUCTS.map((product) => product.key);
}

function getProjectCatalog() {
  const db = getDb(false);
  if (!db) return getDefaultCrmProductCatalog();
  db.exec(SCHEMA);
  seedDefaultCrmProducts(db);
  const rows = db
    .prepare(
      `
      SELECT key
      FROM crm_products
      WHERE active != 0
      ORDER BY COALESCE(sort_order, 999999), display_name COLLATE NOCASE, key
    `
    )
    .all();
  return rows.map((row) => row.key).filter(Boolean);
}

function getApprovedLabelKeys(db) {
  const configured = getSetting(db, "crm.approved_label_keys", Object.keys(APPROVED_LABELS));
  const keys = Array.isArray(configured) ? configured : Object.keys(APPROVED_LABELS);
  return keys.filter((labelKey) => APPROVED_LABELS[labelKey]);
}

function isApprovedLabelEnabled(db, labelKey) {
  return getApprovedLabelKeys(db).includes(labelKey);
}

function setApprovedLabelKeys(nextKeys = []) {
  const db = getDb(false);
  bootstrapSettings(db);
  const filtered = [...new Set((Array.isArray(nextKeys) ? nextKeys : []).filter((labelKey) => APPROVED_LABELS[labelKey]))];
  db.prepare(
    `
    INSERT INTO crm_settings (key, value)
    VALUES ('crm.approved_label_keys', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `
  ).run(JSON.stringify(filtered));
  return getSettingsSnapshot();
}

function parseJsonSafely(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeAutomationChannel(value) {
  const raw = normalizeMachineText(value)?.toLowerCase();
  return raw && AUTOMATION_CHANNELS.includes(raw) ? raw : null;
}

function normalizeAutomationTriggerType(value) {
  const raw = normalizeMachineText(value)?.toLowerCase();
  return raw && AUTOMATION_TRIGGER_TYPES.includes(raw) ? raw : null;
}

function normalizeAutomationRunStatus(value, fallback = "pending") {
  const raw = normalizeMachineText(value)?.toLowerCase();
  return raw && AUTOMATION_RUN_STATUSES.includes(raw) ? raw : fallback;
}

function normalizeAutomationApprovalStatus(value, fallback = "pending_review") {
  const raw = normalizeMachineText(value)?.toLowerCase();
  return raw && AUTOMATION_APPROVAL_STATUSES.includes(raw) ? raw : fallback;
}

function normalizeAutomationDeliveryStatus(value, fallback = "queued") {
  const raw = normalizeMachineText(value)?.toLowerCase();
  return raw && AUTOMATION_DELIVERY_STATUSES.includes(raw) ? raw : fallback;
}

function normalizeAutomationDelayMinutes(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Math.max(0, Math.floor(Number(value)));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePipelineStatusToken(value) {
  const raw = normalizeMachineText(value);
  if (!raw) return null;
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getPipelineStatusesSettingKey(projectName) {
  return `${PIPELINE_SETTING_KEYS.statusesPrefix}${normalizeProjectName(projectName) || PIPELINE_PROJECT}`;
}

function getPipelineBoardStatusesSettingKey(projectName) {
  return `${PIPELINE_SETTING_KEYS.boardStatusesPrefix}${normalizeProjectName(projectName) || PIPELINE_PROJECT}`;
}

function normalizeStatusList(values, fallback = []) {
  const source = Array.isArray(values) ? values : fallback;
  const next = [];
  for (const value of source) {
    const normalized = normalizePipelineStatusToken(value);
    if (!normalized || next.includes(normalized)) continue;
    next.push(normalized);
  }
  return next;
}

function getProjectPipelineStatuses(db, projectName = PIPELINE_PROJECT) {
  const normalizedProject = normalizeProjectName(projectName);
  if (normalizedProject !== PIPELINE_PROJECT) {
    return [...STATUSES];
  }
  const configured = getSetting(
    db,
    getPipelineStatusesSettingKey(normalizedProject),
    PIPELINE_PIPELINE_STATUSES
  );
  const normalized = normalizeStatusList(configured, PIPELINE_PIPELINE_STATUSES);
  return normalized.length ? normalized : [...PIPELINE_PIPELINE_STATUSES];
}

function getProjectBoardStatuses(db, projectName = PIPELINE_PROJECT) {
  const normalizedProject = normalizeProjectName(projectName);
  if (normalizedProject !== PIPELINE_PROJECT) {
    return [...STATUSES];
  }
  const statuses = getProjectPipelineStatuses(db, normalizedProject);
  const configured = getSetting(
    db,
    getPipelineBoardStatusesSettingKey(normalizedProject),
    PIPELINE_BOARD_STATUSES
  );
  const normalized = normalizeStatusList(configured, PIPELINE_BOARD_STATUSES).filter((status) =>
    statuses.includes(status)
  );
  return normalized.length
    ? normalized
    : statuses.filter((status) => status !== "new" && status !== "lost");
}

function persistProjectPipelineConfig(db, projectName, statuses, boardStatuses) {
  const normalizedProject = normalizeProjectName(projectName) || PIPELINE_PROJECT;
  const nextStatuses = normalizeStatusList(statuses, PIPELINE_PIPELINE_STATUSES);
  const nextBoardStatuses = normalizeStatusList(boardStatuses, PIPELINE_BOARD_STATUSES).filter((status) =>
    nextStatuses.includes(status)
  );
  db.prepare(
    "INSERT INTO crm_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(getPipelineStatusesSettingKey(normalizedProject), JSON.stringify(nextStatuses));
  db.prepare(
    "INSERT INTO crm_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(getPipelineBoardStatusesSettingKey(normalizedProject), JSON.stringify(nextBoardStatuses));
  return {
    project: normalizedProject,
    statuses: nextStatuses,
    board_statuses: nextBoardStatuses,
  };
}

function getProjectStatusRank(db, projectName = PIPELINE_PROJECT) {
  return Object.fromEntries(
    getProjectPipelineStatuses(db, projectName).map((status, index) => [status, index])
  );
}

function getPipelineConfig(db, projectName = PIPELINE_PROJECT) {
  const normalizedProject = normalizeProjectName(projectName) || PIPELINE_PROJECT;
  return {
    project: normalizedProject,
    statuses: getProjectPipelineStatuses(db, normalizedProject),
    board_statuses: getProjectBoardStatuses(db, normalizedProject),
  };
}

// Live project + stage catalog for the automation UI. Reads active crm_products
// (display_name from the table) and each project's live pipeline config, so the
// automation dropdowns always match the pipeline columns instead of a hardcoded list.
function listAutomationProjects(db) {
  const database = db || getDb(false);
  if (!database) {
    return DEFAULT_CRM_PRODUCTS.filter((product) => product.active).map((product) => ({
      name: product.key,
      display_name: product.display_name,
      stages: [],
    }));
  }
  bootstrapSettings(database);
  seedDefaultCrmProducts(database);
  const rows = database
    .prepare(
      `
      SELECT key, display_name
      FROM crm_products
      WHERE active != 0
      ORDER BY COALESCE(sort_order, 999999), display_name COLLATE NOCASE, key
    `
    )
    .all();
  const seen = new Set();
  const projects = [];
  for (const row of rows) {
    const name = normalizeProjectName(row.key);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const config = getPipelineConfig(database, name);
    projects.push({
      name,
      display_name: normalizeMachineText(row.display_name) || formatProjectDisplayName(name),
      stages: config.statuses.map((value) => ({ value, label: formatPipelineStatusLabel(value) })),
    });
  }
  return projects;
}

function commandExists(name) {
  // Resolve against the current process PATH only (no login shell), so tests
  // and hardened environments see exactly what this process can execute.
  if (!name || /[\/\0]/.test(name)) return false;
  for (const dir of String(process.env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (fs.statSync(candidate).isFile()) return true;
    } catch {}
  }
  return false;
}


function loadWorkspaceEnvVar(name) {
  if (process.env[name]) return process.env[name];
  // Fallback chain: workspace .env, then the Mission Control target's own
  // .env.local and .env. Next loads .env.local into process.env for the dev
  // server, but standalone scripts and cron ticks do not, so read it here.
  const candidates = [WORKSPACE_ENV_PATH, path.join(process.cwd(), ".env.local"), path.join(process.cwd(), ".env")];
  for (const envPath of candidates) {
    try {
      const content = fs.readFileSync(envPath, "utf8");
      const match = content.match(new RegExp(`^${name}=(.+)$`, "m"));
      if (!match) continue;
      let value = match[1].trim();
      if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")) || (value.startsWith("`") && value.endsWith("`")))) value = value.slice(1, -1);
      // Agree with Next's env loader: \$ is the escape for a literal dollar sign.
      value = value.replace(/\\\$/g, "$");
      if (!value) continue;
      process.env[name] = value;
      return value;
    } catch {}
  }
  return "";
}

function getEvolutionApiUrl() {
  return process.env.EVOLUTION_API_URL || loadWorkspaceEnvVar("EVOLUTION_API_URL") || "";
}

function getEvolutionApiKey() {
  return process.env.EVOLUTION_API_KEY || loadWorkspaceEnvVar("EVOLUTION_API_KEY") || "";
}

function getResendApiKey() {
  return process.env.RESEND_API_KEY || loadWorkspaceEnvVar("RESEND_API_KEY") || "";
}

function getDefaultAutomationEmailFrom() {
  return (
    loadWorkspaceEnvVar("CRM_AUTOMATION_EMAIL_FROM") ||
    loadWorkspaceEnvVar("RESEND_FROM_EMAIL") ||
    AUTOMATION_EMAIL_FROM
  );
}

// ---------------------------------------------------------------------------
// Email provider abstraction for automation sending.
//
// The CRM discovers which transactional email service the customer already has
// (Resend, SendGrid, Mailgun, Postmark, a Gmail app password, a generic SMTP
// relay, or the gog Gmail CLI) and sends through the selected one. Kit
// (ConvertKit) is a list/broadcast tool, so it is detected and recorded but
// never used for transactional sends. Selection lives in crm_settings under
// crm.automation.email.provider; the from-address setting is unchanged.
// ---------------------------------------------------------------------------

const EMAIL_PROVIDER_LABELS = {
  resend: "Resend",
  sendgrid: "SendGrid",
  mailgun: "Mailgun",
  postmark: "Postmark",
  smtp: "SMTP",
  gmail: "Gmail",
  convertkit: "Kit (ConvertKit)",
};

function readEmailEnv(name) {
  return String(loadWorkspaceEnvVar(name) || "").trim();
}

function maskEmailSecret(value) {
  const text = String(value || "");
  return text ? `...${text.slice(-4)}` : "";
}

function extractEmailAddress(value) {
  const raw = String(value || "");
  // Reject anything that could smuggle a header or a second recipient: CR/LF
  // anywhere in the raw value, more than one angle-bracket group, or an
  // extracted address containing whitespace or brackets.
  if (/[\r\n]/.test(raw) || (raw.match(/</g) || []).length > 1) return "";
  const match = raw.match(/<([^>]+)>/);
  const address = (match ? match[1] : raw).trim();
  if (!address || /[\r\n<>\s]/.test(address) || !address.includes("@")) return "";
  return address;
}

function emailCliEnv() {
  return typeof getGogEnv === "function" ? getGogEnv() : { ...process.env };
}

let gmailCliCache = { at: 0, present: false, account: "" };
function detectGmailCli() {
  if (Date.now() - gmailCliCache.at < 30000) return gmailCliCache;
  const next = { at: Date.now(), present: false, account: "" };
  try {
    next.present = commandExists("gog");
    if (next.present) {
      const configured = readEmailEnv("GMAIL_CLI_ACCOUNT") || readEmailEnv("GOG_ACCOUNT");
      if (configured) next.account = configured;
      else {
        const output = execFileSync("gog", ["auth", "list", "--json"], {
          encoding: "utf8",
          timeout: 5000,
          stdio: ["ignore", "pipe", "ignore"],
          env: emailCliEnv(),
        });
        const parsed = parseJsonSafely(output, {});
        const accounts = Array.isArray(parsed?.accounts) ? parsed.accounts : Array.isArray(parsed) ? parsed : [];
        const first = accounts.find((entry) => entry && typeof entry.email === "string" && entry.email);
        next.account = first ? String(first.email).trim() : "";
      }
    }
  } catch {
    next.account = "";
  }
  gmailCliCache = next;
  return next;
}

function resolveEmailProviders() {
  const providers = [];
  const resendKey = getResendApiKey();
  providers.push({
    id: "resend",
    label: EMAIL_PROVIDER_LABELS.resend,
    transactional: true,
    configured: Boolean(resendKey),
    transport: "resend",
    detail: resendKey ? `API key ${maskEmailSecret(resendKey)}` : "RESEND_API_KEY not set",
    apiKey: resendKey,
  });

  const sendgridKey = readEmailEnv("SENDGRID_API_KEY");
  providers.push({
    id: "sendgrid",
    label: EMAIL_PROVIDER_LABELS.sendgrid,
    transactional: true,
    configured: Boolean(sendgridKey),
    transport: "smtp",
    detail: sendgridKey ? `API key ${maskEmailSecret(sendgridKey)} via smtp.sendgrid.net` : "SENDGRID_API_KEY not set",
    smtp: { host: "smtp.sendgrid.net", port: 587, user: "apikey", pass: sendgridKey, requireTls: true },
  });

  const mailgunKey = readEmailEnv("MAILGUN_API_KEY");
  const mailgunDomain = readEmailEnv("MAILGUN_DOMAIN");
  const mailgunSmtpLogin = readEmailEnv("MAILGUN_SMTP_LOGIN");
  const mailgunSmtpPassword = readEmailEnv("MAILGUN_SMTP_PASSWORD");
  if (mailgunSmtpLogin && mailgunSmtpPassword) {
    const host = readEmailEnv("MAILGUN_SMTP_HOST") || "smtp.mailgun.org";
    providers.push({
      id: "mailgun",
      label: EMAIL_PROVIDER_LABELS.mailgun,
      transactional: true,
      configured: true,
      transport: "smtp",
      detail: `SMTP login ${mailgunSmtpLogin} via ${host}`,
      smtp: { host, port: 587, user: mailgunSmtpLogin, pass: mailgunSmtpPassword, requireTls: true },
    });
  } else {
    providers.push({
      id: "mailgun",
      label: EMAIL_PROVIDER_LABELS.mailgun,
      transactional: true,
      configured: Boolean(mailgunKey && mailgunDomain),
      transport: "mailgun_api",
      detail:
        mailgunKey && mailgunDomain
          ? `API key ${maskEmailSecret(mailgunKey)} for ${mailgunDomain}`
          : "MAILGUN_API_KEY and MAILGUN_DOMAIN not both set",
      apiKey: mailgunKey,
      domain: mailgunDomain,
      apiBase: readEmailEnv("MAILGUN_API_BASE") || "https://api.mailgun.net",
    });
  }

  const postmarkToken = readEmailEnv("POSTMARK_SERVER_TOKEN");
  providers.push({
    id: "postmark",
    label: EMAIL_PROVIDER_LABELS.postmark,
    transactional: true,
    configured: Boolean(postmarkToken),
    transport: "smtp",
    detail: postmarkToken ? `server token ${maskEmailSecret(postmarkToken)} via smtp.postmarkapp.com` : "POSTMARK_SERVER_TOKEN not set",
    smtp: { host: "smtp.postmarkapp.com", port: 587, user: postmarkToken, pass: postmarkToken, requireTls: true },
  });

  const smtpHost = readEmailEnv("SMTP_HOST");
  const smtpPort = Number(readEmailEnv("SMTP_PORT")) || 587;
  const smtpUser = readEmailEnv("SMTP_USER");
  const smtpPass = readEmailEnv("SMTP_PASS") || readEmailEnv("SMTP_PASSWORD");
  const smtpSecure = /^(1|true|yes)$/i.test(readEmailEnv("SMTP_SECURE")) || smtpPort === 465;
  const smtpRejectUnauthorized = !/^(0|false|no)$/i.test(readEmailEnv("SMTP_TLS_REJECT_UNAUTHORIZED") || "1");
  providers.push({
    id: "smtp",
    label: EMAIL_PROVIDER_LABELS.smtp,
    transactional: true,
    configured: Boolean(smtpHost),
    transport: "smtp",
    detail: smtpHost ? `${smtpHost}:${smtpPort}${smtpUser ? ` as ${smtpUser}` : ""}` : "SMTP_HOST not set",
    smtp: { host: smtpHost, port: smtpPort, user: smtpUser, pass: smtpPass, secure: smtpSecure, rejectUnauthorized: smtpRejectUnauthorized },
  });

  const gmailUser = readEmailEnv("GMAIL_USER");
  const gmailAppPassword = readEmailEnv("GMAIL_APP_PASSWORD");
  if (gmailUser && gmailAppPassword) {
    providers.push({
      id: "gmail",
      label: EMAIL_PROVIDER_LABELS.gmail,
      transactional: true,
      configured: true,
      transport: "smtp",
      detail: `app password for ${gmailUser} via smtp.gmail.com`,
      smtp: { host: "smtp.gmail.com", port: 587, user: gmailUser, pass: gmailAppPassword, requireTls: true },
    });
  } else {
    const cli = detectGmailCli();
    providers.push({
      id: "gmail",
      label: EMAIL_PROVIDER_LABELS.gmail,
      transactional: true,
      configured: Boolean(cli.present && cli.account),
      transport: "gmail_cli",
      detail: cli.present
        ? cli.account
          ? `gog CLI account ${cli.account}`
          : "gog CLI found but no authenticated account"
        : "GMAIL_USER + GMAIL_APP_PASSWORD not set and gog CLI not found",
      account: cli.account,
    });
  }

  const kitKey = readEmailEnv("CONVERTKIT_API_KEY") || readEmailEnv("KIT_API_KEY") || readEmailEnv("CONVERTKIT_API_SECRET");
  providers.push({
    id: "convertkit",
    label: EMAIL_PROVIDER_LABELS.convertkit,
    transactional: false,
    configured: Boolean(kitKey),
    transport: "none",
    detail: kitKey ? `API key ${maskEmailSecret(kitKey)} (broadcast tool, not used for automation sends)` : "not set",
  });

  return providers;
}

function listEmailProviders() {
  return resolveEmailProviders().map((provider) => ({
    id: provider.id,
    label: provider.label,
    transactional: provider.transactional,
    configured: provider.configured,
    transport: provider.transport,
    detail: provider.detail,
  }));
}

function getConfiguredEmailProviders() {
  return resolveEmailProviders().filter((provider) => provider.configured && provider.transactional);
}

function getMarketingEmailProvider() {
  return resolveEmailProviders().find((provider) => provider.configured && !provider.transactional) || null;
}

function getSelectedEmailProvider(db) {
  const configured = getConfiguredEmailProviders();
  if (!configured.length) return null;
  let selectedId = "";
  if (db) {
    try {
      selectedId = normalizeMachineText(getSetting(db, AUTOMATION_SETTING_KEYS.emailProvider, "")) || "";
    } catch {
      selectedId = "";
    }
  }
  return configured.find((provider) => provider.id === selectedId) || configured[0];
}

function encodeMailHeader(value) {
  const text = String(value || "").replace(/[\r\n]+/g, " ").trim();
  if (/^[\x20-\x7e]*$/.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
}

function base64Lines(text) {
  return Buffer.from(String(text || ""), "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
}

function buildMimeMessage(message) {
  const fromAddress = extractEmailAddress(message.from);
  const domain = fromAddress.includes("@") ? fromAddress.split("@").pop() : "localhost";
  const boundary = `----=_crm_${crypto.randomUUID()}`;
  const headers = [
    `From: ${String(message.from || "").replace(/[\r\n]+/g, " ")}`,
    `To: ${String(message.to || "").replace(/[\r\n]+/g, " ")}`,
    `Subject: ${encodeMailHeader(message.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
  ];
  const text = String(message.text || "");
  const html = String(message.html || "");
  let body;
  if (html) {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    body = [
      `--${boundary}`,
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: base64",
      "",
      base64Lines(text),
      `--${boundary}`,
      "Content-Type: text/html; charset=utf-8",
      "Content-Transfer-Encoding: base64",
      "",
      base64Lines(html),
      `--${boundary}--`,
      "",
    ].join("\r\n");
  } else {
    headers.push("Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64");
    body = base64Lines(text);
  }
  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

// Minimal SMTP client: EHLO, STARTTLS when offered, AUTH PLAIN or LOGIN, one
// recipient. Enough for transactional relays without adding a dependency.
function createSmtpClient(initialSocket) {
  let socket = initialSocket;
  let buffer = "";
  let pending = null;
  let failure = null;
  let handlers = null;
  function deliver() {
    if (!pending) return;
    const lines = buffer.split("\r\n");
    for (let index = 0; index < lines.length - 1; index += 1) {
      if (/^\d{3}( |$)/.test(lines[index])) {
        const reply = lines.slice(0, index + 1);
        buffer = lines.slice(index + 1).join("\r\n");
        const current = pending;
        pending = null;
        current.resolve({ code: Number(reply[index].slice(0, 3)), text: reply.join("\n") });
        return;
      }
    }
  }
  function fail(error) {
    failure = error;
    if (pending) {
      const current = pending;
      pending = null;
      current.reject(error);
    }
  }
  function attach(target) {
    handlers = {
      data: (chunk) => {
        buffer += chunk.toString("utf8");
        deliver();
      },
      error: (error) => fail(error),
      close: () => fail(failure || new Error("SMTP connection closed")),
      timeout: () => target.destroy(new Error("SMTP connection timed out")),
    };
    for (const [event, handler] of Object.entries(handlers)) target.on(event, handler);
  }
  function detach() {
    if (handlers) for (const [event, handler] of Object.entries(handlers)) socket.removeListener(event, handler);
    handlers = null;
    return socket;
  }
  attach(socket);
  return {
    read() {
      return new Promise((resolve, reject) => {
        if (failure) return reject(failure);
        pending = { resolve, reject };
        deliver();
      });
    },
    send(command) {
      socket.write(`${command}\r\n`);
      return this.read();
    },
    detach,
    upgrade(nextSocket) {
      socket = nextSocket;
      buffer = "";
      failure = null;
      attach(nextSocket);
    },
    destroy() {
      try {
        socket.destroy();
      } catch {}
    },
  };
}

const SMTP_CONNECT_TIMEOUT_MS = 10000;
const SMTP_SESSION_DEADLINE_MS = 20000;

async function sendSmtpMail(smtp, message) {
  const port = Number(smtp.port) || 587;
  const secure = Boolean(smtp.secure) || port === 465;
  // Credentials never travel in clear: any authenticated relay, and every
  // hosted provider relay, must end up on TLS (implicit on 465 or STARTTLS).
  const requireTls = Boolean(smtp.requireTls) || Boolean(smtp.user);
  const rejectUnauthorized = smtp.rejectUnauthorized !== false;
  const fromAddress = extractEmailAddress(message.from);
  const toAddress = extractEmailAddress(message.to);
  if (!smtp.host) throw new Error("SMTP host is not configured");
  if (!fromAddress || !toAddress) throw new Error("SMTP send needs both a valid from address and a valid recipient");
  let client = null;
  let deadlineTimer = null;
  const deadline = new Promise((_, reject) => {
    deadlineTimer = setTimeout(() => {
      if (client) client.destroy();
      reject(new Error(`SMTP session exceeded ${SMTP_SESSION_DEADLINE_MS / 1000}s deadline`));
    }, SMTP_SESSION_DEADLINE_MS);
  });
  const session = (async () => {
  const rawSocket = await new Promise((resolve, reject) => {
    const candidate = secure
      ? tls.connect({ host: smtp.host, port, servername: smtp.host, rejectUnauthorized })
      : net.connect({ host: smtp.host, port });
    candidate.setTimeout(SMTP_CONNECT_TIMEOUT_MS, () => candidate.destroy(new Error(`SMTP connect to ${smtp.host}:${port} timed out`)));
    candidate.once("error", reject);
    candidate.once(secure ? "secureConnect" : "connect", () => {
      candidate.removeListener("error", reject);
      candidate.setTimeout(SMTP_SESSION_DEADLINE_MS);
      resolve(candidate);
    });
  });
  client = createSmtpClient(rawSocket);
  const expect = (reply, codes, step) => {
    if (!codes.includes(reply.code)) throw new Error(`SMTP ${step} failed: ${reply.text.split("\n").pop()}`);
    return reply;
  };
  const hostname = (os.hostname && os.hostname()) || "localhost";
  try {
    expect(await client.read(), [220], "greeting");
    let ehlo = expect(await client.send(`EHLO ${hostname}`), [250], "EHLO");
    const offersStartTls = /^250[- ]STARTTLS/im.test(ehlo.text);
    if (!secure && !offersStartTls && requireTls) {
      throw new Error(`SMTP server ${smtp.host}:${port} did not offer STARTTLS; refusing to send credentials in clear. Use port 465 (SMTP_SECURE=1) or a relay that supports STARTTLS.`);
    }
    if (!secure && offersStartTls) {
      expect(await client.send("STARTTLS"), [220], "STARTTLS");
      const plain = client.detach();
      const upgraded = await new Promise((resolve, reject) => {
        const candidate = tls.connect({ socket: plain, servername: smtp.host, rejectUnauthorized }, () => resolve(candidate));
        candidate.once("error", reject);
      });
      upgraded.setTimeout(SMTP_SESSION_DEADLINE_MS);
      client.upgrade(upgraded);
      ehlo = expect(await client.send(`EHLO ${hostname}`), [250], "EHLO after STARTTLS");
    }
    if (smtp.user) {
      const authLine = ehlo.text.split("\n").find((line) => /^250[- ]AUTH/i.test(line)) || "";
      if (/LOGIN/i.test(authLine) && !/PLAIN/i.test(authLine)) {
        expect(await client.send("AUTH LOGIN"), [334], "AUTH LOGIN");
        expect(await client.send(Buffer.from(smtp.user, "utf8").toString("base64")), [334], "AUTH LOGIN username");
        expect(await client.send(Buffer.from(smtp.pass || "", "utf8").toString("base64")), [235], "AUTH LOGIN password");
      } else {
        const token = Buffer.from(`\u0000${smtp.user}\u0000${smtp.pass || ""}`, "utf8").toString("base64");
        expect(await client.send(`AUTH PLAIN ${token}`), [235], "AUTH PLAIN");
      }
    }
    expect(await client.send(`MAIL FROM:<${fromAddress}>`), [250], "MAIL FROM");
    expect(await client.send(`RCPT TO:<${toAddress}>`), [250, 251], "RCPT TO");
    expect(await client.send("DATA"), [354], "DATA");
    const data = buildMimeMessage(message).replace(/^\./gm, "..");
    const accepted = expect(await client.send(`${data}\r\n.`), [250], "message body");
    try {
      await client.send("QUIT");
    } catch {}
    const responseLine = accepted.text.split("\n").pop();
    const queued = responseLine.match(/queued as ([^\s]+)/i);
    return {
      ok: true,
      status: 200,
      data: { transport: "smtp", host: smtp.host, tls: secure || offersStartTls, response: responseLine, id: queued ? queued[1] : undefined },
    };
  } finally {
    client.destroy();
  }
  })();
  try {
    return await Promise.race([session, deadline]);
  } finally {
    clearTimeout(deadlineTimer);
    if (client) client.destroy();
  }
}

function postFormWithHttps(urlString, headers, fields, timeoutMs = 15000) {
  const url = new URL(urlString);
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === "") continue;
    body.append(key, String(value));
  }
  const encoded = body.toString();
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(encoded),
          ...headers,
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          resolve({
            ok: Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 300),
            status: res.statusCode || 500,
            data: parseJsonSafely(raw, { raw }),
          });
        });
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error("request timed out")));
    req.on("error", reject);
    req.write(encoded);
    req.end();
  });
}

function sendViaGmailCli(provider, message) {
  if (!provider.account) throw new Error("Gmail CLI has no authenticated account");
  const toAddress = extractEmailAddress(message.to);
  const args = ["gmail", "send", "-a", provider.account, "--to", toAddress, "--subject", String(message.subject || ""), "--body", String(message.text || "")];
  if (message.html) args.push("--body-html", String(message.html));
  const fromAddress = extractEmailAddress(message.from);
  if (fromAddress && fromAddress.toLowerCase() !== provider.account.toLowerCase()) args.push("--from", fromAddress);
  args.push("--no-input", "--force");
  const output = execFileSync("gog", args, { timeout: 30000, encoding: "utf8", env: emailCliEnv() });
  return { ok: true, status: 200, data: { transport: "gmail_cli", account: provider.account, output: String(output || "").trim() || "sent" } };
}

async function sendEmailViaProvider(provider, message) {
  if (!provider || !provider.configured) throw new Error("No configured email provider");
  let result;
  if (provider.transport === "resend") {
    result = await postJsonWithHttps(
      RESEND_API_URL,
      { Authorization: `Bearer ${provider.apiKey}` },
      { from: message.from, to: [message.to], subject: message.subject, text: message.text, html: message.html || undefined },
      15000
    );
  } else if (provider.transport === "smtp") {
    result = await sendSmtpMail(provider.smtp, message);
  } else if (provider.transport === "mailgun_api") {
    const auth = Buffer.from(`api:${provider.apiKey}`, "utf8").toString("base64");
    result = await postFormWithHttps(
      `${provider.apiBase.replace(/\/$/, "")}/v3/${provider.domain}/messages`,
      { Authorization: `Basic ${auth}` },
      { from: message.from, to: message.to, subject: message.subject, text: message.text, html: message.html || "" },
      15000
    );
  } else if (provider.transport === "gmail_cli") {
    result = sendViaGmailCli(provider, message);
  } else {
    throw new Error(`Email provider ${provider.id} cannot send transactional email`);
  }
  const data = result && typeof result.data === "object" && result.data && !Array.isArray(result.data) ? result.data : { raw: result?.data };
  return { ok: Boolean(result?.ok), status: result?.status || 500, data: { provider: provider.id, ...data } };
}

function normalizeAutomationEmailFrom(value, fallback = null) {
  const normalized = normalizeMachineText(value);
  return normalized || fallback;
}

function postJsonWithHttps(urlString, headers, payload, timeoutMs = 15000) {
  const url = new URL(urlString);
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...headers,
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          resolve({
            ok: Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 300),
            status: res.statusCode || 500,
            data: parseJsonSafely(raw, { raw }),
          });
        });
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error("request timed out")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function getAutomationChannelCapabilities() {
  const capabilities = {
    email: { wired: false, verified: false, reason: "gmail_cli_missing" },
    instagram: { wired: false, verified: false, reason: "instagram_cli_missing" },
    whatsapp: { wired: false, verified: false, reason: "whatsapp_agent_missing" },
  };

  const emailProvider = getSelectedEmailProvider(null);
  if (emailProvider) {
    capabilities.email = {
      wired: true,
      verified: true,
      reason: `${emailProvider.id}_configured`,
      provider: emailProvider.id,
    };
  } else {
    capabilities.email = {
      wired: false,
      verified: false,
      reason: getMarketingEmailProvider() ? "marketing_provider_only" : "email_provider_missing",
    };
  }

  try {
    if (commandExists("instagram-cli")) {
      const output = execFileSync("instagram-cli", ["auth", "whoami"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      const verified = /Currently active account:/i.test(output);
      capabilities.instagram = {
        wired: verified,
        verified,
        reason: verified ? "instagram_authenticated" : "instagram_not_authenticated",
      };
    }
  } catch {
    capabilities.instagram = {
      wired: false,
      verified: false,
      reason: "instagram_not_authenticated",
    };
  }

  const whatsappAgentPath = process.env.CRM_WHATSAPP_SENDER_COMMAND || "";
  if (!whatsappAgentPath) {
    capabilities.whatsapp = { wired: false, verified: false, reason: "Set CRM_WHATSAPP_SENDER_COMMAND to enable delivery." };
  }

  return capabilities;
}

function getAutomationSettings(db) {
  return {
    default_delay_minutes: Number(
      getSetting(db, AUTOMATION_SETTING_KEYS.defaultDelayMinutes, AUTOMATION_DEFAULT_DELAY_MINUTES)
    ) || AUTOMATION_DEFAULT_DELAY_MINUTES,
    channels: {
      email: {
        live_enabled: Boolean(getSetting(db, AUTOMATION_SETTING_KEYS.emailLiveEnabled, false)),
        from_address: normalizeAutomationEmailFrom(
          getSetting(db, AUTOMATION_SETTING_KEYS.emailFromAddress, getDefaultAutomationEmailFrom()),
          getDefaultAutomationEmailFrom()
        ),
        provider: getSelectedEmailProvider(db)?.id || "",
        providers: listEmailProviders(),
        marketing_provider:
          normalizeMachineText(getSetting(db, AUTOMATION_SETTING_KEYS.emailMarketingProvider, "")) ||
          getMarketingEmailProvider()?.id ||
          "",
      },
      instagram: {
        live_enabled: Boolean(getSetting(db, AUTOMATION_SETTING_KEYS.instagramLiveEnabled, false)),
      },
      whatsapp: {
        live_enabled: Boolean(getSetting(db, AUTOMATION_SETTING_KEYS.whatsappLiveEnabled, false)),
      },
    },
  };
}

function resolveEmailProviderSelection(requested, currentId) {
  if (requested === undefined) return currentId || "";
  const wanted = normalizeMachineText(requested) || "";
  if (!wanted) return "";
  const configured = getConfiguredEmailProviders();
  if (!configured.some((provider) => provider.id === wanted)) {
    throw new Error(`Email provider "${wanted}" is not configured. Available: ${configured.map((provider) => provider.id).join(", ") || "none"}`);
  }
  return wanted;
}

function setAutomationSettings(input = {}) {
  const db = getDb(false);
  bootstrapSettings(db);
  const current = getAutomationSettings(db);
  const nextDefaultDelay = normalizeAutomationDelayMinutes(
    input.default_delay_minutes,
    current.default_delay_minutes
  );
  const nextChannels = {
    email: {
      live_enabled:
        input.email_live_enabled === undefined
          ? current.channels.email.live_enabled
          : Boolean(input.email_live_enabled),
      from_address: normalizeAutomationEmailFrom(
        input.email_from_address,
        current.channels.email.from_address || getDefaultAutomationEmailFrom()
      ),
      provider: resolveEmailProviderSelection(input.email_provider, current.channels.email.provider),
    },
    instagram: {
      live_enabled:
        input.instagram_live_enabled === undefined
          ? current.channels.instagram.live_enabled
          : Boolean(input.instagram_live_enabled),
    },
    whatsapp: {
      live_enabled:
        input.whatsapp_live_enabled === undefined
          ? current.channels.whatsapp.live_enabled
          : Boolean(input.whatsapp_live_enabled),
    },
  };
  db.prepare(
    "INSERT INTO crm_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(AUTOMATION_SETTING_KEYS.defaultDelayMinutes, JSON.stringify(nextDefaultDelay));
  db.prepare(
    "INSERT INTO crm_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(AUTOMATION_SETTING_KEYS.emailLiveEnabled, JSON.stringify(nextChannels.email.live_enabled));
  db.prepare(
    "INSERT INTO crm_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(AUTOMATION_SETTING_KEYS.emailFromAddress, JSON.stringify(nextChannels.email.from_address));
  db.prepare(
    "INSERT INTO crm_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(AUTOMATION_SETTING_KEYS.emailProvider, JSON.stringify(nextChannels.email.provider || ""));
  db.prepare(
    "INSERT INTO crm_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(AUTOMATION_SETTING_KEYS.instagramLiveEnabled, JSON.stringify(nextChannels.instagram.live_enabled));
  db.prepare(
    "INSERT INTO crm_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(AUTOMATION_SETTING_KEYS.whatsappLiveEnabled, JSON.stringify(nextChannels.whatsapp.live_enabled));
  return getAutomationSettingsSnapshot();
}

function serializeAutomationTemplate(row) {
  if (!row) return null;
  return {
    ...row,
    channel: normalizeAutomationChannel(row.channel),
  };
}

function serializeAutomationRule(row) {
  if (!row) return null;
  return {
    ...row,
    enabled: Boolean(row.enabled),
    delay_minutes:
      row.delay_minutes === null || row.delay_minutes === undefined ? null : Number(row.delay_minutes),
    channel: normalizeAutomationChannel(row.channel),
    trigger_type: normalizeAutomationTriggerType(row.trigger_type),
  };
}

function formatAutomationChannelLabel(channel) {
  switch (normalizeAutomationChannel(channel)) {
    case "email":
      return "Email";
    case "instagram":
      return "Instagram";
    case "whatsapp":
      return "WhatsApp";
    default:
      return "Automation";
  }
}

function formatAutomationDelayLabel(delayMinutes) {
  if (delayMinutes === null || delayMinutes === undefined) return "after the default delay";
  const normalized = Number(delayMinutes);
  if (!Number.isFinite(normalized) || normalized <= 0) return "immediately";
  if (normalized === 1) return "after 1 minute";
  return `after ${normalized} minutes`;
}

function withIndefiniteArticle(value) {
  const text = String(value || "").trim();
  if (!text) return "an automation";
  return /^[aeiou]/i.test(text) ? `an ${text}` : `a ${text}`;
}

function describeStageAutomationRule(rule) {
  const channelLabel = formatAutomationChannelLabel(rule.channel);
  const templatePart = rule.template_name ? ` using the "${rule.template_name}" template` : "";
  return `${rule.name}: sends ${withIndefiniteArticle(channelLabel.toLowerCase())} follow-up${templatePart} ${formatAutomationDelayLabel(
    rule.delay_minutes
  )} when a lead enters ${formatPipelineStatusLabel(rule.to_stage)}.`;
}

function getStageAutomationMap(db, projectName, statuses = []) {
  const normalizedProject = normalizeProjectName(projectName);
  const uniqueStatuses = Array.from(
    new Set(
      (Array.isArray(statuses) ? statuses : [])
        .map((status) => normalizeMachineText(status))
        .filter(Boolean)
    )
  );
  const stageAutomationMap = Object.fromEntries(
    uniqueStatuses.map((status) => [
      status,
      {
        stage: status,
        stage_label: formatPipelineStatusLabel(status),
        has_automations: false,
        enabled_automation_count: 0,
        icon_label: null,
        tooltip_copy: "",
        automations: [],
      },
    ])
  );
  if (!db || !normalizedProject) {
    return stageAutomationMap;
  }
  const rows = db
    .prepare(
      `
      SELECT r.*, t.name AS template_name
      FROM crm_automation_rules r
      LEFT JOIN crm_automation_templates t ON t.id = r.template_id
      WHERE r.enabled = 1
        AND r.project_name = ?
      ORDER BY lower(r.to_stage) ASC, lower(r.name) ASC, r.created_at ASC
    `
    )
    .all(normalizedProject);

  for (const row of rows) {
    const rule = serializeAutomationRule(row);
    const stage = normalizeMachineText(rule?.to_stage);
    if (!stage) continue;
    if (!stageAutomationMap[stage]) {
      stageAutomationMap[stage] = {
        stage,
        stage_label: formatPipelineStatusLabel(stage),
        has_automations: false,
        enabled_automation_count: 0,
        icon_label: null,
        tooltip_copy: "",
        automations: [],
      };
    }
    stageAutomationMap[stage].automations.push({
      id: rule.id,
      name: rule.name,
      channel: rule.channel,
      channel_label: formatAutomationChannelLabel(rule.channel),
      trigger_type: rule.trigger_type,
      trigger_label: "When a lead enters this stage",
      template_id: rule.template_id || null,
      template_name: row.template_name || null,
      delay_minutes: rule.delay_minutes,
      description: describeStageAutomationRule({ ...rule, template_name: row.template_name || null }),
    });
  }

  for (const value of Object.values(stageAutomationMap)) {
    value.has_automations = value.automations.length > 0;
    value.enabled_automation_count = value.automations.length;
    value.icon_label = value.has_automations
      ? value.automations.length === 1
        ? "1 automation linked"
        : `${value.automations.length} automations linked`
      : null;
    value.tooltip_copy = value.automations.map((automation) => automation.description).join("\n");
  }

  return stageAutomationMap;
}

function serializeAutomationRun(row) {
  if (!row) return null;
  return {
    ...row,
    rendered_payload: parseJsonSafely(row.rendered_payload_json, null),
    status: normalizeAutomationRunStatus(row.status),
  };
}

function serializeAutomationApproval(row) {
  if (!row) return null;
  return {
    ...row,
    rendered_payload: parseJsonSafely(row.rendered_payload_json, {}),
    review_status: normalizeAutomationApprovalStatus(row.review_status),
  };
}

function serializeAutomationDelivery(row) {
  if (!row) return null;
  return {
    ...row,
    payload: parseJsonSafely(row.payload_json, {}),
    status: normalizeAutomationDeliveryStatus(row.status),
    jitter_minutes: Number(row.jitter_minutes) || 0,
  };
}

function listAutomationTemplates() {
  const db = getDb(false);
  bootstrapSettings(db);
  return db
    .prepare("SELECT * FROM crm_automation_templates ORDER BY lower(name) ASC, created_at DESC")
    .all()
    .map(serializeAutomationTemplate);
}

function saveAutomationTemplate(input = {}) {
  const db = getDb(false);
  bootstrapSettings(db);
  const id = normalizeMachineText(input.id) || crypto.randomUUID();
  const existing = db.prepare("SELECT * FROM crm_automation_templates WHERE id = ?").get(id);
  const channel = normalizeAutomationChannel(input.channel || existing?.channel);
  if (!channel) throw new Error("Valid automation template channel required");
  const name = normalizeMachineText(input.name || existing?.name);
  if (!name) throw new Error("Automation template name required");
  const bodyTemplate =
    normalizeLongText(
      Object.prototype.hasOwnProperty.call(input, "body_template")
        ? input.body_template
        : existing?.body_template
    ) || null;
  if (!bodyTemplate) throw new Error("Automation template body_template required");
  const subjectTemplate = normalizeLongText(
    Object.prototype.hasOwnProperty.call(input, "subject_template")
      ? input.subject_template
      : existing?.subject_template
  );
  const ts = nowIso();
  db.prepare(
    `
    INSERT INTO crm_automation_templates (id, name, channel, subject_template, body_template, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      channel = excluded.channel,
      subject_template = excluded.subject_template,
      body_template = excluded.body_template,
      updated_at = excluded.updated_at
  `
  ).run(id, name, channel, subjectTemplate, bodyTemplate, existing?.created_at || ts, ts);
  return serializeAutomationTemplate(
    db.prepare("SELECT * FROM crm_automation_templates WHERE id = ?").get(id)
  );
}

function deleteAutomationTemplate(id) {
  const db = getDb(false);
  bootstrapSettings(db);
  const existing = db.prepare("SELECT id FROM crm_automation_templates WHERE id = ?").get(id);
  if (!existing) throw new Error("Automation template not found");
  db.prepare("DELETE FROM crm_automation_templates WHERE id = ?").run(id);
  return { deleted: true, id };
}

function listAutomationRules() {
  const db = getDb(false);
  bootstrapSettings(db);
  return db
    .prepare(
      `
      SELECT r.*, t.name AS template_name
      FROM crm_automation_rules r
      LEFT JOIN crm_automation_templates t ON t.id = r.template_id
      ORDER BY r.enabled DESC, lower(r.name) ASC, r.created_at DESC
    `
    )
    .all()
    .map((row) => ({ ...serializeAutomationRule(row), template_name: row.template_name || null }));
}

function saveAutomationRule(input = {}) {
  const db = getDb(false);
  bootstrapSettings(db);
  const id = normalizeMachineText(input.id) || crypto.randomUUID();
  const existing = db.prepare("SELECT * FROM crm_automation_rules WHERE id = ?").get(id);
  const name = normalizeMachineText(input.name || existing?.name);
  if (!name) throw new Error("Automation rule name required");
  const triggerType = normalizeAutomationTriggerType(input.trigger_type || existing?.trigger_type);
  if (!triggerType) throw new Error("Valid automation trigger_type required");
  const projectName = normalizeProjectName(input.project_name || existing?.project_name);
  if (!projectName) throw new Error("Automation rule project_name required");
  const toStage = normalizeMachineText(input.to_stage || existing?.to_stage);
  if (!toStage) throw new Error("Automation rule to_stage required");
  // Only validate the destination stage when the caller is changing it (or the
  // project). A plain enable/disable toggle on a rule whose stage was deleted
  // must still succeed so the customer can switch it off.
  const stageSupplied = input.to_stage !== undefined || input.project_name !== undefined;
  const liveStatuses = stageSupplied ? getPipelineConfig(db, projectName).statuses : null;
  if (liveStatuses && !liveStatuses.includes(toStage)) {
    throw new Error(
      `Destination stage "${formatPipelineStatusLabel(toStage)}" is not a pipeline column in ${projectName}. Pick one of: ${liveStatuses
        .map(formatPipelineStatusLabel)
        .join(", ")}`
    );
  }
  const fromStage = null;
  const channel = normalizeAutomationChannel(input.channel || existing?.channel);
  if (!channel) throw new Error("Valid automation rule channel required");
  const delayMinutes = normalizeAutomationDelayMinutes(
    Object.prototype.hasOwnProperty.call(input, "delay_minutes")
      ? input.delay_minutes
      : existing?.delay_minutes,
    null
  );
  const enabled =
    input.enabled === undefined && existing ? Boolean(existing.enabled) : input.enabled === false ? 0 : 1;
  const templateId = normalizeMachineText(
    Object.prototype.hasOwnProperty.call(input, "template_id")
      ? input.template_id
      : existing?.template_id
  );
  if (templateId) {
    const template = db.prepare("SELECT id, channel FROM crm_automation_templates WHERE id = ?").get(templateId);
    if (!template) throw new Error("Automation template not found");
    if (normalizeAutomationChannel(template.channel) !== channel) {
      throw new Error("Automation rule channel must match template channel");
    }
  }
  const ts = nowIso();
  db.prepare(
    `
    INSERT INTO crm_automation_rules (
      id, name, enabled, trigger_type, project_name, from_stage, to_stage, delay_minutes, channel, template_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      enabled = excluded.enabled,
      trigger_type = excluded.trigger_type,
      project_name = excluded.project_name,
      from_stage = excluded.from_stage,
      to_stage = excluded.to_stage,
      delay_minutes = excluded.delay_minutes,
      channel = excluded.channel,
      template_id = excluded.template_id,
      updated_at = excluded.updated_at
  `
  ).run(
    id,
    name,
    enabled,
    triggerType,
    projectName,
    fromStage,
    toStage,
    delayMinutes,
    channel,
    templateId,
    existing?.created_at || ts,
    ts
  );
  return listAutomationRules().find((rule) => rule.id === id) || null;
}

function deleteAutomationRule(id) {
  const db = getDb(false);
  bootstrapSettings(db);
  const existing = db.prepare("SELECT id FROM crm_automation_rules WHERE id = ?").get(id);
  if (!existing) throw new Error("Automation rule not found");
  db.prepare("DELETE FROM crm_automation_rules WHERE id = ?").run(id);
  return { deleted: true, id };
}

function getContactProjectState(db, contactId, projectName) {
  return db
    .prepare(
      "SELECT * FROM crm_contact_projects WHERE contact_id = ? AND project_name = ? LIMIT 1"
    )
    .get(contactId, projectName);
}

function getContactDeliveryIdentity(contact, channel) {
  if (!contact) return null;
  if (channel === "email") return contact.primary_email || null;
  if (channel === "instagram") return contact.instagram_handle || contact.instagram_profile_url || null;
  if (channel === "whatsapp") return contact.primary_phone || null;
  return null;
}

function renderAutomationTemplate(template, context) {
  const tokens = {
    first_name: context.contact?.first_name || "",
    full_name: context.contact?.full_name || "",
    project_name: context.project_display_name || context.project_name || "",
    from_stage: context.from_stage || "",
    to_stage: context.to_stage || "",
  };
  const fill = (value) =>
    String(value || "").replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, token) => tokens[token] || "");
  return {
    subject: template?.subject_template ? fill(template.subject_template) : null,
    body: fill(template?.body_template || ""),
  };
}

function createAutomationRunForRule(db, rule, context) {
  const settings = getAutomationSettings(db);
  const delayMinutes =
    rule.delay_minutes === null || rule.delay_minutes === undefined
      ? settings.default_delay_minutes
      : Number(rule.delay_minutes);
  const triggeredAt = context.changed_at || nowIso();
  const executeAfter = new Date(Date.parse(triggeredAt) + delayMinutes * 60000).toISOString();
  const runId = crypto.randomUUID();
  db.prepare(
    `
    INSERT INTO crm_automation_runs (
      id, rule_id, contact_id, project_name, triggered_from_stage, triggered_to_stage, triggered_at, execute_after, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `
  ).run(
    runId,
    rule.id,
    context.contact_id,
    context.project_name,
    context.from_stage || null,
    context.to_stage,
    triggeredAt,
    executeAfter,
    triggeredAt,
    triggeredAt
  );
  return serializeAutomationRun(db.prepare("SELECT * FROM crm_automation_runs WHERE id = ?").get(runId));
}

function invalidateSupersededAutomationRuns(db, context, channel) {
  const ts = context.changed_at || nowIso();
  db.prepare(
    `
    UPDATE crm_automation_runs
    SET status = 'invalidated', invalidated_at = ?, updated_at = ?
    WHERE id IN (
      SELECT r.id
      FROM crm_automation_runs r
      INNER JOIN crm_automation_rules rule ON rule.id = r.rule_id
      WHERE r.contact_id = ?
        AND r.project_name = ?
        AND r.status = 'pending'
        AND rule.channel = ?
    )
  `
  ).run(ts, ts, context.contact_id, context.project_name, channel);
}

function triggerAutomationForStageChange(db, context) {
  const projectName = normalizeProjectName(context.project_name);
  const toStage = normalizeMachineText(context.to_stage);
  const fromStage = normalizeMachineText(context.from_stage);
  const contactId = normalizeContactId(context.contact_id);
  if (!projectName || !toStage || !contactId) return [];
  if (fromStage === toStage) return [];
  const rules = db
    .prepare(
      `
      SELECT *
      FROM crm_automation_rules
      WHERE enabled = 1
        AND trigger_type = 'stage_changed'
        AND project_name = ?
        AND to_stage = ?
      ORDER BY created_at ASC
    `
    )
    .all(projectName, toStage);
  const created = [];
  for (const rule of rules) {
    invalidateSupersededAutomationRuns(db, context, rule.channel);
    created.push(createAutomationRunForRule(db, rule, context));
  }
  return created;
}

function listAutomationRuns(filters = {}) {
  const db = getDb(false);
  bootstrapSettings(db);
  const clauses = [];
  const args = [];
  if (filters.contact_id) {
    clauses.push("r.contact_id = ?");
    args.push(filters.contact_id);
  }
  if (filters.rule_id) {
    clauses.push("r.rule_id = ?");
    args.push(filters.rule_id);
  }
  if (filters.status) {
    clauses.push("r.status = ?");
    args.push(filters.status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db
    .prepare(
      `
      SELECT r.*, rule.name AS rule_name, rule.channel
      FROM crm_automation_runs r
      INNER JOIN crm_automation_rules rule ON rule.id = r.rule_id
      ${where}
      ORDER BY r.triggered_at DESC, r.created_at DESC
    `
    )
    .all(...args)
    .map((row) => ({ ...serializeAutomationRun(row), rule_name: row.rule_name, channel: row.channel }));
}

function materializeAutomationRun(db, run) {
  if (!run || normalizeAutomationRunStatus(run.status) !== "pending") return null;
  const rule = db.prepare("SELECT * FROM crm_automation_rules WHERE id = ?").get(run.rule_id);
  if (!rule) {
    db.prepare("UPDATE crm_automation_runs SET status = 'failed', failure_reason = ?, updated_at = ? WHERE id = ?").run(
      "Rule missing",
      nowIso(),
      run.id
    );
    return null;
  }
  const contact = db.prepare("SELECT * FROM crm_contacts WHERE id = ?").get(run.contact_id);
  if (!contact) {
    db.prepare("UPDATE crm_automation_runs SET status = 'failed', failure_reason = ?, updated_at = ? WHERE id = ?").run(
      "Contact missing",
      nowIso(),
      run.id
    );
    return null;
  }
  const template = rule.template_id
    ? db.prepare("SELECT * FROM crm_automation_templates WHERE id = ?").get(rule.template_id)
    : null;
  const rendered = renderAutomationTemplate(template, {
    contact,
    project_name: run.project_name,
    project_display_name: formatProjectDisplayName(run.project_name),
    from_stage: run.triggered_from_stage,
    to_stage: run.triggered_to_stage,
  });
  const recipientIdentity = getContactDeliveryIdentity(contact, rule.channel);
  const approvalId = crypto.randomUUID();
  const payload = {
    channel: rule.channel,
    subject: rendered.subject,
    body: rendered.body,
    contact_id: run.contact_id,
    contact_name: contact.full_name || [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim(),
    recipient_identity: recipientIdentity,
  };
  const ts = nowIso();
  db.prepare(
    `
    INSERT INTO crm_automation_approval_queue (
      id, run_id, contact_id, rule_id, project_name, channel, recipient_identity, scheduled_send_at, rendered_payload_json, review_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?, ?)
  `
  ).run(
    approvalId,
    run.id,
    run.contact_id,
    run.rule_id,
    run.project_name,
    rule.channel,
    recipientIdentity,
    run.execute_after,
    JSON.stringify(payload),
    ts,
    ts
  );
  db.prepare(
    `
    UPDATE crm_automation_runs
    SET status = 'awaiting_approval', rendered_payload_json = ?, updated_at = ?
    WHERE id = ?
  `
  ).run(JSON.stringify(payload), ts, run.id);
  return serializeAutomationApproval(
    db.prepare("SELECT * FROM crm_automation_approval_queue WHERE id = ?").get(approvalId)
  );
}

function matureAutomationRuns() {
  const db = getDb(false);
  bootstrapSettings(db);
  const readyRuns = db
    .prepare(
      `
      SELECT *
      FROM crm_automation_runs
      WHERE status = 'pending' AND execute_after <= ?
      ORDER BY execute_after ASC, created_at ASC
    `
    )
    .all(nowIso());
  return readyRuns.map((run) => materializeAutomationRun(db, run)).filter(Boolean);
}

function listAutomationApprovalItems(filters = {}) {
  const db = getDb(false);
  bootstrapSettings(db);
  const clauses = [];
  const args = [];
  if (filters.review_status) {
    clauses.push("aq.review_status = ?");
    args.push(filters.review_status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db
    .prepare(
      `
      SELECT
        aq.*,
        c.full_name,
        c.first_name,
        c.last_name,
        rule.name AS rule_name,
        run.triggered_from_stage,
        run.triggered_to_stage
      FROM crm_automation_approval_queue aq
      INNER JOIN crm_automation_runs run ON run.id = aq.run_id
      INNER JOIN crm_automation_rules rule ON rule.id = aq.rule_id
      LEFT JOIN crm_contacts c ON c.id = aq.contact_id
      ${where}
      ORDER BY aq.review_status = 'pending_review' DESC, aq.scheduled_send_at ASC, aq.created_at DESC
    `
    )
    .all(...args)
    .map((row) => ({
      ...serializeAutomationApproval(row),
      contact_name:
        row.full_name || [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || "Unnamed lead",
      rule_name: row.rule_name,
      triggered_from_stage: row.triggered_from_stage,
      triggered_to_stage: row.triggered_to_stage,
    }));
}

function enqueueAutomationDelivery(db, approval) {
  const settings = getAutomationSettings(db);
  const liveEnabled = Boolean(settings.channels[approval.channel]?.live_enabled);
  const deliveryId = crypto.randomUUID();
  const ts = nowIso();
  const status = liveEnabled ? "queued" : "blocked";
  const blockedReason = liveEnabled ? null : "live_send_disabled";
  db.prepare(
    `
    INSERT INTO crm_automation_delivery_queue (
      id, approval_id, run_id, contact_id, channel, recipient_identity, scheduled_send_at, jitter_minutes, payload_json, status, blocked_reason, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
  `
  ).run(
    deliveryId,
    approval.id,
    approval.run_id,
    approval.contact_id,
    approval.channel,
    approval.recipient_identity,
    approval.scheduled_send_at,
    approval.rendered_payload_json,
    status,
    blockedReason,
    ts,
    ts
  );
  return serializeAutomationDelivery(
    db.prepare("SELECT * FROM crm_automation_delivery_queue WHERE id = ?").get(deliveryId)
  );
}

function updateAutomationApprovalItem(id, input = {}) {
  const db = getDb(false);
  bootstrapSettings(db);
  const existing = db.prepare("SELECT * FROM crm_automation_approval_queue WHERE id = ?").get(id);
  if (!existing) throw new Error("Automation approval item not found");
  const nextPayload = {
    ...parseJsonSafely(existing.rendered_payload_json, {}),
    ...(input.rendered_payload && typeof input.rendered_payload === "object" ? input.rendered_payload : {}),
  };
  if (input.subject !== undefined) nextPayload.subject = normalizeLongText(input.subject);
  if (input.body !== undefined) nextPayload.body = normalizeLongText(input.body);
  const scheduledSendAt = input.scheduled_send_at || existing.scheduled_send_at;
  db.prepare(
    `
    UPDATE crm_automation_approval_queue
    SET rendered_payload_json = ?, scheduled_send_at = ?, reviewer_note = ?, updated_at = ?
    WHERE id = ?
  `
  ).run(
    JSON.stringify(nextPayload),
    scheduledSendAt,
    input.reviewer_note !== undefined ? normalizeLongText(input.reviewer_note) : existing.reviewer_note,
    nowIso(),
    id
  );
  return listAutomationApprovalItems({}).find((item) => item.id === id) || null;
}

function approveAutomationItem(id, input = {}) {
  const db = getDb(false);
  bootstrapSettings(db);
  const existing = db.prepare("SELECT * FROM crm_automation_approval_queue WHERE id = ?").get(id);
  if (!existing) throw new Error("Automation approval item not found");
  if (normalizeAutomationApprovalStatus(existing.review_status) !== "pending_review") {
    throw new Error("Automation approval item is not pending review");
  }
  const updated = updateAutomationApprovalItem(id, input);
  const refreshed = db.prepare("SELECT * FROM crm_automation_approval_queue WHERE id = ?").get(id);
  const ts = nowIso();
  db.prepare(
    `
    UPDATE crm_automation_approval_queue
    SET review_status = 'approved', reviewed_at = ?, reviewer_note = ?, updated_at = ?
    WHERE id = ?
  `
  ).run(ts, input.reviewer_note !== undefined ? normalizeLongText(input.reviewer_note) : refreshed.reviewer_note, ts, id);
  db.prepare(
    "UPDATE crm_automation_runs SET status = 'approved', approved_at = ?, updated_at = ? WHERE id = ?"
  ).run(ts, ts, refreshed.run_id);
  const delivery = enqueueAutomationDelivery(db, db.prepare("SELECT * FROM crm_automation_approval_queue WHERE id = ?").get(id));
  db.prepare("UPDATE crm_automation_runs SET status = ?, updated_at = ? WHERE id = ?").run(
    delivery.status === "blocked" ? "approved" : "queued",
    ts,
    refreshed.run_id
  );
  return {
    approval: listAutomationApprovalItems({}).find((item) => item.id === id) || updated,
    delivery,
  };
}

function cancelAutomationItem(id, input = {}) {
  const db = getDb(false);
  bootstrapSettings(db);
  const existing = db.prepare("SELECT * FROM crm_automation_approval_queue WHERE id = ?").get(id);
  if (!existing) throw new Error("Automation approval item not found");
  const ts = nowIso();
  db.prepare(
    `
    UPDATE crm_automation_approval_queue
    SET review_status = 'cancelled', reviewed_at = ?, reviewer_note = ?, updated_at = ?
    WHERE id = ?
  `
  ).run(ts, normalizeLongText(input.reviewer_note) || existing.reviewer_note, ts, id);
  db.prepare("UPDATE crm_automation_runs SET status = 'cancelled', updated_at = ? WHERE id = ?").run(
    ts,
    existing.run_id
  );
  return listAutomationApprovalItems({}).find((item) => item.id === id) || null;
}

function listAutomationDeliveries(filters = {}) {
  const db = getDb(false);
  bootstrapSettings(db);
  const clauses = [];
  const args = [];
  if (filters.status) {
    clauses.push("dq.status = ?");
    args.push(filters.status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db
    .prepare(
      `
      SELECT dq.*, aq.project_name, aq.review_status, rule.name AS rule_name, c.full_name, c.first_name, c.last_name
      FROM crm_automation_delivery_queue dq
      INNER JOIN crm_automation_approval_queue aq ON aq.id = dq.approval_id
      INNER JOIN crm_automation_rules rule ON rule.id = aq.rule_id
      LEFT JOIN crm_contacts c ON c.id = dq.contact_id
      ${where}
      ORDER BY dq.scheduled_send_at ASC, dq.created_at DESC
    `
    )
    .all(...args)
    .map((row) => ({
      ...serializeAutomationDelivery(row),
      project_name: row.project_name,
      rule_name: row.rule_name,
      review_status: row.review_status,
      contact_name:
        row.full_name || [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || "Unnamed lead",
    }));
}

async function sendWhatsappAutomationDelivery(db, delivery) {
  const waQueueUrl = getEvolutionApiUrl();
  const waQueueKey = getEvolutionApiKey();
  const payload = parseJsonSafely(delivery.payload_json, {});
  const scheduledAtMs = Date.parse(delivery.scheduled_send_at);
  const body = {
    to_jid: delivery.recipient_identity,
    message: payload.body || "",
    scheduled_at: Number.isFinite(scheduledAtMs) ? scheduledAtMs : null,
    broadcast_id: null,
  };
  const response = await fetch(`${waQueueUrl}/queue/add`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: waQueueKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const rawText = await response.text();
  const data = parseJsonSafely(rawText, { raw: rawText });
  return { ok: response.ok, status: response.status, data };
}

async function sendEmailAutomationDelivery(db, delivery) {
  const provider = getSelectedEmailProvider(db);
  const settings = getAutomationSettings(db);
  const fromAddress = normalizeAutomationEmailFrom(
    settings.channels?.email?.from_address,
    getDefaultAutomationEmailFrom()
  );
  const payload = parseJsonSafely(delivery.payload_json, {});
  const subject = String(payload.subject || "").trim() || "Message from Mission Control";
  const body = String(payload.body || "").trim();
  const html = body
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br />")}</p>`)
    .join("");

  if (provider) {
    return sendEmailViaProvider(provider, {
      from: fromAddress,
      to: delivery.recipient_identity,
      subject,
      text: body,
      html: html || undefined,
    });
  }

  try {
    const output = execFileSync(
      "node",
      [
        GOOGLE_AGENT,
        "gmail",
        "send",
        "--to",
        delivery.recipient_identity,
        "--subject",
        subject,
        "--body",
        body,
      ],
      { timeout: 30000, encoding: "utf8", env: { ...process.env } }
    );
    return {
      ok: true,
      status: 200,
      data: { provider: "google_agent", output: String(output || "").trim() || "sent" },
    };
  } catch (error) {
    throw error;
  }
}

async function sendAutomationTestEmail(options = {}) {
  const db = getDb(false);
  bootstrapSettings(db);
  const recipientIdentity = normalizeMachineText(options.to);
  if (!recipientIdentity) {
    throw new Error("Test email recipient is required");
  }

  const delivery = {
    recipient_identity: recipientIdentity,
    payload_json: JSON.stringify({
      subject: options.subject || "Mission Control Email Test",
      body:
        options.body ||
        "This is a live email canary from Mission Control automation settings.",
    }),
  };

  return sendEmailAutomationDelivery(db, delivery);
}

function logAutomationDeliveryAttempt(db, deliveryId, status, responseJson = null, errorMessage = null) {
  db.prepare(
    `
    INSERT INTO crm_automation_delivery_attempts (id, delivery_id, attempted_at, status, response_json, error_message)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  ).run(
    crypto.randomUUID(),
    deliveryId,
    nowIso(),
    status,
    responseJson ? JSON.stringify(responseJson) : null,
    errorMessage || null
  );
}

function appendCommunicationRecord(db, contactId, channel, note, contactedAt) {
  db.prepare(
    `INSERT INTO crm_contact_communications (contact_id, channel, direction, note, contacted_at, created_at)
     VALUES (?, ?, 'outbound', ?, ?, ?)`
  ).run(contactId, channel, note || null, contactedAt, nowIso());
  const maxTs = db
    .prepare("SELECT MAX(contacted_at) AS m FROM crm_contact_communications WHERE contact_id = ?")
    .get(contactId);
  db.prepare("UPDATE crm_contacts SET last_contacted_at = ?, updated_at = ? WHERE id = ?").run(
    maxTs?.m || contactedAt,
    nowIso(),
    contactId
  );
}

async function processAutomationDelivery(db, delivery) {
  const settings = getAutomationSettings(db);
  if (!settings.channels[delivery.channel]?.live_enabled) {
    db.prepare(
      "UPDATE crm_automation_delivery_queue SET status = 'blocked', blocked_reason = ?, updated_at = ? WHERE id = ?"
    ).run("live_send_disabled", nowIso(), delivery.id);
    return { id: delivery.id, status: "blocked", reason: "live_send_disabled" };
  }
  if (!delivery.recipient_identity) {
    db.prepare(
      "UPDATE crm_automation_delivery_queue SET status = 'blocked', blocked_reason = ?, updated_at = ? WHERE id = ?"
    ).run("missing_recipient_identity", nowIso(), delivery.id);
    return { id: delivery.id, status: "blocked", reason: "missing_recipient_identity" };
  }
  if (delivery.channel === "email" && !hasLiveAutomationAdapter("email")) {
    db.prepare(
      "UPDATE crm_automation_delivery_queue SET status = 'blocked', blocked_reason = ?, updated_at = ? WHERE id = ?"
    ).run("adapter_not_wired", nowIso(), delivery.id);
    return { id: delivery.id, status: "blocked", reason: "adapter_not_wired" };
  }
  if (delivery.channel !== "whatsapp" && delivery.channel !== "email") {
    db.prepare(
      "UPDATE crm_automation_delivery_queue SET status = 'blocked', blocked_reason = ?, updated_at = ? WHERE id = ?"
    ).run("adapter_not_wired", nowIso(), delivery.id);
    return { id: delivery.id, status: "blocked", reason: "adapter_not_wired" };
  }

  db.prepare(
    "UPDATE crm_automation_delivery_queue SET status = 'sending', blocked_reason = NULL, released_at = ?, updated_at = ? WHERE id = ?"
  ).run(nowIso(), nowIso(), delivery.id);
  try {
    const result =
      delivery.channel === "email"
        ? await sendEmailAutomationDelivery(db, delivery)
        : await sendWhatsappAutomationDelivery(db, delivery);
    if (!result.ok) {
      if (delivery.channel === "email" && (result.status >= 500 || result.status === 408 || result.status === 429)) {
        logAutomationDeliveryAttempt(db, delivery.id, "blocked", result.data, `HTTP ${result.status}`);
        db.prepare(
          "UPDATE crm_automation_delivery_queue SET status = 'blocked', blocked_reason = ?, failure_reason = ?, updated_at = ? WHERE id = ?"
        ).run("transient_network_error", `HTTP ${result.status}`, nowIso(), delivery.id);
        db.prepare("UPDATE crm_automation_runs SET status = 'approved', failure_reason = NULL, updated_at = ? WHERE id = ?").run(
          nowIso(),
          delivery.run_id
        );
        return { id: delivery.id, status: "blocked", reason: `HTTP ${result.status}` };
      }
      logAutomationDeliveryAttempt(db, delivery.id, "failed", result.data, `HTTP ${result.status}`);
      db.prepare(
        "UPDATE crm_automation_delivery_queue SET status = 'failed', failure_reason = ?, updated_at = ? WHERE id = ?"
      ).run(`HTTP ${result.status}`, nowIso(), delivery.id);
      db.prepare("UPDATE crm_automation_runs SET status = 'failed', failure_reason = ?, updated_at = ? WHERE id = ?").run(
        `HTTP ${result.status}`,
        nowIso(),
        delivery.run_id
      );
      return { id: delivery.id, status: "failed", reason: `HTTP ${result.status}` };
    }
    logAutomationDeliveryAttempt(db, delivery.id, "sent", result.data, null);
    db.prepare(
      "UPDATE crm_automation_delivery_queue SET status = 'sent', blocked_reason = NULL, failure_reason = NULL, external_queue_id = ?, executed_at = ?, updated_at = ? WHERE id = ?"
    ).run(
      normalizeMachineText(result.data?.id || result.data?.queue_id || result.data?.data?.id),
      nowIso(),
      nowIso(),
      delivery.id
    );
    db.prepare("UPDATE crm_automation_runs SET status = 'executed', executed_at = ?, updated_at = ? WHERE id = ?").run(
      nowIso(),
      nowIso(),
      delivery.run_id
    );
    const payload = parseJsonSafely(delivery.payload_json, {});
    appendCommunicationRecord(db, delivery.contact_id, delivery.channel, payload.body || null, nowIso());
    return { id: delivery.id, status: "sent" };
  } catch (error) {
    const message =
      error instanceof Error
        ? [error.message, error.cause instanceof Error ? error.cause.message : null].filter(Boolean).join(": ")
        : "Delivery failed";
    if (delivery.channel === "email" && isTransientDeliveryError(message)) {
      logAutomationDeliveryAttempt(db, delivery.id, "blocked", null, message);
      db.prepare(
        "UPDATE crm_automation_delivery_queue SET status = 'blocked', blocked_reason = ?, failure_reason = ?, updated_at = ? WHERE id = ?"
      ).run("transient_network_error", message, nowIso(), delivery.id);
      db.prepare("UPDATE crm_automation_runs SET status = 'approved', failure_reason = NULL, updated_at = ? WHERE id = ?").run(
        nowIso(),
        delivery.run_id
      );
      return { id: delivery.id, status: "blocked", reason: message };
    }
    logAutomationDeliveryAttempt(db, delivery.id, "failed", null, message);
    db.prepare(
      "UPDATE crm_automation_delivery_queue SET status = 'failed', failure_reason = ?, updated_at = ? WHERE id = ?"
    ).run(message, nowIso(), delivery.id);
    db.prepare("UPDATE crm_automation_runs SET status = 'failed', failure_reason = ?, updated_at = ? WHERE id = ?").run(
      message,
      nowIso(),
      delivery.run_id
    );
    return { id: delivery.id, status: "failed", reason: message };
  }
}

function hasLiveAutomationAdapter(channel) {
  if (channel === "whatsapp") {
    return Boolean(getEvolutionApiUrl() && getEvolutionApiKey());
  }
  if (channel === "email") {
    return getConfiguredEmailProviders().length > 0;
  }
  return false;
}

function isTransientDeliveryError(message) {
  return /ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|fetch failed|timed out|lookup .* no such host/i.test(
    String(message || "")
  );
}

async function tickAutomationQueues() {
  const matured = matureAutomationRuns();
  const db = getDb(false);
  bootstrapSettings(db);
  const blockedRows = db
    .prepare(
      "SELECT * FROM crm_automation_delivery_queue WHERE status = 'blocked' AND blocked_reason IN ('live_send_disabled', 'adapter_not_wired', 'transient_network_error')"
    )
    .all();
  const settings = getAutomationSettings(db);
  for (const row of blockedRows) {
    if (settings.channels[row.channel]?.live_enabled && hasLiveAutomationAdapter(row.channel)) {
      db.prepare(
        "UPDATE crm_automation_delivery_queue SET status = 'queued', blocked_reason = NULL, updated_at = ? WHERE id = ?"
      ).run(nowIso(), row.id);
    }
  }
  const readyDeliveries = db
    .prepare(
      `
      SELECT *
      FROM crm_automation_delivery_queue
      WHERE status = 'queued' AND scheduled_send_at <= ?
      ORDER BY scheduled_send_at ASC, created_at ASC
    `
    )
    .all(nowIso());
  const deliveries = [];
  for (const row of readyDeliveries) {
    deliveries.push(await processAutomationDelivery(db, row));
  }
  return { matured, deliveries };
}

function getAutomationSettingsSnapshot() {
  const db = getDb(false);
  bootstrapSettings(db);
  return {
    settings: {
      ...getAutomationSettings(db),
      capabilities: getAutomationChannelCapabilities(),
    },
    rules: listAutomationRules(),
    templates: listAutomationTemplates(),
    approval: listAutomationApprovalItems({}),
    delivery: listAutomationDeliveries({}),
    projects: listAutomationProjects(db),
  };
}

function getPipelineConfigSnapshot(projectName = PIPELINE_PROJECT) {
  const db = getDb(false);
  bootstrapSettings(db);
  return getPipelineConfig(db, projectName);
}

function insertStatusAfter(statuses, nextStatus, afterStatus = null) {
  const without = statuses.filter((status) => status !== nextStatus);
  const anchor = normalizePipelineStatusToken(afterStatus);
  if (!anchor || !without.includes(anchor)) {
    without.push(nextStatus);
    return without;
  }
  const index = without.indexOf(anchor);
  without.splice(index + 1, 0, nextStatus);
  return without;
}

function addPipelineColumn(input = {}) {
  const db = getDb(false);
  bootstrapSettings(db);
  const projectName = normalizeProjectName(input.project_name || input.project) || PIPELINE_PROJECT;
  const nextStatus = normalizePipelineStatusToken(input.status || input.name || input.label);
  if (!nextStatus) throw new Error("Column name required");
  const config = getPipelineConfig(db, projectName);
  if (config.statuses.includes(nextStatus)) {
    throw new Error("A column with that name already exists");
  }
  const nextStatuses = insertStatusAfter(config.statuses, nextStatus, input.after_status);
  const nextBoardStatuses = insertStatusAfter(config.board_statuses, nextStatus, input.after_status);
  persistProjectPipelineConfig(db, projectName, nextStatuses, nextBoardStatuses);
  return getPipelineConfig(db, projectName);
}

function deletePipelineColumn(input = {}) {
  const db = getDb(false);
  bootstrapSettings(db);
  const projectName = normalizeProjectName(input.project_name || input.project) || PIPELINE_PROJECT;
  const status = normalizePipelineStatusToken(input.status);
  if (!status) throw new Error("Column status required");
  if (status === "new") {
    throw new Error("Possible Candidate cannot be deleted");
  }
  const replacementStatus = normalizePipelineStatusToken(input.replacement_status) || "new";
  const config = getPipelineConfig(db, projectName);
  if (!config.board_statuses.includes(status)) {
    throw new Error("Pipeline column not found");
  }
  const affectedCount =
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM crm_contact_projects WHERE project_name = ? AND pipeline_status = ?"
      )
      .get(projectName, status)?.count || 0;
  if (affectedCount > 0) {
    if (!config.statuses.includes(replacementStatus)) {
      throw new Error("Replacement column not found");
    }
    db.prepare(
      `
      UPDATE crm_contact_projects
      SET pipeline_status = ?, updated_at = ?, last_touched_at = ?
      WHERE project_name = ? AND pipeline_status = ?
    `
    ).run(replacementStatus, nowIso(), nowIso(), projectName, status);
    db.prepare(
      `
      UPDATE crm_automation_rules
      SET to_stage = ?, updated_at = ?
      WHERE project_name = ? AND to_stage = ?
    `
    ).run(replacementStatus, nowIso(), projectName, status);
  } else {
    const dependentRules =
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM crm_automation_rules WHERE project_name = ? AND to_stage = ?"
        )
        .get(projectName, status)?.count || 0;
    if (dependentRules > 0) {
      throw new Error("Move or delete automation rules for this column before removing it");
    }
  }
  const nextStatuses = config.statuses.filter((item) => item !== status);
  const nextBoardStatuses = config.board_statuses.filter((item) => item !== status);
  persistProjectPipelineConfig(db, projectName, nextStatuses, nextBoardStatuses);
  return getPipelineConfig(db, projectName);
}

function renamePipelineColumn(input = {}) {
  const db = getDb(false);
  bootstrapSettings(db);
  const projectName = normalizeProjectName(input.project_name || input.project) || PIPELINE_PROJECT;
  const status = normalizePipelineStatusToken(input.status);
  const nextStatus = normalizePipelineStatusToken(input.next_status || input.name || input.label);
  if (!status) throw new Error("Column status required");
  if (!nextStatus) throw new Error("New column name required");
  const config = getPipelineConfig(db, projectName);
  if (!config.statuses.includes(status)) {
    throw new Error("Pipeline column not found");
  }
  if (status === nextStatus) {
    return getPipelineConfig(db, projectName);
  }
  if (config.statuses.includes(nextStatus)) {
    throw new Error("A column with that name already exists");
  }
  const renameInList = (values) => values.map((value) => (value === status ? nextStatus : value));
  db.prepare(
    `
    UPDATE crm_contact_projects
    SET pipeline_status = ?, updated_at = ?, last_touched_at = ?
    WHERE project_name = ? AND pipeline_status = ?
  `
  ).run(nextStatus, nowIso(), nowIso(), projectName, status);
  db.prepare(
    `
    UPDATE crm_pipeline_history
    SET to_status = CASE WHEN to_status = ? THEN ? ELSE to_status END,
        from_status = CASE WHEN from_status = ? THEN ? ELSE from_status END
    WHERE project_name = ?
  `
  ).run(status, nextStatus, status, nextStatus, projectName);
  db.prepare(
    `
    UPDATE crm_automation_rules
    SET to_stage = CASE WHEN to_stage = ? THEN ? ELSE to_stage END,
        from_stage = CASE WHEN from_stage = ? THEN ? ELSE from_stage END,
        updated_at = ?
    WHERE project_name = ?
  `
  ).run(status, nextStatus, status, nextStatus, nowIso(), projectName);
  db.prepare(
    `
    UPDATE crm_automation_runs
    SET triggered_to_stage = CASE WHEN triggered_to_stage = ? THEN ? ELSE triggered_to_stage END,
        triggered_from_stage = CASE WHEN triggered_from_stage = ? THEN ? ELSE triggered_from_stage END,
        updated_at = ?
    WHERE project_name = ?
  `
  ).run(status, nextStatus, status, nextStatus, nowIso(), projectName);
  persistProjectPipelineConfig(
    db,
    projectName,
    renameInList(config.statuses),
    renameInList(config.board_statuses)
  );
  return getPipelineConfig(db, projectName);
}

function upsertProjectState(db, contactId, projectName, pipelineStatus, options = {}) {
  const normalizedContactId = normalizeContactId(contactId);
  if (!normalizedContactId) return null;
  const normalizedProject = normalizeProjectName(projectName);
  if (!normalizedProject) return null;
  const normalizedStatus =
    normalizedProject === PIPELINE_PROJECT
      ? normalizePipelineStatus(pipelineStatus)
      : STATUSES.includes(pipelineStatus)
        ? pipelineStatus
        : "new";
  const touchedAt = options.touchedAt || nowIso();
  const sortOrder =
    options.sortOrder !== undefined && options.sortOrder !== null
      ? Number(options.sortOrder)
      : getNextSortOrder(db, normalizedProject, normalizedStatus);
  db.prepare(
    `
    INSERT INTO crm_contact_projects (
      contact_id, project_name, pipeline_status, sort_order, last_touched_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(contact_id, project_name) DO UPDATE SET
      pipeline_status = excluded.pipeline_status,
      sort_order = excluded.sort_order,
      last_touched_at = excluded.last_touched_at,
      updated_at = excluded.updated_at
  `
  ).run(
    normalizedContactId,
    normalizedProject,
    normalizedStatus,
    sortOrder,
    touchedAt,
    touchedAt,
    touchedAt
  );
  return {
    contact_id: normalizedContactId,
    project_name: normalizedProject,
    pipeline_status: normalizedStatus,
    sort_order: sortOrder,
    last_touched_at: touchedAt,
  };
}

function addProjectMembership(db, contactId, projectName, pipelineStatus = "new") {
  return upsertProjectState(db, contactId, projectName, pipelineStatus);
}

function setProjectMemberships(db, contactId, projectNames = [], fallbackStatus = "new") {
  const names = [...new Set((Array.isArray(projectNames) ? projectNames : []).map(normalizeProjectName).filter(Boolean))];
  const existingByProject = new Map(
    db
      .prepare(
        `
        SELECT project_name, pipeline_status, sort_order, last_touched_at
        FROM crm_contact_projects
        WHERE contact_id = ?
      `
      )
      .all(contactId)
      .map((row) => [normalizeProjectName(row.project_name), row])
  );
  if (!names.length) {
    db.prepare("DELETE FROM crm_contact_projects WHERE contact_id = ?").run(contactId);
    return names;
  }
  for (const projectName of names) {
    const existing = existingByProject.get(projectName);
    upsertProjectState(db, contactId, projectName, existing?.pipeline_status || fallbackStatus, {
      sortOrder: existing?.sort_order,
      touchedAt: existing?.last_touched_at || nowIso(),
    });
  }
  const placeholders = names.map(() => "?").join(",");
  db.prepare(
    `DELETE FROM crm_contact_projects WHERE contact_id = ? AND project_name NOT IN (${placeholders})`
  ).run(contactId, ...names);
  return names;
}

function getManagedDetailFields() {
  return [
    "location",
    "industry",
    "business_description",
    "biggest_needs",
  ];
}

function getDetailFieldMeta(fieldName) {
  return {
    sourceField: `${fieldName}_source`,
    manualField: `${fieldName}_is_manual`,
  };
}

function applyEnrichedContactFields(db, contactId, values = {}, source = "enrichment", options = {}) {
  const existing = db.prepare("SELECT * FROM crm_contacts WHERE id = ?").get(contactId);
  if (!existing) {
    throw new Error(`CRM contact not found: ${contactId}`);
  }

  const nextValues = {};
  const timestamp = options.updatedAt || nowIso();
  let changed = false;

  for (const fieldName of getManagedDetailFields()) {
    const meta = getDetailFieldMeta(fieldName);
    const incoming =
      fieldName === "business_description" || fieldName === "biggest_needs"
        ? normalizeLongText(values[fieldName])
        : normalizeMachineText(values[fieldName]);
    if (!incoming) continue;
    if (existing[meta.manualField]) continue;
    if (existing[fieldName] === incoming && existing[meta.sourceField] === source) continue;
    nextValues[fieldName] = incoming;
    nextValues[meta.sourceField] = source;
    changed = true;
  }

  if (!changed) return false;

  snapshotContact(db, contactId, options.reason || "enrichment_fields");
  db.prepare(
    `
    UPDATE crm_contacts
    SET location = COALESCE(?, location),
        location_source = COALESCE(?, location_source),
        industry = COALESCE(?, industry),
        industry_source = COALESCE(?, industry_source),
        business_description = COALESCE(?, business_description),
        business_description_source = COALESCE(?, business_description_source),
        biggest_needs = COALESCE(?, biggest_needs),
        biggest_needs_source = COALESCE(?, biggest_needs_source),
        updated_at = ?
    WHERE id = ?
  `
  ).run(
    nextValues.location || null,
    nextValues.location_source || null,
    nextValues.industry || null,
    nextValues.industry_source || null,
    nextValues.business_description || null,
    nextValues.business_description_source || null,
    nextValues.biggest_needs || null,
    nextValues.biggest_needs_source || null,
    timestamp,
    contactId
  );
  return true;
}

function assignLabels(db, contactId, payload, inferred, preserveManual = true) {
  const manualTop = preserveManual
    ? db
        .prepare(
          `
          SELECT label_key
          FROM crm_contact_funnel_labels
          WHERE contact_id = ? AND label_role = 'top_level' AND assigned_by_rule = 'manual'
          LIMIT 1
        `
        )
        .get(contactId)
    : null;

  if (!manualTop) {
    db.prepare(
      "DELETE FROM crm_contact_funnel_labels WHERE contact_id = ? AND label_role = 'top_level' AND assigned_by_rule != 'manual'"
    ).run(contactId);
    if (inferred.labelKey && isApprovedLabelEnabled(db, inferred.labelKey)) {
      db.prepare(
        `
        INSERT INTO crm_contact_funnel_labels (contact_id, label_key, label_role, assigned_by_rule)
        VALUES (?, ?, 'top_level', 'rule')
        ON CONFLICT(contact_id, label_key) DO UPDATE SET label_role = excluded.label_role
      `
      ).run(contactId, inferred.labelKey);
    }
  }

  const autoSecondary = db
    .prepare(
      "SELECT label_key FROM crm_contact_funnel_labels WHERE contact_id = ? AND label_role != 'top_level' AND assigned_by_rule = 'rule'"
    )
    .all(contactId)
    .map((row) => row.label_key);
  if (autoSecondary.length > 0) {
    const placeholders = autoSecondary.map(() => "?").join(", ");
    db.prepare(
      `DELETE FROM crm_contact_funnel_labels WHERE contact_id = ? AND label_key IN (${placeholders})`
    ).run(contactId, ...autoSecondary);
  }

  const secondary = inferSecondaryLabelKeys(payload).filter((labelKey) =>
    isApprovedLabelEnabled(db, labelKey)
  );
  for (const labelKey of secondary) {
    db.prepare(
      `
      INSERT INTO crm_contact_funnel_labels (contact_id, label_key, label_role, assigned_by_rule)
      VALUES (?, ?, ?, 'rule')
      ON CONFLICT(contact_id, label_key) DO UPDATE SET label_role = excluded.label_role
    `
    ).run(contactId, labelKey, APPROVED_LABELS[labelKey].role);
  }
}

function recordPipelineChange(db, contactId, fromStatus, toStatus, changedBy, reason, projectName) {
  db.prepare(
    `
    INSERT INTO crm_pipeline_history (contact_id, project_name, from_status, to_status, changed_by, reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  ).run(contactId, projectName || null, fromStatus || null, toStatus, changedBy || "system", reason || null);
}

function ingestLead(input = {}) {
  const db = getDb(false);
  bootstrapSettings(db);

  const payload = normalizePayload(input);
  const inferred = inferTopLevelLabel(payload);

  if (payload.external_event_id) {
    const existingEvent = db
      .prepare(
        "SELECT id, contact_id FROM crm_lead_events WHERE source = ? AND external_event_id = ? LIMIT 1"
      )
      .get(payload.source, payload.external_event_id);
    if (existingEvent) {
      return {
        contact_id: existingEvent.contact_id,
        lead_event_id: existingEvent.id,
        dedupe_mode: "event_duplicate",
        canonical_fields_changed: false,
        resolved_funnel_label: inferred.labelKey,
        secondary_labels: inferSecondaryLabelKeys(payload),
      };
    }
  }

  const emailContactId = findContactIdByAlias(db, "email", payload.email);
  const phoneContactId = findContactIdByAlias(db, "phone", payload.phone);
  const ids = [emailContactId, phoneContactId].filter(Boolean);
  const uniqueIds = [...new Set(ids)];
  // When multiple contacts match (e.g. same email on two records), pick the furthest-along one
  // rather than creating a third duplicate. Flag review_needed so an operator can merge manually.
  const contactId = uniqueIds.length >= 1 ? pickBestContactId(db, uniqueIds) : null;
  const reviewNeeded = uniqueIds.length > 1 || inferred.reviewNeeded;

  const eventId = crypto.randomUUID();
  const capturedAt = payload.captured_at || nowIso();
  let canonicalChanged = false;
  let finalContactId = contactId;

  if (!finalContactId) {
    finalContactId = crypto.randomUUID();
    db.prepare(
      `
      INSERT INTO crm_contacts (
        id, first_name, last_name, full_name, primary_project, primary_email, primary_phone,
        instagram_handle, instagram_profile_url, tiktok_url, source_first, source_latest, status, priority, owner,
        notes, next_step, willing_to_pay, pipeline_affiliate_id, communication_channel, lost_reason, funnel_label_key, review_needed, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
      finalContactId,
      payload.first_name,
      payload.last_name,
      payload.full_name,
      payload.primary_project || PRIMARY_PROJECT_DEFAULT,
      payload.email,
      payload.phone,
      payload.instagram_handle,
      payload.instagram_profile_url,
      payload.tiktok_url,
      payload.source,
      payload.source,
      payload.pipeline_status || 'new',
      payload.owner,
      payload.notes,
      payload.next_step,
      payload.willing_to_pay,
      payload.pipeline_affiliate_id,
      payload.communication_channel,
      payload.lost_reason,
      inferred.labelKey,
      reviewNeeded ? 1 : 0,
      capturedAt,
      capturedAt
    );
    recordPipelineChange(db, finalContactId, null, payload.pipeline_status || 'new', "system", "lead_ingested");
    ensurePipelineProjectState(db, finalContactId, payload.pipeline_status);
    canonicalChanged = true;
  } else {
    const existing = db.prepare("SELECT * FROM crm_contacts WHERE id = ?").get(finalContactId);
    if (!existing) {
      throw new Error(`CRM contact missing: ${finalContactId}`);
    }
    const next = { ...existing };

    if (payload.email && payload.email !== existing.primary_email) {
      insertAlias(db, finalContactId, "email", existing.primary_email);
      next.primary_email = payload.email;
      canonicalChanged = true;
    }
    if (payload.phone && payload.phone !== existing.primary_phone) {
      insertAlias(db, finalContactId, "phone", existing.primary_phone);
      next.primary_phone = payload.phone;
      canonicalChanged = true;
    }
    if (payload.first_name && payload.first_name !== existing.first_name) {
      next.first_name = payload.first_name;
      canonicalChanged = true;
    }
    if (payload.last_name && payload.last_name !== existing.last_name) {
      next.last_name = payload.last_name;
      canonicalChanged = true;
    }
    const rebuiltName =
      [payload.first_name || next.first_name, payload.last_name || next.last_name]
        .filter(Boolean)
        .join(" ") || payload.full_name || next.full_name;
    if (rebuiltName && rebuiltName !== existing.full_name) {
      next.full_name = rebuiltName;
      canonicalChanged = true;
    }
    if (payload.instagram_handle && payload.instagram_handle !== existing.instagram_handle) {
      next.instagram_handle = payload.instagram_handle;
      canonicalChanged = true;
    }
    if (
      payload.instagram_profile_url &&
      payload.instagram_profile_url !== existing.instagram_profile_url
    ) {
      next.instagram_profile_url = payload.instagram_profile_url;
      canonicalChanged = true;
    }
    if (payload.tiktok_url && payload.tiktok_url !== existing.tiktok_url) {
      next.tiktok_url = payload.tiktok_url;
      canonicalChanged = true;
    }
    next.source_latest = payload.source;
    next.review_needed = reviewNeeded ? 1 : existing.review_needed;
    next.primary_project = payload.primary_project || existing.primary_project || PRIMARY_PROJECT_DEFAULT;
    if (payload.willing_to_pay !== null && payload.willing_to_pay !== existing.willing_to_pay) {
      next.willing_to_pay = payload.willing_to_pay;
      canonicalChanged = true;
    }
    if (
      payload.pipeline_affiliate_id !== null &&
      payload.pipeline_affiliate_id !== existing.pipeline_affiliate_id
    ) {
      next.pipeline_affiliate_id = payload.pipeline_affiliate_id;
      canonicalChanged = true;
    }
    next.communication_channel =
      payload.communication_channel || existing.communication_channel || inferCommunicationChannel(null, payload.source);
    if (!existing.funnel_label_key && inferred.labelKey) {
      next.funnel_label_key = inferred.labelKey;
      canonicalChanged = true;
    }

    if (canonicalChanged) {
      snapshotContact(db, finalContactId, "ingest_update");
      db.prepare(
        `
        UPDATE crm_contacts
        SET first_name = ?, last_name = ?, full_name = ?, primary_email = ?,
            primary_phone = ?, instagram_handle = ?, instagram_profile_url = ?, tiktok_url = ?, primary_project = ?, source_latest = ?,
            owner = COALESCE(?, owner), notes = COALESCE(?, notes), willing_to_pay = COALESCE(?, willing_to_pay), pipeline_affiliate_id = COALESCE(?, pipeline_affiliate_id), communication_channel = COALESCE(?, communication_channel),
            funnel_label_key = COALESCE(?, funnel_label_key),
            review_needed = ?, updated_at = ?
        WHERE id = ?
      `
      ).run(
        next.first_name || null,
        next.last_name || null,
        next.full_name || null,
        next.primary_email || null,
        next.primary_phone || null,
        next.instagram_handle || null,
        next.instagram_profile_url || null,
        next.tiktok_url || null,
        next.primary_project || null,
        next.source_latest || null,
        payload.owner || null,
        payload.notes || null,
        next.willing_to_pay ?? null,
        next.pipeline_affiliate_id || null,
        next.communication_channel || null,
        next.funnel_label_key || null,
        next.review_needed || 0,
        capturedAt,
        finalContactId
      );
    } else {
      db.prepare(
        "UPDATE crm_contacts SET source_latest = ?, primary_project = COALESCE(?, primary_project), communication_channel = COALESCE(?, communication_channel), updated_at = ? WHERE id = ?"
      ).run(
        payload.source,
        payload.primary_project || null,
        payload.communication_channel || inferCommunicationChannel(null, payload.source),
        capturedAt,
        finalContactId
      );
    }
  }

  insertAlias(db, finalContactId, "email", payload.email);
  insertAlias(db, finalContactId, "phone", payload.phone);

  db.prepare(
    `
    INSERT INTO crm_lead_events (
      id, contact_id, source, source_subtype, external_event_id,
      campaign, keyword, raw_payload, captured_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    eventId,
    finalContactId,
    payload.source,
    payload.source_subtype,
    payload.external_event_id,
    payload.campaign,
    payload.keyword,
    JSON.stringify(payload.raw_payload || input || {}),
    capturedAt,
    capturedAt
  );

  assignLabels(db, finalContactId, payload, inferred, true);
  const automationProjectName = payload.primary_project || PRIMARY_PROJECT_DEFAULT;
  const previousProjectState = getContactProjectState(db, finalContactId, automationProjectName);
  ensurePrimaryProject(db, finalContactId, automationProjectName);
  ensurePipelineProjectState(db, finalContactId, payload.pipeline_status);
  const nextAutomationStage = normalizePipelineStatus(payload.pipeline_status);
  const previousAutomationStage =
    previousProjectState?.pipeline_status || null;
  if (automationProjectName && nextAutomationStage && previousAutomationStage !== nextAutomationStage) {
    triggerAutomationForStageChange(db, {
      contact_id: finalContactId,
      project_name: automationProjectName,
      from_stage: previousAutomationStage,
      to_stage: nextAutomationStage,
      changed_at: capturedAt,
    });
  }
  return {
    contact_id: finalContactId,
    lead_event_id: eventId,
    dedupe_mode: contactId ? "matched_existing" : "created_new",
    canonical_fields_changed: canonicalChanged,
    resolved_funnel_label: inferred.labelKey,
    secondary_labels: inferSecondaryLabelKeys(payload),
  };
}

function listContacts(options = {}) {
  const db = getDb(false);
  if (!db) {
    return {
      contacts: [],
      totalContacts: 0,
      summary: getEmptySummary(),
      projectCatalog: getProjectCatalog(),
      affiliates: [],
      statuses: [...PIPELINE_BOARD_STATUSES],
      allStatuses: [...PIPELINE_PIPELINE_STATUSES],
      activeProject: PIPELINE_PROJECT,
      stageAutomationMap: {},
    };
  }
  bootstrapSettings(db);

  const sort = SORT_OPTIONS.has(options.sort) ? options.sort : "updated_desc";
  const project = normalizeProjectName(options.project);
  const activeProject = project || PIPELINE_PROJECT;
  const where = [];
  const params = [];

  if (options.search) {
    const query = `%${String(options.search).toLowerCase()}%`;
    where.push(
      "(lower(c.full_name) LIKE ? OR lower(COALESCE(c.first_name, '')) LIKE ? OR lower(COALESCE(c.last_name, '')) LIKE ? OR lower(c.primary_email) LIKE ? OR lower(COALESCE(c.location, '')) LIKE ? OR lower(COALESCE(c.industry, '')) LIKE ? OR lower(COALESCE(c.next_step, '')) LIKE ? OR lower(COALESCE(c.notes, '')) LIKE ? OR lower(COALESCE(le.campaign, '')) LIKE ? OR lower(COALESCE(le.keyword, '')) LIKE ? OR lower(COALESCE(projects.project_names, '')) LIKE ?)"
    );
    params.push(query, query, query, query, query, query, query, query, query, query, query);
  }
  if (options.status) {
    if (project === PIPELINE_PROJECT) {
      where.push(
        "EXISTS (SELECT 1 FROM crm_contact_projects cp2 WHERE cp2.contact_id = c.id AND cp2.project_name = ? AND cp2.pipeline_status = ?)"
      );
      params.push(PIPELINE_PROJECT, normalizePipelineStatus(options.status));
    } else if (!project) {
      // All-projects list view: a stage can live on the contact row or on any
      // project membership row, so match either.
      where.push(
        "(c.status = ? OR EXISTS (SELECT 1 FROM crm_contact_projects cp2 WHERE cp2.contact_id = c.id AND cp2.pipeline_status = ?))"
      );
      params.push(options.status, normalizePipelineStatus(options.status));
    } else {
      where.push("c.status = ?");
      params.push(options.status);
    }
  }
  if (options.source) {
    // The list view offers both first and latest sources as filter values.
    where.push("(c.source_latest = ? OR c.source_first = ?)");
    params.push(options.source, options.source);
  }
  if (options.owner) {
    where.push("c.owner = ?");
    params.push(options.owner);
  }
  if (options.label) {
    where.push(
      "(c.funnel_label_key = ? OR EXISTS (SELECT 1 FROM crm_contact_funnel_labels fl2 WHERE fl2.contact_id = c.id AND fl2.label_key = ?))"
    );
    params.push(options.label, options.label);
  }
  if (project) {
    where.push(
      "EXISTS (SELECT 1 FROM crm_contact_projects cp WHERE cp.contact_id = c.id AND cp.project_name = ?)"
    );
    params.push(project);
  }

  const orderBy = {
    updated_desc:
      project === PIPELINE_PROJECT
        ? "COALESCE(cp.sort_order, 999999999) ASC, cp.updated_at DESC, c.updated_at DESC"
        : "c.updated_at DESC",
    created_desc: "c.created_at DESC",
    untouched_asc: "c.updated_at ASC",
    priority_desc: "c.priority DESC, c.updated_at DESC",
    source_asc: "c.source_latest ASC, c.updated_at DESC",
    owner_asc: "COALESCE(c.owner, '') ASC, c.updated_at DESC",
    status_asc: "c.status ASC, c.updated_at DESC",
    sync_state_asc: "COALESCE(sd.sync_status, 'pending') ASC, c.updated_at DESC",
  }[sort];

  const rows = db
    .prepare(
      `
      WITH latest_events AS (
        SELECT e1.*
        FROM crm_lead_events e1
        JOIN (
          SELECT contact_id, MAX(captured_at) AS max_captured_at
          FROM crm_lead_events
          GROUP BY contact_id
        ) latest
          ON latest.contact_id = e1.contact_id AND latest.max_captured_at = e1.captured_at
      ),
      latest_enrichment AS (
        SELECT e1.*
        FROM crm_contact_enrichments e1
        JOIN (
          SELECT contact_id, MAX(enriched_at) AS max_enriched_at
          FROM crm_contact_enrichments
          WHERE photo_url IS NOT NULL OR photo_local_path IS NOT NULL
          GROUP BY contact_id
        ) latest
          ON latest.contact_id = e1.contact_id AND latest.max_enriched_at = e1.enriched_at
      ),
      project_rollup AS (
        SELECT
          contact_id,
          GROUP_CONCAT(project_name, '||') AS project_names,
          COUNT(*) AS project_count
        FROM crm_contact_projects
        GROUP BY contact_id
      )
      SELECT
        c.*,
        c.instagram_profile_url AS contact_instagram_profile_url,
        le.source AS latest_event_source,
        le.campaign AS latest_campaign,
        le.keyword AS latest_keyword,
        le.captured_at AS latest_captured_at,
        en.photo_url AS photo_url,
        en.photo_local_path AS photo_local_path,
        en.profile_url AS enriched_instagram_profile_url,
        en.external_url AS website_url,
        aff.first_name AS affiliate_first_name,
        aff.last_name AS affiliate_last_name,
        cp.pipeline_status AS project_state,
        cp.sort_order AS project_sort_order,
        mp.pipeline_status AS pipeline_status,
        cp.project_name AS project_name,
        COALESCE(projects.project_names, '') AS project_names,
        COALESCE(projects.project_count, 0) AS project_count,
        (SELECT COUNT(*) FROM crm_lead_events ev WHERE ev.contact_id = c.id) AS event_count,
        (SELECT COUNT(*) FROM crm_contact_funnel_labels wl WHERE wl.contact_id = c.id) AS label_count
      FROM crm_contacts c
      LEFT JOIN latest_events le ON le.contact_id = c.id
      LEFT JOIN latest_enrichment en ON en.contact_id = c.id
      LEFT JOIN crm_pipeline_affiliates aff ON aff.id = c.pipeline_affiliate_id
      LEFT JOIN project_rollup projects ON projects.contact_id = c.id
      LEFT JOIN crm_contact_projects cp
        ON cp.contact_id = c.id AND cp.project_name = ?
      LEFT JOIN crm_contact_projects mp
        ON mp.contact_id = c.id AND mp.project_name = '${PIPELINE_PROJECT}'
      WHERE c.id IS NOT NULL
        AND trim(c.id) != ''
        AND (c.status IS NULL OR c.status != 'merged')
        ${where.length ? `AND ${where.join(" AND ")}` : ""}
      ORDER BY ${orderBy}
    `
    )
    .all(project || null, ...params);

  const contacts = rows.map((row) => ({
    ...row,
    review_needed: Boolean(row.review_needed),
    primary_project: row.primary_project || PRIMARY_PROJECT_DEFAULT,
    primary_project_display_name: formatProjectDisplayName(row.primary_project || PRIMARY_PROJECT_DEFAULT),
    instagram_profile_url:
      row.contact_instagram_profile_url || row.enriched_instagram_profile_url || null,
    pipeline_status: row.pipeline_status || getPipelineDefaultStatus(row.full_name),
    next_step: row.next_step || null,
    willing_to_pay: row.willing_to_pay ?? null,
    pipeline_affiliate_id: row.pipeline_affiliate_id || null,
    pipeline_affiliate_name:
      [row.affiliate_first_name, row.affiliate_last_name].filter(Boolean).join(" ").trim() || null,
    communication_channel:
      row.communication_channel || inferCommunicationChannel(null, row.source_latest || row.source_first),
    lost_reason: row.lost_reason || null,
    project_state:
      project === PIPELINE_PROJECT
        ? row.pipeline_status || getPipelineDefaultStatus(row.full_name)
        : row.project_state || row.status,
    project_names: row.project_names
      ? String(row.project_names)
          .split("||")
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
    location_is_manual: Boolean(row.location_is_manual),
    industry_is_manual: Boolean(row.industry_is_manual),
    business_description_is_manual: Boolean(row.business_description_is_manual),
    biggest_needs_is_manual: Boolean(row.biggest_needs_is_manual),
  }));

  const statuses = getProjectBoardStatuses(db, activeProject);
  const allStatuses = getProjectPipelineStatuses(db, activeProject);
  const stageAutomationMap = getStageAutomationMap(db, activeProject, allStatuses);

  // Unfiltered, non-merged total so the list view can show "N of M contacts".
  const totalContacts = db
    .prepare(
      "SELECT COUNT(*) AS count FROM crm_contacts WHERE id IS NOT NULL AND trim(id) != '' AND COALESCE(status, '') != 'merged'"
    )
    .get().count;

  return {
    contacts,
    totalContacts,
    summary: getSummary(db),
    projectCatalog: getProjectCatalog(),
    affiliates: listPipelineAffiliates(db),
    statuses,
    allStatuses,
    activeProject,
    stageAutomationMap,
  };
}

function getSummary(db) {
  const total = db
    .prepare("SELECT COUNT(*) AS count FROM crm_contacts WHERE id IS NOT NULL AND trim(id) != '' AND (status IS NULL OR status != 'merged')")
    .get().count;
  const pendingReview = db
    .prepare(
      "SELECT COUNT(*) AS count FROM crm_contacts WHERE id IS NOT NULL AND trim(id) != '' AND (status IS NULL OR status != 'merged') AND review_needed = 1"
    )
    .get().count;
  const byStatus = db
    .prepare(
      "SELECT status, COUNT(*) AS count FROM crm_contacts WHERE id IS NOT NULL AND trim(id) != '' AND (status IS NULL OR status != 'merged') GROUP BY status ORDER BY status ASC"
    )
    .all();
  const pipelineByStatus = db
    .prepare(
      `
      SELECT pipeline_status AS status, COUNT(*) AS count
      FROM crm_contact_projects
      WHERE project_name = ?
      GROUP BY pipeline_status
      ORDER BY pipeline_status ASC
    `
    )
    .all(PIPELINE_PROJECT);
  return { total, pendingReview, byStatus, pipelineByStatus };
}

function listPipelineAffiliates(dbArg = null) {
  const db = dbArg || getDb(false);
  if (!db) return [];
  bootstrapSettings(db);
  return db
    .prepare(
      `
      SELECT
        id,
        first_name,
        last_name,
        email,
        commission_percentage,
        paypal_email,
        wise_url,
        bank_transfer_info,
        preferred_payment_method,
        created_at,
        updated_at
      FROM crm_pipeline_affiliates
      ORDER BY lower(first_name) ASC, lower(COALESCE(last_name, '')) ASC
    `
    )
    .all()
    .map((row) => ({
      ...row,
      commission_percentage: Number(row.commission_percentage) || 0,
      display_name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim(),
    }));
}

function getEmptySummary() {
  return { total: 0, pendingReview: 0, byStatus: [] };
}

function getContactDetail(contactId) {
  const db = getDb(false);
  if (!db) return null;
  bootstrapSettings(db);
  const contact = db.prepare("SELECT * FROM crm_contacts WHERE id = ?").get(contactId);
  if (!contact) return null;
  const latestEnrichment = db
    .prepare(
      `
      SELECT photo_url, photo_local_path, profile_url
      FROM crm_contact_enrichments
      WHERE contact_id = ? AND (photo_url IS NOT NULL OR photo_local_path IS NOT NULL OR profile_url IS NOT NULL)
      ORDER BY enriched_at DESC
      LIMIT 1
    `
    )
    .get(contactId);
  const affiliate = contact.pipeline_affiliate_id
    ? db
        .prepare(
          `
          SELECT
            id,
            first_name,
            last_name,
            email,
            commission_percentage,
            paypal_email,
            wise_url,
            bank_transfer_info,
            preferred_payment_method,
            created_at,
            updated_at
          FROM crm_pipeline_affiliates
          WHERE id = ?
        `
        )
        .get(contact.pipeline_affiliate_id)
    : null;
  const aliases = db
    .prepare("SELECT alias_type, alias_value, created_at FROM crm_contact_aliases WHERE contact_id = ? ORDER BY created_at DESC")
    .all(contactId);
  const events = db
    .prepare("SELECT * FROM crm_lead_events WHERE contact_id = ? ORDER BY captured_at DESC, created_at DESC")
    .all(contactId)
    .map((row) => ({
      ...row,
      raw_payload: row.raw_payload ? JSON.parse(row.raw_payload) : null,
    }));
  const versions = db
    .prepare("SELECT * FROM crm_contact_versions WHERE contact_id = ? ORDER BY changed_at DESC LIMIT 20")
    .all(contactId)
    .map((row) => ({
      ...row,
      snapshot_json: row.snapshot_json ? JSON.parse(row.snapshot_json) : null,
    }));
  const pipeline = db
    .prepare("SELECT * FROM crm_pipeline_history WHERE contact_id = ? ORDER BY changed_at DESC")
    .all(contactId);
  const projects = db
    .prepare(
      `
      SELECT contact_id, project_name, pipeline_status, last_touched_at, created_at, updated_at
      , sort_order
      FROM crm_contact_projects
      WHERE contact_id = ?
      ORDER BY sort_order ASC, updated_at DESC, project_name ASC
    `
    )
    .all(contactId);
  const pipelineProject =
    projects.find((project) => project.project_name === PIPELINE_PROJECT) || null;
  const labels = db
    .prepare(
      `
      SELECT wl.label_key, wl.label_role, wl.assigned_by_rule
      FROM crm_contact_funnel_labels wl
      WHERE wl.contact_id = ?
      ORDER BY CASE wl.label_role WHEN 'top_level' THEN 0 WHEN 'secondary' THEN 1 ELSE 2 END, wl.label_key
    `
    )
    .all(contactId)
    .map((label) => ({
      ...label,
      display_name: APPROVED_LABELS[label.label_key]?.displayName || label.label_key,
    }));
  const enrichment = db
    .prepare(
      `
      SELECT *
      FROM crm_contact_enrichments
      WHERE contact_id = ?
      ORDER BY enriched_at DESC
    `
    )
    .all(contactId)
    .map((row) => ({
      ...row,
      is_verified: Boolean(row.is_verified),
      raw_payload_json: row.raw_payload_json ? JSON.parse(row.raw_payload_json) : null,
    }));
  const communications = db
    .prepare("SELECT * FROM crm_contact_communications WHERE contact_id = ? ORDER BY contacted_at DESC")
    .all(contactId);

  return {
    contact: {
      ...contact,
      primary_project: contact.primary_project || PRIMARY_PROJECT_DEFAULT,
      primary_project_display_name: formatProjectDisplayName(
        contact.primary_project || PRIMARY_PROJECT_DEFAULT
      ),
      pipeline_status:
        pipelineProject?.pipeline_status || getPipelineDefaultStatus(contact.full_name),
      willing_to_pay: contact.willing_to_pay ?? null,
      pipeline_affiliate_id: contact.pipeline_affiliate_id || null,
      pipeline_affiliate_name:
        [affiliate?.first_name, affiliate?.last_name].filter(Boolean).join(" ").trim() || null,
      communication_channel:
        contact.communication_channel ||
        inferCommunicationChannel(null, contact.source_latest || contact.source_first),
      review_needed: Boolean(contact.review_needed),
      location_is_manual: Boolean(contact.location_is_manual),
      industry_is_manual: Boolean(contact.industry_is_manual),
      business_description_is_manual: Boolean(contact.business_description_is_manual),
      biggest_needs_is_manual: Boolean(contact.biggest_needs_is_manual),
      photo_url: latestEnrichment?.photo_url || null,
      photo_local_path: latestEnrichment?.photo_local_path || null,
    },
    aliases,
    events,
    versions,
    pipeline,
    communications,
    projects,
    labels,
    enrichment,
    affiliate: affiliate
      ? {
          ...affiliate,
          commission_percentage: Number(affiliate.commission_percentage) || 0,
          display_name: [affiliate.first_name, affiliate.last_name].filter(Boolean).join(" ").trim(),
        }
      : null,
    affiliates: listPipelineAffiliates(db),
  };
}

function listInstagramEnrichmentCandidates(options = {}) {
  const db = getDb(false);
  if (!db) return [];
  bootstrapSettings(db);
  const limit =
    Number.isInteger(Number(options.limit)) && Number(options.limit) > 0
      ? Number(options.limit)
      : 25;
  const includeEnriched = Boolean(options.includeEnriched);

  return db
    .prepare(
      `
      SELECT
        c.id,
        c.first_name,
        c.last_name,
        c.full_name,
        c.primary_email,
        c.instagram_handle,
        c.updated_at,
        e.enriched_at,
        e.followers,
        e.source AS enrichment_source
      FROM crm_contacts c
      LEFT JOIN crm_contact_enrichments e
        ON e.contact_id = c.id AND e.source = 'instagram_profile'
      WHERE c.instagram_handle IS NOT NULL
        AND c.instagram_handle != ''
        ${includeEnriched ? "" : "AND e.id IS NULL"}
      ORDER BY COALESCE(e.enriched_at, '') ASC, c.updated_at DESC
      LIMIT ?
    `
    )
    .all(limit);
}

function applyInstagramEnrichment(contactId, profile = {}, options = {}) {
  const db = getDb(false);
  bootstrapSettings(db);
  const existing = db.prepare("SELECT * FROM crm_contacts WHERE id = ?").get(contactId);
  if (!existing) {
    throw new Error(`CRM contact not found: ${contactId}`);
  }

  const handle = normalizeHandle(profile.handle || existing.instagram_handle);
  const fullName = normalizeNamePart(profile.full_name);
  const bio = normalizeMachineText(profile.bio);
  const externalUrl = normalizeOptionalUrl(profile.external_url);
  const profileUrl = normalizeOptionalUrl(profile.profile_url);
  const photoUrl = normalizeOptionalUrl(
    profile.picture?.cached_url ||
      profile.picture?.url ||
      profile.photo_url ||
      profile.profile_pic_url_hd ||
      profile.profile_pic_url
  );
  const photoLocalPath = normalizeMachineText(profile.picture?.local_path || profile.picture_local_path);
  const followers = normalizeInteger(profile.followers, 0);
  const following = normalizeInteger(profile.following, 0);
  const postCount = normalizeInteger(profile.post_count, 0);
  const postsFetched = normalizeInteger(profile.posts_fetched, 0);
  const isVerified = Boolean(profile.is_verified);
  const enrichedAt = options.enrichedAt || nowIso();

  db.prepare(
    `
    INSERT INTO crm_contact_enrichments (
      contact_id, source, status, handle, full_name, bio, external_url,
      profile_url, photo_url, photo_local_path, followers, following, post_count, posts_fetched,
      is_verified, raw_payload_json, enriched_at
    ) VALUES (?, 'instagram_profile', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(contact_id, source) DO UPDATE SET
      status = excluded.status,
      handle = excluded.handle,
      full_name = excluded.full_name,
      bio = excluded.bio,
      external_url = excluded.external_url,
      profile_url = excluded.profile_url,
      photo_url = excluded.photo_url,
      photo_local_path = excluded.photo_local_path,
      followers = excluded.followers,
      following = excluded.following,
      post_count = excluded.post_count,
      posts_fetched = excluded.posts_fetched,
      is_verified = excluded.is_verified,
      raw_payload_json = excluded.raw_payload_json,
      enriched_at = excluded.enriched_at
  `
  ).run(
    contactId,
    options.status || "ok",
    handle,
    fullName,
    bio,
    externalUrl,
    profileUrl,
    photoUrl,
    photoLocalPath,
    followers,
    following,
    postCount,
    postsFetched,
    isVerified ? 1 : 0,
    JSON.stringify(profile || {}),
    enrichedAt
  );

  const names = fullName ? splitFullName(fullName, null, null) : null;
  const nextFirstName = existing.first_name || names?.firstName || null;
  const nextLastName = existing.last_name || names?.lastName || null;
  const nextFullName = existing.full_name || names?.fullName || fullName || null;
  const nextHandle = existing.instagram_handle || handle || null;
  const changed =
    nextFirstName !== existing.first_name ||
    nextLastName !== existing.last_name ||
    nextFullName !== existing.full_name ||
    nextHandle !== existing.instagram_handle;

  if (changed) {
    snapshotContact(db, contactId, options.reason || "instagram_enrichment");
    db.prepare(
      `
      UPDATE crm_contacts
      SET first_name = ?, last_name = ?, full_name = ?, instagram_handle = ?, updated_at = ?
      WHERE id = ?
    `
    ).run(nextFirstName, nextLastName, nextFullName, nextHandle, enrichedAt, contactId);
  }

  const preferredProject = normalizeProjectName(options.project);
  if (preferredProject) {
    upsertProjectState(db, contactId, preferredProject, existing.status || "new", {
      touchedAt: enrichedAt,
    });
  }

  applyEnrichedContactFields(
    db,
    contactId,
    {
      business_description: profile.business_description || bio,
      industry: profile.industry,
      location: profile.location,
      biggest_needs: profile.biggest_needs,
    },
    options.fieldSource || "instagram_profile",
    { updatedAt: enrichedAt, reason: options.reason || "instagram_enrichment_fields" }
  );

  return getContactDetail(contactId);
}

function saveContactPhoto(contactId, photoLocalPath) {
  const db = getDb(false);
  bootstrapSettings(db);
  const existing = db.prepare("SELECT * FROM crm_contacts WHERE id = ?").get(contactId);
  if (!existing) {
    throw new Error(`CRM contact not found: ${contactId}`);
  }
  const normalizedPath = normalizeMachineText(photoLocalPath);
  if (!normalizedPath) {
    throw new Error("Photo path is required");
  }
  const enrichedAt = nowIso();
  db.prepare(
    `
    INSERT INTO crm_contact_enrichments (
      contact_id, source, status, handle, full_name, bio, external_url,
      profile_url, photo_url, photo_local_path, followers, following, post_count, posts_fetched,
      is_verified, raw_payload_json, enriched_at
    ) VALUES (?, 'manual_photo', 'ok', NULL, NULL, NULL, NULL, NULL, NULL, ?, 0, 0, 0, 0, 0, ?, ?)
    ON CONFLICT(contact_id, source) DO UPDATE SET
      photo_local_path = excluded.photo_local_path,
      raw_payload_json = excluded.raw_payload_json,
      enriched_at = excluded.enriched_at
  `
  ).run(
    contactId,
    normalizedPath,
    JSON.stringify({ source: "manual_photo", photo_local_path: normalizedPath }),
    enrichedAt
  );
  db.prepare("UPDATE crm_contacts SET updated_at = ? WHERE id = ?").run(enrichedAt, contactId);
  return getContactDetail(contactId);
}

function updateContact(contactId, patch = {}) {
  const db = getDb(false);
  bootstrapSettings(db);
  const existing = db.prepare("SELECT * FROM crm_contacts WHERE id = ?").get(contactId);
  if (!existing) {
    throw new Error(`CRM contact not found: ${contactId}`);
  }

  let automationStageChange = null;
  const normalized = {};
  const instagramFieldPresent =
    "instagram_handle" in patch || "instagram_profile_url" in patch;
  if ("email" in patch || "primary_email" in patch) {
    normalized.primary_email = lenientEmail(patch.primary_email || patch.email);
  }
  if ("phone" in patch || "primary_phone" in patch) {
    normalized.primary_phone = normalizeMachineText(patch.primary_phone || patch.phone);
  }
  const names = splitFullName(
    patch.full_name || existing.full_name,
    patch.first_name,
    patch.last_name
  );
  if ("first_name" in patch || "last_name" in patch || "full_name" in patch) {
    normalized.first_name = names.firstName;
    normalized.last_name = names.lastName;
    normalized.full_name = names.fullName;
  }
  if (instagramFieldPresent) {
    const instagram = normalizeInstagramFields(
      patch.instagram_handle,
      patch.instagram_profile_url
    );
    normalized.instagram_handle = instagram.instagram_handle;
    normalized.instagram_profile_url = instagram.instagram_profile_url;
  }
  if ("tiktok_url" in patch) {
    normalized.tiktok_url = lenientUrl(patch.tiktok_url);
  }
  if ("owner" in patch) {
    normalized.owner = normalizeMachineText(patch.owner);
  }
  if ("notes" in patch) {
    normalized.notes = normalizeMachineText(patch.notes);
  }
  if ("primary_project" in patch || "project" in patch) {
    normalized.primary_project = normalizeProjectName(
      patch.primary_project || patch.project || existing.primary_project || PRIMARY_PROJECT_DEFAULT
    );
  }
  if ("next_step" in patch) {
    normalized.next_step = normalizeLongText(patch.next_step);
  }
  if ("willing_to_pay" in patch) {
    normalized.willing_to_pay = normalizeMoneyNumber(patch.willing_to_pay);
  }
  if ("pipeline_affiliate_id" in patch || "affiliate_id" in patch) {
    normalized.pipeline_affiliate_id = normalizeAffiliateId(
      patch.pipeline_affiliate_id || patch.affiliate_id
    );
  }
  if ("communication_channel" in patch) {
    normalized.communication_channel = normalizeCommunicationChannel(patch.communication_channel);
  }
  if ("lost_reason" in patch) {
    normalized.lost_reason = normalizeDeclinedReason(patch.lost_reason);
  }
  for (const fieldName of getManagedDetailFields()) {
    if (!(fieldName in patch)) continue;
    normalized[fieldName] =
      fieldName === "business_description" || fieldName === "biggest_needs"
        ? normalizeLongText(patch[fieldName])
        : normalizeMachineText(patch[fieldName]);
    normalized[`${fieldName}_source`] = normalized[fieldName] ? "manual" : null;
    normalized[`${fieldName}_is_manual`] = normalized[fieldName] ? 1 : 0;
  }
  const projectNames =
    "projects" in patch
      ? setProjectMemberships(
          db,
          contactId,
          Array.isArray(patch.projects) ? patch.projects : [],
          patch.project_membership_status || "new"
        )
      : null;
  if ("project" in patch || "primary_project" in patch) {
    const projectName = normalized.primary_project;
    if (projectName) {
      addProjectMembership(db, contactId, projectName, patch.status || existing.status || "new");
    }
  }
  if (patch.project_state && typeof patch.project_state === "object") {
    const stateProject = normalizeProjectName(patch.project_state.project || patch.project_state.project_name);
    const stateStatus =
      patch.project_state.status || patch.project_state.pipeline_status || existing.status;
    if (stateProject) {
      const priorProjectState = getContactProjectState(db, contactId, stateProject);
      upsertProjectState(db, contactId, stateProject, stateStatus, {
        touchedAt: patch.project_state.touched_at || nowIso(),
        sortOrder: patch.project_state.sort_order,
      });
      reorderProjectCard(db, contactId, stateProject, stateStatus, {
        beforeContactId: patch.project_state.before_contact_id,
        afterContactId: patch.project_state.after_contact_id,
      });
      if (
        stateProject === PIPELINE_PROJECT &&
        normalizePipelineStatus(stateStatus) === "lost" &&
        !normalized.lost_reason
      ) {
        normalized.lost_reason = normalizeDeclinedReason(patch.lost_reason);
      }
      const normalizedNextStage =
        stateProject === PIPELINE_PROJECT
          ? normalizePipelineStatus(stateStatus)
          : normalizeMachineText(stateStatus);
      const normalizedPreviousStage =
        stateProject === PIPELINE_PROJECT
          ? normalizePipelineStatus(priorProjectState?.pipeline_status)
          : normalizeMachineText(priorProjectState?.pipeline_status);
      if (normalizedNextStage && normalizedPreviousStage !== normalizedNextStage) {
        automationStageChange = {
          contact_id: contactId,
          project_name: stateProject,
          from_stage: normalizedPreviousStage,
          to_stage: normalizedNextStage,
          changed_at: patch.project_state.touched_at || nowIso(),
        };
      }
    }
  }

  snapshotContact(db, contactId, patch.reason || "manual_update");

  if (normalized.primary_email && normalized.primary_email !== existing.primary_email) {
    insertAlias(db, contactId, "email", existing.primary_email);
  }
  if (normalized.primary_phone && normalized.primary_phone !== existing.primary_phone) {
    insertAlias(db, contactId, "phone", existing.primary_phone);
  }

  const nextStatus = patch.status && STATUSES.includes(patch.status) ? patch.status : existing.status;
  if (nextStatus !== existing.status) {
    recordPipelineChange(db, contactId, existing.status, nextStatus, "manual", patch.reason || null);
  }

  const funnelLabel =
    patch.funnel_label_key && APPROVED_LABELS[patch.funnel_label_key]
      ? patch.funnel_label_key
      : existing.funnel_label_key;

  db.prepare(
    `
    UPDATE crm_contacts
    SET first_name = ?, last_name = ?, full_name = ?, primary_email = ?,
        primary_phone = ?, instagram_handle = ?, instagram_profile_url = ?, tiktok_url = ?, status = ?, priority = ?,
        owner = ?, notes = ?, location = ?, location_source = ?, location_is_manual = ?,
        primary_project = ?, next_step = ?, willing_to_pay = ?, pipeline_affiliate_id = ?, communication_channel = ?, lost_reason = ?,
        industry = ?, industry_source = ?, industry_is_manual = ?,
        business_description = ?, business_description_source = ?, business_description_is_manual = ?,
        biggest_needs = ?, biggest_needs_source = ?, biggest_needs_is_manual = ?,
        funnel_label_key = ?, review_needed = ?,
        updated_at = ?
    WHERE id = ?
  `
  ).run(
    normalized.first_name !== undefined ? normalized.first_name : existing.first_name,
    normalized.last_name !== undefined ? normalized.last_name : existing.last_name,
    normalized.full_name !== undefined ? normalized.full_name : existing.full_name,
    normalized.primary_email !== undefined ? normalized.primary_email : existing.primary_email,
    normalized.primary_phone !== undefined ? normalized.primary_phone : existing.primary_phone,
    normalized.instagram_handle !== undefined ? normalized.instagram_handle : existing.instagram_handle,
    normalized.instagram_profile_url !== undefined
      ? normalized.instagram_profile_url
      : existing.instagram_profile_url,
    normalized.tiktok_url !== undefined ? normalized.tiktok_url : existing.tiktok_url,
    nextStatus,
    Number.isFinite(Number(patch.priority)) ? Number(patch.priority) : existing.priority,
    normalized.owner !== undefined ? normalized.owner : existing.owner,
    normalized.notes !== undefined ? normalized.notes : existing.notes,
    normalized.location !== undefined ? normalized.location : existing.location,
    normalized.location_source !== undefined ? normalized.location_source : existing.location_source,
    normalized.location_is_manual !== undefined
      ? normalized.location_is_manual
      : existing.location_is_manual,
    normalized.primary_project !== undefined
      ? normalized.primary_project
      : existing.primary_project || PRIMARY_PROJECT_DEFAULT,
    normalized.next_step !== undefined ? normalized.next_step : existing.next_step,
    normalized.willing_to_pay !== undefined ? normalized.willing_to_pay : existing.willing_to_pay,
    normalized.pipeline_affiliate_id !== undefined
      ? normalized.pipeline_affiliate_id
      : existing.pipeline_affiliate_id,
    normalized.communication_channel !== undefined
      ? normalized.communication_channel
      : existing.communication_channel || inferCommunicationChannel(null, existing.source_latest || existing.source_first),
    normalized.lost_reason !== undefined ? normalized.lost_reason : existing.lost_reason,
    normalized.industry !== undefined ? normalized.industry : existing.industry,
    normalized.industry_source !== undefined ? normalized.industry_source : existing.industry_source,
    normalized.industry_is_manual !== undefined
      ? normalized.industry_is_manual
      : existing.industry_is_manual,
    normalized.business_description !== undefined
      ? normalized.business_description
      : existing.business_description,
    normalized.business_description_source !== undefined
      ? normalized.business_description_source
      : existing.business_description_source,
    normalized.business_description_is_manual !== undefined
      ? normalized.business_description_is_manual
      : existing.business_description_is_manual,
    normalized.biggest_needs !== undefined ? normalized.biggest_needs : existing.biggest_needs,
    normalized.biggest_needs_source !== undefined
      ? normalized.biggest_needs_source
      : existing.biggest_needs_source,
    normalized.biggest_needs_is_manual !== undefined
      ? normalized.biggest_needs_is_manual
      : existing.biggest_needs_is_manual,
    funnelLabel,
    patch.review_needed === undefined ? existing.review_needed : patch.review_needed ? 1 : 0,
    nowIso(),
    contactId
  );

  if (projectNames && projectNames.length > 0) {
    for (const projectName of projectNames) {
      upsertProjectState(db, contactId, projectName, nextStatus, {
        touchedAt: nowIso(),
      });
    }
  }

  if (
    (normalized.primary_project || existing.primary_project || PRIMARY_PROJECT_DEFAULT) ===
    PIPELINE_PROJECT
  ) {
    ensurePipelineProjectState(
      db,
      contactId,
      patch.project_state?.status || patch.pipeline_status || null
    );
  }

  if (automationStageChange) {
    triggerAutomationForStageChange(db, automationStageChange);
  }

  return getContactDetail(contactId);
}

function deleteContact(contactId) {
  const db = getDb(false);
  bootstrapSettings(db);
  const existing = db.prepare("SELECT id FROM crm_contacts WHERE id = ?").get(contactId);
  if (!existing) {
    throw new Error(`CRM contact not found: ${contactId}`);
  }

  db.prepare("DELETE FROM crm_contact_aliases WHERE contact_id = ?").run(contactId);
  db.prepare("DELETE FROM crm_contact_versions WHERE contact_id = ?").run(contactId);
  db.prepare("DELETE FROM crm_lead_events WHERE contact_id = ?").run(contactId);
  db.prepare("DELETE FROM crm_pipeline_history WHERE contact_id = ?").run(contactId);
  db.prepare("DELETE FROM crm_contact_projects WHERE contact_id = ?").run(contactId);
  db.prepare("DELETE FROM crm_sync_destinations WHERE contact_id = ?").run(contactId);
  db.prepare("DELETE FROM crm_contact_funnel_labels WHERE contact_id = ?").run(contactId);
  db.prepare("DELETE FROM crm_contact_enrichments WHERE contact_id = ?").run(contactId);
  db.prepare("DELETE FROM crm_automation_delivery_attempts WHERE delivery_id IN (SELECT id FROM crm_automation_delivery_queue WHERE contact_id = ?)").run(contactId);
  db.prepare("DELETE FROM crm_automation_delivery_queue WHERE contact_id = ?").run(contactId);
  db.prepare("DELETE FROM crm_automation_approval_queue WHERE contact_id = ?").run(contactId);
  db.prepare("DELETE FROM crm_automation_runs WHERE contact_id = ?").run(contactId);
  db.prepare("DELETE FROM crm_contacts WHERE id = ?").run(contactId);

  return { ok: true, id: contactId };
}

function replaceManualLabels(db, contactId, labels, funnelLabel) {
  const requested = new Set(
    (Array.isArray(labels) ? labels : [])
      .filter((label) => APPROVED_LABELS[label])
      .map((label) => String(label))
  );
  if (funnelLabel && APPROVED_LABELS[funnelLabel]) {
    requested.add(funnelLabel);
  }

  db.prepare("DELETE FROM crm_contact_funnel_labels WHERE contact_id = ?").run(contactId);
  for (const labelKey of requested) {
    const config = APPROVED_LABELS[labelKey];
    db.prepare(
      `
      INSERT INTO crm_contact_funnel_labels (contact_id, label_key, label_role, assigned_by_rule)
      VALUES (?, ?, ?, 'manual')
    `
    ).run(contactId, labelKey, config.role);
  }
}

function getPipelineBoard(options = {}) {
  const selectedProject = normalizeProjectName(options.project);
  const { contacts, summary, affiliates, activeProject, stageAutomationMap, allStatuses } = listContacts({
    sort: "updated_desc",
    project: selectedProject || "",
    search: options.search || "",
  });
  const db = getDb(false);
  if (!db) {
    return {
      grouped: {},
      summary,
      project: selectedProject,
      activeProject,
      statuses: selectedProject === PIPELINE_PROJECT ? [...PIPELINE_BOARD_STATUSES] : [...STATUSES],
      allStatuses,
      stageAutomationMap,
      projectCatalog: getProjectCatalog(),
      affiliates,
    };
  }
  bootstrapSettings(db);
  const grouped = {};
  const statuses =
    selectedProject === PIPELINE_PROJECT
      ? getProjectBoardStatuses(db, selectedProject)
      : [...STATUSES];
  for (const status of statuses) grouped[status] = [];
  for (const contact of contacts) {
    const status = selectedProject ? contact.project_state || contact.status : contact.status;
    if (!(status in grouped)) continue;
    grouped[status].push(contact);
  }
  return {
    grouped,
    summary,
    project: selectedProject,
    activeProject,
    statuses,
    allStatuses,
    stageAutomationMap,
    projectCatalog: getProjectCatalog(),
    affiliates,
  };
}

function getSettingsSnapshot() {
  const db = getDb(false);
  bootstrapSettings(db);
  const enabledKeys = new Set(getApprovedLabelKeys(db));
  const approved = Object.entries(APPROVED_LABELS).map(([key, value]) => ({
    key,
    role: value.role,
    displayName: value.displayName,
    enabled: enabledKeys.has(key),
    existsInCatalog: true,
  }));
  return {
    approvedLabels: approved,
    projectCatalog: getProjectCatalog(),
    affiliates: listPipelineAffiliates(db),
    defaults: {
      sort: getSetting(db, "crm.default_sort", "updated_desc"),
    },
    pipeline: getPipelineConfig(db, PIPELINE_PROJECT),
    automation: getAutomationSettings(db),
    legacy: auditLegacyStores(),
  };
}

function auditLegacyStores() {
  const result = {
    crmJson: { exists: fs.existsSync(CRM_JSON_PATH), count: 0 },
    chatWidgetLeads: { exists: fs.existsSync(INSTAGRAM_DB_PATH), count: 0 },
  };
  if (result.crmJson.exists) {
    try {
      const raw = JSON.parse(fs.readFileSync(CRM_JSON_PATH, "utf8"));
      result.crmJson.count = Array.isArray(raw) ? raw.length : 0;
    } catch {
      result.crmJson.count = 0;
    }
  }
  if (result.chatWidgetLeads.exists) {
    try {
      const db = new Database(INSTAGRAM_DB_PATH, { readonly: true });
      result.chatWidgetLeads.count = db
        .prepare("SELECT COUNT(*) AS count FROM chat_widget_leads")
        .get().count;
      db.close();
    } catch {
      result.chatWidgetLeads.count = 0;
    }
  }
  return result;
}

function listRecentLeads(limit = 50) {
  const db = getDb(false);
  if (!db) return [];
  bootstrapSettings(db);
  return db
    .prepare(
      `
      WITH latest_events AS (
        SELECT e1.*
        FROM crm_lead_events e1
        JOIN (
          SELECT contact_id, MAX(captured_at) AS max_captured_at
          FROM crm_lead_events
          GROUP BY contact_id
        ) latest
          ON latest.contact_id = e1.contact_id AND latest.max_captured_at = e1.captured_at
      )
      SELECT
        c.id,
        c.first_name,
        c.last_name,
        c.full_name,
        c.primary_email AS email,
        c.primary_phone AS phone,
        c.source_latest,
        c.funnel_label_key,
        c.review_needed,
        c.updated_at,
        le.campaign,
        le.keyword
      FROM crm_contacts c
      LEFT JOIN latest_events le ON le.contact_id = c.id
      ORDER BY c.updated_at DESC
      LIMIT ?
    `
    )
    .all(limit)
    .map((row) => ({
      ...row,
      review_needed: Boolean(row.review_needed),
    }));
}

function createPipelineAffiliate(input = {}) {
  const db = getDb(false);
  bootstrapSettings(db);
  const firstName = normalizeNamePart(input.first_name);
  if (!firstName) {
    throw new Error("Affiliate first name is required");
  }
  const lastName = normalizeNamePart(input.last_name);
  const email = lenientEmail(input.email);
  const commissionPercentage = normalizeMoneyNumber(input.commission_percentage);
  const paypalEmail = lenientEmail(input.paypal_email);
  const wiseUrl = lenientUrl(input.wise_url);
  const bankTransferInfo = normalizeLongText(input.bank_transfer_info);
  const preferredPaymentMethod = normalizePreferredPaymentMethod(input.preferred_payment_method);
  if (commissionPercentage === null) {
    throw new Error("Commission percentage is required");
  }
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  db.prepare(
    `
    INSERT INTO crm_pipeline_affiliates (
      id, first_name, last_name, email, commission_percentage, paypal_email, wise_url,
      bank_transfer_info, preferred_payment_method, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    firstName,
    lastName || null,
    email,
    commissionPercentage,
    paypalEmail,
    wiseUrl,
    bankTransferInfo,
    preferredPaymentMethod,
    timestamp,
    timestamp
  );
  return listPipelineAffiliates(db).find((affiliate) => affiliate.id === id) || null;
}

function updatePipelineAffiliate(id, input = {}) {
  const db = getDb(false);
  bootstrapSettings(db);
  const existing = db.prepare("SELECT * FROM crm_pipeline_affiliates WHERE id = ?").get(id);
  if (!existing) {
    throw new Error("Affiliate not found");
  }

  const next = {
    first_name:
      Object.prototype.hasOwnProperty.call(input, "first_name")
        ? normalizeNamePart(input.first_name)
        : existing.first_name,
    last_name:
      Object.prototype.hasOwnProperty.call(input, "last_name")
        ? normalizeNamePart(input.last_name)
        : existing.last_name,
    email:
      Object.prototype.hasOwnProperty.call(input, "email")
        ? lenientEmail(input.email)
        : existing.email,
    commission_percentage:
      Object.prototype.hasOwnProperty.call(input, "commission_percentage")
        ? normalizeMoneyNumber(input.commission_percentage)
        : Number(existing.commission_percentage),
    paypal_email:
      Object.prototype.hasOwnProperty.call(input, "paypal_email")
        ? lenientEmail(input.paypal_email)
        : existing.paypal_email,
    wise_url:
      Object.prototype.hasOwnProperty.call(input, "wise_url")
        ? lenientUrl(input.wise_url)
        : existing.wise_url,
    bank_transfer_info:
      Object.prototype.hasOwnProperty.call(input, "bank_transfer_info")
        ? normalizeLongText(input.bank_transfer_info)
        : existing.bank_transfer_info,
    preferred_payment_method:
      Object.prototype.hasOwnProperty.call(input, "preferred_payment_method")
        ? normalizePreferredPaymentMethod(input.preferred_payment_method)
        : existing.preferred_payment_method,
  };

  if (!next.first_name) {
    throw new Error("Affiliate first name is required");
  }
  if (next.commission_percentage === null) {
    throw new Error("Commission percentage is required");
  }

  db.prepare(
    `
    UPDATE crm_pipeline_affiliates
    SET first_name = ?, last_name = ?, email = ?, commission_percentage = ?, paypal_email = ?,
        wise_url = ?, bank_transfer_info = ?, preferred_payment_method = ?, updated_at = ?
    WHERE id = ?
  `
  ).run(
    next.first_name,
    next.last_name || null,
    next.email || null,
    next.commission_percentage,
    next.paypal_email || null,
    next.wise_url || null,
    next.bank_transfer_info || null,
    next.preferred_payment_method || null,
    nowIso(),
    id
  );

  return listPipelineAffiliates(db).find((affiliate) => affiliate.id === id) || null;
}

function deletePipelineAffiliate(id) {
  const db = getDb(false);
  bootstrapSettings(db);
  const existing = db.prepare("SELECT id FROM crm_pipeline_affiliates WHERE id = ?").get(id);
  if (!existing) {
    throw new Error("Affiliate not found");
  }
  db.prepare("UPDATE crm_contacts SET pipeline_affiliate_id = NULL WHERE pipeline_affiliate_id = ?").run(id);
  db.prepare("DELETE FROM crm_pipeline_affiliates WHERE id = ?").run(id);
  return { deleted: true };
}

// ── Affiliate Payouts ─────────────────────────────────────────────────────────

function listAffiliatePayouts(affiliateId) {
  const db = getDb(false);
  bootstrapSettings(db);
  const rows = db
    .prepare("SELECT * FROM crm_affiliate_payouts WHERE affiliate_id = ? ORDER BY paid_at DESC, created_at DESC")
    .all(affiliateId);
  return rows.map((r) => ({ ...r, amount_cents: Number(r.amount_cents) }));
}

function createAffiliatePayout(input = {}) {
  const db = getDb(false);
  bootstrapSettings(db);
  if (!input.affiliate_id) throw new Error("affiliate_id is required");
  const affiliate = db.prepare("SELECT id FROM crm_pipeline_affiliates WHERE id = ?").get(input.affiliate_id);
  if (!affiliate) throw new Error("Affiliate not found");
  if (input.amount_cents === undefined || input.amount_cents === null) throw new Error("amount_cents is required");
  if (!input.paid_at) throw new Error("paid_at is required");
  const amount_cents = Math.round(Number(input.amount_cents));
  if (!Number.isFinite(amount_cents) || amount_cents <= 0) throw new Error("amount_cents must be a positive number");
  const status = input.status === "pending" ? "pending" : "paid";
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO crm_affiliate_payouts (id, affiliate_id, amount_cents, paid_at, note, status) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, input.affiliate_id, amount_cents, String(input.paid_at), input.note || null, status);
  return listAffiliatePayouts(input.affiliate_id).find((p) => p.id === id);
}

function updateAffiliatePayout(id, input = {}) {
  const db = getDb(false);
  bootstrapSettings(db);
  const existing = db.prepare("SELECT * FROM crm_affiliate_payouts WHERE id = ?").get(id);
  if (!existing) throw new Error("Payout not found");
  const amount_cents = input.amount_cents !== undefined
    ? Math.round(Number(input.amount_cents))
    : existing.amount_cents;
  if (!Number.isFinite(amount_cents) || amount_cents <= 0) throw new Error("amount_cents must be a positive number");
  const paid_at = input.paid_at !== undefined ? String(input.paid_at) : existing.paid_at;
  const note = input.note !== undefined ? (input.note || null) : existing.note;
  const status = input.status === "pending" || input.status === "paid" ? input.status : existing.status;
  db.prepare(
    "UPDATE crm_affiliate_payouts SET amount_cents = ?, paid_at = ?, note = ?, status = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(amount_cents, paid_at, note, status, id);
  return listAffiliatePayouts(existing.affiliate_id).find((p) => p.id === id);
}

function deleteAffiliatePayout(id) {
  const db = getDb(false);
  bootstrapSettings(db);
  const existing = db.prepare("SELECT id FROM crm_affiliate_payouts WHERE id = ?").get(id);
  if (!existing) throw new Error("Payout not found");
  db.prepare("DELETE FROM crm_affiliate_payouts WHERE id = ?").run(id);
  return { deleted: true };
}

function logCommunication(contactId, { channel, direction = "outbound", note = null, contacted_at = null }) {
  const db = getDb(false);
  if (!db) throw new Error("Database unavailable");
  bootstrapSettings(db);
  const contact = db.prepare("SELECT id FROM crm_contacts WHERE id = ?").get(contactId);
  if (!contact) throw new Error("Contact not found");
  const ts = contacted_at || nowIso();
  db.prepare(
    `INSERT INTO crm_contact_communications (contact_id, channel, direction, note, contacted_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(contactId, channel, direction, note, ts, nowIso());
  const maxTs = db
    .prepare("SELECT MAX(contacted_at) AS m FROM crm_contact_communications WHERE contact_id = ?")
    .get(contactId);
  db.prepare("UPDATE crm_contacts SET last_contacted_at = ?, updated_at = ? WHERE id = ?").run(
    maxTs?.m || ts,
    nowIso(),
    contactId
  );
  return getContactDetail(contactId);
}

function updateCommunication(communicationId, contactId, { channel, direction, note, contacted_at }) {
  const db = getDb(false);
  if (!db) throw new Error("Database unavailable");
  bootstrapSettings(db);
  const existing = db.prepare("SELECT id FROM crm_contact_communications WHERE id = ? AND contact_id = ?").get(communicationId, contactId);
  if (!existing) throw new Error("Communication not found");
  db.prepare(
    `UPDATE crm_contact_communications
     SET channel = ?, direction = ?, note = ?, contacted_at = ?
     WHERE id = ? AND contact_id = ?`
  ).run(channel, direction || "outbound", note || null, contacted_at || nowIso(), communicationId, contactId);
  const maxTs = db
    .prepare("SELECT MAX(contacted_at) AS m FROM crm_contact_communications WHERE contact_id = ?")
    .get(contactId);
  db.prepare("UPDATE crm_contacts SET last_contacted_at = ?, updated_at = ? WHERE id = ?").run(
    maxTs?.m || null,
    nowIso(),
    contactId
  );
  return getContactDetail(contactId);
}

function deleteCommunication(communicationId, contactId) {
  const db = getDb(false);
  if (!db) throw new Error("Database unavailable");
  bootstrapSettings(db);
  db.prepare("DELETE FROM crm_contact_communications WHERE id = ? AND contact_id = ?").run(
    communicationId,
    contactId
  );
  const maxTs = db
    .prepare("SELECT MAX(contacted_at) AS m FROM crm_contact_communications WHERE contact_id = ?")
    .get(contactId);
  db.prepare("UPDATE crm_contacts SET last_contacted_at = ?, updated_at = ? WHERE id = ?").run(
    maxTs?.m || null,
    nowIso(),
    contactId
  );
  return getContactDetail(contactId);
}

function deleteLegacyCrmJsonIfEmpty() {
  if (!fs.existsSync(CRM_JSON_PATH)) return false;
  try {
    const raw = JSON.parse(fs.readFileSync(CRM_JSON_PATH, "utf8"));
    if (Array.isArray(raw) && raw.length === 0) {
      fs.unlinkSync(CRM_JSON_PATH);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

module.exports = {
  APPROVED_LABELS,
  STATUSES,
  SORT_OPTIONS,
  applyInstagramEnrichment,
  auditLegacyStores,
  createPipelineAffiliate,
  updatePipelineAffiliate,
  deletePipelineAffiliate,
  listAffiliatePayouts,
  createAffiliatePayout,
  updateAffiliatePayout,
  deleteAffiliatePayout,
  deleteCommunication,
  deleteContact,
  deleteLegacyCrmJsonIfEmpty,
  logCommunication,
  updateCommunication,
  getContactDetail,
  getDb,
  getAutomationSettingsSnapshot,
  getProjectCatalog,
  listAutomationProjects,
  listInstagramEnrichmentCandidates,
  listAutomationApprovalItems,
  listAutomationDeliveries,
  listAutomationRules,
  listAutomationRuns,
  listAutomationTemplates,
  addPipelineColumn,
  deletePipelineColumn,
  getPipelineBoard,
  getPipelineConfigSnapshot,
  getSettingsSnapshot,
  ingestLead,
  listContacts,
  listPipelineAffiliates,
  listRecentLeads,
  saveContactPhoto,
  normalizePayload,
  applyEnrichedContactFields,
  saveAutomationRule,
  saveAutomationTemplate,
  sendAutomationTestEmail,
  getConfiguredEmailProviders,
  getMarketingEmailProvider,
  getSelectedEmailProvider,
  listEmailProviders,
  resolveEmailProviders,
  sendEmailViaProvider,
  sendSmtpMail,
  buildMimeMessage,
  setApprovedLabelKeys,
  setAutomationSettings,
  tickAutomationQueues,
  renamePipelineColumn,
  approveAutomationItem,
  cancelAutomationItem,
  updateAutomationApprovalItem,
  deleteAutomationRule,
  deleteAutomationTemplate,
  updateContact,
};
