"use client";

import { Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { useScroogeData } from "@/hooks/useScroogeData";
import type { TimeRange } from "@/lib/scrooge-types";
import StatCards from "./sections/StatCards";
import CostTrendChart from "./sections/CostTrendChart";
import ModelBreakdown from "./sections/ModelBreakdown";
import AttributionOverview from "./sections/AttributionOverview";
import ActivityOverview from "./sections/ActivityOverview";
import ResearchSuggestions from "./sections/ResearchSuggestions";

const TIME_OPTIONS: { label: string; value: TimeRange }[] = [
  { label: "Today", value: "today" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "All time", value: "all" },
];

export default function ScroogePage() {
  const {
    data,
    loading,
    error,
    timeRange,
    setTimeRange,
    modelFilter,
    setModelFilter,
    refresh,
  } = useScroogeData();

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Loader2 className="animate-spin text-cm-purple mb-4" size={32} />
        <p className="text-dark-muted">Loading Scrooge data...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <AlertCircle className="text-dark-danger mb-4" size={32} />
        <h3 className="text-lg font-bold  text-dark-text mb-2">
          Failed to load data
        </h3>
        <p className="text-dark-muted mb-4">{error}</p>
        <button
          onClick={refresh}
          className="px-4 py-2 bg-cm-purple text-white rounded-lg hover:bg-cm-purple/80 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  // Build model options from data
  const models = data.modelBreakdown.map((m) => m.model);

  return (
    <div className="space-y-6">
      {/* Header + Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold  text-dark-text">Scrooge</h1>
          <p className="text-sm text-dark-muted">AI token usage & cost tracking</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Time Range */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            className="px-3 py-1.5 text-sm border border-dark-border rounded-lg bg-dark-panel text-dark-text focus:outline-none focus:ring-2 focus:ring-cm-purple"
          >
            {TIME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Model Filter */}
          <select
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-dark-border rounded-lg bg-dark-panel text-dark-text focus:outline-none focus:ring-2 focus:ring-cm-purple"
          >
            <option value="all">All models</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </option>
            ))}
          </select>

          {/* Refresh */}
          <button
            onClick={refresh}
            disabled={loading}
            className="p-1.5 text-dark-muted hover:text-dark-muted transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <StatCards stats={data.stats} />
      <CostTrendChart costTrend={data.costTrend} />
      <ModelBreakdown
        modelBreakdown={data.modelBreakdown}
        topAgents={data.topAgents}
        topAuthLabels={data.topAuthLabels}
        dataSources={data.dataSources}
      />
      <AttributionOverview
        alerts={data.alerts}
        recentEvents={data.recentEvents}
        surfaceBreakdown={data.surfaceBreakdown}
      />
      <ActivityOverview activity={data.activity} />
      <ResearchSuggestions research={data.research} />
    </div>
  );
}
