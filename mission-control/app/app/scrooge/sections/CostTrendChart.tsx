"use client";

import type { ScroogeDashboard } from "@/lib/scrooge-types";

function formatUSD(value: number): string {
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

export default function CostTrendChart({
  costTrend,
}: {
  costTrend: ScroogeDashboard["costTrend"];
}) {
  if (costTrend.length === 0) {
    return (
      <div className="bg-dark-panel rounded-lg border border-dark-border p-6">
        <h3 className="text-lg font-bold text-dark-text mb-4">
          Daily Cost Trend
        </h3>
        <div className="flex items-center justify-center py-12 text-dark-muted">
          No cost data available yet
        </div>
      </div>
    );
  }

  const maxCost = Math.max(...costTrend.map((entry) => entry.costUSD), 0.0001);

  return (
    <div className="bg-dark-panel rounded-lg border border-dark-border p-6">
      <h3 className="text-lg font-bold text-dark-text mb-4">
        Daily Cost Trend
      </h3>
      <div className="space-y-3">
        {costTrend.map((entry) => (
          <div key={entry.date} className="grid grid-cols-[88px_1fr_90px] items-center gap-3">
            <div className="text-xs text-dark-muted">
              {new Date(entry.date + "T00:00:00").toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </div>
            <div className="h-3 rounded-full bg-dark-panel2 overflow-hidden">
              <div
                className="h-full rounded-full bg-cm-purple"
                style={{ width: `${Math.max((entry.costUSD / maxCost) * 100, 2)}%` }}
              />
            </div>
            <div className="text-right text-xs text-dark-muted">
              {formatUSD(entry.costUSD)} · {entry.requests} req
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
