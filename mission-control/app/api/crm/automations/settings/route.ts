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
    if (body?.action === "verify_sender") {
      // Non-sending check: lists the Resend domains and reports whether the
      // sender's domain is verified. No email leaves the machine.
      const result = await crm.verifyResendSender({ from: body.email_from_address });
      return NextResponse.json(result, { status: result?.ok ? 200 : result?.status || 502 });
    }
    if (body?.action === "send_test_email") {
      if (body.email_from_address || body.email_provider !== undefined) {
        crm.setAutomationSettings({
          ...(body.email_from_address ? { email_from_address: body.email_from_address } : {}),
          ...(body.email_provider !== undefined ? { email_provider: body.email_provider } : {}),
        });
      }
      const result = await crm.sendAutomationTestEmail({
        to: body.to,
        subject: body.subject,
        body: body.body,
      });
      if (!result?.ok) {
        return NextResponse.json(
          { error: result?.data?.message || `Email test failed with status ${result?.status || 500}` },
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
          : body?.action === "verify_sender"
            ? "Failed to verify sender"
          : "Failed to update automation settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
