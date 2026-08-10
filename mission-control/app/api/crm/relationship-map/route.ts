import { NextRequest, NextResponse } from "next/server";

const crm = require("../../../../lib/crm");

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const project = req.nextUrl.searchParams.get("project") || "pipeline";
    const board = crm.getPipelineBoard({ project, search: req.nextUrl.searchParams.get("search") || "" });
    return NextResponse.json({ ...board, project });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load relationship map" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.contact_id || !body.pipeline_status) {
      return NextResponse.json({ error: "contact_id and pipeline_status are required" }, { status: 400 });
    }
    const project = body.project || "pipeline";
    const detail = crm.updateContact(body.contact_id, {
      project,
      project_state: { project, status: body.pipeline_status },
    });
    return NextResponse.json(detail);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update relationship map" }, { status: 500 });
  }
}
