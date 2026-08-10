import { NextRequest, NextResponse } from "next/server";

const crm = require("../../../../lib/crm");

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ contactId: string }> }
) {
  try {
    const { contactId } = await context.params;
    const detail = crm.getContactDetail(contactId);
    if (!detail) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load lead detail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
