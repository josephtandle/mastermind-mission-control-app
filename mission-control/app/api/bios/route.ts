import { NextResponse } from "next/server";
import os from "os";
import path from "path";
import { existsSync, readFileSync } from "fs";

function resolveWorkspaceRoot(): string {
  const candidates = [
    process.env.GET_SORTED_WORKSPACE,
    path.join(os.homedir(), ".myos", "workspace"),
    path.join(os.homedir(), "golden-claw"),
  ].filter((value): value is string => Boolean(value));

  return candidates.find((candidate) => existsSync(path.join(candidate, ".env"))) || candidates[0];
}

const WS = resolveWorkspaceRoot();
const ENV_PATH = path.join(WS, ".env");
const NOTION_VERSION = "2022-06-28";
const BIOS_DB_ID = "3588b7fd-668f-8115-afb6-d024792c4373";

type SelectValue = { name: string } | null;

interface NotionQueryResponse {
  results?: NotionPage[];
}

interface NotionPage {
  id: string;
  url: string;
  last_edited_time: string;
  properties: Record<string, any>;
}

interface BioRow {
  id: string;
  record: string;
  name: string;
  title: string;
  variant: string;
  purpose: string;
  useWhen: string;
  sourcePage: string;
  links: string;
  bioText: string;
  entryType: string;
  isTitle: boolean;
  currentStatus: string;
  date: string | null;
  order: number;
  characterCount: number;
  lengthCategory: string;
  url: string;
  lastEditedTime: string;
}

function loadWorkspaceEnv(): void {
  try {
    const envContent = readFileSync(ENV_PATH, "utf8");
    for (const line of envContent.split("\n")) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // ignore
  }
}

function getNotionKey(): string {
  loadWorkspaceEnv();
  const key = process.env.NOTION_API_KEY_BALIBLOOM;
  if (!key) throw new Error("NOTION_API_KEY_BALIBLOOM not set");
  return key;
}

async function notionRequest<T>(endpoint: string, body?: Record<string, unknown>): Promise<T> {
  const key = getNotionKey();
  const res = await fetch(`https://api.notion.com/v1${endpoint}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion request failed: ${res.status} ${text}`);
  }

  return res.json() as Promise<T>;
}

function richText(prop: any): string {
  const arr = prop?.rich_text || prop?.title || [];
  return arr.map((item: any) => item.plain_text || "").join("");
}

function selectName(prop: any): string {
  return (prop?.select as SelectValue)?.name || "";
}

function checkbox(prop: any): boolean {
  return Boolean(prop?.checkbox);
}

function numberValue(prop: any): number {
  if (typeof prop?.number === "number") return prop.number;
  if (typeof prop?.formula?.number === "number") return prop.formula.number;
  return 0;
}

function formulaString(prop: any): string {
  return prop?.formula?.string || "";
}

function dateValue(prop: any): string | null {
  return prop?.date?.start || null;
}

function mapPage(page: NotionPage): BioRow {
  const p = page.properties;
  return {
    id: page.id,
    record: richText(p.Record),
    name: richText(p.Name),
    title: richText(p.Title),
    variant: richText(p.Variant),
    purpose: richText(p.Purpose),
    useWhen: richText(p["Use When"]),
    sourcePage: richText(p["Source Page"]),
    links: richText(p.Links),
    bioText: richText(p["Bio Text"]),
    entryType: selectName(p["Entry Type"]),
    isTitle: checkbox(p["Is Title"]),
    currentStatus: selectName(p["Current Status"]),
    date: dateValue(p.Date),
    order: numberValue(p.Order),
    characterCount: numberValue(p["Character Count"]),
    lengthCategory: formulaString(p["Length Category"]),
    url: page.url,
    lastEditedTime: page.last_edited_time,
  };
}

export async function GET() {
  try {
    const data = await notionRequest<NotionQueryResponse>(`/databases/${BIOS_DB_ID}/query`, {
      page_size: 100,
      sorts: [{ property: "Order", direction: "ascending" }],
    });

    const rows = (data.results || []).map(mapPage);
    const stats = {
      total: rows.length,
      current: rows.filter((row) => row.currentStatus === "Current").length,
      old: rows.filter((row) => row.currentStatus === "Old").length,
      titles: rows.filter((row) => row.entryType === "Title" || row.isTitle).length,
      bios: rows.filter((row) => row.entryType === "Bio").length,
    };

    const taxonomy = {
      statuses: Array.from(new Set(rows.map((row) => row.currentStatus).filter(Boolean))),
      entryTypes: Array.from(new Set(rows.map((row) => row.entryType).filter(Boolean))),
      lengthCategories: Array.from(new Set(rows.map((row) => row.lengthCategory).filter(Boolean))),
      sourcePages: Array.from(new Set(rows.map((row) => row.sourcePage).filter(Boolean))),
      variants: Array.from(new Set(rows.map((row) => row.variant).filter(Boolean))),
    };

    return NextResponse.json({
      rows,
      stats,
      taxonomy,
      sourcePageUrl: "https://www.notion.so/balibloom/Joe-s-Bio-s-205e4f12690f4b84ba509407ab04827b?source=copy_link",
      databaseUrl: "https://www.notion.so/3588b7fd668f8115afb6d024792c4373",
      hubUrl: "https://www.notion.so/Joe-Bios-Hub-3588b7fd668f8165bfe5ff435af1cd9e",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load bios" },
      { status: 500 },
    );
  }
}
