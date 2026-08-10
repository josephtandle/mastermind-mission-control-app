"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Clock3, Loader2, RefreshCw, Save, Send, Settings2, ShieldCheck, X } from "lucide-react";

type AutomationMode = "templates" | "automations" | "approval" | "settings";

type AutomationTemplate = {
  id: string;
  name: string;
  channel: "email" | "instagram" | "whatsapp";
  subject_template?: string | null;
  body_template: string;
};

type AutomationRule = {
  id: string;
  name: string;
  enabled: boolean;
  trigger_type: "stage_changed";
  project_name: string;
  from_stage?: string | null;
  to_stage: string;
  delay_minutes?: number | null;
  channel: "email" | "instagram" | "whatsapp";
  template_id?: string | null;
  template_name?: string | null;
};

type ApprovalItem = {
  id: string;
  run_id: string;
  contact_id: string;
  project_name: string;
  channel: "email" | "instagram" | "whatsapp";
  contact_name: string;
  rule_name: string;
  review_status: "pending_review" | "approved" | "cancelled";
  triggered_from_stage?: string | null;
  triggered_to_stage?: string | null;
  scheduled_send_at: string;
  rendered_payload: {
    subject?: string | null;
    body?: string | null;
    recipient_identity?: string | null;
  };
};

type DeliveryItem = {
  id: string;
  channel: "email" | "instagram" | "whatsapp";
  contact_name: string;
  project_name: string;
  rule_name: string;
  status: "queued" | "blocked" | "sending" | "sent" | "failed";
  scheduled_send_at: string;
  blocked_reason?: string | null;
  failure_reason?: string | null;
  payload: {
    subject?: string | null;
    body?: string | null;
  };
};

type AutomationSnapshot = {
  settings: {
    default_delay_minutes: number;
    channels: {
      email: { live_enabled: boolean; from_address?: string | null };
      instagram: { live_enabled: boolean };
      whatsapp: { live_enabled: boolean };
    };
    capabilities: {
      email: { wired: boolean; verified: boolean; reason?: string | null };
      instagram: { wired: boolean; verified: boolean; reason?: string | null };
      whatsapp: { wired: boolean; verified: boolean; reason?: string | null };
    };
  };
  rules: AutomationRule[];
  templates: AutomationTemplate[];
  approval: ApprovalItem[];
  delivery: DeliveryItem[];
};

type DraftAssistantResult = {
  opener: string;
  body: string;
  cta: string;
  reasoning: string;
};

const CHANNEL_OPTIONS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "instagram", label: "Instagram" },
] as const;

const PROJECT_OPTIONS = [{ value: "default", label: "Default Project" }];

const STAGE_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  negotiating: "Negotiating",
  won: "Won",
  stale: "Stale",
  lost: "Lost",
};

const STAGE_OPTIONS = [
  "new",
  "contacted",
  "qualified",
  "qualified",
  "negotiating",
  "won",
  "qualified",
  "stale",
  "lost",
];

const TEMPLATE_VARIABLES = [
  { token: "{{first_name}}", label: "First Name", description: "Lead first name" },
  { token: "{{full_name}}", label: "Full Name", description: "Lead full name" },
  { token: "{{project_name}}", label: "Project", description: "CRM project name" },
  { token: "{{from_stage}}", label: "From Stage", description: "Source pipeline stage" },
  { token: "{{to_stage}}", label: "To Stage", description: "Destination pipeline stage" },
] as const;

function formatDateTimeLocalInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function formatStage(value?: string | null) {
  if (!value) return "Any";
  return STAGE_LABELS[value] || value.replace(/_/g, " ");
}

function formatChannel(value: string) {
  return CHANNEL_OPTIONS.find((option) => option.value === value)?.label || value;
}

function formatChannelAvailabilityLabel(
  value: "email" | "instagram" | "whatsapp",
  settings?: AutomationSnapshot["settings"] | null
) {
  const baseLabel = formatChannel(value);
  if (!settings) return baseLabel;
  return settings.capabilities?.[value]?.wired ? baseLabel : `${baseLabel} not yet enabled`;
}

function formatTimestamp(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function QueueBadge({ status }: { status: string }) {
  const styles =
    status === "pending_review"
      ? "bg-dark-warn/15 text-dark-warn border-dark-warn/30"
      : status === "approved" || status === "sent"
        ? "bg-dark-success/15 text-dark-success border-dark-success/30"
        : status === "blocked"
          ? "bg-sky-500/15 text-sky-200 border-sky-500/30"
          : status === "failed" || status === "cancelled"
            ? "bg-dark-danger/15 text-dark-danger border-dark-danger/30"
            : "bg-dark-panel2 text-dark-text border-dark-border";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${styles}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function CrmAutomationWorkspace({ mode }: { mode: AutomationMode }) {
  const subjectTemplateRef = useRef<HTMLInputElement | null>(null);
  const bodyTemplateRef = useRef<HTMLTextAreaElement | null>(null);
  const [snapshot, setSnapshot] = useState<AutomationSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [approvalErrors, setApprovalErrors] = useState<Record<string, string>>({});

  const [templateForm, setTemplateForm] = useState({
    id: "",
    name: "",
    channel: "email",
    subject_template: "",
    body_template: "",
  });
  const [ruleForm, setRuleForm] = useState({
    id: "",
    name: "",
    enabled: true,
    trigger_type: "stage_changed",
    project_name: "pipeline",
    from_stage: "",
    to_stage: "contacted",
    delay_minutes: "3",
    channel: "whatsapp",
    template_id: "",
  });
  const [settingsForm, setSettingsForm] = useState({
    default_delay_minutes: "3",
    email_live_enabled: false,
    email_from_address: "",
    email_test_recipient: "",
    instagram_live_enabled: false,
    whatsapp_live_enabled: false,
  });
  const [approvalDrafts, setApprovalDrafts] = useState<Record<string, { subject: string; body: string; scheduled_send_at: string }>>({});
  const [activeTemplateField, setActiveTemplateField] = useState<"subject" | "body">("body");
  const [templateSelections, setTemplateSelections] = useState({
    subject: { start: 0, end: 0 },
    body: { start: 0, end: 0 },
  });
  const [draftLab, setDraftLab] = useState({
    channel: "linkedin",
    leadName: "",
    businessContext: "",
    objective: "",
    priorMessage: "",
  });
  const [draftLabResult, setDraftLabResult] = useState<DraftAssistantResult | null>(null);
  const [draftLabError, setDraftLabError] = useState<string | null>(null);

  async function loadSnapshot() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/crm/automations/settings");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load automation snapshot");
      setSnapshot(data);
      setSettingsForm((current) => ({
        default_delay_minutes: String(data.settings.default_delay_minutes || 3),
        email_live_enabled: Boolean(data.settings.channels.email.live_enabled),
        email_from_address: String(data.settings.channels.email.from_address || ""),
        email_test_recipient: current.email_test_recipient || "",
        instagram_live_enabled: Boolean(data.settings.channels.instagram.live_enabled),
        whatsapp_live_enabled: Boolean(data.settings.channels.whatsapp.live_enabled),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load automation snapshot");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSnapshot();
  }, []);

  const pendingApproval = useMemo(
    () => (snapshot?.approval || []).filter((item) => item.review_status === "pending_review"),
    [snapshot]
  );
  const isTemplatesMode = mode === "templates";
  const isAutomationsMode = mode === "automations";

  async function handleSaveTemplate() {
    setSaving("template");
    setError(null);
    setTemplateError(null);
    const normalizedName = templateForm.name.trim();
    const normalizedBody = templateForm.body_template.trim();
    const normalizedSubject = templateForm.subject_template.trim();
    if (!normalizedName) {
      setTemplateError("Template name is required.");
      setSaving(null);
      return;
    }
    if (!normalizedBody) {
      setTemplateError("Template body is required.");
      setSaving(null);
      return;
    }
    try {
      const res = await fetch("/api/crm/automations/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          ...templateForm,
          name: normalizedName,
          body_template: normalizedBody,
          id: templateForm.id || undefined,
          subject_template: normalizedSubject || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save template");
      setTemplateForm({ id: "", name: "", channel: "email", subject_template: "", body_template: "" });
      setTemplateError(null);
      await loadSnapshot();
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSaving(null);
    }
  }

  async function handleSaveRule() {
    setSaving("rule");
    setError(null);
    setRuleError(null);
    try {
      const res = await fetch("/api/crm/automations/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          ...ruleForm,
          id: ruleForm.id || undefined,
          from_stage: ruleForm.from_stage || null,
          delay_minutes: ruleForm.delay_minutes ? Number(ruleForm.delay_minutes) : null,
          template_id: ruleForm.template_id || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save rule");
      setRuleForm({
        id: "",
        name: "",
        enabled: true,
        trigger_type: "stage_changed",
        project_name: "pipeline",
        from_stage: "",
        to_stage: "contacted",
        delay_minutes: settingsForm.default_delay_minutes,
        channel: "whatsapp",
        template_id: "",
      });
      setRuleError(null);
      await loadSnapshot();
    } catch (err) {
      setRuleError(err instanceof Error ? err.message : "Failed to save rule");
    } finally {
      setSaving(null);
    }
  }

  async function handleDeleteRule(id: string) {
    setSaving(`delete-rule-${id}`);
    setError(null);
    try {
      const res = await fetch("/api/crm/automations/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete rule");
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete rule");
    } finally {
      setSaving(null);
    }
  }

  async function handleToggleRule(rule: AutomationRule) {
    setSaving(`toggle-rule-${rule.id}`);
    setError(null);
    try {
      const res = await fetch("/api/crm/automations/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", ...rule, enabled: !rule.enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to toggle rule");
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle rule");
    } finally {
      setSaving(null);
    }
  }

  async function handleDeleteTemplate(id: string) {
    setSaving(`delete-template-${id}`);
    setError(null);
    try {
      const res = await fetch("/api/crm/automations/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete template");
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete template");
    } finally {
      setSaving(null);
    }
  }

  async function handleSaveSettings() {
    setSaving("settings");
    setError(null);
    setSettingsError(null);
    try {
      const res = await fetch("/api/crm/automations/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          default_delay_minutes: Number(settingsForm.default_delay_minutes) || 3,
          email_live_enabled: settingsForm.email_live_enabled,
          email_from_address: settingsForm.email_from_address,
          instagram_live_enabled: settingsForm.instagram_live_enabled,
          whatsapp_live_enabled: settingsForm.whatsapp_live_enabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save automation settings");
      setSettingsError(null);
      await loadSnapshot();
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Failed to save automation settings");
    } finally {
      setSaving(null);
    }
  }

  async function handleSendTestEmail() {
    setSaving("test-email");
    setError(null);
    setSettingsError(null);
    try {
      const res = await fetch("/api/crm/automations/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_test_email",
          to: settingsForm.email_test_recipient,
          email_from_address: settingsForm.email_from_address,
          subject: "Mission Control Resend Test",
          body: `Live Resend canary from Mission Control using sender ${settingsForm.email_from_address || "default sender"}.`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send test email");
      setSettingsError(null);
      await loadSnapshot();
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Failed to send test email");
    } finally {
      setSaving(null);
    }
  }

  async function handleApprovalAction(id: string, action: "update" | "approve" | "cancel") {
    const draft = approvalDrafts[id];
    setSaving(`${action}-${id}`);
    setError(null);
    setApprovalErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    try {
      const res = await fetch("/api/crm/automations/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          id,
          subject: draft?.subject,
          body: draft?.body,
          scheduled_send_at: draft?.scheduled_send_at ? fromLocalInput(draft.scheduled_send_at) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${action} approval item`);
      setApprovalErrors((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      await loadSnapshot();
    } catch (err) {
      setApprovalErrors((current) => ({
        ...current,
        [id]: err instanceof Error ? err.message : `Failed to ${action} approval item`,
      }));
    } finally {
      setSaving(null);
    }
  }

  async function handleTick() {
    setSaving("tick");
    setError(null);
    try {
      const res = await fetch("/api/crm/automations/tick", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to process automation queues");
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process automation queues");
    } finally {
      setSaving(null);
    }
  }

  function seedApprovalDraft(item: ApprovalItem) {
    if (approvalDrafts[item.id]) return approvalDrafts[item.id];
    return {
      subject: item.rendered_payload.subject || "",
      body: item.rendered_payload.body || "",
      scheduled_send_at: formatDateTimeLocalInput(item.scheduled_send_at),
    };
  }

  function syncTemplateSelection(field: "subject" | "body") {
    return () => {
      const input = field === "subject" ? subjectTemplateRef.current : bodyTemplateRef.current;
      if (!input) return;
      setActiveTemplateField(field);
      setTemplateSelections((current) => ({
        ...current,
        [field]: {
          start: input.selectionStart ?? input.value.length,
          end: input.selectionEnd ?? input.value.length,
        },
      }));
    };
  }

  function insertTemplateVariable(token: string) {
    const targetField =
      activeTemplateField === "subject" && templateForm.channel === "email" ? "subject" : "body";
    const input = targetField === "subject" ? subjectTemplateRef.current : bodyTemplateRef.current;
    const currentValue =
      targetField === "subject" ? templateForm.subject_template : templateForm.body_template;
    const selection = templateSelections[targetField];
    const start = input?.selectionStart ?? selection.start ?? currentValue.length;
    const end = input?.selectionEnd ?? selection.end ?? currentValue.length;
    const nextValue = `${currentValue.slice(0, start)}${token}${currentValue.slice(end)}`;
    const nextCaret = start + token.length;

    setTemplateForm((current) => ({
      ...current,
      ...(targetField === "subject"
        ? { subject_template: nextValue }
        : { body_template: nextValue }),
    }));
    setTemplateSelections((current) => ({
      ...current,
      [targetField]: { start: nextCaret, end: nextCaret },
    }));

    requestAnimationFrame(() => {
      if (!input) return;
      input.focus();
      input.setSelectionRange(nextCaret, nextCaret);
    });
  }

  async function handleGenerateDraft() {
    setSaving("draft-lab");
    setDraftLabError(null);
    try {
      const res = await fetch("/api/crm/automations/draft-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftLab),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate draft");
      setDraftLabResult(data.draft || null);
    } catch (err) {
      setDraftLabError(err instanceof Error ? err.message : "Failed to generate draft");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-dark-border bg-dark-panel p-5 shadow-md shadow-black/20">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-dark-muted">CRM Automation</p>
            <h1 className="mt-2 text-2xl font-semibold text-dark-text">
              {isTemplatesMode
                ? "Templates"
                : isAutomationsMode
                  ? "Automations"
                  : mode === "approval"
                    ? "Approval Queue"
                    : "Automation Settings"}
            </h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => void loadSnapshot()}
              className="inline-flex items-center gap-2 rounded-xl border border-dark-border bg-dark-panel2 px-4 py-2 text-sm text-dark-text"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
            <button
              onClick={() => void handleTick()}
              className="inline-flex items-center gap-2 rounded-xl bg-cm-purple px-4 py-2 text-sm font-medium text-white"
            >
              {saving === "tick" ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Process Queue Now
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-dark-danger/30 bg-dark-danger/10 px-4 py-3 text-sm text-dark-danger">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-dark-border bg-dark-panel px-5 py-6 text-sm text-dark-muted">
          <Loader2 size={16} className="animate-spin" />
          Loading automation workspace…
        </div>
      ) : null}

      {!loading && (isTemplatesMode || isAutomationsMode) ? (
        <>
          <section className="rounded-2xl border border-dark-border bg-dark-panel p-5 shadow-md shadow-black/20">
            <div className="space-y-2">
              <p className="text-sm font-medium text-dark-text">
                {isTemplatesMode ? "How templates work" : "How automations work"}
              </p>
              <p className="text-sm text-dark-muted">
                {isTemplatesMode
                  ? "Build reusable messages here. Then attach a template to an automation so a lead gets the right message when they move into a destination stage."
                  : "Attach a template to an automation and trigger it when a lead enters a destination stage. Matured runs move into approval automatically, and approved items only deliver when the channel is live-enabled."}
              </p>
              {!isTemplatesMode ? (
                <p className="text-xs text-dark-muted">
                  Use CRM Settings to confirm the Resend sender and run a live email canary before turning on production delivery.
                </p>
              ) : null}
            </div>
          </section>

          <section className="grid gap-4">
            {isTemplatesMode ? (
            <div className="rounded-2xl border border-dark-border bg-dark-panel p-5 shadow-md shadow-black/20">
              <div className="mb-4 flex items-center gap-2">
                <Settings2 size={18} className="text-cm-purple" />
                <h2 className="text-lg font-semibold text-dark-text">Template Builder</h2>
              </div>
              <div className="space-y-3">
                <input
                  value={templateForm.name}
                  onChange={(event) => {
                    setTemplateError(null);
                    setTemplateForm((current) => ({ ...current, name: event.target.value }));
                  }}
                  placeholder="Template name"
                  className="h-11 w-full rounded-xl border border-dark-border bg-dark-panel2 px-4 text-sm text-dark-text outline-none"
                />
                <label className="space-y-1">
                  <span className="block text-xs font-medium uppercase tracking-[0.18em] text-dark-muted">Sending Source</span>
                  <select
                    value={templateForm.channel}
                    onChange={(event) => {
                      setTemplateError(null);
                      setTemplateForm((current) => ({ ...current, channel: event.target.value }));
                    }}
                    className="h-11 w-full rounded-xl border border-dark-border bg-dark-panel2 px-4 text-sm text-dark-text outline-none"
                  >
                    {CHANNEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {formatChannelAvailabilityLabel(option.value, snapshot?.settings)}
                      </option>
                    ))}
                  </select>
                </label>
                {templateForm.channel === "email" && (
                  <input
                    ref={subjectTemplateRef}
                    value={templateForm.subject_template}
                    onChange={(event) => {
                      setTemplateError(null);
                      setTemplateForm((current) => ({ ...current, subject_template: event.target.value }));
                    }}
                    onClick={syncTemplateSelection("subject")}
                    onKeyUp={syncTemplateSelection("subject")}
                    onSelect={syncTemplateSelection("subject")}
                    onFocus={() => setActiveTemplateField("subject")}
                    placeholder="Subject template"
                    className="h-11 w-full rounded-xl border border-dark-border bg-dark-panel2 px-4 text-sm text-dark-text outline-none"
                  />
                )}
                <div className="rounded-xl border border-dark-border bg-dark-panel2 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-dark-text">CRM Variables</p>
                      <p className="text-xs text-dark-muted">
                        Click to insert into the active template field. Email templates support variables in both subject and body.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {TEMPLATE_VARIABLES.map((variable) => (
                      <button
                        key={variable.token}
                        type="button"
                        draggable
                        onClick={() => insertTemplateVariable(variable.token)}
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/plain", variable.token);
                          event.dataTransfer.effectAllowed = "copy";
                        }}
                        className="rounded-lg border border-dark-border bg-dark-panel px-3 py-2 text-left text-xs text-dark-text transition-colors hover:border-cm-purple/40 hover:bg-dark-panel2"
                        title={variable.description}
                      >
                        <span className="block font-medium text-cm-purple-mid">{variable.label}</span>
                        <span className="mt-0.5 block font-mono text-[11px] text-dark-muted">{variable.token}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  ref={bodyTemplateRef}
                  value={templateForm.body_template}
                  onChange={(event) => {
                    setTemplateError(null);
                    setTemplateForm((current) => ({ ...current, body_template: event.target.value }));
                  }}
                  onClick={syncTemplateSelection("body")}
                  onKeyUp={syncTemplateSelection("body")}
                  onSelect={syncTemplateSelection("body")}
                  onFocus={() => setActiveTemplateField("body")}
                  onDrop={(event) => {
                    event.preventDefault();
                    const token = event.dataTransfer.getData("text/plain");
                    const textarea = bodyTemplateRef.current;
                    if (!textarea || !token) return;
                    const caret =
                      typeof document.caretPositionFromPoint === "function"
                        ? document.caretPositionFromPoint(event.clientX, event.clientY)?.offset ?? textarea.selectionStart
                        : textarea.selectionStart;
                    textarea.focus();
                    textarea.setSelectionRange(caret ?? 0, caret ?? 0);
                    setActiveTemplateField("body");
                    setTemplateSelections((current) => ({
                      ...current,
                      body: { start: caret ?? 0, end: caret ?? 0 },
                    }));
                    insertTemplateVariable(token);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                  }}
                  placeholder="Body template"
                  className="min-h-[144px] w-full rounded-xl border border-dark-border bg-dark-panel2 px-4 py-3 text-sm text-dark-text outline-none"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => void handleSaveTemplate()}
                    className="inline-flex items-center gap-2 rounded-xl bg-cm-purple px-4 py-2 text-sm font-medium text-white"
                  >
                    {saving === "template" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Save Template
                  </button>
                  {templateError ? <p className="text-sm text-dark-danger">{templateError}</p> : null}
                </div>
              </div>
            </div>
            ) : null}

            {isAutomationsMode ? (
            <div className="rounded-2xl border border-dark-border bg-dark-panel p-5 shadow-md shadow-black/20">
              <div className="mb-4 flex items-center gap-2">
                <ShieldCheck size={18} className="text-cm-purple" />
                <h2 className="text-lg font-semibold text-dark-text">Automation Builder</h2>
              </div>
              <p className="mb-4 text-sm text-dark-muted">
                Automations currently trigger on destination stage. Source stage is preserved for context, but matching happens on where the lead lands.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 md:col-span-2">
                  <span className="block text-xs font-medium uppercase tracking-[0.18em] text-dark-muted">Automation Name</span>
                  <input
                    value={ruleForm.name}
                    onChange={(event) => {
                      setRuleError(null);
                      setRuleForm((current) => ({ ...current, name: event.target.value }));
                    }}
                    placeholder="Automation name"
                    className="h-11 w-full rounded-xl border border-dark-border bg-dark-panel2 px-4 text-sm text-dark-text outline-none"
                  />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="block text-xs font-medium uppercase tracking-[0.18em] text-dark-muted">Template</span>
                  <select
                    value={ruleForm.template_id}
                    onChange={(event) => {
                      const nextTemplateId = event.target.value;
                      const nextTemplate = (snapshot?.templates || []).find((template) => template.id === nextTemplateId);
                      setRuleForm((current) => ({
                        ...current,
                        template_id: nextTemplateId,
                        channel: nextTemplate?.channel || current.channel,
                      }));
                    }}
                    className="h-11 w-full rounded-xl border border-dark-border bg-dark-panel2 px-4 text-sm text-dark-text outline-none"
                  >
                    <option value="">No template</option>
                    {(snapshot?.templates || []).map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} · {formatChannel(template.channel)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="block text-xs font-medium uppercase tracking-[0.18em] text-dark-muted">Sending Source</span>
                  <select
                    value={ruleForm.channel}
                    onChange={(event) => setRuleForm((current) => ({ ...current, channel: event.target.value, template_id: "" }))}
                    className="h-11 w-full rounded-xl border border-dark-border bg-dark-panel2 px-4 text-sm text-dark-text outline-none"
                  >
                    {CHANNEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {formatChannelAvailabilityLabel(option.value, snapshot?.settings)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="block text-xs font-medium uppercase tracking-[0.18em] text-dark-muted">Project</span>
                  <select
                    value={ruleForm.project_name}
                    onChange={(event) => setRuleForm((current) => ({ ...current, project_name: event.target.value }))}
                    className="h-11 w-full rounded-xl border border-dark-border bg-dark-panel2 px-4 text-sm text-dark-text outline-none"
                  >
                    {PROJECT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="block text-xs font-medium uppercase tracking-[0.18em] text-dark-muted">Source Stage</span>
                  <select
                    value={ruleForm.from_stage}
                    onChange={(event) => setRuleForm((current) => ({ ...current, from_stage: event.target.value }))}
                    className="h-11 w-full rounded-xl border border-dark-border bg-dark-panel2 px-4 text-sm text-dark-text outline-none"
                  >
                    <option value="">Any source stage</option>
                    {STAGE_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {formatStage(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="block text-xs font-medium uppercase tracking-[0.18em] text-dark-muted">Destination Stage</span>
                  <select
                    value={ruleForm.to_stage}
                    onChange={(event) => setRuleForm((current) => ({ ...current, to_stage: event.target.value }))}
                    className="h-11 w-full rounded-xl border border-dark-border bg-dark-panel2 px-4 text-sm text-dark-text outline-none"
                  >
                    {STAGE_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {formatStage(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="block text-xs font-medium uppercase tracking-[0.18em] text-dark-muted">Delay (Minutes)</span>
                  <input
                    value={ruleForm.delay_minutes}
                    onChange={(event) => setRuleForm((current) => ({ ...current, delay_minutes: event.target.value }))}
                    placeholder="Delay minutes"
                    className="h-11 w-full rounded-xl border border-dark-border bg-dark-panel2 px-4 text-sm text-dark-text outline-none"
                  />
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-dark-text md:col-span-2">
                  <input
                    type="checkbox"
                    checked={ruleForm.enabled}
                    onChange={(event) => setRuleForm((current) => ({ ...current, enabled: event.target.checked }))}
                  />
                  Enabled
                </label>
                <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => void handleSaveRule()}
                    className="inline-flex items-center gap-2 rounded-xl bg-cm-purple px-4 py-2 text-sm font-medium text-white"
                  >
                    {saving === "rule" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Save Automation
                  </button>
                  {ruleError ? <p className="text-sm text-dark-danger">{ruleError}</p> : null}
                </div>
              </div>
            </div>
            ) : null}

            {isAutomationsMode ? (
            <div className="rounded-2xl border border-dark-border bg-dark-panel p-5 shadow-md shadow-black/20">
              <div className="mb-4 flex items-center gap-2">
                <Send size={18} className="text-cm-purple" />
                <h2 className="text-lg font-semibold text-dark-text">Response Draft Lab</h2>
              </div>
              <p className="mb-4 text-sm text-dark-muted">
                Draft LinkedIn replies and Instantly autoreplies here, then turn the winners into automation templates or approval-queue edits.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="block text-xs font-medium uppercase tracking-[0.18em] text-dark-muted">Draft Type</span>
                  <select
                    value={draftLab.channel}
                    onChange={(event) => setDraftLab((current) => ({ ...current, channel: event.target.value }))}
                    className="h-11 w-full rounded-xl border border-dark-border bg-dark-panel2 px-4 text-sm text-dark-text outline-none"
                  >
                    <option value="linkedin">LinkedIn response</option>
                    <option value="instantly">Instantly autoreply</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="block text-xs font-medium uppercase tracking-[0.18em] text-dark-muted">Lead Name</span>
                  <input
                    value={draftLab.leadName}
                    onChange={(event) => setDraftLab((current) => ({ ...current, leadName: event.target.value }))}
                    placeholder="Lead name"
                    className="h-11 w-full rounded-xl border border-dark-border bg-dark-panel2 px-4 text-sm text-dark-text outline-none"
                  />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="block text-xs font-medium uppercase tracking-[0.18em] text-dark-muted">Business Context</span>
                  <textarea
                    value={draftLab.businessContext}
                    onChange={(event) => setDraftLab((current) => ({ ...current, businessContext: event.target.value }))}
                    placeholder="Who the lead is, what they do, why they matter, and what context the reply should respect..."
                    className="min-h-[120px] w-full rounded-xl border border-dark-border bg-dark-panel2 px-4 py-3 text-sm text-dark-text outline-none"
                  />
                </label>
                <label className="space-y-1">
                  <span className="block text-xs font-medium uppercase tracking-[0.18em] text-dark-muted">Objective</span>
                  <input
                    value={draftLab.objective}
                    onChange={(event) => setDraftLab((current) => ({ ...current, objective: event.target.value }))}
                    placeholder="Book a call, continue the thread, ask one clean question..."
                    className="h-11 w-full rounded-xl border border-dark-border bg-dark-panel2 px-4 text-sm text-dark-text outline-none"
                  />
                </label>
                <label className="space-y-1">
                  <span className="block text-xs font-medium uppercase tracking-[0.18em] text-dark-muted">Prior Message</span>
                  <input
                    value={draftLab.priorMessage}
                    onChange={(event) => setDraftLab((current) => ({ ...current, priorMessage: event.target.value }))}
                    placeholder="Optional previous message"
                    className="h-11 w-full rounded-xl border border-dark-border bg-dark-panel2 px-4 text-sm text-dark-text outline-none"
                  />
                </label>
                <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => void handleGenerateDraft()}
                    className="inline-flex items-center gap-2 rounded-xl bg-cm-purple px-4 py-2 text-sm font-medium text-white"
                  >
                    {saving === "draft-lab" ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    Generate Draft
                  </button>
                  {draftLabError ? <p className="text-sm text-dark-danger">{draftLabError}</p> : null}
                </div>
              </div>
              {draftLabResult ? (
                <div className="mt-4 rounded-xl border border-dark-border bg-dark-panel2 p-4 space-y-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-dark-muted">Opener</p>
                    <p className="mt-1 text-sm text-dark-text">{draftLabResult.opener}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-dark-muted">Body</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-dark-text">{draftLabResult.body}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-dark-muted">CTA</p>
                    <p className="mt-1 text-sm text-dark-text">{draftLabResult.cta}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-dark-muted">Why this works</p>
                    <p className="mt-1 text-sm text-dark-muted">{draftLabResult.reasoning}</p>
                  </div>
                </div>
              ) : null}
            </div>
            ) : null}
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            {isAutomationsMode ? (
            <div className="rounded-2xl border border-dark-border bg-dark-panel p-5 shadow-md shadow-black/20">
              <h3 className="mb-4 text-lg font-semibold text-dark-text">Automations</h3>
              <div className="space-y-3">
                {(snapshot?.rules || []).map((rule) => (
                  <div key={rule.id} className="rounded-xl border border-dark-border bg-dark-panel2 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-dark-text">{rule.name}</p>
                        <p className="mt-1 text-xs text-dark-muted">
                          {formatChannel(rule.channel)} · {rule.project_name} · {formatStage(rule.from_stage)} → {formatStage(rule.to_stage)}
                        </p>
                        <p className="mt-1 text-xs text-dark-muted">
                          Delay {rule.delay_minutes ?? snapshot?.settings.default_delay_minutes ?? 3} min
                          {rule.template_name ? ` · Template: ${rule.template_name}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <QueueBadge status={rule.enabled ? "approved" : "cancelled"} />
                        <button
                          onClick={() =>
                            setRuleForm({
                              id: rule.id,
                              name: rule.name,
                              enabled: rule.enabled,
                              trigger_type: "stage_changed",
                              project_name: rule.project_name,
                              from_stage: rule.from_stage || "",
                              to_stage: rule.to_stage,
                              delay_minutes:
                                rule.delay_minutes === null || rule.delay_minutes === undefined
                                  ? ""
                                  : String(rule.delay_minutes),
                              channel: rule.channel,
                              template_id: rule.template_id || "",
                            })
                          }
                          className="rounded-lg border border-dark-border px-3 py-1.5 text-xs text-dark-text"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => void handleToggleRule(rule)}
                          className="rounded-lg border border-dark-border px-3 py-1.5 text-xs text-dark-text"
                        >
                          {rule.enabled ? "Disable" : "Enable"}
                        </button>
                        <button
                          onClick={() => void handleDeleteRule(rule.id)}
                          className="rounded-lg border border-dark-border px-3 py-1.5 text-xs text-dark-text"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {snapshot?.rules?.length === 0 ? <p className="text-sm text-dark-muted">No automations yet.</p> : null}
              </div>
            </div>
            ) : null}

            {isTemplatesMode ? (
            <div className="rounded-2xl border border-dark-border bg-dark-panel p-5 shadow-md shadow-black/20">
              <h3 className="mb-4 text-lg font-semibold text-dark-text">Templates</h3>
              <div className="space-y-3">
                {(snapshot?.templates || []).map((template) => (
                  <div key={template.id} className="rounded-xl border border-dark-border bg-dark-panel2 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-dark-text">{template.name}</p>
                        <p className="mt-1 text-xs text-dark-muted">{formatChannel(template.channel)}</p>
                        {template.subject_template ? (
                          <p className="mt-2 text-xs text-dark-muted">Subject: {template.subject_template}</p>
                        ) : null}
                        <p className="mt-2 whitespace-pre-wrap text-sm text-dark-text">{template.body_template}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            setTemplateForm({
                              id: template.id,
                              name: template.name,
                              channel: template.channel,
                              subject_template: template.subject_template || "",
                              body_template: template.body_template,
                            })
                          }
                          className="rounded-lg border border-dark-border px-3 py-1.5 text-xs text-dark-text"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => void handleDeleteTemplate(template.id)}
                          className="rounded-lg border border-dark-border px-3 py-1.5 text-xs text-dark-text"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {snapshot?.templates?.length === 0 ? <p className="text-sm text-dark-muted">No templates yet.</p> : null}
              </div>
            </div>
            ) : null}
          </section>
        </>
      ) : null}

      {!loading && mode === "approval" ? (
        <>
          <section className="rounded-2xl border border-dark-border bg-dark-panel p-5 shadow-md shadow-black/20">
            <div className="mb-4 flex items-center gap-2">
              <Clock3 size={18} className="text-cm-purple" />
              <h2 className="text-lg font-semibold text-dark-text">Pending Review</h2>
            </div>
            <div className="space-y-4">
              {pendingApproval.map((item) => {
                const draft = seedApprovalDraft(item);
                return (
                  <div key={item.id} className="rounded-xl border border-dark-border bg-dark-panel2 p-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-dark-text">{item.contact_name}</p>
                          <p className="text-xs text-dark-muted">
                            {item.project_name} · {item.rule_name} · {formatChannel(item.channel)}
                          </p>
                          <p className="mt-1 text-xs text-dark-muted">
                            {formatStage(item.triggered_from_stage)} → {formatStage(item.triggered_to_stage)}
                          </p>
                        </div>
                        <QueueBadge status={item.review_status} />
                      </div>
                      {item.channel === "email" ? (
                        <input
                          value={draft.subject}
                          onChange={(event) =>
                            setApprovalDrafts((current) => ({
                              ...current,
                              [item.id]: { ...draft, subject: event.target.value },
                            }))
                          }
                          placeholder="Subject"
                          className="h-11 rounded-xl border border-dark-border bg-dark-panel px-4 text-sm text-dark-text outline-none"
                        />
                      ) : null}
                      <textarea
                        value={draft.body}
                        onChange={(event) =>
                          setApprovalDrafts((current) => ({
                            ...current,
                            [item.id]: { ...draft, body: event.target.value },
                          }))
                        }
                        className="min-h-[120px] rounded-xl border border-dark-border bg-dark-panel px-4 py-3 text-sm text-dark-text outline-none"
                      />
                      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                        <input
                          type="datetime-local"
                          value={draft.scheduled_send_at}
                          onChange={(event) =>
                            setApprovalDrafts((current) => ({
                              ...current,
                              [item.id]: { ...draft, scheduled_send_at: event.target.value },
                            }))
                          }
                          className="h-11 rounded-xl border border-dark-border bg-dark-panel px-4 text-sm text-dark-text outline-none"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => void handleApprovalAction(item.id, "update")}
                            className="inline-flex items-center gap-2 rounded-xl border border-dark-border bg-dark-panel px-4 py-2 text-sm text-dark-text"
                          >
                            <Save size={15} />
                            Save
                          </button>
                          <button
                            onClick={() => void handleApprovalAction(item.id, "approve")}
                            className="inline-flex items-center gap-2 rounded-xl border border-dark-success/30 bg-dark-success/10 px-4 py-2 text-sm font-medium text-dark-success"
                          >
                            <Check size={15} />
                            Approve
                          </button>
                          <button
                            onClick={() => void handleApprovalAction(item.id, "cancel")}
                            className="inline-flex items-center gap-2 rounded-xl border border-dark-danger/30 bg-dark-danger/10 px-4 py-2 text-sm font-medium text-dark-danger"
                          >
                            <X size={15} />
                            Cancel
                          </button>
                        </div>
                      </div>
                      {approvalErrors[item.id] ? (
                        <p className="text-sm text-dark-danger">{approvalErrors[item.id]}</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {pendingApproval.length === 0 ? <p className="text-sm text-dark-muted">No approval items pending review.</p> : null}
            </div>
          </section>

          <section className="rounded-2xl border border-dark-border bg-dark-panel p-5 shadow-md shadow-black/20">
            <h2 className="mb-4 text-lg font-semibold text-dark-text">Delivery Queue</h2>
            <div className="space-y-3">
              {(snapshot?.delivery || []).map((delivery) => (
                <div key={delivery.id} className="rounded-xl border border-dark-border bg-dark-panel2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-dark-text">{delivery.contact_name}</p>
                      <p className="text-xs text-dark-muted">
                        {delivery.project_name} · {delivery.rule_name} · {formatChannel(delivery.channel)}
                      </p>
                      <p className="mt-1 text-xs text-dark-muted">Scheduled {formatTimestamp(delivery.scheduled_send_at)}</p>
                      {delivery.blocked_reason ? (
                        <p className="mt-1 text-xs text-sky-200">Blocked: {delivery.blocked_reason}</p>
                      ) : null}
                      {delivery.failure_reason ? (
                        <p className="mt-1 text-xs text-dark-danger">Failure: {delivery.failure_reason}</p>
                      ) : null}
                    </div>
                    <QueueBadge status={delivery.status} />
                  </div>
                </div>
              ))}
              {snapshot?.delivery?.length === 0 ? <p className="text-sm text-dark-muted">No delivery items yet.</p> : null}
            </div>
          </section>
        </>
      ) : null}

      {!loading && mode === "settings" ? (
        <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-dark-border bg-dark-panel p-5 shadow-md shadow-black/20">
            <h2 className="mb-4 text-lg font-semibold text-dark-text">Automation Defaults</h2>
            <div className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm text-dark-muted">Default delay in minutes</span>
                <input
                  value={settingsForm.default_delay_minutes}
                  onChange={(event) =>
                    setSettingsForm((current) => ({ ...current, default_delay_minutes: event.target.value }))
                  }
                  className="h-11 w-full rounded-xl border border-dark-border bg-dark-panel2 px-4 text-sm text-dark-text outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm text-dark-muted">Email send from</span>
                <input
                  value={settingsForm.email_from_address}
                  onChange={(event) =>
                    setSettingsForm((current) => ({ ...current, email_from_address: event.target.value }))
                  }
                  placeholder="Your verified sender"
                  className="h-11 w-full rounded-xl border border-dark-border bg-dark-panel2 px-4 text-sm text-dark-text outline-none"
                />
                <p className="mt-2 text-xs text-dark-muted">
                  Use the exact verified Resend domain or subdomain configured for your account.
                </p>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm text-dark-muted">Send test email to</span>
                <input
                  value={settingsForm.email_test_recipient}
                  onChange={(event) =>
                    setSettingsForm((current) => ({ ...current, email_test_recipient: event.target.value }))
                  }
                  placeholder="Test recipient"
                  className="h-11 w-full rounded-xl border border-dark-border bg-dark-panel2 px-4 text-sm text-dark-text outline-none"
                />
              </label>
              {(["email", "instagram", "whatsapp"] as const).map((channel) => (
                <label
                  key={channel}
                  className="flex items-center justify-between rounded-xl border border-dark-border bg-dark-panel2 px-4 py-3"
                >
                  <div>
                    <span className="text-sm text-dark-text">{formatChannel(channel)} sending</span>
                    <p className="mt-1 text-xs text-dark-muted">
                      {!snapshot?.settings.capabilities?.[channel]?.wired
                        ? `${formatChannel(channel)} not yet enabled`
                        : settingsForm[`${channel}_live_enabled`]
                          ? `${formatChannel(channel)} enabled`
                          : `${formatChannel(channel)} available but turned off`}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    disabled={!snapshot?.settings.capabilities?.[channel]?.wired}
                    checked={settingsForm[`${channel}_live_enabled`]}
                    onChange={(event) =>
                      setSettingsForm((current) => ({
                        ...current,
                        [`${channel}_live_enabled`]: event.target.checked,
                      }))
                    }
                  />
                </label>
              ))}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => void handleSaveSettings()}
                  className="inline-flex items-center gap-2 rounded-xl bg-cm-purple px-4 py-2 text-sm font-medium text-white"
                >
                  {saving === "settings" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save Settings
                </button>
                <button
                  onClick={() => void handleSendTestEmail()}
                  className="inline-flex items-center gap-2 rounded-xl border border-dark-border bg-dark-panel2 px-4 py-2 text-sm font-medium text-dark-text"
                >
                  {saving === "test-email" ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  Send Resend Test
                </button>
                {settingsError ? <p className="text-sm text-dark-danger">{settingsError}</p> : null}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-dark-border bg-dark-panel p-5 shadow-md shadow-black/20">
            <h2 className="mb-4 text-lg font-semibold text-dark-text">Queue Snapshot</h2>
            <div className="space-y-3">
              <div className="rounded-xl border border-dark-border bg-dark-panel2 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-dark-muted">Rules</p>
                <p className="mt-1 text-lg font-semibold text-dark-text">{snapshot?.rules.length || 0}</p>
              </div>
              <div className="rounded-xl border border-dark-border bg-dark-panel2 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-dark-muted">Pending Approval</p>
                <p className="mt-1 text-lg font-semibold text-dark-text">{pendingApproval.length}</p>
              </div>
              <div className="rounded-xl border border-dark-border bg-dark-panel2 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-dark-muted">Delivery Queue</p>
                <p className="mt-1 text-lg font-semibold text-dark-text">{snapshot?.delivery.length || 0}</p>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
