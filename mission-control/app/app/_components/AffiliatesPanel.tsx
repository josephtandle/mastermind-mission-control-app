"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronRight, DollarSign, Loader2, Plus, Save, Trash2, Users, X } from "lucide-react";

// ── Types & constants ────────────────────────────────────────────

export type AffiliateRecord = {
  id: string;
  first_name: string;
  last_name?: string | null;
  email?: string | null;
  commission_percentage: number;
  paypal_email?: string | null;
  wise_url?: string | null;
  bank_transfer_info?: string | null;
  preferred_payment_method?: string | null;
  created_at?: string;
  updated_at?: string;
  display_name: string;
};

export const AFFILIATE_PAYMENT_METHOD_OPTIONS = [
  { value: "paypal", label: "PayPal" },
  { value: "wise", label: "Wise" },
  { value: "bank_transfer", label: "Bank Transfer" },
];

export function createEmptyAffiliateDraft() {
  return {
    first_name: "",
    last_name: "",
    email: "",
    commission_percentage: "10",
    paypal_email: "",
    wise_url: "",
    bank_transfer_info: "",
    preferred_payment_method: "",
  };
}

type AffiliatePayout = {
  id: string;
  affiliate_id: string;
  amount_cents: number;
  paid_at: string;
  note?: string | null;
  status: "pending" | "paid";
  created_at: string;
  updated_at: string;
};

type AffiliateModalTab = "profile" | "referred" | "payouts";

type ParticipantCharge = {
  participant_id: number;
  amount_cents: number;
  charge_date: string;
  status: string;
};

type ReferredParticipant = {
  id: number;
  full_name: string;
  amount_cents: number | null;
  billing_status: string | null;
  plan_name: string | null;
  group_number: number | null;
  commission_cents: number;
  charges: ParticipantCharge[];
};

function formatUSD(cents: number) {
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Sub-components (module-level, no nesting) ────────────────────

export function AffiliateAvatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  const colors = [
    "bg-cm-purple/20 text-cm-purple",
    "bg-violet-500/20 text-violet-300",
    "bg-pink-500/20 text-pink-300",
    "bg-dark-warn/20 text-dark-warn",
    "bg-sky-500/20 text-sky-300",
  ];
  const colorIdx = (name.charCodeAt(0) || 0) % colors.length;
  const s = `${size}px`;
  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold flex-shrink-0 ${colors[colorIdx]}`}
      style={{ width: s, height: s, fontSize: size < 32 ? "10px" : "13px" }}
    >
      {initials || "?"}
    </div>
  );
}

function AffiliateEditField({
  label,
  value,
  onChange,
  multiline,
  type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  type?: string;
}) {
  const base =
    "w-full border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cm-purple bg-dark-panel2 text-dark-text transition-colors";
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-dark-muted mb-1">
        {label}
      </label>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} className={`${base} resize-y h-24`} />
      ) : (
        <input type={type ?? "text"} value={value} onChange={(e) => onChange(e.target.value)} className={base} />
      )}
    </div>
  );
}

function AffiliateModalTabs({
  activeTab,
  onTabChange,
  isNew,
}: {
  activeTab: AffiliateModalTab;
  onTabChange: (tab: AffiliateModalTab) => void;
  isNew: boolean;
}) {
  const tabs: { key: AffiliateModalTab; label: string }[] = [
    { key: "profile", label: "Profile" },
    { key: "referred", label: "People Referred" },
    { key: "payouts", label: "Payouts" },
  ];
  return (
    <div className="flex items-center gap-1 px-6 border-b border-dark-border bg-dark-panel">
      {tabs.map((t) => {
        const disabled = isNew && t.key !== "profile";
        const active = activeTab === t.key;
        return (
          <button
            key={t.key}
            disabled={disabled}
            onClick={() => { if (!disabled) onTabChange(t.key); }}
            className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px
              ${disabled ? "opacity-40 cursor-not-allowed text-dark-muted border-transparent" :
                active ? "text-cm-purple border-cm-purple" :
                "text-dark-muted hover:text-dark-text border-transparent hover:bg-dark-panel2"}`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function AffiliateProfileSection({
  draft,
  setDraft,
}: {
  draft: ReturnType<typeof createEmptyAffiliateDraft>;
  setDraft: React.Dispatch<React.SetStateAction<ReturnType<typeof createEmptyAffiliateDraft>>>;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-dark-muted border-b border-dark-border pb-1">
          Profile
        </h3>
        <AffiliateEditField
          label="First Name"
          value={draft.first_name}
          onChange={(v) => setDraft((d) => ({ ...d, first_name: v }))}
        />
        <AffiliateEditField
          label="Last Name"
          value={draft.last_name}
          onChange={(v) => setDraft((d) => ({ ...d, last_name: v }))}
        />
        <AffiliateEditField
          label="Email"
          value={draft.email}
          onChange={(v) => setDraft((d) => ({ ...d, email: v }))}
        />
        <AffiliateEditField
          label="Commission %"
          value={draft.commission_percentage}
          onChange={(v) => setDraft((d) => ({ ...d, commission_percentage: v }))}
          type="number"
        />
      </div>
      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-dark-muted border-b border-dark-border pb-1">
          Payment
        </h3>
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-dark-muted mb-1">
            Preferred Method
          </label>
          <select
            value={draft.preferred_payment_method}
            onChange={(e) => setDraft((d) => ({ ...d, preferred_payment_method: e.target.value }))}
            className="w-full border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cm-purple bg-dark-panel2 text-dark-text"
          >
            <option value="">Select method</option>
            {AFFILIATE_PAYMENT_METHOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <AffiliateEditField
          label="PayPal Email"
          value={draft.paypal_email}
          onChange={(v) => setDraft((d) => ({ ...d, paypal_email: v }))}
        />
        <AffiliateEditField
          label="Wise URL"
          value={draft.wise_url}
          onChange={(v) => setDraft((d) => ({ ...d, wise_url: v }))}
        />
        <AffiliateEditField
          label="Bank Transfer Info"
          value={draft.bank_transfer_info}
          onChange={(v) => setDraft((d) => ({ ...d, bank_transfer_info: v }))}
          multiline
        />
      </div>
    </div>
  );
}

function AffiliateReferredTab({
  affiliateId,
  commissionPercentage,
  onCommissionChange,
}: {
  affiliateId: string;
  commissionPercentage: number;
  onCommissionChange: (cents: number) => void;
}) {
  const [participants, setParticipants] = useState<ReferredParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/crm/affiliate-participants?affiliate_id=${encodeURIComponent(affiliateId)}`)
      .then((r) => r.json())
      .then((d) => {
        const list = (d.participants ?? []) as {
          id: number; full_name: string; amount_cents: number | null;
          billing_status: string | null; plan_name: string | null;
          charges: ParticipantCharge[];
        }[];
        const mapped: ReferredParticipant[] = list.map((p) => ({
          id: p.id,
          full_name: p.full_name,
          amount_cents: p.amount_cents ?? null,
          billing_status: p.billing_status,
          plan_name: p.plan_name,
          group_number: null,
          charges: p.charges ?? [],
          commission_cents: (p.charges ?? []).reduce(
            (sum, c) => sum + Math.round((c.amount_cents * commissionPercentage) / 100),
            0
          ),
        }));
        setParticipants(mapped);
        const total = mapped.reduce((sum, p) => sum + p.commission_cents, 0);
        onCommissionChange(total);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affiliateId, commissionPercentage]);

  const totalCommission = participants.reduce((s, p) => s + p.commission_cents, 0);

  const billingColor = (status: string | null) => {
    if (status === "active" || status === "paid_in_full") return "text-dark-success";
    if (status === "canceled" || status === "failed") return "text-dark-danger";
    return "text-dark-muted";
  };

  if (loading) return (
    <div className="flex items-center gap-2 py-8 text-dark-muted text-sm">
      <Loader2 size={16} className="animate-spin" /> Loading referred participants…
    </div>
  );

  if (error) return <p className="text-dark-danger text-sm py-4">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 p-4 bg-dark-panel2 border border-dark-border rounded-xl">
        <div className="flex items-center gap-2 text-dark-muted">
          <Users size={16} className="text-cm-purple" />
          <span className="text-sm font-medium text-dark-text">{participants.length} referred</span>
        </div>
        <div className="h-4 w-px bg-dark-border" />
        <div className="text-sm text-dark-muted">
          Total commission owed: <span className="font-semibold text-dark-text">{formatUSD(totalCommission)}</span>
        </div>
      </div>

      {participants.length === 0 ? (
        <p className="text-dark-muted text-sm py-6 text-center">No referred participants yet.</p>
      ) : (
        <div className="bg-dark-panel border border-dark-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-border bg-dark-panel2">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-dark-muted uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-dark-muted uppercase tracking-wide">Status</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-dark-muted uppercase tracking-wide">Monthly</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-dark-muted uppercase tracking-wide">Commission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border">
              {participants.map((p) => (
                <tr key={p.id} className="hover:bg-dark-panel2/40 transition-colors">
                  <td className="px-4 py-3 font-medium text-dark-text">{p.full_name}</td>
                  <td className={`px-4 py-3 text-xs capitalize ${billingColor(p.billing_status)}`}>
                    {p.billing_status?.replace(/_/g, " ") ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-dark-muted">
                    {p.amount_cents != null ? formatUSD(p.amount_cents) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-cm-purple">
                    {p.commission_cents > 0 ? formatUSD(p.commission_cents) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AffiliatePayoutRow({
  payout,
  onStatusToggle,
  onDelete,
}: {
  payout: AffiliatePayout;
  onStatusToggle: (id: string, newStatus: "pending" | "paid") => void;
  onDelete: (id: string) => void;
}) {
  const isPaid = payout.status === "paid";
  return (
    <tr className="hover:bg-dark-panel2/40 transition-colors">
      <td className="px-4 py-3 text-sm text-dark-muted">{payout.paid_at}</td>
      <td className="px-4 py-3 font-semibold text-dark-text text-right">{formatUSD(payout.amount_cents)}</td>
      <td className="px-4 py-3 text-sm text-dark-muted max-w-[200px] truncate">{payout.note ?? "—"}</td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold
          ${isPaid ? "bg-dark-success/15 text-dark-success" : "bg-dark-warn/15 text-dark-warn"}`}>
          {isPaid && <Check size={10} />}
          {isPaid ? "Paid" : "Pending"}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onStatusToggle(payout.id, isPaid ? "pending" : "paid")}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors
              ${isPaid
                ? "bg-dark-warn/10 text-dark-warn hover:bg-dark-warn/20"
                : "bg-dark-success/10 text-dark-success hover:bg-dark-success/20"}`}
            title={isPaid ? "Mark as pending" : "Mark as paid"}
          >
            {isPaid ? "Mark Pending" : "Mark Paid"}
          </button>
          <button
            onClick={() => onDelete(payout.id)}
            className="p-1.5 rounded hover:bg-dark-danger/10 text-dark-muted hover:text-dark-danger transition-colors"
            title="Delete payout"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function AffiliatePayoutForm({
  affiliateId,
  onCreated,
}: {
  affiliateId: string;
  onCreated: (payout: AffiliatePayout) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [amountDollars, setAmountDollars] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"paid" | "pending">("paid");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = Math.round(parseFloat(amountDollars) * 100);
    if (!cents || cents <= 0) { setError("Enter a valid amount"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/crm/affiliates/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ affiliate_id: affiliateId, amount_cents: cents, paid_at: date, note: note.trim() || null, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create payout");
      onCreated(data.payout as AffiliatePayout);
      setAmountDollars("");
      setNote("");
      setDate(today);
      setStatus("paid");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "border border-dark-border rounded-lg px-3 py-2 text-sm bg-dark-panel2 text-dark-text focus:outline-none focus:ring-2 focus:ring-cm-purple transition-colors";

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="bg-dark-panel2 border border-dark-border rounded-xl p-4 space-y-3">
      <p className="text-xs font-bold uppercase tracking-widest text-dark-muted">Record Payout</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-dark-muted block mb-1">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass + " w-full"} />
        </div>
        <div>
          <label className="text-xs text-dark-muted block mb-1">Amount (USD)</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            value={amountDollars}
            onChange={(e) => setAmountDollars(e.target.value)}
            className={inputClass + " w-full"}
          />
        </div>
        <div>
          <label className="text-xs text-dark-muted block mb-1">Note</label>
          <input type="text" placeholder="Optional note" value={note} onChange={(e) => setNote(e.target.value)} className={inputClass + " w-full"} />
        </div>
        <div>
          <label className="text-xs text-dark-muted block mb-1">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as "paid" | "pending")} className={inputClass + " w-full"}>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
          </select>
        </div>
      </div>
      {error && <p className="text-xs text-dark-danger">{error}</p>}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-cm-purple text-white text-sm font-medium rounded-lg hover:bg-cm-purple/80 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <DollarSign size={14} />}
          Record Payout
        </button>
      </div>
    </form>
  );
}

type RawReferredParticipant = {
  id: number;
  full_name: string;
  amount_cents: number | null;
  billing_status: string | null;
  plan_name: string | null;
  group_number: number | null;
  charges: ParticipantCharge[];
};

function AffiliatePayoutsTab({
  affiliateId,
  commissionPercentage,
}: {
  affiliateId: string;
  commissionPercentage: number;
}) {
  const [payouts, setPayouts] = useState<AffiliatePayout[]>([]);
  const [rawReferred, setRawReferred] = useState<RawReferredParticipant[]>([]);
  const [groupsMap, setgroupsMap] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Fetch data once — commission % changes just re-derive, no refetch
  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/crm/affiliates/payouts?affiliate_id=${encodeURIComponent(affiliateId)}`).then((r) => r.json()),
      fetch(`/api/crm/affiliate-participants?affiliate_id=${encodeURIComponent(affiliateId)}`).then((r) => r.json()),
    ])
      .then(([payoutData, participantData]) => {
        setPayouts(payoutData.payouts ?? []);
        setRawReferred(participantData.participants ?? []);
        setgroupsMap(participantData.groupsMap ?? {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [affiliateId]); // commissionPercentage intentionally excluded — math is derived below

  useEffect(() => { load(); }, [load]);

  // Derive commission from actual charge history × current commission %
  const referred: ReferredParticipant[] = rawReferred.map((p) => ({
    id: p.id,
    full_name: p.full_name,
    amount_cents: p.amount_cents ?? null,
    billing_status: p.billing_status,
    plan_name: p.plan_name,
    group_number: p.group_number ?? null,
    charges: p.charges ?? [],
    commission_cents: (p.charges ?? []).reduce(
      (sum, c) => sum + Math.round((c.amount_cents * commissionPercentage) / 100),
      0
    ),
  }));

  const handleStatusToggle = async (id: string, newStatus: "paid" | "pending") => {
    const res = await fetch("/api/crm/affiliates/payouts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: newStatus }),
    });
    if (res.ok) {
      const data = await res.json();
      setPayouts((prev) => prev.map((p) => p.id === id ? data.payout : p));
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/crm/affiliates/payouts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) setPayouts((prev) => prev.filter((p) => p.id !== id));
  };

  const commissionOwed = referred.reduce((s, p) => s + p.commission_cents, 0);
  const totalPaid = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount_cents, 0);
  const balance = commissionOwed - totalPaid;

  return (
    <div className="space-y-4">
      {/* Per-participant charge breakdown */}
      {referred.length > 0 && (
        <div className="bg-dark-panel2 border border-dark-border rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-dark-muted">Commission Breakdown</p>
          {referred.map((p) => (
            <div key={p.id} className="space-y-1">
              <p className="text-sm font-semibold text-dark-text">{p.full_name}</p>
              {p.charges.length === 0 ? (
                <p className="text-xs text-dark-muted pl-2">No charges recorded</p>
              ) : (
                p.charges.map((c, i) => {
                  const cohortStart = p.group_number != null ? groupsMap[p.group_number] : null;
                  let periodLabel: string;
                  if (cohortStart) {
                    const fmt = (d: Date) => d.toLocaleString("en-US", { month: "short" }) + " " + d.getDate();
                    const s = new Date(cohortStart + "T00:00:00");
                    s.setMonth(s.getMonth() + i);
                    const e = new Date(cohortStart + "T00:00:00");
                    e.setMonth(e.getMonth() + i + 1);
                    periodLabel = `${fmt(s)} - ${fmt(e)}`;
                  } else {
                    periodLabel = new Date(c.charge_date + "T00:00:00").toLocaleString("en-US", { month: "short", year: "numeric" });
                  }
                  const commission = Math.round((c.amount_cents * commissionPercentage) / 100);
                  return (
                    <div key={i} className="flex items-center justify-between text-xs pl-2">
                      <span className="text-dark-muted">{periodLabel} — {formatUSD(c.amount_cents)}</span>
                      <span className="font-semibold text-cm-purple">+{formatUSD(commission)}</span>
                    </div>
                  );
                })
              )}
              <div className="flex justify-between text-xs pl-2 text-dark-muted border-t border-dark-border/50 pt-1">
                <span>Subtotal</span>
                <span className="font-semibold text-dark-text">{formatUSD(p.commission_cents)}</span>
              </div>
            </div>
          ))}
          <div className="border-t border-dark-border pt-2 flex justify-between text-sm font-semibold">
            <span className="text-dark-muted">Total commission owed</span>
            <span className="text-dark-text">{formatUSD(commissionOwed)}</span>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="flex flex-wrap items-center gap-4 p-4 bg-dark-panel2 border border-dark-border rounded-xl text-sm">
        <div className="text-dark-muted">
          Total Paid: <span className="font-semibold text-dark-text">{formatUSD(totalPaid)}</span>
        </div>
        <div className="h-4 w-px bg-dark-border hidden sm:block" />
        <div className="text-dark-muted">
          Commission Owed: <span className="font-semibold text-dark-text">{formatUSD(commissionOwed)}</span>
        </div>
        <div className="h-4 w-px bg-dark-border hidden sm:block" />
        <div className="text-dark-muted">
          Balance:{" "}
          <span className={`font-semibold ${balance <= 0 ? "text-dark-success" : "text-dark-danger"}`}>
            {balance <= 0 ? "All paid" : formatUSD(balance)}
          </span>
        </div>
      </div>

      {/* Add payout */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-cm-purple border border-cm-purple/30 rounded-lg hover:bg-cm-purple/10 transition-colors"
        >
          <Plus size={14} />
          {showForm ? "Cancel" : "Add Payout"}
        </button>
      </div>

      {showForm && (
        <AffiliatePayoutForm
          affiliateId={affiliateId}
          onCreated={(payout) => {
            setPayouts((prev) => [payout, ...prev]);
            setShowForm(false);
          }}
        />
      )}

      {/* Payout list */}
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-dark-muted text-sm">
          <Loader2 size={14} className="animate-spin" /> Loading payouts…
        </div>
      ) : payouts.length === 0 ? (
        <p className="text-dark-muted text-sm py-6 text-center">No payouts recorded yet.</p>
      ) : (
        <div className="bg-dark-panel border border-dark-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-border bg-dark-panel2">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-dark-muted uppercase tracking-wide">Date</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-dark-muted uppercase tracking-wide">Amount</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-dark-muted uppercase tracking-wide">Note</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-dark-muted uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-dark-muted uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border">
              {payouts.map((p) => (
                <AffiliatePayoutRow
                  key={p.id}
                  payout={p}
                  onStatusToggle={(id, s) => void handleStatusToggle(id, s)}
                  onDelete={(id) => void handleDelete(id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AffiliateModal({
  affiliate,
  onClose,
  onSave,
  onDelete,
}: {
  affiliate: AffiliateRecord | null;
  onClose: () => void;
  onSave: (id: string | null, draft: ReturnType<typeof createEmptyAffiliateDraft>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const isNew = !affiliate?.id;
  const [draft, setDraft] = useState<ReturnType<typeof createEmptyAffiliateDraft>>(() =>
    affiliate
      ? {
          first_name: affiliate.first_name ?? "",
          last_name: affiliate.last_name ?? "",
          email: affiliate.email ?? "",
          commission_percentage: String(affiliate.commission_percentage ?? "10"),
          paypal_email: affiliate.paypal_email ?? "",
          wise_url: affiliate.wise_url ?? "",
          bank_transfer_info: affiliate.bank_transfer_info ?? "",
          preferred_payment_method: affiliate.preferred_payment_method ?? "",
        }
      : createEmptyAffiliateDraft()
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeTab, setActiveTab] = useState<AffiliateModalTab>("profile");
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const displayName =
    [draft.first_name, draft.last_name].filter(Boolean).join(" ") || "New Affiliate";
  const paymentLabel = AFFILIATE_PAYMENT_METHOD_OPTIONS.find(
    (o) => o.value === draft.preferred_payment_method
  )?.label;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(affiliate?.id ?? null, draft);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!affiliate?.id) return;
    setDeleting(true);
    try {
      await onDelete(affiliate.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="bg-dark-panel rounded-2xl shadow-2xl shadow-black/40 w-[90vw] max-w-5xl h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 p-6 border-b border-dark-border bg-gradient-to-r from-cm-purple/10 via-dark-panel to-dark-panel">
          <AffiliateAvatar name={displayName} size={72} />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold tracking-tight text-dark-text truncate">{displayName}</h2>
            <p className="text-sm text-dark-muted">{draft.email || "No email"}</p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {draft.commission_percentage && (
                <span className="text-xs px-2 py-0.5 bg-cm-purple/15 text-cm-purple rounded-full font-medium">
                  {draft.commission_percentage}% commission
                </span>
              )}
              {paymentLabel && (
                <span className="text-xs px-2 py-0.5 bg-dark-panel2 border border-dark-border text-dark-muted rounded-full">
                  {paymentLabel}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!isNew &&
              (confirmDelete ? (
                <div className="flex items-center gap-2 bg-dark-danger/10 border border-dark-danger/30 rounded-lg px-3 py-1.5">
                  <span className="text-xs text-dark-danger font-medium">Delete this affiliate?</span>
                  <button
                    onClick={() => void handleDelete()}
                    disabled={deleting}
                    className="text-xs px-2 py-1 bg-dark-danger text-white rounded font-medium hover:bg-dark-danger/80 disabled:opacity-50 transition-colors"
                  >
                    {deleting ? "Deleting..." : "Yes, delete"}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs text-dark-muted hover:text-dark-text transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="p-2 rounded-lg hover:bg-dark-danger/10 transition-colors text-dark-muted hover:text-dark-danger"
                  title="Delete affiliate"
                >
                  <Trash2 size={16} />
                </button>
              ))}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-dark-panel2 transition-colors text-dark-muted"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <AffiliateModalTabs activeTab={activeTab} onTabChange={setActiveTab} isNew={isNew} />

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "profile" && (
            <AffiliateProfileSection draft={draft} setDraft={setDraft} />
          )}
          {activeTab === "referred" && !isNew && affiliate?.id && (
            <AffiliateReferredTab
              affiliateId={affiliate.id}
              commissionPercentage={Number(draft.commission_percentage) || 0}
              onCommissionChange={() => {}}
            />
          )}
          {activeTab === "payouts" && !isNew && affiliate?.id && (
            <AffiliatePayoutsTab
              affiliateId={affiliate.id}
              commissionPercentage={Number(draft.commission_percentage) || 0}
            />
          )}
        </div>

        {/* Footer — only on Profile tab */}
        {activeTab === "profile" && (
          <div className="border-t border-dark-border p-4 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-dark-muted hover:text-dark-text rounded-lg hover:bg-dark-panel2 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-cm-purple px-5 py-2 text-sm font-medium text-white transition hover:bg-cm-purple/80 disabled:opacity-60"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {isNew ? "Create Affiliate" : "Save Changes"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── AffiliatesPanel — self-contained, no external state deps ────

export default function AffiliatesPanel() {
  const [affiliates, setAffiliates] = useState<AffiliateRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [affiliateModalOpen, setAffiliateModalOpen] = useState(false);
  const [affiliateModalTarget, setAffiliateModalTarget] = useState<AffiliateRecord | null>(null);

  const loadAffiliates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/crm/affiliates");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load affiliates");
      setAffiliates(data.affiliates || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAffiliates();
  }, [loadAffiliates]);

  async function saveAffiliate(
    id: string | null,
    draft: ReturnType<typeof createEmptyAffiliateDraft>
  ) {
    if (id) {
      const res = await fetch("/api/crm/affiliates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save affiliate");
      const updated = data.affiliate as AffiliateRecord;
      setAffiliates((current) =>
        current
          .map((a) => (a.id === updated.id ? updated : a))
          .sort((a, b) =>
            a.display_name.localeCompare(b.display_name, undefined, { sensitivity: "base" })
          )
      );
    } else {
      const res = await fetch("/api/crm/affiliates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create affiliate");
      setAffiliates((current) =>
        [...current, data.affiliate].sort((a: AffiliateRecord, b: AffiliateRecord) =>
          a.display_name.localeCompare(b.display_name, undefined, { sensitivity: "base" })
        )
      );
    }
  }

  async function deleteAffiliate(id: string) {
    const res = await fetch(`/api/crm/affiliates?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to delete affiliate");
    setAffiliates((current) => current.filter((a) => a.id !== id));
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-dark-text">Affiliate Partners</p>
          <p className="text-sm text-dark-muted">
            Manage referral partners for your business.
          </p>
        </div>
        <button
          onClick={() => {
            setAffiliateModalTarget(null);
            setAffiliateModalOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-cm-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-cm-purple/80 flex-shrink-0"
        >
          <Plus size={16} />
          Add Affiliate
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 px-1 py-4 text-sm text-dark-muted">
          <Loader2 size={16} className="animate-spin" />
          Loading affiliates…
        </div>
      ) : (
        <div className="bg-dark-panel border border-dark-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-border bg-dark-panel2">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-dark-muted uppercase tracking-wide">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-dark-muted uppercase tracking-wide">
                    Commission
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-dark-muted uppercase tracking-wide">
                    Payment Method
                  </th>
                  <th className="px-4 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border">
                {affiliates.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-sm text-dark-muted">
                      No affiliates yet. Add one to get started.
                    </td>
                  </tr>
                ) : (
                  affiliates.map((affiliate) => (
                    <tr
                      key={affiliate.id}
                      className="hover:bg-dark-panel2/50 cursor-pointer transition-colors"
                      onClick={() => {
                        setAffiliateModalTarget(affiliate);
                        setAffiliateModalOpen(true);
                      }}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <AffiliateAvatar name={affiliate.display_name} size={36} />
                          <div className="min-w-0">
                            <p className="font-semibold text-dark-text truncate">
                              {affiliate.display_name}
                            </p>
                            <p className="text-xs text-dark-muted truncate">
                              {affiliate.email || "No email"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-cm-purple/15 text-cm-purple">
                          {affiliate.commission_percentage}%
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {affiliate.preferred_payment_method ? (
                          <span className="text-sm text-dark-text">
                            {AFFILIATE_PAYMENT_METHOD_OPTIONS.find(
                              (o) => o.value === affiliate.preferred_payment_method
                            )?.label ?? affiliate.preferred_payment_method}
                          </span>
                        ) : (
                          <span className="text-sm text-dark-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-dark-muted">
                        <ChevronRight size={16} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {affiliateModalOpen && (
        <AffiliateModal
          affiliate={affiliateModalTarget}
          onClose={() => {
            setAffiliateModalOpen(false);
            setAffiliateModalTarget(null);
          }}
          onSave={saveAffiliate}
          onDelete={deleteAffiliate}
        />
      )}
    </section>
  );
}
