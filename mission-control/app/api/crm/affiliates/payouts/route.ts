import { NextRequest, NextResponse } from "next/server";

const crm = require("../../../../../lib/crm");

export async function GET(req: NextRequest) {
  try {
    const affiliateId = req.nextUrl.searchParams.get("affiliate_id");
    if (!affiliateId) {
      return NextResponse.json({ error: "affiliate_id is required" }, { status: 400 });
    }
    return NextResponse.json({ payouts: crm.listAffiliatePayouts(affiliateId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown payout error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const payout = crm.createAffiliatePayout(body);
    return NextResponse.json({ payout }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown payout error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const payout = crm.updateAffiliatePayout(body.id, body);
    return NextResponse.json({ payout });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown payout error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const result = crm.deleteAffiliatePayout(id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown payout error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
