"use client";

import { Database, CheckCircle } from "lucide-react";
import type { ScroogeBucket, ScroogeDashboard } from "@/lib/scrooge-types";

const MODEL_COLORS: Record<string, string> = {
  "gpt-5.4": "bg-cm-purple",
  "gpt-5.4-mini": "bg-cm-purple/80",
  "gpt-5.5": "bg-dark-warn/100",
};

function formatUSD(value: number): string {
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function ModelBars({
  models,
}: {
  models: ScroogeDashboard["modelBreakdown"];
}) {
  if (models.length === 0) {
    return (
      <div className="text-center py-8 text-dark-muted">No model data yet</div>
    );
  }

  return (
    <div className="space-y-4">
      {models.map((m) => (
        <div key={m.model}>
          <div className="flex items-center justify-between mb-1 gap-3">
            <span className="text-sm font-medium text-dark-text break-all">
              {m.model}
            </span>
            <span className="text-sm text-dark-muted text-right">
              {formatUSD(m.costUSD)} · {m.requests} req · {m.percentOfTotal.toFixed(0)}%
            </span>
          </div>
          <div className="w-full bg-dark-panel2 rounded-full h-3">
            <div
              className={`h-full rounded-full ${MODEL_COLORS[m.model] || "bg-dark-bg0"}`}
              style={{ width: `${Math.max(m.percentOfTotal, 2)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function AttributionTable({
  title,
  buckets,
}: {
  title: string;
  buckets: ScroogeBucket[];
}) {
  return (
    <div className="bg-dark-panel rounded-lg border border-dark-border p-6">
      <h3 className="text-lg font-bold text-dark-text mb-4">{title}</h3>
      {buckets.length === 0 ? (
        <div className="text-center py-8 text-dark-muted">No data yet</div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-dark-border">
              <th className="text-left text-xs font-medium text-dark-muted uppercase pb-2">
                Name
              </th>
              <th className="text-right text-xs font-medium text-dark-muted uppercase pb-2">
                Requests
              </th>
              <th className="text-right text-xs font-medium text-dark-muted uppercase pb-2">
                Spend
              </th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((bucket) => (
              <tr key={bucket.key} className="border-b border-slate-50">
                <td className="py-2 text-sm font-medium text-dark-text break-all">
                  {bucket.key}
                </td>
                <td className="py-2 text-sm text-dark-muted text-right">
                  {bucket.requests}
                </td>
                <td className="py-2 text-sm text-dark-muted text-right">
                  {formatUSD(bucket.costUSD)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DataSources({
  dataSources,
}: {
  dataSources: ScroogeDashboard["dataSources"];
}) {
  const { ledgerJsonl } = dataSources;
  const { activityJsonl } = dataSources;

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-3">
        <Database size={16} className="text-dark-muted" />
        <span className="text-dark-muted">billable usage ledger</span>
        {ledgerJsonl.available ? (
          <>
            <CheckCircle size={14} className="text-dark-success" />
            <span className="text-dark-muted">
              {ledgerJsonl.recordCount} records
            </span>
          </>
        ) : (
          <span className="text-dark-muted">Not found</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Database size={16} className="text-dark-muted" />
        <span className="text-dark-muted">non-billable activity ledger</span>
        {activityJsonl.available ? (
          <>
            <CheckCircle size={14} className="text-dark-success" />
            <span className="text-dark-muted">
              {activityJsonl.recordCount} records
            </span>
          </>
        ) : (
          <span className="text-dark-muted">Not found</span>
        )}
      </div>
    </div>
  );
}

export default function ModelBreakdown({
  modelBreakdown,
  topAgents,
  topAuthLabels,
  dataSources,
}: {
  modelBreakdown: ScroogeDashboard["modelBreakdown"];
  topAgents: ScroogeDashboard["topAgents"];
  topAuthLabels: ScroogeDashboard["topAuthLabels"];
  dataSources: ScroogeDashboard["dataSources"];
}) {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-dark-panel rounded-lg border border-dark-border p-6">
          <h3 className="text-lg font-bold text-dark-text mb-4">
            Cost by Model
          </h3>
          <ModelBars models={modelBreakdown} />
        </div>

        <AttributionTable title="Top Agents" buckets={topAgents} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AttributionTable title="Top API Keys / Auth Labels" buckets={topAuthLabels} />

        <div className="bg-dark-panel rounded-lg border border-dark-border p-4">
          <h3 className="text-sm font-medium text-dark-text mb-2">
            Data Sources
          </h3>
          <DataSources dataSources={dataSources} />
        </div>
      </div>
    </>
  );
}
