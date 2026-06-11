import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import os from "os";

const WS = process.env.GET_SORTED_WORKSPACE || path.join(os.homedir(), ".myos", "workspace");

const DB_PATH = path.join(WS, "data/online-program-participants.db");

function getDb() {
  return new Database(DB_PATH);
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

// GET /api/online-program/intake
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
        i.created_at as intake_created_at
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

// POST /api/online-program/intake
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

// PATCH /api/online-program/intake
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
      "billing_status", "next_billing_date", "stripe_subscription_id"
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
