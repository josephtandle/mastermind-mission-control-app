"use strict";

// Duplicate contact detection and merge for the CRM.
//
// Contacts are grouped when they share a normalized full name, a phone or
// WhatsApp number (digits only, last 9+ digits compared) or an email
// (lowercased, trimmed). Grouping is transitive. Each group merges into its
// oldest contact: empty survivor fields are filled from the others (a
// non-empty value is never overwritten, notes are concatenated), every row in
// every table with a contact_id or *_contact_id column is repointed to the
// survivor, and the merged-away contacts are deleted. The full original row
// of each merged-away contact, plus any dependent row that could not be
// repointed because the survivor already had an equivalent one, is written to
// crm_contact_merges first, so nothing is lost without a record.
//
// Groups whose members sit in different pipeline statuses in the same
// project are not merged; they are reported as needs_review. A member still in
// the default "new" status does not count as a conflict: the survivor simply
// takes the further-along status.

const NOTES_SEPARATOR = "\n\n--- merged ---\n\n";
const DEFAULT_STATUS = "new";
const PROTECTED_COLUMNS = new Set(["id", "created_at", "updated_at", "notes", "status"]);

function getCrm() {
  return require("./crm");
}

const quote = (name) => `"${String(name).replace(/"/g, '""')}"`;

function normalizeName(value) {
  const text = String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
  return text || null;
}

function normalizePhoneKey(value) {
  const digits = String(value || "").replace(/\D+/g, "");
  if (digits.length < 9) return null;
  return digits.slice(-9);
}

function normalizeEmailKey(value) {
  const text = String(value || "").trim().toLowerCase();
  return text.includes("@") ? text : null;
}

function isEmpty(value) {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

function ensureMergeTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_contact_merges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      survivor_id TEXT NOT NULL,
      merged_contact_id TEXT NOT NULL,
      matched_on TEXT,
      original_json TEXT NOT NULL,
      dropped_rows_json TEXT,
      merged_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_crm_contact_merges_survivor ON crm_contact_merges(survivor_id);
  `);
}

// Every (table, column) pair that points at a contact.
function discoverContactColumns(db) {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((row) => row.name)
    .filter((name) => name !== "crm_contacts" && name !== "crm_contact_merges");
  const pairs = [];
  for (const table of tables) {
    for (const column of db.prepare(`PRAGMA table_info(${quote(table)})`).all()) {
      if (column.name === "contact_id" || /_contact_id$/.test(column.name)) pairs.push({ table, column: column.name });
    }
  }
  return pairs;
}

function findDuplicateGroups(db) {
  const contacts = db
    .prepare("SELECT id, full_name, first_name, last_name, primary_email, primary_phone, created_at FROM crm_contacts")
    .all();
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const aliasRows = db
    .prepare("SELECT contact_id, alias_type, alias_value FROM crm_contact_aliases")
    .all()
    .filter((row) => byId.has(row.contact_id));

  const parent = new Map(contacts.map((c) => [c.id, c.id]));
  const find = (id) => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    let cur = id;
    while (parent.get(cur) !== root) { const next = parent.get(cur); parent.set(cur, root); cur = next; }
    return root;
  };
  const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(rb, ra); };

  const keyOwners = new Map();
  const reasons = new Map();
  const addKey = (key, id) => {
    if (!key) return;
    const owner = keyOwners.get(key);
    if (owner === undefined) { keyOwners.set(key, id); return; }
    if (owner !== id) {
      union(owner, id);
      const kind = key.split(":")[0];
      reasons.set(id, new Set([...(reasons.get(id) || []), kind]));
      reasons.set(owner, new Set([...(reasons.get(owner) || []), kind]));
    }
  };

  for (const c of contacts) {
    const name = normalizeName(c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" "));
    if (name) addKey(`name:${name}`, c.id);
    const phone = normalizePhoneKey(c.primary_phone);
    if (phone) addKey(`phone:${phone}`, c.id);
    const email = normalizeEmailKey(c.primary_email);
    if (email) addKey(`email:${email}`, c.id);
  }
  for (const a of aliasRows) {
    const type = String(a.alias_type || "").toLowerCase();
    if (type.includes("email")) {
      const email = normalizeEmailKey(a.alias_value);
      if (email) addKey(`email:${email}`, a.contact_id);
    } else if (type.includes("phone") || type.includes("whatsapp") || type === "wa_jid") {
      const phone = normalizePhoneKey(String(a.alias_value).split("@")[0]);
      if (phone) addKey(`phone:${phone}`, a.contact_id);
    }
  }

  const groups = new Map();
  for (const c of contacts) {
    const root = find(c.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(c);
  }
  const result = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    members.sort((x, y) => String(x.created_at || "").localeCompare(String(y.created_at || "")) || String(x.id).localeCompare(String(y.id)));
    const matchedOn = new Set();
    for (const m of members) for (const r of reasons.get(m.id) || []) matchedOn.add(r);
    result.push({ matched_on: [...matchedOn].sort(), contacts: members });
  }
  return result;
}

// Pipeline status conflicts per project, ignoring the default status.
function findStatusConflicts(db, ids) {
  const rows = db
    .prepare(`SELECT contact_id, project_name, pipeline_status FROM crm_contact_projects WHERE contact_id IN (${ids.map(() => "?").join(",")})`)
    .all(...ids);
  const byProject = new Map();
  for (const row of rows) {
    if (!row.pipeline_status || row.pipeline_status === DEFAULT_STATUS) continue;
    if (!byProject.has(row.project_name)) byProject.set(row.project_name, new Set());
    byProject.get(row.project_name).add(row.pipeline_status);
  }
  const conflicts = [];
  for (const [project, statuses] of byProject) if (statuses.size > 1) conflicts.push({ project, statuses: [...statuses].sort() });
  return conflicts;
}

function planGroups(db) {
  return findDuplicateGroups(db).map((group) => {
    const ids = group.contacts.map((c) => c.id);
    const conflicts = findStatusConflicts(db, ids);
    const [survivor, ...losers] = group.contacts;
    return {
      survivor_id: survivor.id,
      survivor_name: survivor.full_name || null,
      merged_ids: losers.map((c) => c.id),
      merged_names: losers.map((c) => c.full_name || null),
      matched_on: group.matched_on,
      status: conflicts.length ? "needs_review" : "ready",
      reason: conflicts.length
        ? conflicts.map((c) => `${c.project}: ${c.statuses.join(" vs ")}`).join("; ")
        : null,
    };
  });
}

function mergeGroup(db, plan, contactColumns) {
  const now = new Date().toISOString();
  const survivorId = plan.survivor_id;
  const contactColumnsInfo = db.prepare("PRAGMA table_info(crm_contacts)").all();
  const tx = db.transaction(() => {
    const survivor = db.prepare("SELECT * FROM crm_contacts WHERE id = ?").get(survivorId);
    if (!survivor) throw new Error(`Survivor not found: ${survivorId}`);
    db.prepare("INSERT INTO crm_contact_versions (contact_id, snapshot_json, reason) VALUES (?, ?, ?)")
      .run(survivorId, JSON.stringify(survivor), "crm_dedupe_pre_merge");
    const fill = {};
    let notes = survivor.notes;

    for (const loserId of plan.merged_ids) {
      const loser = db.prepare("SELECT * FROM crm_contacts WHERE id = ?").get(loserId);
      if (!loser) continue;

      // Carry the further-along status onto the survivor's project row first,
      // so the UNIQUE(contact_id, project_name) conflict below keeps it.
      for (const row of db.prepare("SELECT project_name, pipeline_status FROM crm_contact_projects WHERE contact_id = ?").all(loserId)) {
        const mine = db.prepare("SELECT pipeline_status FROM crm_contact_projects WHERE contact_id = ? AND project_name = ?").get(survivorId, row.project_name);
        if (mine && mine.pipeline_status === DEFAULT_STATUS && row.pipeline_status && row.pipeline_status !== DEFAULT_STATUS) {
          db.prepare("UPDATE crm_contact_projects SET pipeline_status = ?, updated_at = ? WHERE contact_id = ? AND project_name = ?")
            .run(row.pipeline_status, now, survivorId, row.project_name);
        }
      }

      const dropped = [];
      for (const { table, column } of contactColumns) {
        db.prepare(`UPDATE OR IGNORE ${quote(table)} SET ${quote(column)} = ? WHERE ${quote(column)} = ?`).run(survivorId, loserId);
        const leftovers = db.prepare(`SELECT * FROM ${quote(table)} WHERE ${quote(column)} = ?`).all(loserId);
        if (leftovers.length) {
          dropped.push({ table, column, rows: leftovers });
          db.prepare(`DELETE FROM ${quote(table)} WHERE ${quote(column)} = ?`).run(loserId);
        }
      }

      for (const col of contactColumnsInfo) {
        if (PROTECTED_COLUMNS.has(col.name)) continue;
        const current = Object.prototype.hasOwnProperty.call(fill, col.name) ? fill[col.name] : survivor[col.name];
        if (isEmpty(current) && !isEmpty(loser[col.name])) fill[col.name] = loser[col.name];
      }
      if (!isEmpty(loser.notes)) notes = isEmpty(notes) ? loser.notes : `${notes}${NOTES_SEPARATOR}${loser.notes}`;

      const aliasInsert = db.prepare("INSERT OR IGNORE INTO crm_contact_aliases (contact_id, alias_type, alias_value) VALUES (?, ?, ?)");
      aliasInsert.run(survivorId, "merged_contact_id", loserId);
      if (!isEmpty(loser.primary_email)) aliasInsert.run(survivorId, "email", String(loser.primary_email).trim().toLowerCase());
      if (!isEmpty(loser.primary_phone)) aliasInsert.run(survivorId, "phone", String(loser.primary_phone).trim());

      db.prepare("INSERT INTO crm_contact_merges (survivor_id, merged_contact_id, matched_on, original_json, dropped_rows_json, merged_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(survivorId, loserId, plan.matched_on.join(","), JSON.stringify(loser), dropped.length ? JSON.stringify(dropped) : null, now);
      db.prepare("DELETE FROM crm_contacts WHERE id = ?").run(loserId);
    }

    const sets = Object.keys(fill);
    const values = sets.map((name) => fill[name]);
    sets.push("notes", "updated_at");
    values.push(notes, now);
    db.prepare(`UPDATE crm_contacts SET ${sets.map((name) => `${quote(name)} = ?`).join(", ")} WHERE id = ?`).run(...values, survivorId);
  });
  tx.immediate();
}

function scanDuplicates() {
  const db = getCrm().getDb(false);
  try {
    const groups = planGroups(db);
    return { total_groups: groups.length, needs_review: groups.filter((g) => g.status === "needs_review").length, groups };
  } finally {
    db.close();
  }
}

function mergeDuplicates() {
  const db = getCrm().getDb(false);
  try {
    ensureMergeTable(db);
    const contactColumns = discoverContactColumns(db);
    const groups = [];
    let merged = 0;
    let skipped = 0;
    for (const plan of planGroups(db)) {
      if (plan.status === "needs_review") {
        skipped += 1;
        groups.push(plan);
        continue;
      }
      try {
        mergeGroup(db, plan, contactColumns);
        merged += 1;
        groups.push({ ...plan, status: "merged" });
      } catch (error) {
        skipped += 1;
        groups.push({ ...plan, status: "failed", reason: error instanceof Error ? error.message : String(error) });
      }
    }
    return { merged, skipped, groups };
  } finally {
    db.close();
  }
}

module.exports = {
  normalizeName,
  normalizePhoneKey,
  normalizeEmailKey,
  discoverContactColumns,
  findDuplicateGroups,
  planGroups,
  scanDuplicates,
  mergeDuplicates,
};
