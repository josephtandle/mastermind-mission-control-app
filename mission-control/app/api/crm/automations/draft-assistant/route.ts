import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const LIMIT = 4000;

function bounded(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, LIMIT) : "";
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const businessContext = bounded(body.businessContext);
  if (!businessContext) {
    return NextResponse.json({ error: "businessContext is required" }, { status: 400 });
  }
  return NextResponse.json(
    {
      error: "Draft assistant is not configured.",
      detail: "Set up an approved draft provider before enabling assisted writing.",
      request: {
        channel: bounded(body.channel),
        leadName: bounded(body.leadName),
        businessContext,
        objective: bounded(body.objective),
        priorMessage: bounded(body.priorMessage),
      },
    },
    { status: 503 }
  );
}
