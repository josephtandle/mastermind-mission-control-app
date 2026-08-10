import { NextResponse } from "next/server";

const crm = require("../../../../../lib/crm");

export async function POST() {
  try {
    return NextResponse.json(await crm.tickAutomationQueues());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process automation queues";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
