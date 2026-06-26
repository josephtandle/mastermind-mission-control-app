import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";

type RankObservation = {
  source?: string;
  label?: string;
  url?: string;
  rank?: number;
  category?: string;
  metric?: string;
  fetchedAt?: string;
};

type RankHistoryEntry = {
  ts?: string;
  source?: string;
  ok?: boolean;
  status?: string;
  mode?: string;
  error?: string;
  observations?: RankObservation[];
};

const WORKSPACE_ROOT =
  process.env.MYOS_WORKSPACE_ROOT ||
  path.join(os.homedir(), ".myos/workspace");

const BOOK_PROJECT_ROOT =
  process.env.AI_OS_BOOK_PROJECT_ROOT ||
  path.join(WORKSPACE_ROOT, "projects/ai-operating-system-book");

const HISTORY_PATH =
  process.env.BOOK_RANKINGS_HISTORY_PATH ||
  path.join(BOOK_PROJECT_ROOT, "logs/book-rankings-history.jsonl");

const STATE_PATH =
  process.env.BOOK_RANKINGS_STATE_PATH ||
  path.join(BOOK_PROJECT_ROOT, "logs/amazon-bestseller-checker-state.json");

function parseJsonLine(line: string): RankHistoryEntry | null {
  try {
    return JSON.parse(line) as RankHistoryEntry;
  } catch {
    return null;
  }
}

async function readHistory(): Promise<RankHistoryEntry[]> {
  try {
    const text = await fs.readFile(HISTORY_PATH, "utf8");
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map(parseJsonLine)
      .filter((entry): entry is RankHistoryEntry => Boolean(entry));
  } catch {
    return [];
  }
}

async function readState() {
  try {
    return JSON.parse(await fs.readFile(STATE_PATH, "utf8"));
  } catch {
    return null;
  }
}

function seriesKey(observation: RankObservation) {
  return [
    observation.source || "unknown",
    observation.metric || "rank",
    observation.category || "Uncategorized",
  ].join(" | ");
}

function buildSeries(entries: RankHistoryEntry[]) {
  const byKey = new Map<
    string,
    {
      key: string;
      source: string;
      category: string;
      metric: string;
      points: { ts: string; rank: number }[];
    }
  >();

  for (const entry of entries) {
    const ts = entry.ts || new Date(0).toISOString();
    for (const observation of entry.observations || []) {
      if (!Number.isFinite(observation.rank)) continue;
      const key = seriesKey(observation);
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          source: observation.source || entry.source || "unknown",
          category: observation.category || "Uncategorized",
          metric: observation.metric || "rank",
          points: [],
        });
      }
      byKey.get(key)?.points.push({ ts, rank: Number(observation.rank) });
    }
  }

  return Array.from(byKey.values())
    .map((item) => ({
      ...item,
      points: item.points.slice(-300),
      bestRank: Math.min(...item.points.map((point) => point.rank)),
      latestRank: item.points[item.points.length - 1]?.rank ?? null,
      latestAt: item.points[item.points.length - 1]?.ts ?? null,
    }))
    .sort((a, b) => {
      if (a.source !== b.source) return a.source.localeCompare(b.source);
      return a.bestRank - b.bestRank;
    });
}

function latestBySource(entries: RankHistoryEntry[]) {
  const latest = new Map<string, RankHistoryEntry>();
  for (const entry of entries) {
    if (!entry.source) continue;
    latest.set(entry.source, entry);
  }
  return Object.fromEntries(latest.entries());
}

export async function GET() {
  const [history, state] = await Promise.all([readHistory(), readState()]);
  const recentHistory = history.slice(-1000);
  const series = buildSeries(recentHistory);
  const latest = latestBySource(recentHistory);

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    paths: {
      history: HISTORY_PATH,
      state: STATE_PATH,
    },
    state: state
      ? {
          lastRun: state.lastRun || null,
          lastHealthStatus: state.lastHealthStatus || null,
          lastHealthReason: state.lastHealthReason || null,
          lastBookReportResult: state.lastBookReportResult || null,
        }
      : null,
    latest,
    historyCount: history.length,
    series,
  });
}
