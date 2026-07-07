import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";
import { sendTelegramViaSharedSender } from "../../_telegram";

const WORKSPACE_ROOT = path.join(os.homedir(), ".myos", "workspace");
const {
  DEFAULT_REGISTRATION_COHORT,
  openDb,
  upsertWebhookCheckout,
} = require(path.join(WORKSPACE_ROOT, "projects", "mastermind", "lib", "local-intake-db.js"));
const { runPostIntake } = require(path.join(WORKSPACE_ROOT, "agents", "mastermind-participants", "post-intake.js"));
const MASTERMIND_PRODUCT_IDS = new Set([
  "prod_TByaEiUx41kYm2",
  "prod_TBybEOTIMAee6Q",
  "prod_TByd4yPozXUgT6",
  "prod_TByePg5VOUYnix",
  "prod_TBychwDDMpDRny",
  "prod_UKeMVuCb2FiGwM",
  "prod_UKeM76Ju9WmjT3",
]);

const execAsync = promisify(exec);

async function sendIntakeEmail(name: string, email: string, intakeFormUrl: string, nickname?: string) {
  const greeting = nickname || name.split(" ")[0];
  const html = `<p>Hi ${greeting},</p>
<p>Welcome to the Business Automation Mastermind! We're so excited to have you.</p>
<p>To get you fully set up, please complete your intake form — it only takes a few minutes:</p>
<p><a href="${intakeFormUrl}" style="background:#7C69C7;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Complete Intake Form →</a></p>
<p>This helps us personalize your experience and get you introduced to the community.</p>
<p>See you inside,<br>The Team</p>`;

  await execAsync(`gog email send --to "${email}" --subject "Welcome to the Mastermind — Complete Your Intake" --body-html ${JSON.stringify(html)}`);
}

async function alertTeamMember(name: string, email: string, plan: string) {
  const token = process.env.JUNO_BOT_TOKEN;
  const chatId = process.env.TEAM_ALERT_TELEGRAM_ID;
  if (!token || !chatId) return;
  const text = `🎉 New Mastermind participant!\\n\\nName: ${name}\\nEmail: ${email}\\nPlan: ${plan}\\n\\nPlease add them to the community.`;
  await sendTelegramViaSharedSender({
    botToken: token,
    chatId,
    text,
    agentId: "mastermind-stripe-webhook",
    messageType: "alert",
    sourcePath: "projects/mastermind-mission-control/mission-control/app/api/webhooks/stripe/route.ts",
    plainText: true,
  });
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
  const db = openDb();

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const expandedSession = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ["line_items.data.price.product", "payment_intent"],
      });
      const lineItem = expandedSession.line_items?.data?.[0];
      const productId =
        typeof lineItem?.price?.product === "string"
          ? lineItem.price.product
          : lineItem?.price?.product?.id;
      if (!productId || !MASTERMIND_PRODUCT_IDS.has(productId)) {
        db.close();
        return NextResponse.json({ received: true, ignored: "non_mastermind_product" });
      }

      const email = expandedSession.customer_details?.email || expandedSession.customer_email;
      const name = expandedSession.customer_details?.name || "";
      const customerId = expandedSession.customer;
      const isSubscription = expandedSession.mode === "subscription" && !!expandedSession.subscription;
      const subscription = isSubscription
        ? await stripe.subscriptions.retrieve(expandedSession.subscription, {
            expand: ["items.data.price.product", "latest_invoice"],
          })
        : null;
      const subscriptionItem = subscription?.items?.data?.[0] || null;
      const periodEnd = subscription?.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString().split("T")[0]
        : null;
      const latestInvoice = subscription?.latest_invoice as {
        id?: string;
        amount_paid?: number;
        amount_due?: number;
        currency?: string;
        status?: string;
        created?: number;
        period_start?: number;
        period_end?: number;
      } | null;
      const amountCents =
        latestInvoice?.amount_paid ||
        latestInvoice?.amount_due ||
        expandedSession.amount_total ||
        (expandedSession.payment_intent as { amount?: number } | null)?.amount ||
        null;
      const billingInterval = subscriptionItem?.price?.recurring?.interval || null;
      const billingIntervalCount = subscriptionItem?.price?.recurring?.interval_count || null;
      const planName =
        (typeof lineItem?.price?.product === "object" && lineItem?.price?.product?.name) ||
        (typeof subscriptionItem?.price?.product === "object" && subscriptionItem?.price?.product?.name) ||
        lineItem?.description ||
        "Mastermind";
      const firstName = name.split(" ")[0] || "";
      const lastName = name.split(" ").slice(1).join(" ");
      const cohortNumber = Number(expandedSession.metadata?.cohort || expandedSession.metadata?.cohort_number || DEFAULT_REGISTRATION_COHORT);
      const upserted = upsertWebhookCheckout(db, {
        email,
        name,
        firstName,
        lastName,
        cohortNumber,
        customerId,
        subscriptionId: subscription?.id || null,
        checkoutSessionId: expandedSession.id,
        amountCents,
        billingStatus: isSubscription ? "active" : "paid_in_full",
        nextBillingDate: periodEnd,
        billingInterval,
        billingIntervalCount,
        planName,
        whatsapp: expandedSession.customer_details?.phone || "",
        invoiceId: latestInvoice?.id || null,
        currency: latestInvoice?.currency || expandedSession.currency || "usd",
        chargeStatus: latestInvoice?.status || "paid",
        chargeDate: latestInvoice?.created
          ? new Date(latestInvoice.created * 1000).toISOString().split("T")[0]
          : null,
        periodStart: latestInvoice?.period_start
          ? new Date(latestInvoice.period_start * 1000).toISOString().split("T")[0]
          : null,
        periodEnd: latestInvoice?.period_end
          ? new Date(latestInvoice.period_end * 1000).toISOString().split("T")[0]
          : periodEnd,
      });

      // Send welcome email and alert Ronnie
      await sendIntakeEmail(name, email, upserted.intakeFormUrl);
      await alertTeamMember(name, email, "Mastermind");
      if (upserted.shouldRunPostIntake) {
        await runPostIntake(upserted.participant.id, { maxAttempts: 2 });
      }

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
