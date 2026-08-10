import { NextRequest, NextResponse } from "next/server";

const crm = require("../../../../../lib/crm");

export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get("status") || undefined;
    await crm.tickAutomationQueues();
    return NextResponse.json({ deliveries: crm.listAutomationDeliveries({ status }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load automation delivery queue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
