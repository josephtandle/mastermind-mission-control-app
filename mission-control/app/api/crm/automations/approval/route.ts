import { NextRequest, NextResponse } from "next/server";

const crm = require("../../../../../lib/crm");

export async function GET(request: NextRequest) {
  try {
    const reviewStatus = request.nextUrl.searchParams.get("review_status") || undefined;
    await crm.tickAutomationQueues();
    return NextResponse.json({ items: crm.listAutomationApprovalItems({ review_status: reviewStatus }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load approval queue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "update") {
      return NextResponse.json({ item: crm.updateAutomationApprovalItem(body.id, body) });
    }
    if (body.action === "approve") {
      return NextResponse.json(crm.approveAutomationItem(body.id, body));
    }
    if (body.action === "cancel") {
      return NextResponse.json({ item: crm.cancelAutomationItem(body.id, body) });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Approval queue action failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
