import { NextRequest, NextResponse } from "next/server";

const crm = require("../../../../../lib/crm");

export async function GET() {
  try {
    return NextResponse.json({ rules: crm.listAutomationRules() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load automation rules";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = body.action || "save";
  try {
    if (action === "save") {
      return NextResponse.json({ rule: crm.saveAutomationRule(body) });
    }
    if (action === "delete") {
      return NextResponse.json(crm.deleteAutomationRule(body.id));
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Automation rule action failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
