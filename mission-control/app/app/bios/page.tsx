"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  BookText,
  CheckCircle2,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Type,
  X,
} from "lucide-react";

interface BioRow {
  id: string;
  record: string;
  name: string;
  title: string;
  variant: string;
  purpose: string;
  useWhen: string;
  sourcePage: string;
  links: string;
  bioText: string;
  entryType: string;
  isTitle: boolean;
  currentStatus: string;
  date: string | null;
  order: number;
  characterCount: number;
  lengthCategory: string;
  url: string;
  lastEditedTime: string;
}

interface BiosResponse {
  rows: BioRow[];
  stats: {
    total: number;
    current: number;
    old: number;
    titles: number;
    bios: number;
  };
  taxonomy: {
    statuses: string[];
    entryTypes: string[];
    lengthCategories: string[];
    sourcePages: string[];
    variants: string[];
  };
  sourcePageUrl: string;
  databaseUrl: string;
  hubUrl: string;
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-dark-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold text-dark-text">{value}</div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
        active
          ? "bg-cm-purple text-white"
          : "bg-dark-panel2 text-dark-muted hover:bg-cm-purple/10 hover:text-cm-purple"
      }`}
    >
      {children}
    </button>
  );
}

export default function BiosPage() {
  const [data, setData] = useState<BiosResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [lengthFilter, setLengthFilter] = useState("all");
  const [selected, setSelected] = useState<BioRow | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/bios");
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as BiosResponse;
      setData(json);
      if (!selected && json.rows.length > 0) setSelected(json.rows[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bios");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const rows = data?.rows || [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesSearch =
        !q ||
        [
          row.record,
          row.name,
          row.title,
          row.variant,
          row.purpose,
          row.useWhen,
          row.bioText,
          row.sourcePage,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      const matchesStatus = statusFilter === "all" || row.currentStatus === statusFilter;
      const matchesType = typeFilter === "all" || row.entryType === typeFilter;
      const matchesLength = lengthFilter === "all" || row.lengthCategory === lengthFilter;
      return matchesSearch && matchesStatus && matchesType && matchesLength;
    });
  }, [rows, search, statusFilter, typeFilter, lengthFilter]);

  useEffect(() => {
    if (!selected && filtered.length > 0) setSelected(filtered[0]);
    if (selected && !filtered.find((row) => row.id === selected.id)) {
      setSelected(filtered[0] ?? null);
    }
  }, [filtered, selected]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="mr-3 animate-spin text-cm-purple" size={28} />
        <span className="text-dark-muted">Loading bios...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-dark-danger/30 bg-dark-danger/10 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 text-dark-danger" size={20} />
          <div>
            <div className="font-medium text-dark-text">Failed to load bios</div>
            <div className="mt-1 text-sm text-dark-danger">{error || "Unknown error"}</div>
            <button
              onClick={() => void load()}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-dark-panel2 px-3 py-2 text-sm text-dark-text hover:bg-dark-panel"
            >
              <RefreshCw size={14} />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-dark-text">
            <BookText size={20} className="text-cm-purple" />
            Bios
          </h1>
          <p className="mt-1 text-sm text-dark-muted">
            Searchable identity library for Joe bios, titles, variants, and old positioning.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={data.hubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-dark-border px-3 py-2 text-sm text-dark-muted hover:bg-dark-panel2"
          >
            Hub
            <ArrowUpRight size={14} />
          </a>
          <a
            href={data.sourcePageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-dark-border px-3 py-2 text-sm text-dark-muted hover:bg-dark-panel2"
          >
            Source
            <ArrowUpRight size={14} />
          </a>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg bg-cm-purple px-3 py-2 text-sm text-white hover:bg-cm-purple/80"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Total" value={data.stats.total} tone="bg-dark-panel border-dark-border" />
        <StatCard label="Current" value={data.stats.current} tone="bg-dark-success/10 border-dark-success/30" />
        <StatCard label="Old" value={data.stats.old} tone="bg-dark-danger/10 border-dark-danger/30" />
        <StatCard label="Titles" value={data.stats.titles} tone="bg-cm-purple/10 border-cm-purple/30" />
        <StatCard label="Bios" value={data.stats.bios} tone="bg-dark-panel border-dark-border" />
      </div>

      <div className="rounded-xl border border-dark-border bg-dark-panel p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search record, title, purpose, use case, copy..."
              className="w-full rounded-xl border border-dark-border bg-dark-bg py-2.5 pl-9 pr-10 text-sm text-dark-text focus:outline-none focus:ring-2 focus:ring-cm-purple"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-muted hover:text-dark-text"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-dark-muted">
            <Filter size={14} />
            {filtered.length} showing
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Pill active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>All statuses</Pill>
          {data.taxonomy.statuses.map((status) => (
            <Pill key={status} active={statusFilter === status} onClick={() => setStatusFilter(status)}>
              {status}
            </Pill>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Pill active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>All types</Pill>
          {data.taxonomy.entryTypes.map((type) => (
            <Pill key={type} active={typeFilter === type} onClick={() => setTypeFilter(type)}>
              {type}
            </Pill>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Pill active={lengthFilter === "all"} onClick={() => setLengthFilter("all")}>All lengths</Pill>
          {data.taxonomy.lengthCategories.map((length) => (
            <Pill key={length} active={lengthFilter === length} onClick={() => setLengthFilter(length)}>
              {length}
            </Pill>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="min-w-0 overflow-hidden rounded-xl border border-dark-border bg-dark-panel">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-border bg-dark-bg text-left text-xs uppercase tracking-wide text-dark-muted">
                  <th className="px-4 py-3">Record</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Length</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border">
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelected(row)}
                    className={`cursor-pointer transition-colors hover:bg-cm-purple/10 ${
                      selected?.id === row.id ? "bg-cm-purple/10" : ""
                    }`}
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium text-dark-text">{row.record}</div>
                      <div className="mt-1 text-xs text-dark-muted">{row.variant || "No variant"}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="line-clamp-2 text-dark-text">{row.title || "—"}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className="inline-flex rounded-full bg-cm-purple/10 px-2 py-0.5 text-xs text-cm-purple">
                        {row.entryType || (row.isTitle ? "Title" : "Bio")}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="text-dark-text">{row.lengthCategory || "—"}</div>
                      <div className="mt-1 text-xs text-dark-muted">{row.characterCount} chars</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                          row.currentStatus === "Current"
                            ? "bg-dark-success/10 text-dark-success"
                            : row.currentStatus === "Old"
                              ? "bg-dark-danger/10 text-dark-danger"
                              : "bg-dark-panel2 text-dark-muted"
                        }`}
                      >
                        {row.currentStatus || "Unknown"}
                      </span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-dark-muted">
                      No bios matched this search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-dark-border bg-dark-panel p-5">
          {selected ? (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-dark-text">{selected.record}</div>
                  <div className="mt-1 text-sm text-dark-muted">{selected.variant || "No variant"}</div>
                </div>
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-dark-border px-2.5 py-1.5 text-xs text-dark-muted hover:bg-dark-panel2"
                >
                  Open
                  <ArrowUpRight size={12} />
                </a>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-dark-bg p-3">
                  <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-dark-muted">
                    <Type size={12} />
                    Title
                  </div>
                  <div className="text-sm text-dark-text">{selected.title || "—"}</div>
                </div>
                <div className="rounded-lg bg-dark-bg p-3">
                  <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-dark-muted">
                    <Tag size={12} />
                    Purpose
                  </div>
                  <div className="text-sm text-dark-text">{selected.purpose || "—"}</div>
                </div>
                <div className="rounded-lg bg-dark-bg p-3">
                  <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-dark-muted">
                    <Sparkles size={12} />
                    Use When
                  </div>
                  <div className="text-sm text-dark-text">{selected.useWhen || "—"}</div>
                </div>
                <div className="rounded-lg bg-dark-bg p-3">
                  <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-dark-muted">
                    <CheckCircle2 size={12} />
                    Metadata
                  </div>
                  <div className="space-y-1 text-sm text-dark-text">
                    <div>{selected.entryType || "Bio"} / {selected.lengthCategory || "—"}</div>
                    <div>{selected.characterCount} chars</div>
                    <div>{selected.currentStatus || "Unknown"}</div>
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs uppercase tracking-wide text-dark-muted">Bio Text</div>
                <div className="whitespace-pre-wrap rounded-lg bg-dark-bg p-4 text-sm leading-6 text-dark-text">
                  {selected.bioText || "No body text"}
                </div>
              </div>

              <div className="grid gap-3 text-xs text-dark-muted">
                <div>
                  <span className="font-medium text-dark-text">Source:</span> {selected.sourcePage || "—"}
                </div>
                <div>
                  <span className="font-medium text-dark-text">Date:</span> {selected.date || "—"}
                </div>
                <div>
                  <span className="font-medium text-dark-text">Last edited:</span>{" "}
                  {new Date(selected.lastEditedTime).toLocaleString()}
                </div>
                {selected.links && (
                  <div className="break-all">
                    <span className="font-medium text-dark-text">Links:</span> {selected.links}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="py-16 text-center text-dark-muted">Select a bio to inspect it.</div>
          )}
        </div>
      </div>
    </div>
  );
}
