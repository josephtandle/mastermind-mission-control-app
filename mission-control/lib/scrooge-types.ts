export interface MetricsFile {
  startDate: string;
  total: {
    requests: number;
    tokensUsed: number;
    tokensSaved: number;
    costUSD: number;
    costSavedUSD: number;
  };
  byModel: Record<string, {
    requests: number;
    tokensUsed: number;
    tokensSaved: number;
    costUSD: number;
    costSavedUSD: number;
  }>;
  byStrategy: Record<string, {
    uses: number;
    tokensSaved: number;
    costSavedUSD: number;
  }>;
  daily: Record<string, {
    requests: number;
    tokensUsed: number;
    tokensSaved: number;
    costUSD: number;
    costSavedUSD: number;
  }>;
}

export interface ScroogeBucket {
  key: string;
  requests: number;
  costUSD: number;
  inputTokens: number;
  outputTokens: number;
}

export interface ScroogeEvent {
  eventId: string;
  ts: string;
  outcome: string;
  resolvedProviderOrTool: string;
  resolvedModelOrEngine: string;
  estimatedCostUsd: number;
  authLabel: string;
  caller: {
    agentId: string;
    surface: string;
    project: string;
    jobId: string | null;
    runId: string | null;
    traceId: string | null;
    callerVersion: string | null;
  };
}

export interface ScroogeAlert {
  level: "info" | "warn" | "critical";
  message: string;
}

export interface ScroogeActivitySummary {
  totalRequests: number;
  totalTokensUsed: number;
  topAgents: ScroogeBucket[];
  topAuthLabels: ScroogeBucket[];
  recentEvents: ScroogeEvent[];
}

export interface ScroogeDashboard {
  stats: {
    totalSpendUSD: number;
    todaySpendUSD: number;
    totalRequests: number;
    totalTokensUsed: number;
    totalTokensSaved: number;
    totalCostSaved: number;
    savingsPercent: number;
    dataStartDate: string;
    uniqueAgents: number;
    unattributedSpendUSD: number;
  };
  costTrend: Array<{
    date: string;
    costUSD: number;
    requests: number;
  }>;
  modelBreakdown: Array<{
    model: string;
    requests: number;
    tokensUsed: number;
    costUSD: number;
    percentOfTotal: number;
  }>;
  strategies: Array<{
    name: string;
    uses: number;
    tokensSaved: number;
    costSavedUSD: number;
  }>;
  topAgents: ScroogeBucket[];
  topAuthLabels: ScroogeBucket[];
  surfaceBreakdown: ScroogeBucket[];
  alerts: ScroogeAlert[];
  recentEvents: ScroogeEvent[];
  activity: ScroogeActivitySummary;
  research: {
    lastUpdate: string | null;
    suggestions: Array<{
      name: string;
      confidence: string;
      mentions: number;
      implementation: string;
      sources: string[];
      installed: boolean;
    }>;
  };
  dataSources: {
    ledgerJsonl: {
      available: boolean;
      recordCount: number;
      lastUpdated: string;
    };
    activityJsonl: {
      available: boolean;
      recordCount: number;
      lastUpdated: string;
    };
    metricsJson?: {
      available: boolean;
      recordCount: number;
      lastUpdated: string;
    };
  };
  lastUpdated: string;
}

export type TimeRange = "today" | "7d" | "30d" | "all";
