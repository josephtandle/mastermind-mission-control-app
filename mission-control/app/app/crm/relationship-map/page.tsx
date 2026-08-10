"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Loader2,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  StickyNote,
  User,
  Users,
  X,
} from "lucide-react";

// ── Constants ────────────────────────────────────────────────────────

const STAGES = ["warm", "nurturing", "qualified", "converted", "stale"] as const;
type Stage = typeof STAGES[number];

const STAGE_META: Record<Stage, { label: string; color: string; dot: string }> = {
  warm: {
    label: "Warm",
    color: "border-t-cm-purple bg-cm-purple/5",
    dot: "bg-cm-purple",
  },
  nurturing: {
    label: "Nurturing",
    color: "border-t-dark-warn bg-dark-warn/5",
    dot: "bg-dark-warn",
  },
  qualified: {
    label: "In Conversation",
    color: "border-t-dark-success bg-dark-success/5",
    dot: "bg-dark-success",
  },
  converted: {
    label: "Converted",
    color: "border-t-cm-purple-mid bg-cm-purple-mid/5",
    dot: "bg-cm-purple-mid",
  },
  stale: {
    label: "Stale",
    color: "border-t-dark-border bg-dark-panel2/30",
    dot: "bg-dark-muted",
  },
};

// ── Types ─────────────────────────────────────────────────────────────

type ContactCard = {
  id: string;
  full_name: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  notes: string | null;
  updated_at: string;
  pipeline_status: Stage;
};

type GroupedContacts = Record<Stage, ContactCard[]>;

type Summary = {
  total: number;
  by_stage: Record<Stage, number>;
};

// ── Sub-components (module-level to avoid scroll jumps) ───────────────

interface KanbanCardProps {
  card: ContactCard;
  onStageChange: (contactId: string, newStage: Stage) => void;
  saving: boolean;
}

function KanbanCard({ card, onStageChange, saving }: KanbanCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pendingScrollY = useRef<number | null>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  useEffect(() => {
    if (pendingScrollY.current !== null) {
      window.scrollTo(0, pendingScrollY.current);
      pendingScrollY.current = null;
    }
  });

  const displayName = card.full_name?.trim() || "Unnamed contact";
  const notesSnippet = card.notes
    ? card.notes.length > 80
      ? card.notes.slice(0, 80) + "…"
      : card.notes
    : null;

  return (
    <div className="bg-dark-panel border border-dark-border rounded-xl p-3 space-y-2 hover:border-cm-purple/40 transition-colors">
      {/* Name row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <User size={13} className="text-dark-muted flex-shrink-0 mt-0.5" />
          <span className="text-sm font-medium text-dark-text truncate">{displayName}</span>
        </div>

        {/* Stage selector */}
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => {
              pendingScrollY.current = window.scrollY;
              setMenuOpen((v) => !v);
            }}
            disabled={saving}
            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-dark-panel2 border border-dark-border text-dark-muted hover:border-cm-purple/40 hover:text-cm-purple transition-colors disabled:opacity-50"
            title="Move to stage"
          >
            <span>{STAGE_META[card.pipeline_status].label}</span>
            <ChevronDown size={10} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-dark-panel border border-dark-border rounded-xl shadow-xl min-w-[150px] overflow-hidden">
              {STAGES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    if (s !== card.pipeline_status) {
                      onStageChange(card.id, s);
                    }
                  }}
                  className={`w-full text-left text-xs px-3 py-2 flex items-center gap-2 hover:bg-cm-purple/10 hover:text-cm-purple transition-colors ${
                    s === card.pipeline_status ? "text-cm-purple bg-cm-purple/10" : "text-dark-muted"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${STAGE_META[s].dot}`}
                  />
                  {STAGE_META[s].label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Contact details */}
      {card.primary_phone && (
        <div className="flex items-center gap-1.5 text-xs text-dark-muted">
          <Phone size={11} className="flex-shrink-0" />
          <span className="truncate">{card.primary_phone}</span>
        </div>
      )}
      {card.primary_email && (
        <div className="flex items-center gap-1.5 text-xs text-dark-muted">
          <Mail size={11} className="flex-shrink-0" />
          <span className="truncate">{card.primary_email}</span>
        </div>
      )}
      {notesSnippet && (
        <div className="flex items-start gap-1.5 text-xs text-dark-muted">
          <StickyNote size={11} className="flex-shrink-0 mt-0.5" />
          <span className="leading-relaxed">{notesSnippet}</span>
        </div>
      )}
    </div>
  );
}

interface KanbanColumnProps {
  stage: Stage;
  cards: ContactCard[];
  onStageChange: (contactId: string, newStage: Stage) => void;
  saving: string | null;
}

function KanbanColumn({ stage, cards, onStageChange, saving }: KanbanColumnProps) {
  const meta = STAGE_META[stage];
  return (
    <div
      className={`flex flex-col rounded-xl border-t-2 border border-dark-border ${meta.color} min-w-[230px] flex-1`}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-dark-border/60">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
          <span className="text-xs font-semibold text-dark-text uppercase tracking-wide">
            {meta.label}
          </span>
        </div>
        <span className="text-xs text-dark-muted bg-dark-panel2 border border-dark-border rounded-full px-2 py-0.5">
          {cards.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[calc(100vh-260px)]">
        {cards.length === 0 ? (
          <div className="py-8 text-center text-xs text-dark-muted italic">No contacts</div>
        ) : (
          cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onStageChange={onStageChange}
              saving={saving === card.id}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────

export default function ConnectionMapPage() {
  const [grouped, setGrouped] = useState<GroupedContacts>({
    warm: [],
    nurturing: [],
    qualified: [],
    converted: [],
    stale: [],
  });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const loadBoard = useCallback(async (searchStr = "") => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchStr) params.set("search", searchStr);
      const res = await fetch(`/api/crm/relationship-map?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load board");
      setGrouped(data.grouped || {});
      setSummary(data.summary || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => loadBoard(search), 300);
    return () => clearTimeout(t);
  }, [search, loadBoard]);

  const handleStageChange = useCallback(
    async (contactId: string, newStage: Stage) => {
      setSaving(contactId);
      // Optimistic update
      setGrouped((prev) => {
        const next = { ...prev } as GroupedContacts;
        let card: ContactCard | undefined;
        for (const stage of STAGES) {
          const idx = next[stage].findIndex((c) => c.id === contactId);
          if (idx !== -1) {
            [card] = next[stage].splice(idx, 1);
            next[stage] = [...next[stage]];
            break;
          }
        }
        if (card) {
          next[newStage] = [...next[newStage], { ...card, pipeline_status: newStage }];
        }
        return next;
      });

      try {
        const res = await fetch("/api/crm/relationship-map", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contact_id: contactId, pipeline_status: newStage }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Save failed");
        }
      } catch (err) {
        // Revert on error by reloading
        setError(err instanceof Error ? err.message : "Save failed");
        loadBoard(search);
      } finally {
        setSaving(null);
      }
    },
    [loadBoard, search]
  );

  const totalContacts = summary?.total ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-dark-panel border border-dark-border rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-cm-purple/15 rounded-lg">
              <MapPin size={22} className="text-cm-purple" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-dark-text">Connection Map</h1>
              <p className="text-sm text-dark-muted mt-0.5">
                Pipeline for non-pipeline pipelines (career planning and other offerings)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {summary && (
              <div className="flex items-center gap-1.5 text-xs text-dark-muted bg-dark-panel2 border border-dark-border rounded-full px-3 py-1">
                <Users size={12} />
                <span>{totalContacts} contact{totalContacts !== 1 ? "s" : ""}</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => loadBoard(search)}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-dark-border bg-dark-panel2 text-dark-muted hover:border-cm-purple/40 hover:text-cm-purple transition-colors disabled:opacity-50"
            >
              {loading ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <RefreshCw size={13} />
              )}
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="mt-4 relative max-w-sm">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-muted pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search contacts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-dark-border bg-dark-panel2 text-dark-text placeholder:text-dark-muted focus:outline-none focus:ring-2 focus:ring-cm-purple/40 focus:border-cm-purple transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-cm-purple/15 transition-colors"
            >
              <X size={12} className="text-dark-muted" />
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-dark-danger/10 border border-dark-danger/30 rounded-xl px-4 py-3 text-sm text-dark-danger flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-4 text-dark-danger hover:text-dark-danger/70 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Kanban board */}
      {loading && totalContacts === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-dark-muted" />
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STAGES.map((stage) => (
            <KanbanColumn
              key={stage}
              stage={stage}
              cards={grouped[stage] || []}
              onStageChange={handleStageChange}
              saving={saving}
            />
          ))}
        </div>
      )}
    </div>
  );
}
