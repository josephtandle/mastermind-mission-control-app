"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, ExternalLink, RefreshCw, Trophy } from "lucide-react";

type RankPoint = {
  ts: string;
  rank: number;
};

type RankSeries = {
  key: string;
  source: string;
  category: string;
  metric: string;
  points: RankPoint[];
  bestRank: number;
  latestRank: number | null;
  latestAt: string | null;
};

type RankingApiResponse = {
  ok: boolean;
  generatedAt: string;
  historyCount: number;
  state: {
    lastRun: string | null;
    lastHealthStatus: string | null;
    lastHealthReason: string | null;
    lastBookReportResult: {
      ok?: boolean;
      status?: string;
      mode?: string;
      error?: string;
      observations?: unknown[];
      fetchedAt?: string;
    } | null;
  } | null;
  series: RankSeries[];
};

const sourceLabels: Record<string, string> = {
  amazon: "Amazon",
  bookreport: "Book Report",
};

const colors = ["#9b8cff", "#2dd4bf", "#f97316", "#e879f9", "#38bdf8", "#facc15"];

function formatDate(value: string | null | undefined) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatRank(value: number | null | undefined) {
  if (!Number.isFinite(value)) return "No rank";
  return `#${Number(value).toLocaleString()}`;
}

export default function BookRankingsPage() {
  const [data, setData] = useState<RankingApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/book-rankings", { cache: "no-store" });
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      setData(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load rankings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const primarySeries = useMemo(() => {
    if (!data) return [];
    return data.series
      .filter((item) => item.points.length > 0)
      .sort((a, b) => a.bestRank - b.bestRank)
      .slice(0, 6);
  }, [data]);

  const chartData = useMemo(() => {
    const byTs = new Map<string, Record<string, string | number>>();
    for (const item of primarySeries) {
      for (const point of item.points) {
        const existing = byTs.get(point.ts) || { ts: point.ts, label: formatDate(point.ts) };
        existing[item.key] = point.rank;
        byTs.set(point.ts, existing);
      }
    }
    return Array.from(byTs.values()).sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  }, [primarySeries]);

  const bestAmazon = data?.series
    .filter((item) => item.source === "amazon")
    .sort((a, b) => a.bestRank - b.bestRank)[0];
  const bestBookReport = data?.series
    .filter((item) => item.source === "bookreport")
    .sort((a, b) => a.bestRank - b.bestRank)[0];
  const bookReportStatus = data?.state?.lastBookReportResult;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-dark-muted">AI OS book sprint</p>
          <h1 className="text-2xl font-bold text-dark-text">Book Rankings</h1>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-lg border border-dark-border bg-dark-panel2 px-3 py-2 text-sm text-dark-text hover:border-cm-purple/60"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-dark-border bg-dark-panel p-4">
          <p className="text-xs uppercase tracking-wide text-dark-muted">Best Amazon</p>
          <div className="mt-2 flex items-center gap-2 text-2xl font-bold text-dark-text">
            <Trophy size={22} className="text-yellow-300" />
            {formatRank(bestAmazon?.bestRank)}
          </div>
          <p className="mt-2 truncate text-sm text-dark-muted">{bestAmazon?.category || "Waiting for Amazon ranks"}</p>
        </div>
        <div className="rounded-lg border border-dark-border bg-dark-panel p-4">
          <p className="text-xs uppercase tracking-wide text-dark-muted">Best Book Report</p>
          <div className="mt-2 text-2xl font-bold text-dark-text">{formatRank(bestBookReport?.bestRank)}</div>
          <p className="mt-2 truncate text-sm text-dark-muted">{bestBookReport?.category || "Waiting for backup ranks"}</p>
        </div>
        <div className="rounded-lg border border-dark-border bg-dark-panel p-4">
          <p className="text-xs uppercase tracking-wide text-dark-muted">Last Checker Run</p>
          <div className="mt-2 text-lg font-semibold text-dark-text">{formatDate(data?.state?.lastRun)}</div>
          <p className="mt-2 text-sm text-dark-muted">{data?.historyCount ?? 0} history entries</p>
        </div>
        <div className="rounded-lg border border-dark-border bg-dark-panel p-4">
          <p className="text-xs uppercase tracking-wide text-dark-muted">Book Report Backup</p>
          <div className="mt-2 text-lg font-semibold text-dark-text">
            {bookReportStatus?.ok ? "Connected" : bookReportStatus?.status || "Not checked"}
          </div>
          <p className="mt-2 line-clamp-2 text-sm text-dark-muted">
            {bookReportStatus?.error || `${bookReportStatus?.observations?.length || 0} observations`}
          </p>
        </div>
      </div>

      <section className="rounded-lg border border-dark-border bg-dark-panel p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-dark-text">Rank History</h2>
            <p className="text-sm text-dark-muted">Lower is better. The best six tracked series are shown.</p>
          </div>
          <a
            href="https://app.getbookreport.com/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm text-cm-purple hover:text-cm-purple-light"
          >
            Open Book Report
            <ExternalLink size={15} />
          </a>
        </div>
        <div className="h-[360px]">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 12 }} minTickGap={32} />
                <YAxis reversed tick={{ fill: "#9ca3af", fontSize: 12 }} tickFormatter={(value) => `#${value}`} />
                <Tooltip
                  contentStyle={{ background: "#171720", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8 }}
                  labelStyle={{ color: "#f3f4f6" }}
                />
                {primarySeries.map((item, index) => (
                  <Area
                    key={item.key}
                    type="monotone"
                    dataKey={item.key}
                    name={`${sourceLabels[item.source] || item.source}: ${item.category}`}
                    stroke={colors[index % colors.length]}
                    fill={colors[index % colors.length]}
                    fillOpacity={0.12}
                    connectNulls
                    dot={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-dark-muted">
              No rank history has been logged yet.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-dark-border bg-dark-panel">
        <div className="border-b border-dark-border px-4 py-3">
          <h2 className="text-lg font-semibold text-dark-text">Tracked Series</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-dark-muted">
              <tr>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Latest</th>
                <th className="px-4 py-3">Best</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border">
              {(data?.series || []).map((item) => (
                <tr key={item.key} className="text-dark-text">
                  <td className="px-4 py-3">{sourceLabels[item.source] || item.source}</td>
                  <td className="max-w-xl px-4 py-3 text-dark-muted">{item.category}</td>
                  <td className="px-4 py-3 font-semibold">{formatRank(item.latestRank)}</td>
                  <td className="px-4 py-3 font-semibold">{formatRank(item.bestRank)}</td>
                  <td className="px-4 py-3 text-dark-muted">{formatDate(item.latestAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
