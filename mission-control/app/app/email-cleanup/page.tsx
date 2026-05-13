"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Clock3,
  FileText,
  FolderOpen,
  Inbox,
  Loader2,
  Mail,
  Play,
  RefreshCw,
  Shield,
  Sparkles,
} from "lucide-react";
import ApiKeyBanner from "@/components/ApiKeyBanner";
import UncertainEmailsSection from "./sections/UncertainEmailsSection";
import WhitelistSection from "./sections/WhitelistSection";
import MetricsSection from "./sections/MetricsSection";
import LogsSection from "./sections/LogsSection";

type Section = "overview" | "uncertain" | "whitelist" | "metrics" | "logs";

interface OverviewData {
  running: boolean;
  account: string | null;
  rulesProfile: string | null;
  cleanupEnabled: boolean;
  rulesPath: string | null;
  totalRules: number;
  customRuleCount: number;
  protectedSenders: number;
  pendingUncertain: number;
  totalTrackedEmails: number;
  topPlatform: string | null;
  totalRuns: number;
  totalEmailsTrashed: number;
  successRate: number;
  latestReport: {
    date: string;
    deleted: number;
    filed: number;
    learningPatterns: string[];
    patternCount: number;
    startTime: string;
    endTime: string;
    status: "completed" | "failed";
  } | null;
}

const defaultOverview: OverviewData = {
  running: false,
  account: null,
  rulesProfile: null,
  cleanupEnabled: false,
  rulesPath: null,
  totalRules: 0,
  customRuleCount: 0,
  protectedSenders: 0,
  pendingUncertain: 0,
  totalTrackedEmails: 0,
  topPlatform: null,
  totalRuns: 0,
  totalEmailsTrashed: 0,
  successRate: 0,
  latestReport: null,
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Unavailable";
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function metricCard(
  label: string,
  value: string | number,
  detail: string,
  accent: string,
  Icon: React.ComponentType<{ className?: string; size?: number }>
) {
  return (
    <div className="rounded-2xl border border-dark-border bg-dark-panel p-5 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-dark-muted">
            {label}
          </p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-dark-text">
            {value}
          </p>
          <p className="mt-2 text-sm text-dark-muted">{detail}</p>
        </div>
        <div className={`rounded-2xl border px-3 py-3 ${accent}`}>
          <Icon size={20} className="text-current" />
        </div>
      </div>
    </div>
  );
}

export default function EmailCleanupPage() {
  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [overview, setOverview] = useState<OverviewData>(defaultOverview);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [emmyRunning, setEmmyRunning] = useState(false);
  const [emmyResult, setEmmyResult] = useState<{ success: boolean; message: string } | null>(null);

  const refreshOverview = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const [runRes, configRes, whitelistRes, uncertainRes, metricsRes, logsRes] =
        await Promise.all([
          fetch("/api/emmie/run"),
          fetch("/api/emmie/config"),
          fetch("/api/emmie/whitelist"),
          fetch("/api/emmie/uncertain?status=pending&limit=500"),
          fetch("/api/emmie/metrics"),
          fetch("/api/emmie/logs"),
        ]);

      const [runData, configData, whitelistData, uncertainData, metricsData, logsData] =
        await Promise.all([
          runRes.json(),
          configRes.json(),
          whitelistRes.json(),
          uncertainRes.json(),
          metricsRes.json(),
          logsRes.json(),
        ]);

      setEmmyRunning(Boolean(runData.running));
      setOverview({
        running: Boolean(runData.running),
        account: configData.account || runData.account || null,
        rulesProfile: configData.rulesProfile || runData.rulesProfile || null,
        cleanupEnabled: Boolean(configData.cleanupEnabled),
        rulesPath: configData.rulesPath || null,
        totalRules: configData.totalRules || 0,
        customRuleCount: configData.customRuleCount || 0,
        protectedSenders: (whitelistData.whitelist || []).length,
        pendingUncertain: uncertainData.count || 0,
        totalTrackedEmails: metricsData.totalEmails || 0,
        topPlatform: metricsData.platformStats?.[0]?.platform || null,
        totalRuns: logsData.summary?.totalRuns || 0,
        totalEmailsTrashed: logsData.summary?.totalEmailsTrashed || 0,
        successRate: logsData.summary?.successRate || 0,
        latestReport: logsData.summary?.latestReport || null,
      });
    } catch {
      setOverview(defaultOverview);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    refreshOverview();
  }, []);

  const handleRunEmmy = async () => {
    setEmmyRunning(true);
    setEmmyResult(null);

    try {
      const res = await fetch("/api/emmie/run", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setEmmyResult({
          success: true,
          message: data.message || "Cleanup completed successfully",
        });
      } else {
        setEmmyResult({
          success: false,
          message: data.error || "Cleanup failed",
        });
      }
    } catch {
      setEmmyResult({
        success: false,
        message: "Failed to reach Emmy runtime",
      });
    } finally {
      setEmmyRunning(false);
      refreshOverview(true);
    }
  };

  const latestNarrative = useMemo(() => {
    if (!overview.latestReport) {
      return "Emmy is connected, but there is no cleanup report yet.";
    }

    const bits = [
      `${overview.latestReport.deleted} emails cleared`,
      `${overview.latestReport.filed} filed for later`,
      `${overview.latestReport.patternCount} new sender patterns learned`,
    ].filter(Boolean);

    return bits.join(" · ");
  }, [overview.latestReport]);

  const menuItems: Array<{ id: Section; label: string; icon: typeof Mail }> = [
    { id: "overview", label: "Overview", icon: Sparkles },
    { id: "uncertain", label: "Edge Cases", icon: AlertCircle },
    { id: "whitelist", label: "Guardrails", icon: Shield },
    { id: "metrics", label: "Metrics", icon: BarChart3 },
    { id: "logs", label: "Reports", icon: FileText },
  ];

  return (
    <div className="space-y-6">
      <ApiKeyBanner slug="google" agentName="Gmail / Email Cleanup" />

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="sticky top-6 overflow-hidden rounded-[28px] border border-dark-border bg-dark-panel shadow-[0_30px_80px_rgba(0,0,0,0.28)]">
            <div className="border-b border-dark-border bg-[linear-gradient(135deg,rgba(155,92,255,0.18),rgba(26,26,31,0.95)_55%,rgba(255,114,168,0.12))] px-5 py-5">
              <p className="text-[11px] uppercase tracking-[0.28em] text-cm-purple-mid">
                Emmy Ops
              </p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-dark-text">
                Email Cleanup
              </h1>
              <p className="mt-2 text-sm leading-6 text-dark-muted">
                Live inbox cleanup, filing, guardrails, and learning signals from Emmy.
              </p>
            </div>

            <div className="space-y-1 p-3">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm transition-colors ${
                      isActive
                        ? "bg-cm-purple/12 text-cm-purple"
                        : "text-dark-muted hover:bg-dark-bg hover:text-dark-text"
                    }`}
                  >
                    <Icon size={18} className="shrink-0" />
                    <span className="truncate font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <main className="space-y-6">
          <section className="overflow-hidden rounded-[30px] border border-dark-border bg-[radial-gradient(circle_at_top_left,rgba(155,92,255,0.24),transparent_38%),radial-gradient(circle_at_top_right,rgba(255,114,168,0.18),transparent_28%),linear-gradient(180deg,rgba(27,28,34,0.96),rgba(20,21,27,1))] shadow-[0_30px_90px_rgba(0,0,0,0.3)]">
            <div className="grid gap-6 px-6 py-7 lg:grid-cols-[minmax(0,1.5fr)_360px] lg:px-8">
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.22em] text-dark-muted">
                  <span className="rounded-full border border-cm-purple/30 bg-cm-purple/12 px-3 py-1 text-cm-purple-mid">
                    {overview.account || "No account"}
                  </span>
                  {overview.rulesProfile && (
                    <span className="rounded-full border border-dark-border bg-dark-bg px-3 py-1">
                      {overview.rulesProfile}
                    </span>
                  )}
                  <span
                    className={`rounded-full border px-3 py-1 ${
                      overview.cleanupEnabled
                        ? "border-dark-success/30 bg-dark-success/10 text-dark-success"
                        : "border-dark-warn/30 bg-dark-warn/10 text-dark-warn"
                    }`}
                  >
                    {overview.cleanupEnabled ? "Cleanup enabled" : "Cleanup paused"}
                  </span>
                </div>

                <div>
                  <h2 className="max-w-3xl text-4xl font-bold tracking-tight text-dark-text sm:text-[2.7rem]">
                    Emmy is finally speaking through real reports, not dead placeholders.
                  </h2>
                  <p className="mt-4 max-w-2xl text-base leading-7 text-dark-muted">
                    Latest run: {latestNarrative} {overview.latestReport ? `Completed ${formatDateTime(overview.latestReport.endTime)}.` : ""}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleRunEmmy}
                    disabled={emmyRunning}
                    className={`inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white transition-colors ${
                      emmyRunning
                        ? "cursor-not-allowed bg-dark-warn"
                        : "bg-cm-purple hover:bg-cm-purple/85"
                    }`}
                  >
                    {emmyRunning ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Running Emmy
                      </>
                    ) : (
                      <>
                        <Play size={16} />
                        Go Talk to Emmy
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => refreshOverview(true)}
                    disabled={refreshing}
                    className="inline-flex items-center gap-2 rounded-2xl border border-dark-border bg-dark-bg px-5 py-3 text-sm font-medium text-dark-text transition-colors hover:bg-dark-panel2"
                  >
                    <RefreshCw
                      size={16}
                      className={refreshing ? "animate-spin" : ""}
                    />
                    Refresh reports
                  </button>

                  {emmyResult && (
                    <span
                      className={`text-sm font-medium ${
                        emmyResult.success ? "text-dark-success" : "text-dark-danger"
                      }`}
                    >
                      {emmyResult.message}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <div className="rounded-[24px] border border-dark-border bg-dark-panel/80 p-5">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-dark-muted">
                    Latest report
                  </p>
                  <div className="mt-4 flex items-center gap-3">
                    <div className="rounded-2xl border border-dark-success/20 bg-dark-success/10 p-3 text-dark-success">
                      <CheckCircle2 size={20} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold tracking-tight text-dark-text">
                        {overview.latestReport?.deleted ?? 0}
                      </p>
                      <p className="text-sm text-dark-muted">
                        emails deleted in the latest pass
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-sm text-dark-muted">
                    <span>Filed</span>
                    <span className="font-medium text-dark-text">
                      {overview.latestReport?.filed ?? 0}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm text-dark-muted">
                    <span>Learned patterns</span>
                    <span className="font-medium text-dark-text">
                      {overview.latestReport?.patternCount ?? 0}
                    </span>
                  </div>
                </div>

                <div className="rounded-[24px] border border-dark-border bg-dark-panel/80 p-5">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-dark-muted">
                    Guardrails
                  </p>
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-dark-muted">Protected senders</span>
                      <span className="font-semibold text-dark-text">
                        {overview.protectedSenders}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-dark-muted">Pending reviews</span>
                      <span className="font-semibold text-dark-text">
                        {overview.pendingUncertain}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-dark-muted">Success rate</span>
                      <span className="font-semibold text-dark-text">
                        {overview.successRate}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {loading ? (
            <div className="rounded-2xl border border-dark-border bg-dark-panel p-10 text-center">
              <Loader2 className="mx-auto animate-spin text-cm-purple" size={28} />
              <p className="mt-3 text-sm text-dark-muted">Loading Emmy reports…</p>
            </div>
          ) : activeSection === "overview" ? (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {metricCard(
                  "Deleted",
                  overview.latestReport?.deleted ?? 0,
                  "latest cleanup pass",
                  "border-dark-success/20 bg-dark-success/10 text-dark-success",
                  Inbox
                )}
                {metricCard(
                  "Filed",
                  overview.latestReport?.filed ?? 0,
                  "routed into durable labels",
                  "border-cm-purple/20 bg-cm-purple/12 text-cm-purple",
                  FolderOpen
                )}
                {metricCard(
                  "Protected",
                  overview.protectedSenders,
                  "whitelisted senders and domains",
                  "border-dark-border bg-dark-bg text-dark-text",
                  Shield
                )}
                {metricCard(
                  "Tracked",
                  overview.totalTrackedEmails,
                  overview.topPlatform ? `top source: ${overview.topPlatform}` : "metrics feed connected",
                  "border-cm-pink/20 bg-cm-pink/10 text-cm-pink-light",
                  BarChart3
                )}
              </div>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.9fr)]">
                <section className="rounded-[28px] border border-dark-border bg-dark-panel p-6 shadow-[0_24px_70px_rgba(0,0,0,0.22)]">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl border border-cm-purple/20 bg-cm-purple/12 p-3 text-cm-purple">
                      <Sparkles size={18} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold tracking-tight text-dark-text">
                        Emmy&apos;s latest report
                      </h3>
                      <p className="text-sm text-dark-muted">
                        {overview.latestReport
                          ? `${formatDateTime(overview.latestReport.endTime)} · ${overview.latestReport.status}`
                          : "No latest run yet"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 sm:grid-cols-3">
                    <div className="rounded-2xl bg-dark-bg p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-dark-muted">
                        Cleanup account
                      </p>
                      <p className="mt-3 font-semibold text-dark-text">
                        {overview.account || "Unknown"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-dark-bg p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-dark-muted">
                        Rules profile
                      </p>
                      <p className="mt-3 font-semibold text-dark-text">
                        {overview.rulesProfile || "Unavailable"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-dark-bg p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-dark-muted">
                        Run history
                      </p>
                      <p className="mt-3 font-semibold text-dark-text">
                        {overview.totalRuns} logged runs
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 rounded-[24px] border border-dark-border bg-[linear-gradient(180deg,rgba(155,92,255,0.08),rgba(26,26,31,0.65))] p-5">
                    <p className="text-xs uppercase tracking-[0.22em] text-dark-muted">
                      Why this demo now feels real
                    </p>
                    <div className="mt-4 space-y-3 text-sm leading-6 text-dark-muted">
                      <p>
                        Emmy is now wired to the real workspace runtime, real metrics CSV, and real
                        cleanup logs under <code className="rounded bg-dark-bg px-1.5 py-0.5 text-dark-text">~/.myos/workspace</code>.
                      </p>
                      <p>
                        Mission Control is showing actual operational reporting: latest deleted volume,
                        filing volume, pending edge cases, protected sender count, and learned sender
                        patterns from the most recent run.
                      </p>
                      <p>
                        Rules profile source:{" "}
                        <code className="rounded bg-dark-bg px-1.5 py-0.5 text-dark-text">
                          {overview.rulesPath || "Unavailable"}
                        </code>
                      </p>
                    </div>
                  </div>
                </section>

                <section className="rounded-[28px] border border-dark-border bg-dark-panel p-6 shadow-[0_24px_70px_rgba(0,0,0,0.22)]">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl border border-dark-border bg-dark-bg p-3 text-dark-text">
                      <Clock3 size={18} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold tracking-tight text-dark-text">
                        Learning queue
                      </h3>
                      <p className="text-sm text-dark-muted">
                        Patterns Emmy thinks should be added next
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    {(overview.latestReport?.learningPatterns || []).slice(0, 8).map((pattern) => (
                      <div
                        key={pattern}
                        className="flex items-start gap-3 rounded-2xl border border-dark-border bg-dark-bg px-4 py-3"
                      >
                        <Mail size={16} className="mt-0.5 shrink-0 text-cm-purple" />
                        <div>
                          <p className="text-sm font-medium text-dark-text">{pattern}</p>
                          <p className="text-xs text-dark-muted">
                            surfaced from recent trash analysis
                          </p>
                        </div>
                      </div>
                    ))}

                    {!(overview.latestReport?.learningPatterns || []).length && (
                      <div className="rounded-2xl border border-dark-border bg-dark-bg px-4 py-6 text-sm text-dark-muted">
                        No learning patterns surfaced from the latest run.
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>
          ) : activeSection === "uncertain" ? (
            <UncertainEmailsSection />
          ) : activeSection === "whitelist" ? (
            <WhitelistSection />
          ) : activeSection === "metrics" ? (
            <MetricsSection />
          ) : (
            <LogsSection />
          )}
        </main>
      </div>
    </div>
  );
}
