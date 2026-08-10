import { NextRequest, NextResponse } from "next/server";

const crm = require("../../../../lib/crm");

export async function GET(req: NextRequest) {
  try {
    const project = req.nextUrl.searchParams.get("project") || "pipeline";
    return NextResponse.json({ config: crm.getPipelineConfigSnapshot(project) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load pipeline config";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  try {
    if (body?.action === "add-column") {
      return NextResponse.json({
        config: crm.addPipelineColumn({
          project: body.project,
          status: body.status,
          after_status: body.after_status,
        }),
      });
    }
    if (body?.action === "delete-column") {
      return NextResponse.json({
        config: crm.deletePipelineColumn({
          project: body.project,
          status: body.status,
          replacement_status: body.replacement_status,
        }),
      });
    }
    if (body?.action === "rename-column") {
      return NextResponse.json({
        config: crm.renamePipelineColumn({
          project: body.project,
          status: body.status,
          next_status: body.next_status,
        }),
      });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pipeline action failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
