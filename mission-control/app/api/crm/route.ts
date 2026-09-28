import { NextRequest, NextResponse } from "next/server";

const crm = require("../../../lib/crm");
const enrichment = require("../../../lib/crm-enrichment");

function normalizeSort(input: string | null) {
  return input && crm.SORT_OPTIONS.has(input) ? input : "updated_desc";
}

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl;
    const view = url.searchParams.get("view") || "contacts";
    const projectParam = url.searchParams.get("project") || "";
    // The contacts list view sends project=all to mean "every project"; the
    // pipeline board always needs a concrete project.
    const project = projectParam === "all" ? "" : projectParam || "pipeline";

    // Fresh install: place the sample cards in their pipeline columns once.
    crm.ensureInitialSampleData();

    if (view === "detail") {
      const contactId = url.searchParams.get("id") || "";
      if (!contactId) {
        return NextResponse.json({ error: "id required" }, { status: 400 });
      }
      const detail = crm.getContactDetail(contactId);
      if (!detail) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(detail);
    }

    if (view === "pipeline") {
      // sample_data lets the board show or hide the Clear sample data button
      // without a second request.
      return NextResponse.json({
        ...crm.getPipelineBoard({ project: project || "pipeline", search: url.searchParams.get("search") || "" }),
        sample_data: crm.getSampleDataStatus(),
      });
    }

    const result = crm.listContacts({
      search: url.searchParams.get("search") || "",
      status: url.searchParams.get("status") || "",
      source: url.searchParams.get("source") || "",
      owner: url.searchParams.get("owner") || "",
      label: url.searchParams.get("label") || "",
      project,
      sort: normalizeSort(url.searchParams.get("sort")),
    });

    return NextResponse.json({ ...result, sample_data: crm.getSampleDataStatus() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown CRM error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const action = body.action || "ingest";

  try {
    if (action === "ingest") {
      const result = crm.ingestLead(body);
      return NextResponse.json(result, { status: 201 });
    }

    if (action === "update") {
      if (!body.id) {
        return NextResponse.json({ error: "id required" }, { status: 400 });
      }
      const detail = crm.updateContact(body.id, body);
      return NextResponse.json(detail);
    }

    if (action === "enrich-contact") {
      if (!body.id) {
        return NextResponse.json({ error: "id required" }, { status: 400 });
      }
      const result = await enrichment.enrichContact(body.id);
      return NextResponse.json(result);
    }

    if (action === "enrich-all") {
      const result = await enrichment.enrichAllContacts({
        project: body.project || "pipeline",
      });
      return NextResponse.json(result);
    }

    if (action === "clear-sample-data") {
      const result = crm.clearSampleData();
      return NextResponse.json({ ...result, sample_data: crm.getSampleDataStatus() });
    }

    if (action === "load-sample-data") {
      const result = crm.loadSampleData();
      return NextResponse.json({ ...result, sample_data: crm.getSampleDataStatus() });
    }

    if (action === "delete") {
      if (!body.id) {
        return NextResponse.json({ error: "id required" }, { status: 400 });
      }
      const result = crm.deleteContact(body.id);
      return NextResponse.json(result);
    }

    if (action === "log-communication") {
      if (!body.id || !body.channel) {
        return NextResponse.json({ error: "id and channel required" }, { status: 400 });
      }
      const detail = crm.logCommunication(body.id, {
        channel: body.channel,
        direction: body.direction,
        note: body.note,
        contacted_at: body.contacted_at,
      });
      return NextResponse.json(detail);
    }

    if (action === "update-communication") {
      if (!body.id || !body.communication_id || !body.channel) {
        return NextResponse.json({ error: "id, communication_id, and channel required" }, { status: 400 });
      }
      const detail = crm.updateCommunication(body.communication_id, body.id, {
        channel: body.channel,
        direction: body.direction,
        note: body.note,
        contacted_at: body.contacted_at,
      });
      return NextResponse.json(detail);
    }

    if (action === "delete-communication") {
      if (!body.id || !body.communication_id) {
        return NextResponse.json({ error: "id and communication_id required" }, { status: 400 });
      }
      const detail = crm.deleteCommunication(body.communication_id, body.id);
      return NextResponse.json(detail);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown CRM error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
