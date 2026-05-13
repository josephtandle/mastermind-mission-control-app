"use client";

import type { ScroogeDashboard } from "@/lib/scrooge-types";

function formatNumber(value: number): string {
  return value.toLocaleString();
}

export default function ActivityOverview({
  activity,
}: {
  activity: ScroogeDashboard["activity"];
}) {
  return (
    <div className="bg-dark-panel rounded-lg border border-dark-border p-6 space-y-6">
      <div>
        <h3 className="text-lg font-bold text-dark-text">Non-Billable Activity</h3>
        <p className="text-sm text-dark-muted">
          OAuth and local-tool history, separated from API spend.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg bg-dark-panel2 p-4">
          <div className="text-xs uppercase text-dark-muted mb-1">Requests</div>
          <div className="text-2xl font-bold text-dark-text">
            {formatNumber(activity.totalRequests)}
          </div>
        </div>
        <div className="rounded-lg bg-dark-panel2 p-4">
          <div className="text-xs uppercase text-dark-muted mb-1">Tokens Used</div>
          <div className="text-2xl font-bold text-dark-text">
            {formatNumber(activity.totalTokensUsed)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h4 className="text-sm font-medium text-dark-text mb-3">Top Activity Agents</h4>
          <div className="space-y-2">
            {activity.topAgents.length === 0 ? (
              <div className="text-sm text-dark-muted">No non-billable activity yet.</div>
            ) : (
              activity.topAgents.map((bucket) => (
                <div key={bucket.key} className="flex items-center justify-between text-sm">
                  <span className="text-dark-text break-all">{bucket.key}</span>
                  <span className="text-dark-muted">{bucket.requests} req</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium text-dark-text mb-3">Top Activity Auth Labels</h4>
          <div className="space-y-2">
            {activity.topAuthLabels.length === 0 ? (
              <div className="text-sm text-dark-muted">No OAuth/local activity yet.</div>
            ) : (
              activity.topAuthLabels.map((bucket) => (
                <div key={bucket.key} className="flex items-center justify-between text-sm">
                  <span className="text-dark-text break-all">{bucket.key}</span>
                  <span className="text-dark-muted">{bucket.requests} req</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium text-dark-text mb-3">Recent Non-Billable Calls</h4>
        <div className="space-y-3">
          {activity.recentEvents.length === 0 ? (
            <div className="text-sm text-dark-muted">No recent activity.</div>
          ) : (
            activity.recentEvents.slice(0, 6).map((event) => (
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
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
