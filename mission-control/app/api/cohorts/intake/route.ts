import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import os from "os";

const WS = process.env.GET_SORTED_WORKSPACE || path.join(os.homedir(), ".myos", "workspace");

const DB_PATH = path.join(WS, "data/mastermind-participants.db");

function ensureDir(p: string) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getDb() {
  ensureDir(DB_PATH);
  const db = new Database(DB_PATH);
  initTables(db);
  return db;
}

function clean(value: unknown): string {
  return String(value || "").trim();
}

function normalizePhone(value: unknown): string {
  return clean(value).replace(/\D/g, "");
}

function resolveParticipantId(db: InstanceType<typeof Database>, body: Record<string, any>): number | null {
  if (body.participant_id) return Number(body.participant_id);

  const email = clean(body.email || body.billing_email).toLowerCase();
  if (email) {
    const byEmail = db.prepare("SELECT id FROM participants WHERE lower(email) = ?").get(email) as { id: number } | undefined;
    if (byEmail?.id) return byEmail.id;
  }

  const phone = normalizePhone(body.whatsapp || body.phone);
  if (phone) {
    const rows = db.prepare("SELECT id, whatsapp FROM participants WHERE whatsapp IS NOT NULL AND whatsapp != ''").all() as { id: number; whatsapp: string }[];
    const byPhone = rows.find((row) => normalizePhone(row.whatsapp).endsWith(phone) || phone.endsWith(normalizePhone(row.whatsapp)));
    if (byPhone?.id) return byPhone.id;
  }

  const fullName = clean(body.full_name || body.name).toLowerCase();
  if (fullName) {
    const byName = db.prepare("SELECT id FROM participants WHERE lower(full_name) = ?").get(fullName) as { id: number } | undefined;
    if (byName?.id) return byName.id;
  }

  return null;
}

function initTables(db: InstanceType<typeof Database>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      airtable_id TEXT,
      first_name TEXT,
      last_name TEXT,
      full_name TEXT,
      email TEXT,
      photo_url TEXT,
      cohort_number INTEGER,
      role TEXT,
      nickname TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS intake (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_id INTEGER,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      stripe_price_id TEXT,
      plan_name TEXT,
      amount_cents INTEGER,
      billing_status TEXT DEFAULT 'pending',
      billing_anchor_date TEXT,
      next_billing_date TEXT,
      intake_form_sent_at TEXT,
      intake_submitted_at TEXT,
      wa_status TEXT,
      wix_cms_id TEXT,
      calendar_added INTEGER DEFAULT 0,
      status TEXT DEFAULT 'awaiting_payment',
      payment_email_sent_at TEXT,
      airtable_record_id TEXT,
      payment_date TEXT,
      billing_interval TEXT,
      billing_interval_count INTEGER,
      payment_method TEXT,
      package_months INTEGER,
      cohort_start_date TEXT,
      manual_payment_note TEXT,
      bio_raw TEXT,
      bio_refined TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const count = (db.prepare("SELECT COUNT(*) as c FROM intake").get() as { c: number }).c;
  if (count === 0) {
    const pCount = (db.prepare("SELECT COUNT(*) as c FROM participants").get() as { c: number }).c;
    if (pCount > 0) {
      const seed = db.prepare(`
        INSERT INTO intake (participant_id, plan_name, amount_cents, billing_status, status, intake_form_sent_at, intake_submitted_at, wa_status, calendar_added, payment_date, payment_method)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      seed.run(1, "Growth", 69900, "active", "complete", "2026-01-10T09:00:00Z", "2026-01-11T14:30:00Z", "added", 1, "2026-01-09", "stripe");
      seed.run(2, "Starter", 99900, "active", "awaiting_form", "2026-02-15T09:00:00Z", null, "pending", 0, "2026-02-14", "stripe");
      seed.run(3, "Leader", 49900, "active", "processing", "2026-03-01T09:00:00Z", "2026-03-03T10:15:00Z", "pending", 0, "2026-02-28", "wise");
    }
  }
}

// GET /api/cohorts/intake
// Returns all participants with their intake status joined
export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT
        p.id, p.full_name, p.first_name, p.last_name, p.nickname, p.email, p.photo_url,
        p.cohort_number, p.role,
        i.id as intake_id,
        i.plan_name, i.amount_cents, i.billing_status,
        i.stripe_subscription_id, i.stripe_customer_id,
        i.intake_form_sent_at, i.intake_submitted_at,
        i.wa_status, i.wix_cms_id, i.calendar_added,
        i.status as intake_status,
        i.next_billing_date,
        i.created_at as intake_created_at,
        i.payment_email_sent_at,
        i.airtable_record_id,
        i.payment_date,
        i.billing_interval,
        i.billing_interval_count,
        i.payment_method,
        i.package_months,
        i.cohort_start_date,
        i.manual_payment_note,
        i.bio_raw,
        i.bio_refined
      FROM participants p
      LEFT JOIN intake i ON i.participant_id = p.id
      ORDER BY p.cohort_number ASC NULLS LAST, p.full_name ASC
    `).all();
    db.close();
    return NextResponse.json({ participants: rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/cohorts/intake
// Create a new intake record (called from Stripe webhook)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();
    const participantId = resolveParticipantId(db, body);
    if (!participantId) {
      db.close();
      return NextResponse.json(
        { error: "participant_id required or resolvable by email/phone/name" },
        { status: 400 }
      );
    }
    const result = db.prepare(`
      INSERT INTO intake (
        participant_id, stripe_customer_id, stripe_subscription_id,
        stripe_price_id, plan_name, amount_cents, billing_status,
        billing_anchor_date, next_billing_date,
        intake_form_sent_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, datetime('now'), 'awaiting_form')
    `).run(
      participantId, body.stripe_customer_id, body.stripe_subscription_id,
      body.stripe_price_id, body.plan_name, body.amount_cents,
      body.billing_anchor_date, body.next_billing_date
    );
    db.close();
    return NextResponse.json({ id: result.lastInsertRowid });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH /api/cohorts/intake
// Update a field on an intake record
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const db = getDb();
    const allowed = [
      "wa_status", "wix_cms_id", "calendar_added", "status",
      "intake_submitted_at", "intake_form_sent_at", "airtable_record_id",
      "billing_status", "next_billing_date", "stripe_subscription_id",
      "payment_email_sent_at",
      "payment_date", "billing_interval", "billing_interval_count",
      "payment_method", "package_months", "cohort_start_date",
      "manual_payment_note", "plan_name", "amount_cents",
      "bio_raw", "bio_refined"
    ];
    const updates = Object.keys(fields).filter(k => allowed.includes(k));
    if (updates.length === 0) return NextResponse.json({ error: "no valid fields" }, { status: 400 });

    const sql = `UPDATE intake SET ${updates.map(k => `${k} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`;
    db.prepare(sql).run(...updates.map(k => fields[k]), id);
    db.close();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
