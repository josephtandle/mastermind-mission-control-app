import { NextRequest, NextResponse } from "next/server";

const crm = require("../../../../../lib/crm");

export async function GET() {
  try {
    await crm.tickAutomationQueues();
    return NextResponse.json(crm.getAutomationSettingsSnapshot());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load automation settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  try {
    if (body?.action === "send_test_email") {
      if (body.email_from_address) {
        crm.setAutomationSettings({ email_from_address: body.email_from_address });
      }
      const result = await crm.sendAutomationTestEmail({
        to: body.to,
        subject: body.subject,
        body: body.body,
      });
      if (!result?.ok) {
        return NextResponse.json(
          { error: result?.data?.message || `Resend test failed with status ${result?.status || 500}` },
          { status: result?.status || 502 }
        );
      }
      return NextResponse.json({ success: true, result });
    }
    return NextResponse.json(crm.setAutomationSettings(body));
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : body?.action === "send_test_email"
          ? "Failed to send test email"
          : "Failed to update automation settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
