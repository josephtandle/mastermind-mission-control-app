import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import {
  CLEANUP_SCRIPT,
  EMMIE_DIR,
  extractLatestRunSegment,
  getDefaultAccount,
  listCleanupLogs,
  parseCleanupSummary,
  readMaybe,
} from "../shared";

const RULES_FILE = path.join(process.cwd(), "lib", "emmie-filing-rules.json");

interface Rule {
  _id: string;
  name: string;
  query: string;
  description: string;
  enabled: boolean;
  priority: number;
  type?: string;
  action?: string;
  condition?: string;
  targetLabel?: string;
  ageThresholdDays?: number;
  maxPerRun?: number;
  source?: "profile" | "custom";
}

interface RulesFile {
  customRules: Rule[];
}

async function ensureRulesFile(): Promise<void> {
  try {
    await fs.access(RULES_FILE);
  } catch {
    await fs.writeFile(RULES_FILE, JSON.stringify({ customRules: [] }, null, 2));
  }
}

async function readRulesFile(): Promise<RulesFile> {
  await ensureRulesFile();
  const content = await fs.readFile(RULES_FILE, "utf8");
  return JSON.parse(content) as RulesFile;
}

async function writeRulesFile(data: RulesFile): Promise<void> {
  await fs.writeFile(RULES_FILE, JSON.stringify(data, null, 2));
}

async function buildProfileRules(): Promise<Rule[]> {
  const account = await getDefaultAccount();
  const latestLog = (await listCleanupLogs(1))[0];
  const latestRaw = latestLog ? await readMaybe(latestLog.fullPath) : null;
  const latestRun = latestRaw ? extractLatestRunSegment(latestRaw) : "";
  const summary = parseCleanupSummary(latestRun);
  const kept = summary.keptWhitelisted ?? 0;

  return [
    {
      _id: "profile_reply_marketing",
      name: "Reply-to-friends marketing",
      query: "phase:0 reply_then_delete",
      description: "Friends' promo blasts get a contextual reply before cleanup.",
      enabled: true,
      priority: 1,
      type: "profile",
      action: "reply-delete",
      source: "profile",
    },
    {
      _id: "profile_promotions",
      name: "Promotions cleanup with whitelist guardrails",
      query: "category:promotions -is:starred whitelist:enabled",
      description: kept
        ? `Promotions are cleaned aggressively while preserving ${kept} protected senders from the last run.`
        : "Promotions are cleaned aggressively while respecting stars and protected senders.",
      enabled: true,
      priority: 2,
      type: "profile",
      action: "delete",
      source: "profile",
    },
    {
      _id: "profile_social_updates",
      name: "Stale social and updates cleanup",
      query: "category:social | category:updates age>7d",
      description: "Aging social and update mail is trimmed to keep the inbox operational.",
      enabled: true,
      priority: 3,
      type: "profile",
      action: "delete",
      source: "profile",
    },
    {
      _id: "profile_primary",
      name: "Primary inbox sender and subject triage",
      query: "primary conservative sender+subject filters",
      description: "High-confidence sender and subject heuristics remove obvious inbox noise without touching starred mail.",
      enabled: true,
      priority: 4,
      type: "profile",
      action: "delete",
      source: "profile",
    },
    {
      _id: "profile_filing",
      name: "Folder filing for receipts, travel, and infrastructure",
      query: "labels:receipts,tickets,travel,infrastructure",
      description: "Useful operational mail is filed into durable labels instead of being deleted.",
      enabled: true,
      priority: 5,
      type: "profile",
      action: "file",
      source: "profile",
    },
    {
      _id: "profile_learning",
      name: "Pattern learning from recent trash",
      query: "recent trash scan -> suggested new sender patterns",
      description: "Each run learns uncaught sender domains from recent trash to tighten future cleanup.",
      enabled: true,
      priority: 6,
      type: "profile",
      action: "learn",
      source: "profile",
    },
    {
      _id: "profile_ruleset",
      name: account?.rulesProfile ? `Rules profile: ${account.rulesProfile}` : "Rules profile",
      query: account?.rulesPath || "rules/new-york-personal.md",
      description: "This workspace account is driven by Emmy's profile plus any custom Mission Control rules.",
      enabled: true,
      priority: 7,
      type: "profile",
      action: "profile",
      source: "profile",
    },
  ];
}

export async function GET() {
  try {
    const account = await getDefaultAccount();
    const data = await readRulesFile();
    const profileRules = await buildProfileRules();
    const customRules = (data.customRules || []).map((rule) => ({
      ...rule,
      source: "custom" as const,
    }));

    return NextResponse.json({
      rules: [...profileRules, ...customRules],
      account: account?.email || "",
      displayName: account?.displayName || "Emmy",
      rulesProfile: account?.rulesProfile || "",
      rulesPath: account ? path.join(EMMIE_DIR, account.rulesPath) : null,
      cleanupScript: CLEANUP_SCRIPT,
      cleanupEnabled: Boolean(account?.cleanup?.enabled),
      totalRules: profileRules.length + customRules.length,
      activeRules: profileRules.filter((rule) => rule.enabled).length + customRules.filter((rule) => rule.enabled).length,
      customRuleCount: customRules.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to read configuration" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      description,
      type,
      action,
      condition,
      targetLabel,
      ageThresholdDays,
      enabled,
      priority,
      maxPerRun,
    } = body;

    if (!name || !condition) {
      return NextResponse.json(
        { error: "name and condition are required" },
        { status: 400 }
      );
    }

    const newRule: Rule = {
      _id: randomUUID(),
      name,
      description: description || "",
      query: condition,
      condition,
      type: type || "custom",
      action: action || "delete",
      targetLabel: targetLabel || "",
      ageThresholdDays: ageThresholdDays ?? 30,
      enabled: enabled !== undefined ? enabled : true,
      priority: priority ?? 5,
      maxPerRun: maxPerRun ?? 100,
      source: "custom",
    };

    const data = await readRulesFile();
    data.customRules = data.customRules || [];
    data.customRules.push(newRule);
    await writeRulesFile(data);

    return NextResponse.json({ rule: newRule }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create rule" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const data = await readRulesFile();
    const index = (data.customRules || []).findIndex((rule) => rule._id === id);
    if (index === -1) {
      return NextResponse.json(
        { error: "Rule not found or managed by Emmy profile" },
        { status: 404 }
      );
    }

    const existing = data.customRules[index];
    const updated: Rule = {
      ...existing,
      ...updates,
      query: updates.condition ?? existing.query,
      condition: updates.condition ?? existing.condition,
      source: "custom",
    };

    data.customRules[index] = updated;
    await writeRulesFile(data);

    return NextResponse.json({ rule: updated });
  } catch {
    return NextResponse.json(
      { error: "Failed to update rule" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const data = await readRulesFile();
    const index = (data.customRules || []).findIndex((rule) => rule._id === id);
    if (index === -1) {
      return NextResponse.json(
        { error: "Profile rules are read-only in Mission Control" },
        { status: 400 }
      );
    }

    data.customRules[index] = {
      ...data.customRules[index],
      enabled: !data.customRules[index].enabled,
    };
    await writeRulesFile(data);

    return NextResponse.json({ rule: data.customRules[index] });
  } catch {
    return NextResponse.json(
      { error: "Failed to toggle rule" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id query parameter is required" },
        { status: 400 }
      );
    }

    const data = await readRulesFile();
    const initialLength = (data.customRules || []).length;
    data.customRules = (data.customRules || []).filter((rule) => rule._id !== id);

    if (data.customRules.length === initialLength) {
      return NextResponse.json(
        { error: "Rule not found or managed by Emmy profile" },
        { status: 404 }
      );
    }

    await writeRulesFile(data);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete rule" },
      { status: 500 }
    );
  }
}
