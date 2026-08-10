import { NextRequest, NextResponse } from "next/server";

const crm = require("../../../../lib/crm");

export async function GET() {
  try {
    const snapshot = crm.getSettingsSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load CRM settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = body.action;

  try {
    if (action === "cleanup-legacy") {
      const deleted = crm.deleteLegacyCrmJsonIfEmpty();
      return NextResponse.json({ ok: true, deleted });
    }

    if (action === "set-approved-labels") {
      const snapshot = crm.setApprovedLabelKeys(body.keys || []);
      return NextResponse.json({ ok: true, snapshot });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CRM settings action failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
