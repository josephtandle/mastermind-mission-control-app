"use client";

import type { ScroogeDashboard } from "@/lib/scrooge-types";

function formatUSD(value: number): string {
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

export default function AttributionOverview({
  alerts,
  recentEvents,
  surfaceBreakdown,
}: {
  alerts: ScroogeDashboard["alerts"];
  recentEvents: ScroogeDashboard["recentEvents"];
  surfaceBreakdown: ScroogeDashboard["surfaceBreakdown"];
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="bg-dark-panel rounded-lg border border-dark-border p-6">
        <h3 className="text-lg font-bold text-dark-text mb-4">Alerts</h3>
        {alerts.length === 0 ? (
          <div className="text-dark-muted text-sm">No active alerts.</div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert, index) => (
              <div
                key={`${alert.level}-${index}`}
                className="rounded-lg border border-dark-border bg-dark-panel2 px-3 py-2 text-sm text-dark-text"
              >
                <span className="mr-2 uppercase text-xs text-dark-muted">{alert.level}</span>
                {alert.message}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-dark-panel rounded-lg border border-dark-border p-6">
        <h3 className="text-lg font-bold text-dark-text mb-4">Spend by Surface</h3>
        {surfaceBreakdown.length === 0 ? (
          <div className="text-dark-muted text-sm">No surface data yet.</div>
        ) : (
          <div className="space-y-3">
            {surfaceBreakdown.map((bucket) => (
              <div key={bucket.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-dark-text break-all">{bucket.key}</span>
                <span className="text-dark-muted text-right">
                  {formatUSD(bucket.costUSD)} · {bucket.requests} req
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-dark-panel rounded-lg border border-dark-border p-6">
        <h3 className="text-lg font-bold text-dark-text mb-4">Recent Calls</h3>
        {recentEvents.length === 0 ? (
          <div className="text-dark-muted text-sm">No recent calls.</div>
        ) : (
          <div className="space-y-3">
            {recentEvents.slice(0, 6).map((event) => (
              <div key={event.eventId} className="border-b border-dark-border pb-3 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-dark-text break-all">
                    {event.caller.agentId}
                  </span>
                  <span className="text-xs text-dark-muted">
                    {new Date(event.ts).toLocaleString()}
                  </span>
                </div>
                <div className="mt-1 text-xs text-dark-muted break-all">
                  {event.resolvedModelOrEngine} via {event.authLabel} on {event.caller.surface}
                </div>
                <div className="mt-1 text-xs text-dark-muted">
                  {formatUSD(event.estimatedCostUsd)} · {event.outcome}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
