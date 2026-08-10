import { NextRequest, NextResponse } from "next/server";

const crm = require("../../../../lib/crm");

export async function GET() {
  try {
    return NextResponse.json({ affiliates: crm.listPipelineAffiliates() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown CRM affiliate error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const affiliate = crm.createPipelineAffiliate(body);
    return NextResponse.json({ affiliate }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown CRM affiliate error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.id) {
      return NextResponse.json({ error: "Affiliate id is required" }, { status: 400 });
    }
    const affiliate = crm.updatePipelineAffiliate(body.id, body);
    return NextResponse.json({ affiliate });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown CRM affiliate error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Affiliate id is required" }, { status: 400 });
    }
    const result = crm.deletePipelineAffiliate(id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown CRM affiliate error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
