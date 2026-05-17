import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";

const WS = process.env.GET_SORTED_WORKSPACE || path.join(os.homedir(), "golden-claw");
const MASTERMIND_PRODUCT_IDS = new Set([
  "prod_TByaEiUx41kYm2",
  "prod_TBybEOTIMAee6Q",
  "prod_TByd4yPozXUgT6",
  "prod_TByePg5VOUYnix",
  "prod_TBychwDDMpDRny",
  "prod_UKeMVuCb2FiGwM",
]);

const execAsync = promisify(exec);

const DB_PATH = path.join(WS, "data/mastermind-participants.db");
const INTAKE_FORM_URL = "https://airtable.com/appYNF8Zkzpd7FmZ1/pagSmsaRwBS0IHmk2/form";

function getDb() {
  return new Database(DB_PATH);
}

async function sendIntakeEmail(name: string, email: string, nickname?: string) {
  const greeting = nickname || name.split(" ")[0];
  const html = `<p>Hi ${greeting},</p>
<p>Welcome to the Business Automation Mastermind! We're so excited to have you.</p>
<p>To get you fully set up, please complete your intake form — it only takes a few minutes:</p>
<p><a href="${INTAKE_FORM_URL}" style="background:#7C69C7;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Complete Intake Form →</a></p>
<p>This helps us personalize your experience and get you introduced to the community.</p>
<p>See you inside,<br>The Team</p>`;

  await execAsync(`gog email send --to "${email}" --subject "Welcome to the Mastermind — Complete Your Intake" --body-html ${JSON.stringify(html)}`);
}

async function alertTeamMember(name: string, email: string, plan: string) {
  const token = process.env.JUNO_BOT_TOKEN;
  const chatId = process.env.TEAM_ALERT_TELEGRAM_ID;
  if (!token || !chatId) return;
  const text = `🎉 New Mastermind participant!\\n\\nName: ${name}\\nEmail: ${email}\\nPlan: ${plan}\\n\\nPlease add them to the community.`;
  await execAsync(`curl -s -X POST "https://api.telegram.org/bot${token}/sendMessage" -H "Content-Type: application/json" -d '{"chat_id":"${chatId}","text":"${text}"}'`);
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") || "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeModule = (await import("stripe")).default;
  const stripe = new stripeModule(process.env.STRIPE_SECRET_KEY || "");

  // Verify signature if secret is set
  if (webhookSecret) {
    try {
      stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  }

  const event = JSON.parse(body);
  const db = getDb();

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.mode !== "subscription" || !session.subscription) {
        db.close();
        return NextResponse.json({ received: true, ignored: "non_mastermind_checkout" });
      }

      const subscription = await stripe.subscriptions.retrieve(session.subscription, {
        expand: ["items.data.price.product", "latest_invoice"],
      });
      const subscriptionItem = subscription.items.data[0];
      const productId =
        typeof subscriptionItem?.price?.product === "string"
          ? subscriptionItem.price.product
          : subscriptionItem?.price?.product?.id;
      if (!productId || !MASTERMIND_PRODUCT_IDS.has(productId)) {
        db.close();
        return NextResponse.json({ received: true, ignored: "non_mastermind_product" });
      }

      const email = session.customer_details?.email || session.customer_email;
      const name = session.customer_details?.name || "";
      const customerId = session.customer;
      const subId = subscription.id;
      const periodEnd = subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString().split("T")[0]
        : null;
      const latestInvoice = subscription.latest_invoice as { amount_paid?: number; amount_due?: number } | null;
      const amountCents = latestInvoice?.amount_paid || latestInvoice?.amount_due || null;
      const billingInterval = subscriptionItem?.price?.recurring?.interval || null;
      const billingIntervalCount = subscriptionItem?.price?.recurring?.interval_count || null;
      const planName =
        typeof subscriptionItem?.price?.product === "object"
          ? subscriptionItem.price.product.name
          : "Mastermind";

      const firstName = name.split(" ")[0];
      const lastName = name.split(" ").slice(1).join(" ");

      // Find or create participant
      let participant = db.prepare("SELECT * FROM participants WHERE email = ?").get(email) as any;
      if (!participant) {
        const res = db.prepare(`
          INSERT INTO participants (airtable_id, first_name, last_name, full_name, email, cohort_number, synced_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'), datetime('now'))
        `).run(`stripe_${customerId}`, firstName, lastName, name, email);
        participant = db.prepare("SELECT * FROM participants WHERE id = ?").get(res.lastInsertRowid);
      }

      // Create intake record (idempotent — skip if already exists)
      db.prepare(`
        INSERT OR IGNORE INTO intake (
          participant_id, stripe_customer_id, stripe_subscription_id,
          plan_name, amount_cents, billing_status, next_billing_date,
          billing_interval, billing_interval_count,
          intake_form_sent_at, status, intake_form_url
        )
        VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, datetime('now'), 'awaiting_form', ?)
      `).run(
        participant.id,
        customerId,
        subId,
        planName,
        amountCents,
        periodEnd,
        billingInterval,
        billingIntervalCount,
        INTAKE_FORM_URL
      );

      // Send welcome email and alert Ronnie
      await sendIntakeEmail(name, email);
      await alertTeamMember(name, email, "Mastermind");

    } else if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object;
      const subId = invoice.subscription;
      const periodEnd = new Date(invoice.lines?.data?.[0]?.period?.end * 1000).toISOString().split("T")[0];
      db.prepare(`
        UPDATE intake SET billing_status = 'active', next_billing_date = ?, updated_at = datetime('now')
        WHERE stripe_subscription_id = ?
      `).run(periodEnd, subId);

    } else if (event.type === "invoice.payment_failed") {
      const subId = event.data.object.subscription;
      db.prepare(`
        UPDATE intake SET billing_status = 'past_due', updated_at = datetime('now')
        WHERE stripe_subscription_id = ?
      `).run(subId);

    } else if (event.type === "customer.subscription.deleted") {
      const subId = event.data.object.id;
      db.prepare(`
        UPDATE intake SET billing_status = 'canceled', updated_at = datetime('now')
        WHERE stripe_subscription_id = ?
      `).run(subId);
    } else if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object;
      const subId = subscription.id;
      const billingStatus = subscription.cancel_at_period_end ? "canceling" : subscription.status;
      const periodEnd = subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString().split("T")[0]
        : null;
      db.prepare(`
        UPDATE intake
        SET billing_status = ?, next_billing_date = ?, updated_at = datetime('now')
        WHERE stripe_subscription_id = ?
      `).run(billingStatus, periodEnd, subId);
    }

    db.close();
    return NextResponse.json({ received: true });
  } catch (e: any) {
    db.close();
    console.error("Stripe webhook error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
