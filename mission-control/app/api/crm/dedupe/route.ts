import { NextResponse } from "next/server";

const dedupe = require("../../../../lib/crm-dedupe");

// GET = dry run (groups and which ones need review, no writes).
// POST = merge every group without a pipeline-status conflict.

export async function GET() {
  try {
    return NextResponse.json(dedupe.scanDuplicates());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Duplicate scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    return NextResponse.json(dedupe.mergeDuplicates());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Duplicate merge failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
