"use client";

import { DollarSign, CalendarDays, Hash, AlertTriangle } from "lucide-react";
import type { ScroogeDashboard } from "@/lib/scrooge-types";

function formatUSD(value: number): string {
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

export default function StatCards({ stats }: { stats: ScroogeDashboard["stats"] }) {
  const cards = [
    {
      label: "Total Spend",
      value: formatUSD(stats.totalSpendUSD),
      subtitle: `Since ${stats.dataStartDate ? new Date(stats.dataStartDate).toLocaleDateString() : "—"}`,
      icon: DollarSign,
      gradient: "from-cm-purple to-cm-purple/60",
      lightText: "text-cm-purple",
    },
    {
      label: "Today's Spend",
      value: formatUSD(stats.todaySpendUSD),
      subtitle: `${stats.totalTokensUsed.toLocaleString()} tokens total`,
      icon: CalendarDays,
      gradient: "from-cm-purple to-cm-purple-mid",
      lightText: "text-cm-purple-mid",
    },
    {
      label: "Total Requests",
      value: stats.totalRequests.toLocaleString(),
      subtitle: `${stats.uniqueAgents.toLocaleString()} agent(s) attributed`,
      icon: Hash,
      gradient: "from-cm-purple to-cm-purple/60",
      lightText: "text-dark-muted",
    },
    {
      label: "Unattributed Spend",
      value: formatUSD(stats.unattributedSpendUSD),
      subtitle: "Needs caller metadata",
      icon: AlertTriangle,
      gradient: "from-amber-500 to-orange-500",
      lightText: "text-amber-100",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className={`bg-gradient-to-br ${card.gradient} text-white rounded-lg p-6`}
          >
            <div className="flex items-center justify-between mb-2">
              <p className={`${card.lightText} text-sm`}>{card.label}</p>
              <Icon size={20} className={card.lightText} />
            </div>
            <p className="text-3xl font-bold">{card.value}</p>
            <p className={`text-xs ${card.lightText} mt-1`}>{card.subtitle}</p>
          </div>
        );
      })}
    </div>
  );
}
