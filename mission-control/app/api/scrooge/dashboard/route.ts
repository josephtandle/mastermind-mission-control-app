import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { pathToFileURL } from "url";
import type { ScroogeAlert, ScroogeBucket, ScroogeDashboard } from "@/lib/scrooge-types";

const WORKSPACE_ROOT = path.join(os.homedir(), ".myos", "workspace");
const SHARED_DIR = path.join(WORKSPACE_ROOT, "agents", "shared");
const LEDGER_MODULE_PATH = path.join(SHARED_DIR, "myos-usage-ledger.js");
const RESEARCH_PATH = path.join(
  WORKSPACE_ROOT,
  "agents",
  "scrooge",
  "data",
  "research.json"
);

interface ResearchFile {
  lastUpdate: string | null;
  findings: unknown[];
  implementations: Array<{
    name: string;
    confidence: string;
    mentions: number;
    implementation: string;
    sources: string[];
    installed?: boolean;
    safe: boolean;
  }>;
}

function emptyDashboard(): ScroogeDashboard {
  return {
    stats: {
      totalSpendUSD: 0,
      todaySpendUSD: 0,
      totalRequests: 0,
      totalTokensUsed: 0,
      totalTokensSaved: 0,
      totalCostSaved: 0,
      savingsPercent: 0,
      dataStartDate: "",
      uniqueAgents: 0,
      unattributedSpendUSD: 0,
    },
    costTrend: [],
    modelBreakdown: [],
    strategies: [],
    topAgents: [],
    topAuthLabels: [],
    surfaceBreakdown: [],
    alerts: [],
    recentEvents: [],
    activity: {
      totalRequests: 0,
      totalTokensUsed: 0,
      topAgents: [],
      topAuthLabels: [],
      recentEvents: [],
    },
    research: { lastUpdate: null, suggestions: [] },
    dataSources: {
      ledgerJsonl: { available: false, recordCount: 0, lastUpdated: "" },
      activityJsonl: { available: false, recordCount: 0, lastUpdated: "" },
    },
    lastUpdated: new Date().toISOString(),
  };
}

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

function timeRangeToHours(timeRange: string): number {
  switch (timeRange) {
    case "today":
      return 24;
    case "7d":
      return 24 * 7;
    case "30d":
      return 24 * 30;
    default:
      return 24 * 365 * 3;
  }
}

function toSortedBuckets(
  buckets: Record<string, { key: string; runs: number; costUsd: number; inputTokens: number; outputTokens: number }>,
  limit = 8
): ScroogeBucket[] {
  return Object.values(buckets)
    .sort((a, b) => b.costUsd - a.costUsd || b.runs - a.runs)
    .slice(0, limit)
    .map((bucket) => ({
      key: bucket.key,
      requests: bucket.runs,
      costUSD: bucket.costUsd,
      inputTokens: bucket.inputTokens,
      outputTokens: bucket.outputTokens,
    }));
}

function buildAlerts(summary: any): ScroogeAlert[] {
  const alerts: ScroogeAlert[] = [];
  if (summary.unattributedSpendUsd > 0) {
    alerts.push({
      level: "warn",
      message: `Unattributed spend: $${summary.unattributedSpendUsd.toFixed(2)} across ${summary.missingCallerCount} call(s).`,
    });
  }

  const topAuth = toSortedBuckets(summary.byAuthLabel, 1)[0];
  if (topAuth && topAuth.costUSD > 1) {
    alerts.push({
      level: "info",
      message: `Top auth label in range: ${topAuth.key} at $${topAuth.costUSD.toFixed(2)}.`,
    });
  }

  const topAgent = toSortedBuckets(summary.byAgent, 1)[0];
  if (topAgent && topAgent.key !== "unknown" && topAgent.costUSD > 1) {
    alerts.push({
      level: "info",
      message: `Top agent in range: ${topAgent.key} at $${topAgent.costUSD.toFixed(2)}.`,
    });
  }

  return alerts;
}

type LedgerHelpers = {
  summarizeUsage: (options: {
    windowHours: number;
    modelFilter: string;
    billableOnly?: boolean;
    activity?: boolean;
  }) => any;
  resolveLedgerDir: () => string;
  resolveActivityLedgerDir: () => string;
};

async function loadLedgerHelpers(): Promise<LedgerHelpers> {
  const moduleUrl = pathToFileURL(LEDGER_MODULE_PATH).href;
  const imported = await import(moduleUrl);
  const helpers = (imported.default ?? imported) as Partial<LedgerHelpers>;

  if (
    typeof helpers.summarizeUsage !== "function" ||
    typeof helpers.resolveLedgerDir !== "function" ||
    typeof helpers.resolveActivityLedgerDir !== "function"
  ) {
    throw new Error(`Invalid ledger helper module: ${LEDGER_MODULE_PATH}`);
  }

  return helpers as LedgerHelpers;
}

async function loadResearch() {
  try {
    const researchRaw = await fs.readFile(RESEARCH_PATH, "utf-8");
    const researchData: ResearchFile = JSON.parse(researchRaw);
    return {
      lastUpdate: researchData.lastUpdate,
      suggestions: (researchData.implementations || []).map((impl) => ({
        name: impl.name,
        confidence: impl.confidence || "low",
        mentions: impl.mentions || 0,
        implementation: impl.implementation,
        sources: impl.sources || [],
        installed: !!impl.installed,
      })),
    };
  } catch {
    return { lastUpdate: null, suggestions: [] };
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const timeRange = searchParams.get("timeRange") || "all";
  const modelFilter = searchParams.get("model") || "all";

  let summarizeUsage: LedgerHelpers["summarizeUsage"];
  let resolveLedgerDir: LedgerHelpers["resolveLedgerDir"];
  let resolveActivityLedgerDir: LedgerHelpers["resolveActivityLedgerDir"];
  try {
    ({ summarizeUsage, resolveLedgerDir, resolveActivityLedgerDir } = await loadLedgerHelpers());
  } catch {
    return NextResponse.json(emptyDashboard());
  }

  const summary = summarizeUsage({
    windowHours: timeRangeToHours(timeRange),
    modelFilter,
  });
  const activitySummary = summarizeUsage({
    windowHours: timeRangeToHours(timeRange),
    modelFilter,
    billableOnly: false,
    activity: true,
  });

  const ledgerDir = resolveLedgerDir();
  const activityDir = resolveActivityLedgerDir();
  let fileStats: { mtimeMs: number } | null = null;
  let activityStats: { mtimeMs: number } | null = null;
  try {
    const files = await fs.readdir(ledgerDir);
    const jsonlFiles = files.filter((entry) => entry.endsWith(".jsonl")).sort();
    if (jsonlFiles.length > 0) {
      const lastFile = path.join(ledgerDir, jsonlFiles[jsonlFiles.length - 1]);
      const stat = await fs.stat(lastFile);
      fileStats = { mtimeMs: stat.mtimeMs };
    }
  } catch {
    // Leave null.
  }
  try {
    const files = await fs.readdir(activityDir);
    const jsonlFiles = files.filter((entry) => entry.endsWith(".jsonl")).sort();
    if (jsonlFiles.length > 0) {
      const lastFile = path.join(activityDir, jsonlFiles[jsonlFiles.length - 1]);
      const stat = await fs.stat(lastFile);
      activityStats = { mtimeMs: stat.mtimeMs };
    }
  } catch {
    // Leave null.
  }

  const todayData = summary.dailyTrend.find((entry: { date: string }) => entry.date === getToday());
  const modelTotalCost = Object.values(summary.byModel).reduce(
    (sum: number, bucket: any) => sum + Number(bucket.costUsd || 0),
    0
  );
  const research = await loadResearch();

  const dashboard: ScroogeDashboard = {
    stats: {
      totalSpendUSD: summary.totalCostUsd,
      todaySpendUSD: todayData ? todayData.costUsd : 0,
      totalRequests: summary.totalRuns,
      totalTokensUsed: summary.totalInputTokens + summary.totalOutputTokens,
      totalTokensSaved: 0,
      totalCostSaved: 0,
      savingsPercent: 0,
      dataStartDate: summary.dailyTrend[0]?.date || "",
      uniqueAgents: summary.uniqueAgents || 0,
      unattributedSpendUSD: summary.unattributedSpendUsd || 0,
    },
    costTrend: summary.dailyTrend,
    modelBreakdown: Object.values(summary.byModel)
      .map((bucket: any) => ({
        model: bucket.key,
        requests: bucket.runs,
        tokensUsed: bucket.inputTokens + bucket.outputTokens,
        costUSD: bucket.costUsd,
        percentOfTotal: modelTotalCost > 0 ? (bucket.costUsd / modelTotalCost) * 100 : 0,
      }))
      .sort((a, b) => b.costUSD - a.costUSD),
    strategies: [],
    topAgents: toSortedBuckets(summary.byAgent),
    topAuthLabels: toSortedBuckets(summary.byAuthLabel),
    surfaceBreakdown: toSortedBuckets(summary.bySurface),
    alerts: buildAlerts(summary),
    recentEvents: (summary.recentEvents || []).map((event: any) => ({
      eventId: event.eventId,
      ts: event.ts,
      outcome: event.outcome,
      resolvedProviderOrTool: event.resolvedProviderOrTool,
      resolvedModelOrEngine: event.resolvedModelOrEngine,
      estimatedCostUsd: event.estimatedCostUsd,
      authLabel: event.authLabel,
      caller: {
        agentId: event.caller?.agentId || "unknown",
        surface: event.caller?.surface || "unknown",
        project: event.caller?.project || "unknown",
        jobId: event.caller?.jobId || null,
        runId: event.caller?.runId || null,
        traceId: event.caller?.traceId || null,
        callerVersion: event.caller?.callerVersion || null,
      },
    })),
    activity: {
      totalRequests: activitySummary.totalRuns || 0,
      totalTokensUsed:
        (activitySummary.totalInputTokens || 0) + (activitySummary.totalOutputTokens || 0),
      topAgents: toSortedBuckets(activitySummary.byAgent),
      topAuthLabels: toSortedBuckets(activitySummary.byAuthLabel),
      recentEvents: (activitySummary.recentEvents || []).map((event: any) => ({
        eventId: event.eventId,
        ts: event.ts,
        outcome: event.outcome,
        resolvedProviderOrTool: event.resolvedProviderOrTool,
        resolvedModelOrEngine: event.resolvedModelOrEngine,
        estimatedCostUsd: event.estimatedCostUsd,
        authLabel: event.authLabel,
        caller: {
          agentId: event.caller?.agentId || "unknown",
          surface: event.caller?.surface || "unknown",
          project: event.caller?.project || "unknown",
          jobId: event.caller?.jobId || null,
          runId: event.caller?.runId || null,
          traceId: event.caller?.traceId || null,
          callerVersion: event.caller?.callerVersion || null,
        },
      })),
    },
    research,
    dataSources: {
      ledgerJsonl: {
        available: Boolean(fileStats),
        recordCount: summary.recordCount || 0,
        lastUpdated: fileStats ? new Date(fileStats.mtimeMs).toISOString() : "",
      },
      activityJsonl: {
        available: Boolean(activityStats),
        recordCount: activitySummary.recordCount || 0,
        lastUpdated: activityStats ? new Date(activityStats.mtimeMs).toISOString() : "",
      },
    },
    lastUpdated: new Date().toISOString(),
  };

  return NextResponse.json(dashboard);
}
