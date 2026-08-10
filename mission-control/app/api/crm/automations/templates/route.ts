import { NextRequest, NextResponse } from "next/server";

const crm = require("../../../../../lib/crm");

export async function GET() {
  try {
    return NextResponse.json({ templates: crm.listAutomationTemplates() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load automation templates";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = body.action || "save";
  try {
    if (action === "save") {
      return NextResponse.json({ template: crm.saveAutomationTemplate(body) });
    }
    if (action === "delete") {
      return NextResponse.json(crm.deleteAutomationTemplate(body.id));
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Automation template action failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
