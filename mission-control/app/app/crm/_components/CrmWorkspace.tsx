"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  Folder,
  Globe,
  Instagram,
  MailPlus,
  Linkedin,
  Loader2,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Target,
  MessageCircle,
  Trash2,
  X,
  UserPlus,
  Clock,
  Pencil,
  Users,
  Video,
  Zap,
} from "lucide-react";

import AffiliatesPanel, { AffiliateRecord } from "../../_components/AffiliatesPanel";

type ViewMode = "inbox" | "contacts" | "pipeline" | "affiliates" | "labels" | "settings";
type TableSortKey = "name" | "projects" | "stage" | "signal" | "source" | "last_activity";

const PIPELINE_PROJECT = "pipeline";
const PIPELINE_PROJECT_DISPLAY_NAME = "Pipelines";
const PIPELINE_STATUSES = [
  "new", "contacted", "qualified", "negotiating", "won", "stale", "lost",
] as const;

const PIPELINE_BOARD_STATUSES = [
  "new", "contacted", "qualified", "negotiating", "won", "stale", "lost",
] as const;

const DECLINED_REASONS = [
  { value: "fit", label: "Fit" },
  { value: "fit_not_ready", label: "Fit-Too Advanced" },
  { value: "timing", label: "Timing" },
  { value: "price", label: "Price" },
  { value: "other", label: "Other" },
];

const COMMUNICATION_CHANNEL_OPTIONS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "phone", label: "Phone" },
  { value: "in_person", label: "In Person" },
  { value: "other", label: "Other" },
];

type ProjectCatalogEntry = {
  name: string;
  displayName: string;
};

type ContactRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name: string | null;
  photo_url?: string | null;
  photo_local_path?: string | null;
  primary_email?: string | null;
  primary_phone?: string | null;
  email?: string | null;
  phone?: string | null;
  instagram_handle?: string | null;
  tiktok_url?: string | null;
  location?: string | null;
  location_source?: string | null;
  location_is_manual?: boolean;
  industry?: string | null;
  industry_source?: string | null;
  industry_is_manual?: boolean;
  business_description?: string | null;
  business_description_source?: string | null;
  business_description_is_manual?: boolean;
  biggest_needs?: string | null;
  biggest_needs_source?: string | null;
  biggest_needs_is_manual?: boolean;
  instagram_profile_url?: string | null;
  website_url?: string | null;
  source_latest: string | null;
  status: string;
  priority: number;
  owner: string | null;
  next_step?: string | null;
  communication_channel?: string | null;
  willing_to_pay?: number | null;
  pipeline_affiliate_id?: string | null;
  pipeline_affiliate_name?: string | null;
  primary_project?: string | null;
  primary_project_display_name?: string | null;
  pipeline_status?: string | null;
  lost_reason?: string | null;
  funnel_label_key: string | null;
  review_needed: boolean;
  updated_at: string;
  project_state?: string | null;
  project_name?: string | null;
  latest_campaign?: string | null;
  latest_keyword?: string | null;
  latest_captured_at?: string | null;
  last_contacted_at?: string | null;
  project_names?: string[];
  project_count?: number;
};

type ContactDetail = {
  contact: ContactRow & {
    first_name?: string | null;
    last_name?: string | null;
    notes?: string | null;
    instagram_handle?: string | null;
    tiktok_url?: string | null;
    photo_url?: string | null;
    photo_local_path?: string | null;
  };
  aliases: Array<{ alias_type: string; alias_value: string; created_at: string }>;
  events: Array<{
    id: string;
    source: string;
    campaign?: string | null;
    keyword?: string | null;
    captured_at?: string | null;
    raw_payload?: unknown;
  }>;
  versions: Array<{ id: number; changed_at: string; reason?: string | null }>;
  pipeline: Array<{ id: number; from_status?: string | null; to_status: string; changed_at: string }>;
  communications?: Array<{
    id: number;
    channel: string;
    direction: string;
    note?: string | null;
    contacted_at: string;
    created_at: string;
  }>;
  projects: Array<{
    contact_id?: string;
    project_name: string;
    pipeline_status: string;
    last_touched_at?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  }>;
  labels: Array<{ label_key: string; display_name?: string | null; label_role: string }>;
  enrichment: Array<{
    id: number;
    source: string;
    handle?: string | null;
    profile_url?: string | null;
    external_url?: string | null;
    photo_url?: string | null;
    photo_local_path?: string | null;
    full_name?: string | null;
    bio?: string | null;
    enriched_at?: string | null;
  }>;
  affiliate?: AffiliateRecord | null;
  affiliates?: AffiliateRecord[];
};

type SettingsData = {
  approvedLabels: Array<{
    key: string;
    role: string;
    displayName: string;
    enabled: boolean;
    existsInCatalog: boolean;
  }>;
  projectCatalog: Array<string>;
  legacy: {
    crmJson: { exists: boolean; count: number };
    chatWidgetLeads: { exists: boolean; count: number };
  };
  affiliates?: AffiliateRecord[];
};

type InitialPipelineData = {
  grouped?: Record<string, ContactRow[]>;
  statuses?: string[];
  allStatuses?: string[];
  projectCatalog?: string[];
  project?: string;
  affiliates?: AffiliateRecord[];
  columnAutomationMap?: Record<string, ColumnAutomationInfo[]>;
  summary?: {
    [key: string]: unknown;
  };
};

type ColumnAutomationInfo = {
  id?: string;
  name: string;
  description: string;
  channel?: string | null;
  status?: string | null;
};

const SORT_OPTIONS = [
  { value: "updated_desc", label: "Newest Updated" },
  { value: "created_desc", label: "Newest Created" },
  { value: "untouched_asc", label: "Oldest Touched" },
  { value: "priority_desc", label: "Highest Priority" },
  { value: "source_asc", label: "Source" },
  { value: "owner_asc", label: "Owner" },
  { value: "status_asc", label: "Status" },
  { value: "sync_state_asc", label: "Sync State" },
];

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function getDisplayName(contact: ContactRow) {
  const splitName = [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim();
  return splitName || contact.full_name || contact.primary_email || contact.email || "Unnamed lead";
}

function createEmptyContactDetail(
  initialStatus: string = "new",
  initialProject: string = PIPELINE_PROJECT
): ContactDetail {
  const now = new Date().toISOString();
  const displayName = formatProjectName(initialProject);
  return {
    contact: {
      id: "__new__",
      first_name: "",
      last_name: "",
      full_name: "New Lead",
      photo_url: null,
      photo_local_path: null,
      primary_email: null,
      primary_phone: null,
      email: null,
      phone: null,
      instagram_handle: null,
      tiktok_url: null,
      location: null,
      location_source: null,
      location_is_manual: false,
      industry: null,
      industry_source: null,
      industry_is_manual: false,
      business_description: null,
      business_description_source: null,
      business_description_is_manual: false,
      biggest_needs: null,
      biggest_needs_source: null,
      biggest_needs_is_manual: false,
      instagram_profile_url: null,
      website_url: null,
      source_latest: "manual",
      status: "new",
      priority: 0,
      owner: null,
      next_step: null,
      communication_channel: "whatsapp",
      willing_to_pay: null,
      pipeline_affiliate_id: null,
      pipeline_affiliate_name: null,
      primary_project: initialProject,
      primary_project_display_name: displayName,
      pipeline_status: initialProject === PIPELINE_PROJECT ? initialStatus : null,
      lost_reason: null,
      funnel_label_key: null,
      review_needed: false,
      updated_at: now,
      project_state: initialStatus,
      project_name: initialProject,
      latest_campaign: null,
      latest_keyword: null,
      latest_captured_at: null,
      project_names: [initialProject],
      project_count: 1,
      notes: null,
    },
    aliases: [],
    events: [],
    versions: [],
    pipeline: [],
    projects: [
      {
        project_name: initialProject,
        pipeline_status: initialStatus,
        created_at: now,
        updated_at: now,
        last_touched_at: now,
      },
    ],
    labels: [],
    enrichment: [],
    affiliate: null,
    affiliates: [],
  };
}

function splitAffiliateName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return { first_name: "", last_name: "" };
  const parts = trimmed.split(/\s+/);
  return {
    first_name: parts[0] || "",
    last_name: parts.slice(1).join(" "),
  };
}

function normalizeProjectName(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw === "all_sorted" || raw === "all sorted") return "all-sorted";
  return raw;
}

function formatProjectName(value: string) {
  value = normalizeProjectName(value);
  if (value === PIPELINE_PROJECT) return PIPELINE_PROJECT_DISPLAY_NAME;
  if (value === "connection_map") return "Connection Map";
  if (value === "mentorships") return "Mentorships";
  if (value === "all-sorted") return "All Sorted";
  return value.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

function formatStatusLabel(value?: string | null) {
  if (!value) return "—";
  switch (value) {
    case "new":
      return "Possible Candidate";
    case "contacted":
      return "Interested";
    case "qualified":
      return "In Conversation";
    case "qualified":
      return "Strong Interest";
    case "negotiating":
      return "Awaiting Payment";
    case "won":
      return "Registered";
    case "qualified":
      return "Future Interest";
    case "stale":
      return "Stale";
    case "lost":
      return "Can't Afford It";
    case "new":
      return "Unreviewed";
    case "lost":
      return "Declined";
    default:
      return value.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
  }
}

function coerceColumnAutomationEntry(
  value: unknown,
  fallbackStatus?: string | null
): ColumnAutomationInfo | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const channel =
    typeof record.channel === "string"
      ? record.channel
      : typeof record.medium === "string"
        ? record.medium
        : typeof record.type === "string"
          ? record.type
          : null;
  const name =
    typeof record.name === "string"
      ? record.name.trim()
      : typeof record.title === "string"
        ? record.title.trim()
        : typeof record.label === "string"
          ? record.label.trim()
          : "";
  const description =
    typeof record.description === "string"
      ? record.description.trim()
      : typeof record.summary === "string"
        ? record.summary.trim()
        : typeof record.body === "string"
          ? record.body.trim()
          : typeof record.action === "string"
            ? record.action.trim()
            : "";
  const toStage =
    typeof record.to_stage === "string"
      ? record.to_stage
      : typeof record.toStage === "string"
        ? record.toStage
        : fallbackStatus || null;
  const resolvedName =
    name ||
    [channel ? formatCommunicationChannelLabel(channel) : null, "automation"].filter(Boolean).join(" ");
  const resolvedDescription =
    description ||
    `Runs when a lead lands in ${formatStatusLabel(String(toStage || ""))}.`;

  if (!resolvedName) return null;
  return {
    id:
      typeof record.id === "string"
        ? record.id
        : typeof record.id === "number"
          ? String(record.id)
          : undefined,
    name: resolvedName,
    description: resolvedDescription,
    channel,
    status: toStage,
  };
}

function extractColumnAutomationMap(payload: unknown): Record<string, ColumnAutomationInfo[]> {
  if (!payload || typeof payload !== "object") return {};
  const root = payload as Record<string, unknown>;
  const candidates = [
    root.columnAutomationMap,
    root.stageAutomationMap,
    root.columnAutomations,
    root.automationsByStage,
    root.summary && typeof root.summary === "object"
      ? (root.summary as Record<string, unknown>).columnAutomationMap
      : null,
    root.summary && typeof root.summary === "object"
      ? (root.summary as Record<string, unknown>).stageAutomationMap
      : null,
  ];
  const map: Record<string, ColumnAutomationInfo[]> = {};
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    for (const [rawStatus, rawEntries] of Object.entries(candidate as Record<string, unknown>)) {
      const status = normalizePipelineStatusToken(rawStatus);
      if (!status) continue;
      const entrySource = Array.isArray(rawEntries)
        ? rawEntries
        : rawEntries && typeof rawEntries === "object"
          ? ((rawEntries as Record<string, unknown>).automations ||
              (rawEntries as Record<string, unknown>).automation_rules ||
              (rawEntries as Record<string, unknown>).rules)
          : null;
      if (!Array.isArray(entrySource)) continue;
      const nextEntries = entrySource
        .map((entry) => coerceColumnAutomationEntry(entry, status))
        .filter((entry): entry is ColumnAutomationInfo => Boolean(entry));
      if (nextEntries.length) {
        map[status] = nextEntries;
      }
    }
  }
  return map;
}

function normalizePipelineStatusToken(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function formatCommunicationChannelLabel(value?: string | null) {
  switch (value) {
    case "whatsapp":
      return "WhatsApp";
    case "email":
      return "Email";
    case "instagram":
      return "Instagram";
    case "tiktok":
      return "TikTok";
    default:
      return "—";
  }
}

function normalizePhoneLink(value?: string | null) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  return digits || null;
}

function extractInstagramHandle(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("@")) return raw.slice(1).trim();
  const match = raw.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  if (match?.[1]) return match[1].replace(/\/+$/, "");
  return raw.replace(/^@/, "").trim();
}

function getInstagramProfileUrl(value?: string | null) {
  const handle = extractInstagramHandle(value);
  return handle ? `https://instagram.com/${handle}` : null;
}

function getGmailComposeUrl(email?: string | null) {
  const recipient = String(email || "").trim();
  if (!recipient) return null;
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipient)}`;
}

function syncInstagramFields(input: { handle?: string | null; url?: string | null }) {
  const handle = extractInstagramHandle(input.handle || input.url);
  const profileUrl =
    (input.url && input.url.trim().startsWith("http") ? input.url.trim() : null) ||
    getInstagramProfileUrl(handle);
  return {
    handle,
    profileUrl: profileUrl || "",
  };
}

function LeadCardActionIcons({
  contact,
}: {
  contact: ContactRow;
}) {
  const whatsappLink = normalizePhoneLink(contact.primary_phone || contact.phone)
    ? `https://wa.me/${normalizePhoneLink(contact.primary_phone || contact.phone)}`
    : null;
  const instagramLink = contact.instagram_profile_url || getInstagramProfileUrl(contact.instagram_handle);
  const email = contact.primary_email || contact.email;
  const gmailComposeLink = getGmailComposeUrl(email);

  if (!whatsappLink && !instagramLink && !gmailComposeLink) return null;

  return (
    <div className="mt-1 flex items-center gap-2">
      {whatsappLink && (
        <a
          href={whatsappLink}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-dark-success transition hover:bg-dark-success/10"
          title="Open WhatsApp chat"
        >
          <MessageCircle size={14} />
        </a>
      )}
      {instagramLink && (
        <a
          href={instagramLink}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-cm-purple transition hover:bg-cm-purple/10"
          title="Open Instagram profile"
        >
          <Instagram size={14} />
        </a>
      )}
      {gmailComposeLink && (
        <a
          href={gmailComposeLink}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-dark-muted transition hover:bg-dark-panel"
          title="Open Gmail compose"
        >
          <MailPlus size={14} />
        </a>
      )}
    </div>
  );
}

function getProjectNames(contact: ContactRow) {
  const names = Array.isArray(contact.project_names)
    ? contact.project_names
    : contact.project_name
      ? [contact.project_name]
      : [];
  return [...new Set(names.map(normalizeProjectName).filter(Boolean))];
}

function getProjectStatus(detail: ContactDetail, projectName?: string | null) {
  const normalized = normalizeProjectName(projectName || detail.contact.primary_project || PIPELINE_PROJECT);
  const membership = detail.projects.find(
    (project) => normalizeProjectName(project.project_name) === normalized
  );
  return membership?.pipeline_status || detail.contact.project_state || detail.contact.pipeline_status || detail.contact.status || "new";
}

function mergeProjectCatalog(
  catalog: ProjectCatalogEntry[],
  projectNames: Array<string | null | undefined>
) {
  const byName = new Map<string, ProjectCatalogEntry>();
  for (const project of catalog) {
    const name = normalizeProjectName(project.name);
    if (name) byName.set(name, { ...project, name, displayName: formatProjectName(name) });
  }
  for (const name of projectNames) {
    const normalized = normalizeProjectName(name);
    if (!normalized || byName.has(normalized)) continue;
    byName.set(normalized, { name: normalized, displayName: formatProjectName(normalized) });
  }
  return Array.from(byName.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function getSignal(contact: ContactRow) {
  const stage = contact.pipeline_status || contact.project_state || contact.status;
  if (stage === "qualified" || stage === "negotiating") {
    return { label: "Hot", tone: "success" as const };
  }
  if (!contact.primary_email && !contact.email && !contact.phone && !contact.primary_phone) {
    return { label: "No contact", tone: "danger" as const };
  }
  if (contact.review_needed) {
    return { label: "Needs review", tone: "warning" as const };
  }
  if ((contact.project_count || getProjectNames(contact).length) > 0) {
    return { label: "Product-linked", tone: "default" as const };
  }
  if (contact.business_description || contact.industry || contact.location) {
    return { label: "Profile-rich", tone: "muted" as const };
  }
  return { label: "Thin record", tone: "muted" as const };
}

function getSaleStageLabel(contact: ContactRow) {
  return formatStatusLabel(contact.pipeline_status || contact.project_state || contact.status);
}

function getSocialLinks(contact: ContactRow, detail?: ContactDetail | null) {
  const enrichmentLinks = detail?.enrichment || [];
  const instagramProfile =
    contact.instagram_profile_url ||
    enrichmentLinks.find((entry) => entry.source === "instagram_profile")?.profile_url;
  const instagramHandle =
    detail?.contact.instagram_handle ||
    contact.instagram_handle ||
    detail?.enrichment.find((entry) => entry.handle)?.handle;
  return {
    instagram:
      instagramProfile ||
      (instagramHandle ? `https://instagram.com/${instagramHandle.replace(/^@/, "")}` : null),
    linkedin: enrichmentLinks.find((entry) => entry.source === "linkedin_profile")?.profile_url || null,
    website:
      contact.website_url ||
      enrichmentLinks.find((entry) => entry.external_url)?.external_url ||
      null,
  };
}

function getRepoImageUrl(pathValue?: string | null) {
  if (!pathValue) return null;
  const looksAbsoluteUnix = pathValue.startsWith("/");
  const looksAbsoluteWindows = /^[A-Za-z]:\\/.test(pathValue);
  if (!looksAbsoluteUnix && !looksAbsoluteWindows) return null;
  return `/api/repo/image?path=${encodeURIComponent(pathValue)}`;
}

function getResolvedPhotoUrl(photoLocalPath?: string | null, photoUrl?: string | null) {
  return getRepoImageUrl(photoLocalPath) || photoUrl || null;
}

function Avatar({
  name,
  photoUrl,
  size = 40,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
}) {
  const [imgError, setImgError] = useState(false);
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
  const colors = [
    "bg-violet-500/20 text-violet-300",
    "bg-cm-purple/20 text-indigo-300",
    "bg-pink-500/20 text-pink-300",
    "bg-cm-purple/30 text-cm-purple",
    "bg-dark-warn/20 text-dark-warn",
    "bg-sky-500/20 text-sky-300",
  ];
  const colorIdx = Math.abs((name || "?").charCodeAt(0)) % colors.length;
  const dimension = `${size}px`;

  if (photoUrl && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        width={size}
        height={size}
        onError={() => setImgError(true)}
        className="flex-shrink-0 rounded-full object-cover"
        style={{ width: dimension, height: dimension }}
      />
    );
  }

  return (
    <div
      className={`flex flex-shrink-0 items-center justify-center rounded-full font-bold ${colors[colorIdx]}`}
      style={{ width: dimension, height: dimension, fontSize: size < 32 ? "10px" : size < 48 ? "14px" : "20px" }}
    >
      {initials || "?"}
    </div>
  );
}

/* ── Activity Timeline helpers ── */

function daysAgoText(isoDate: string): string {
  const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function getDaysAgoTone(isoDate: string): "success" | "warning" | "danger" | "muted" {
  const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / 86400000);
  if (days <= 3) return "success";
  if (days <= 7) return "muted";
  if (days <= 14) return "warning";
  return "danger";
}

type TimelineEntry =
  | { kind: "communication"; id: number; channel: string; direction: string; note?: string | null; timestamp: string }
  | { kind: "event"; id: string; source: string; campaign?: string | null; keyword?: string | null; timestamp: string }
  | { kind: "pipeline"; id: number; from_status?: string | null; to_status: string; timestamp: string };

function buildTimeline(detail: ContactDetail): TimelineEntry[] {
  const items: TimelineEntry[] = [];
  for (const c of detail.communications || []) {
    items.push({ kind: "communication", id: c.id, channel: c.channel, direction: c.direction, note: c.note, timestamp: c.contacted_at });
  }
  for (const e of detail.events) {
    items.push({ kind: "event", id: e.id, source: e.source, campaign: e.campaign, keyword: e.keyword, timestamp: e.captured_at || "" });
  }
  for (const p of detail.pipeline) {
    items.push({ kind: "pipeline", id: p.id, from_status: p.from_status, to_status: p.to_status, timestamp: p.changed_at });
  }
  return items.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
}

function formatDateOnly(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  instagram: "Instagram",
  tiktok: "TikTok",
  phone: "Phone",
  in_person: "In Person",
  other: "Other",
};

function ChannelIcon({ channel, size = 14 }: { channel: string; size?: number }) {
  switch (channel) {
    case "whatsapp":
      return <MessageCircle size={size} />;
    case "email":
      return <Mail size={size} />;
    case "instagram":
      return <Instagram size={size} />;
    case "tiktok":
      return <Video size={size} />;
    case "phone":
      return <Phone size={size} />;
    case "in_person":
      return <Users size={size} />;
    default:
      return <Globe size={size} />;
  }
}

function formatStatus(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function TimelineItem({
  entry,
  onDelete,
  onEdit,
}: {
  entry: TimelineEntry;
  onDelete?: (id: number) => void;
  onEdit?: (id: number) => void;
}) {
  if (entry.kind === "communication") {
    const isOut = entry.direction === "outbound";
    return (
      <div className="group flex gap-3 rounded-xl border border-dark-border bg-dark-panel px-3 py-2.5 text-sm">
        <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-cm-purple/15 text-cm-purple">
          <ChannelIcon channel={entry.channel} size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-dark-text">
              {CHANNEL_LABELS[entry.channel] || entry.channel}{" "}
              <span className="text-xs font-normal text-dark-muted">{isOut ? "outbound" : "inbound"}</span>
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-dark-muted">{formatDateOnly(entry.timestamp)}</span>
              {onEdit && (
                <button
                  onClick={() => onEdit(entry.id)}
                  className="opacity-0 transition group-hover:opacity-100"
                  title="Edit"
                >
                  <Pencil size={12} className="text-dark-muted hover:text-cm-purple" />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => onDelete(entry.id)}
                  className="opacity-0 transition group-hover:opacity-100"
                  title="Delete"
                >
                  <Trash2 size={12} className="text-dark-muted hover:text-dark-danger" />
                </button>
              )}
            </div>
          </div>
          {entry.note && <p className="mt-1 text-xs text-dark-muted">{entry.note}</p>}
        </div>
      </div>
    );
  }
  if (entry.kind === "pipeline") {
    return (
      <div className="flex gap-3 rounded-xl border border-dark-border bg-dark-panel px-3 py-2.5 text-sm">
        <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-dark-warn/15">
          <Target size={14} className="text-dark-warn" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-dark-text">
              {entry.from_status ? `${formatStatus(entry.from_status)} → ` : ""}
              {formatStatus(entry.to_status)}
            </p>
            <span className="text-xs text-dark-muted">{formatDateOnly(entry.timestamp)}</span>
          </div>
          <p className="mt-0.5 text-xs text-dark-muted">Pipeline status change</p>
        </div>
      </div>
    );
  }
  // event
  return (
    <div className="flex gap-3 rounded-xl border border-dark-border bg-dark-panel px-3 py-2.5 text-sm">
      <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-dark-panel2">
        <Globe size={14} className="text-dark-muted" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-dark-text">{entry.source}</p>
          <span className="text-xs text-dark-muted">{formatDateOnly(entry.timestamp)}</span>
        </div>
        <p className="mt-0.5 text-xs text-dark-muted">
          {entry.campaign || "No campaign"} {entry.keyword ? `· ${entry.keyword}` : ""}
        </p>
      </div>
    </div>
  );
}

function ActivityTimeline({
  detail,
  onLog,
  onDeleteComm,
  onEditComm,
}: {
  detail: ContactDetail;
  onLog?: (payload: { channel: string; direction: string; note: string; contacted_at: string }) => Promise<void>;
  onDeleteComm?: (communicationId: number) => Promise<void>;
  onEditComm?: (communicationId: number, payload: { channel: string; direction: string; note: string; contacted_at: string }) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(detail.contact.id === "__new__");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [logChannel, setLogChannel] = useState("whatsapp");
  const [logDirection, setLogDirection] = useState("outbound");
  const [logNote, setLogNote] = useState("");
  const [logDate, setLogDate] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [logging, setLogging] = useState(false);

  const timeline = useMemo(() => buildTimeline(detail), [detail]);

  function resetForm() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setLogChannel("whatsapp");
    setLogDirection("outbound");
    setLogNote("");
    setLogDate(now.toISOString().slice(0, 16));
    setEditingId(null);
  }

  function startEdit(commId: number) {
    const comm = (detail.communications || []).find((c) => c.id === commId);
    if (!comm) return;
    const d = new Date(comm.contacted_at);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    setLogChannel(comm.channel);
    setLogDirection(comm.direction);
    setLogNote(comm.note || "");
    setLogDate(d.toISOString().slice(0, 16));
    setEditingId(commId);
    setShowForm(true);
  }

  async function handleQuickLog() {
    if (!onLog) return;
    setLogging(true);
    try {
      await onLog({
        channel: "whatsapp",
        direction: "outbound",
        note: "",
        contacted_at: new Date().toISOString(),
      });
    } finally {
      setLogging(false);
    }
  }

  async function handleSubmit() {
    if (!logChannel) return;
    setLogging(true);
    try {
      const payload = {
        channel: logChannel,
        direction: logDirection,
        note: logNote,
        contacted_at: new Date(logDate).toISOString(),
      };
      if (editingId && onEditComm) {
        await onEditComm(editingId, payload);
      } else if (onLog) {
        await onLog(payload);
      }
      resetForm();
      setShowForm(false);
    } finally {
      setLogging(false);
    }
  }

  // Days since last contact
  const lastContactedAt = detail.contact.last_contacted_at;
  const daysSince = lastContactedAt
    ? Math.floor((Date.now() - new Date(lastContactedAt).getTime()) / 86400000)
    : null;

  return (
    <div className="space-y-3 rounded-2xl border border-dark-border bg-dark-panel2 p-4">
      {/* Days counter */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold ${
            daysSince === null
              ? "bg-dark-warn/10 text-dark-warn"
              : daysSince <= 3
                ? "bg-dark-success/10 text-dark-success"
                : daysSince <= 7
                  ? "bg-dark-panel text-dark-muted"
                  : daysSince <= 14
                    ? "bg-dark-warn/10 text-dark-warn"
                    : "bg-dark-danger/10 text-dark-danger"
          }`}>
            <Clock size={14} />
            {daysSince === null
              ? "No contact yet"
              : daysSince === 0
                ? "Contacted today"
                : `${daysSince} day${daysSince === 1 ? "" : "s"} since last contact`}
          </div>
        </div>
        {onLog && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (showForm && !editingId) {
                  setShowForm(false);
                } else {
                  resetForm();
                  setShowForm(true);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cm-purple/30 bg-cm-purple/10 px-3 py-1.5 text-xs font-medium text-cm-purple transition hover:bg-cm-purple/20"
            >
              <Plus size={14} />
              Advanced Log
            </button>
            <button
              onClick={() => void handleQuickLog()}
              disabled={logging}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dark-success/30 bg-dark-success/10 px-3 py-1.5 text-xs font-medium text-dark-success transition hover:bg-dark-success/20 disabled:opacity-60"
              title="Log outbound WhatsApp contact right now with no note"
            >
              {logging ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
              Quick Log
            </button>
          </div>
        )}
      </div>

      {showForm && (
        <div className="space-y-3 rounded-xl border border-dark-border bg-dark-panel p-3">
          {editingId && (
            <p className="text-xs font-medium text-cm-purple">Editing communication</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-dark-muted">Channel</label>
              <select
                value={logChannel}
                onChange={(e) => setLogChannel(e.target.value)}
                className="w-full rounded-lg border border-dark-border bg-dark-panel2 px-2.5 py-1.5 text-sm text-dark-text outline-none"
              >
                {COMMUNICATION_CHANNEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-dark-muted">Direction</label>
              <select
                value={logDirection}
                onChange={(e) => setLogDirection(e.target.value)}
                className="w-full rounded-lg border border-dark-border bg-dark-panel2 px-2.5 py-1.5 text-sm text-dark-text outline-none"
              >
                <option value="outbound">Outbound</option>
                <option value="inbound">Inbound</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-dark-muted">When</label>
            <input
              type="datetime-local"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              className="w-full rounded-lg border border-dark-border bg-dark-panel2 px-2.5 py-1.5 text-sm text-dark-text outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-dark-muted">Note</label>
            <textarea
              value={logNote}
              onChange={(e) => setLogNote(e.target.value)}
              rows={2}
              placeholder="What was discussed..."
              className="w-full resize-y rounded-lg border border-dark-border bg-dark-panel2 px-2.5 py-1.5 text-sm text-dark-text placeholder:text-dark-muted/50 outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void handleSubmit()}
              disabled={logging || !logChannel}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cm-purple px-3 py-1.5 text-xs font-medium text-white transition hover:bg-cm-purple/80 disabled:opacity-60"
            >
              {logging ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              {editingId ? "Save" : "Log"}
            </button>
            {editingId && (
              <button
                onClick={() => { resetForm(); setShowForm(false); }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dark-border px-3 py-1.5 text-xs font-medium text-dark-muted transition hover:text-dark-text"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      <div className="max-h-[40vh] space-y-2 overflow-y-auto pr-1">
        {timeline.map((entry) => (
          <TimelineItem
            key={`${entry.kind}-${entry.id}`}
            entry={entry}
            onDelete={entry.kind === "communication" && onDeleteComm ? (id) => void onDeleteComm(id) : undefined}
            onEdit={entry.kind === "communication" && onEditComm ? (id) => startEdit(id) : undefined}
          />
        ))}
        {timeline.length === 0 && <p className="text-sm text-dark-muted">No activity yet.</p>}
      </div>
    </div>
  );
}

function ContactModal({
  detail,
  statusOptions,
  projectCatalog,
  selectedProject,
  actionState,
  onClose,
  onSaveDetail,
  onDelete,
  affiliates,
  onCreateAffiliate,
  onUploadPhoto,
  onEnrichLead,
  onLogCommunication,
  onDeleteCommunication,
  onEditCommunication,
}: {
  detail: ContactDetail;
  statusOptions: string[];
  projectCatalog: ProjectCatalogEntry[];
  selectedProject: string;
  actionState: string | null;
  onClose: () => void;
  onSaveDetail: (patch: Record<string, unknown>) => Promise<ContactDetail | null>;
  onDelete: () => void;
  affiliates: AffiliateRecord[];
  onCreateAffiliate: (name: string) => Promise<AffiliateRecord | null>;
  onUploadPhoto: (contactId: string, file: File) => Promise<void>;
  onEnrichLead?: () => Promise<void>;
  onLogCommunication?: (payload: { channel: string; direction: string; note: string; contacted_at: string }) => Promise<void>;
  onDeleteCommunication?: (communicationId: number) => Promise<void>;
  onEditCommunication?: (communicationId: number, payload: { channel: string; direction: string; note: string; contacted_at: string }) => Promise<void>;
}) {
  const isDraft = detail.contact.id === "__new__";
  const availableProjects = useMemo(
    () =>
      mergeProjectCatalog(projectCatalog, [
        selectedProject,
        detail.contact.primary_project,
        ...detail.projects.map((project) => project.project_name),
      ]),
    [detail, projectCatalog, selectedProject]
  );
  const initialPrimaryProject = normalizeProjectName(
    detail.contact.primary_project || selectedProject || PIPELINE_PROJECT
  );
  const initialProductLeads = [
    ...new Set(
      (detail.projects.length
        ? detail.projects.map((project) => project.project_name)
        : [initialPrimaryProject]
      )
        .map(normalizeProjectName)
        .filter(Boolean)
    ),
  ];
  const [fields, setFields] = useState(() => ({
    first_name: detail.contact.first_name || "",
    last_name: detail.contact.last_name || "",
    primary_email: detail.contact.primary_email || detail.contact.email || "",
    primary_phone: detail.contact.primary_phone || detail.contact.phone || "",
    instagram_handle: detail.contact.instagram_handle || "",
    instagram_profile_url:
      detail.contact.instagram_profile_url || getInstagramProfileUrl(detail.contact.instagram_handle) || "",
    tiktok_url: detail.contact.tiktok_url || "",
    status: getProjectStatus(detail, initialPrimaryProject),
    priority: detail.contact.priority,
    owner: detail.contact.owner || "",
    notes: detail.contact.notes || "",
    next_step: detail.contact.next_step || "",
    communication_channel: detail.contact.communication_channel || "",
    willing_to_pay:
      detail.contact.willing_to_pay === null || detail.contact.willing_to_pay === undefined
        ? ""
        : String(detail.contact.willing_to_pay),
    pipeline_affiliate_id: detail.contact.pipeline_affiliate_id || "",
    business_description: detail.contact.business_description || "",
    biggest_needs: detail.contact.biggest_needs || "",
    industry: detail.contact.industry || "",
    location: detail.contact.location || "",
    primary_project: initialPrimaryProject,
    product_leads: initialProductLeads,
    lost_reason: detail.contact.lost_reason || "",
    funnel_label_key: detail.contact.funnel_label_key || "",
  }));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showAffiliateCreator, setShowAffiliateCreator] = useState(false);
  const [newAffiliateName, setNewAffiliateName] = useState("");
  const [affiliateCreateBusy, setAffiliateCreateBusy] = useState(false);
  const [photoUploadBusy, setPhotoUploadBusy] = useState(false);
  const [photoDragActive, setPhotoDragActive] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const photoUrl = getResolvedPhotoUrl(detail.contact.photo_local_path, detail.contact.photo_url);
  const primaryEmail = detail.contact.primary_email || detail.contact.email || null;
  const primaryPhone = detail.contact.primary_phone || detail.contact.phone || null;
  const signal = getSignal({
    ...detail.contact,
    project_count: detail.projects.length,
    project_names: detail.projects.map((project) => project.project_name),
  });
  const socials = getSocialLinks(detail.contact, detail);

  useEffect(() => {
    setFields({
      first_name: detail.contact.first_name || "",
      last_name: detail.contact.last_name || "",
      primary_email: detail.contact.primary_email || detail.contact.email || "",
      primary_phone: detail.contact.primary_phone || detail.contact.phone || "",
      instagram_handle: detail.contact.instagram_handle || "",
      instagram_profile_url:
        detail.contact.instagram_profile_url || getInstagramProfileUrl(detail.contact.instagram_handle) || "",
      tiktok_url: detail.contact.tiktok_url || "",
      status: getProjectStatus(detail, detail.contact.primary_project || selectedProject || PIPELINE_PROJECT),
      priority: detail.contact.priority,
      owner: detail.contact.owner || "",
      notes: detail.contact.notes || "",
      next_step: detail.contact.next_step || "",
      communication_channel: detail.contact.communication_channel || "",
      willing_to_pay:
        detail.contact.willing_to_pay === null || detail.contact.willing_to_pay === undefined
          ? ""
          : String(detail.contact.willing_to_pay),
      pipeline_affiliate_id: detail.contact.pipeline_affiliate_id || "",
      business_description: detail.contact.business_description || "",
      biggest_needs: detail.contact.biggest_needs || "",
      industry: detail.contact.industry || "",
      location: detail.contact.location || "",
      primary_project: normalizeProjectName(detail.contact.primary_project || selectedProject || PIPELINE_PROJECT),
      product_leads: [
        ...new Set(
          (detail.projects.length
            ? detail.projects.map((project) => project.project_name)
            : [detail.contact.primary_project || selectedProject || PIPELINE_PROJECT]
          )
            .map(normalizeProjectName)
            .filter(Boolean)
        ),
      ],
      lost_reason: detail.contact.lost_reason || "",
      funnel_label_key: detail.contact.funnel_label_key || "",
    });
  }, [detail, selectedProject]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    setPortalReady(true);
    return () => setPortalReady(false);
  }, []);

  async function commitPatch(patch: Record<string, unknown>) {
    if (isDraft) return true;
    setSaveState("saving");
    setSaveError(null);
    try {
      await onSaveDetail(patch);
      setSaveState("saved");
      window.setTimeout(() => {
        setSaveState((current) => (current === "saved" ? "idle" : current));
      }, 1200);
      return true;
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "Autosave failed");
      return false;
    }
  }

  const saveBadge =
    isDraft
      ? { label: "Draft", tone: "muted" as const }
      : saveState === "saving"
      ? { label: "Saving…", tone: "muted" as const }
      : saveState === "saved"
        ? { label: "Saved", tone: "success" as const }
        : saveState === "error"
          ? { label: "Save failed", tone: "danger" as const }
          : { label: "Autosave", tone: "muted" as const };

  async function handleCreateLead() {
    setSaveState("saving");
    setSaveError(null);
    try {
      await onSaveDetail({
        first_name: fields.first_name,
        last_name: fields.last_name,
        primary_email: fields.primary_email || null,
        primary_phone: fields.primary_phone || null,
        instagram_handle: fields.instagram_handle || null,
        instagram_profile_url: fields.instagram_profile_url || null,
        tiktok_url: fields.tiktok_url || null,
        primary_project: fields.primary_project,
        communication_channel: fields.communication_channel || null,
        willing_to_pay: fields.willing_to_pay || null,
        pipeline_affiliate_id: fields.pipeline_affiliate_id || null,
        next_step: fields.next_step,
        owner: fields.owner,
        notes: fields.notes,
        industry: fields.industry,
        location: fields.location,
        business_description: fields.business_description,
        biggest_needs: fields.biggest_needs,
        lost_reason: fields.lost_reason || null,
        projects: fields.product_leads.length ? fields.product_leads : [fields.primary_project],
        project_membership_status: "new",
        project_state: { project: fields.primary_project, status: fields.status },
      });
      onClose();
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "Create failed");
      return;
    }
  }

  async function handleQuickCreateAffiliate() {
    if (!newAffiliateName.trim()) return;
    setAffiliateCreateBusy(true);
    try {
      const created = await onCreateAffiliate(newAffiliateName);
      if (created) {
        setFields((current) => ({
          ...current,
          pipeline_affiliate_id: created.id,
        }));
        await commitPatch({ pipeline_affiliate_id: created.id });
        setNewAffiliateName("");
        setShowAffiliateCreator(false);
      }
    } finally {
      setAffiliateCreateBusy(false);
    }
  }

  async function saveProductLeads(nextProjects: string[], nextPrimaryProject?: string, projectAdded?: string | null) {
    const productLeads = [...new Set(nextProjects.map(normalizeProjectName).filter(Boolean))];
    if (!productLeads.length) return;
    const primaryProject =
      nextPrimaryProject && productLeads.includes(nextPrimaryProject)
        ? nextPrimaryProject
        : productLeads.includes(fields.primary_project)
          ? fields.primary_project
          : productLeads[0];
    const nextStatus = getProjectStatus(detail, primaryProject);
    setFields((current) => ({
      ...current,
      primary_project: primaryProject,
      product_leads: productLeads,
      status: nextStatus,
    }));
    await commitPatch({
      primary_project: primaryProject,
      project: primaryProject,
      projects: productLeads,
      project_membership_status: "new",
      project_state: {
        project: projectAdded || primaryProject,
        status: projectAdded ? "new" : nextStatus,
      },
    });
  }

  async function uploadPhoto(file: File) {
    if (isDraft) return;
    setPhotoUploadBusy(true);
    setSaveError(null);
    try {
      await onUploadPhoto(detail.contact.id, file);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Photo upload failed");
    } finally {
      setPhotoUploadBusy(false);
      setPhotoDragActive(false);
    }
  }

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex h-[82vh] w-[86vw] max-w-[1400px] flex-col overflow-hidden rounded-2xl border border-dark-border bg-dark-panel shadow-2xl shadow-black/40">
        <div className="flex items-center gap-4 border-b border-dark-border bg-gradient-to-r from-cm-purple/10 via-dark-panel to-dark-panel p-6">
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                if (!isDraft) photoInputRef.current?.click();
              }}
              onDragOver={(event) => {
                if (isDraft) return;
                event.preventDefault();
                setPhotoDragActive(true);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                  setPhotoDragActive(false);
                }
              }}
              onDrop={(event) => {
                if (isDraft) return;
                event.preventDefault();
                const file = event.dataTransfer.files?.[0];
                if (file) {
                  void uploadPhoto(file);
                }
              }}
              disabled={photoUploadBusy || isDraft}
              className={`relative rounded-full transition ${
                photoDragActive ? "ring-2 ring-cm-purple ring-offset-2 ring-offset-dark-panel" : ""
              } ${isDraft ? "cursor-default" : "cursor-pointer"}`}
              title={isDraft ? "Save the lead before uploading a photo" : "Click or drop a photo"}
            >
              <Avatar name={getDisplayName(detail.contact)} photoUrl={photoUrl} size={72} />
              {!isDraft && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 text-transparent transition hover:bg-black/40 hover:text-white">
                  {photoUploadBusy ? <Loader2 size={20} className="animate-spin" /> : <Plus size={20} />}
                </div>
              )}
            </button>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void uploadPhoto(file);
                }
                event.currentTarget.value = "";
              }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-2xl font-semibold tracking-tight text-dark-text">
              {getDisplayName(detail.contact)}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-dark-muted">
              <span>{primaryEmail || "No email"}</span>
              <span>•</span>
              <span>{primaryPhone || "No phone"}</span>
              <span>•</span>
              <span>Updated {formatDate(detail.contact.updated_at)}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge label={getSaleStageLabel(detail.contact)} />
              <Badge label={signal.label} tone={signal.tone} />
              <Badge label={`P${detail.contact.priority}`} tone="muted" />
              <Badge
                label={
                  detail.contact.funnel_label_key === "custom.connection"
                    ? "Connection"
                    : detail.contact.funnel_label_key === "custom.alignment"
                      ? "Alignment"
                      : "Unassigned"
                }
                tone={detail.contact.funnel_label_key ? "success" : "warning"}
              />
              <Badge label={saveBadge.label} tone={saveBadge.tone} />
              {!isDraft && detail.contact.last_contacted_at && (
                <Badge
                  label={`Contacted ${daysAgoText(detail.contact.last_contacted_at)}`}
                  tone={getDaysAgoTone(detail.contact.last_contacted_at)}
                />
              )}
              {!isDraft && !detail.contact.last_contacted_at && (
                <Badge label="Never contacted" tone="warning" />
              )}
            </div>
          </div>
          {isDraft && (
            <button
              onClick={() => void handleCreateLead()}
              disabled={actionState === "create"}
              className="inline-flex items-center gap-2 rounded-xl bg-cm-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-cm-purple/80 disabled:opacity-60"
            >
              {actionState === "create" ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Save
            </button>
          )}
          {!isDraft && (
            <button
              onClick={onDelete}
              disabled={actionState === "delete"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dark-danger/20 px-2.5 py-1.5 text-xs font-medium text-dark-danger/60 transition hover:border-dark-danger/40 hover:bg-dark-danger/10 hover:text-dark-danger disabled:opacity-40"
              title="Delete contact"
            >
              {actionState === "delete" ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              Delete
            </button>
          )}
          <div className="h-6 w-px bg-dark-border mx-2" />
          <button
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-dark-panel2 text-dark-muted transition hover:bg-dark-border hover:text-dark-text"
            aria-label="Close contact popup"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="space-y-6 p-6">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-4 rounded-2xl border border-dark-border bg-dark-panel2 p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <EditableField
                    label="First Name"
                    control={
                      <input
                        value={fields.first_name}
                        onChange={(event) =>
                          setFields((current) => ({ ...current, first_name: event.target.value }))
                        }
                        onBlur={async (event) => {
                          await commitPatch({ first_name: event.target.value, last_name: fields.last_name });
                        }}
                        placeholder="First name"
                        autoFocus={isDraft}
                        className="w-full rounded-xl border border-dark-border bg-dark-panel px-3 py-2 text-sm text-dark-text outline-none"
                      />
                    }
                  />
                  <EditableField
                    label="Last Name"
                    control={
                      <input
                        value={fields.last_name}
                        onChange={(event) =>
                          setFields((current) => ({ ...current, last_name: event.target.value }))
                        }
                        onBlur={async (event) => {
                          await commitPatch({ first_name: fields.first_name, last_name: event.target.value });
                        }}
                        placeholder="Last name"
                        className="w-full rounded-xl border border-dark-border bg-dark-panel px-3 py-2 text-sm text-dark-text outline-none"
                      />
                    }
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
                  <InfoTile icon={<Folder size={16} />} label="Product Leads">
                    <div className="space-y-2 text-sm text-dark-text">
                      {availableProjects.map((project) => {
                        const checked = fields.product_leads.includes(project.name);
                        const membership = detail.projects.find(
                          (item) => normalizeProjectName(item.project_name) === project.name
                        );
                        const isPrimary = fields.primary_project === project.name;
                        return (
                          <label
                            key={project.name}
                            className="flex items-center justify-between gap-3 rounded-lg border border-dark-border bg-dark-panel px-3 py-2"
                          >
                            <span className="flex min-w-0 items-center gap-3">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={checked && fields.product_leads.length <= 1}
                                onChange={async (event) => {
                                  const nextProjects = event.target.checked
                                    ? [...fields.product_leads, project.name]
                                    : fields.product_leads.filter((name) => name !== project.name);
                                  await saveProductLeads(
                                    nextProjects,
                                    fields.primary_project === project.name && !event.target.checked
                                      ? nextProjects[0]
                                      : fields.primary_project,
                                    event.target.checked ? project.name : null
                                  );
                                }}
                                className="h-4 w-4 shrink-0 rounded border-dark-border bg-dark-panel2 accent-cm-purple"
                              />
                              <span className="min-w-0">
                                <span className="block truncate font-medium">{project.displayName}</span>
                                {checked && (
                                  <span className="text-xs text-dark-muted">
                                    {isPrimary ? "Primary" : "Tagged"}
                                    {membership?.pipeline_status
                                      ? ` · ${formatStatusLabel(membership.pipeline_status)}`
                                      : ""}
                                  </span>
                                )}
                              </span>
                            </span>
                            {checked && !isPrimary && (
                              <button
                                type="button"
                                onClick={async (event) => {
                                  event.preventDefault();
                                  await saveProductLeads(fields.product_leads, project.name, null);
                                }}
                                className="shrink-0 rounded-lg border border-dark-border px-2 py-1 text-xs text-dark-muted transition hover:border-cm-purple/40 hover:text-cm-purple"
                              >
                                Make primary
                              </button>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </InfoTile>
                  <EditableField
                    label={`${formatProjectName(fields.primary_project)} Status`}
                    control={
                      <select
                        value={fields.status}
                        onChange={async (event) => {
                          const value = event.target.value;
                          setFields((current) => ({ ...current, status: value }));
                          await commitPatch({
                            primary_project: fields.primary_project,
                            project: fields.primary_project,
                            project_state: { project: fields.primary_project, status: value },
                            lost_reason:
                              fields.primary_project === PIPELINE_PROJECT && value === "lost"
                                ? fields.lost_reason
                                : null,
                          });
                        }}
                        className="w-full rounded-xl border border-dark-border bg-dark-panel px-3 py-2 text-sm text-dark-text outline-none"
                      >
                        {statusOptions.map((status) => (
                          <option key={status} value={status}>
                            {formatStatusLabel(status)}
                          </option>
                        ))}
                      </select>
                    }
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {fields.primary_project === PIPELINE_PROJECT && fields.status === "lost" ? (
                    <EditableField
                      label="Declined Reason"
                      control={
                        <select
                          value={fields.lost_reason}
                          onChange={async (event) => {
                            const value = event.target.value;
                            setFields((current) => ({ ...current, lost_reason: value }));
                            await commitPatch({ lost_reason: value });
                          }}
                          className="w-full rounded-xl border border-dark-border bg-dark-panel px-3 py-2 text-sm text-dark-text outline-none"
                        >
                          <option value="">Select reason</option>
                          {DECLINED_REASONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      }
                    />
                  ) : (
                    <div className="hidden md:block" aria-hidden="true" />
                  )}
                  <EditableField
                    label="Communication Channel"
                    control={
                      <select
                        value={fields.communication_channel}
                        onChange={async (event) => {
                          const value = event.target.value;
                          setFields((current) => ({ ...current, communication_channel: value }));
                          await commitPatch({ communication_channel: value || null });
                        }}
                        className="w-full rounded-xl border border-dark-border bg-dark-panel px-3 py-2 text-sm text-dark-text outline-none"
                      >
                        <option value="">Select channel</option>
                        {COMMUNICATION_CHANNEL_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    }
                  />
                  <EditableField
                    label="Referral"
                    control={
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <select
                            value={fields.pipeline_affiliate_id}
                            onChange={async (event) => {
                              const value = event.target.value;
                              setFields((current) => ({ ...current, pipeline_affiliate_id: value }));
                              await commitPatch({ pipeline_affiliate_id: value || null });
                            }}
                            className="min-w-0 flex-1 rounded-xl border border-dark-border bg-dark-panel px-3 py-2 text-sm text-dark-text outline-none"
                          >
                            <option value="">No referral</option>
                            {affiliates.map((affiliate) => (
                              <option key={affiliate.id} value={affiliate.id}>
                                {affiliate.display_name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => setShowAffiliateCreator((current) => !current)}
                            className="inline-flex items-center justify-center rounded-xl border border-dark-border bg-dark-panel px-3 py-2 text-cm-purple transition hover:border-cm-purple/30"
                            aria-label="Add affiliate"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                        {showAffiliateCreator && (
                          <div className="flex gap-2">
                            <input
                              value={newAffiliateName}
                              onChange={(event) => setNewAffiliateName(event.target.value)}
                              placeholder="New affiliate name"
                              className="min-w-0 flex-1 rounded-xl border border-dark-border bg-dark-panel px-3 py-2 text-sm text-dark-text outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => void handleQuickCreateAffiliate()}
                              disabled={affiliateCreateBusy || !newAffiliateName.trim()}
                              className="inline-flex items-center justify-center rounded-xl border border-dark-border bg-dark-panel px-3 py-2 text-cm-purple transition hover:border-cm-purple/30 disabled:opacity-50"
                              aria-label="Save affiliate"
                            >
                              {affiliateCreateBusy ? <Loader2 size={16} className="animate-spin" /> : <ChevronRight size={16} />}
                            </button>
                          </div>
                        )}
                      </div>
                    }
                  />
                  <EditableField
                    label="Willing to Pay"
                    control={
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={fields.willing_to_pay}
                        onChange={(event) =>
                          setFields((current) => ({ ...current, willing_to_pay: event.target.value }))
                        }
                        onBlur={async (event) => {
                          await commitPatch({ willing_to_pay: event.target.value || null });
                        }}
                        placeholder="0"
                        className="w-full rounded-xl border border-dark-border bg-dark-panel px-3 py-2 text-sm text-dark-text outline-none"
                      />
                    }
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <EditableField
                    label="Email"
                    control={
                      <input
                        value={fields.primary_email}
                        onChange={(event) =>
                          setFields((current) => ({ ...current, primary_email: event.target.value }))
                        }
                        onBlur={async (event) => {
                          await commitPatch({ primary_email: event.target.value || null });
                        }}
                        placeholder="Email address"
                        className="w-full rounded-xl border border-dark-border bg-dark-panel px-3 py-2 text-sm text-dark-text outline-none"
                      />
                    }
                  />
                  <EditableField
                    label="WhatsApp Number"
                    control={
                      <input
                        value={fields.primary_phone}
                        onChange={(event) =>
                          setFields((current) => ({ ...current, primary_phone: event.target.value }))
                        }
                        onBlur={async (event) => {
                          await commitPatch({ primary_phone: event.target.value || null });
                        }}
                        placeholder="WhatsApp number"
                        className="w-full rounded-xl border border-dark-border bg-dark-panel px-3 py-2 text-sm text-dark-text outline-none"
                      />
                    }
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <EditableField
                    label="Instagram URL"
                    control={
                      <input
                        value={fields.instagram_profile_url}
                        onChange={(event) => {
                          const next = syncInstagramFields({ url: event.target.value, handle: fields.instagram_handle });
                          setFields((current) => ({
                            ...current,
                            instagram_profile_url: next.profileUrl,
                            instagram_handle: next.handle,
                          }));
                        }}
                        onBlur={async (event) => {
                          const next = syncInstagramFields({ url: event.target.value, handle: fields.instagram_handle });
                          await commitPatch({
                            instagram_handle: next.handle || null,
                            instagram_profile_url: next.profileUrl || null,
                          });
                        }}
                        placeholder="https://instagram.com/handle"
                        className="w-full rounded-xl border border-dark-border bg-dark-panel px-3 py-2 text-sm text-dark-text outline-none"
                      />
                    }
                  />
                  <EditableField
                    label="Instagram Handle"
                    control={
                      <input
                        value={fields.instagram_handle}
                        onChange={(event) => {
                          const next = syncInstagramFields({ handle: event.target.value, url: fields.instagram_profile_url });
                          setFields((current) => ({
                            ...current,
                            instagram_handle: next.handle,
                            instagram_profile_url: next.profileUrl,
                          }));
                        }}
                        onBlur={async (event) => {
                          const next = syncInstagramFields({ handle: event.target.value, url: fields.instagram_profile_url });
                          await commitPatch({
                            instagram_handle: next.handle || null,
                            instagram_profile_url: next.profileUrl || null,
                          });
                        }}
                        placeholder="@handle"
                        className="w-full rounded-xl border border-dark-border bg-dark-panel px-3 py-2 text-sm text-dark-text outline-none"
                      />
                    }
                  />
                </div>

                <EditableField
                  label="TikTok URL"
                  control={
                    <input
                      value={fields.tiktok_url}
                      onChange={(event) =>
                        setFields((current) => ({ ...current, tiktok_url: event.target.value }))
                      }
                      onBlur={async (event) => {
                        await commitPatch({ tiktok_url: event.target.value || null });
                      }}
                      placeholder="https://www.tiktok.com/@username"
                      className="w-full rounded-xl border border-dark-border bg-dark-panel px-3 py-2 text-sm text-dark-text outline-none"
                    />
                  }
                />

                <EditableField
                  label="Next Step"
                  control={
                    <textarea
                      rows={3}
                      value={fields.next_step}
                      onChange={(event) =>
                        setFields((current) => ({
                          ...current,
                          next_step: event.target.value,
                        }))
                      }
                      onBlur={async (event) => {
                        await commitPatch({ next_step: event.target.value });
                      }}
                      className="w-full resize-y rounded-xl border border-dark-border bg-dark-panel px-3 py-2 text-sm text-dark-text outline-none"
                      placeholder="Next step"
                    />
                  }
                />

                <EditableField
                  label="Notes"
                  control={
                    <textarea
                      value={fields.notes}
                      onChange={(event) =>
                        setFields((current) => ({ ...current, notes: event.target.value }))
                      }
                      onBlur={async (event) => {
                        await commitPatch({ notes: event.target.value });
                      }}
                      rows={4}
                      className="w-full resize-y rounded-xl border border-dark-border bg-dark-panel px-3 py-2 text-sm text-dark-text outline-none"
                    />
                  }
                />
              </div>

              <div className="space-y-4 self-start xl:sticky xl:top-0">
                {!isDraft && (
                  <ActivityTimeline
                    detail={detail}
                    onLog={onLogCommunication}
                    onDeleteComm={onDeleteCommunication}
                    onEditComm={onEditCommunication}
                  />
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="border-b border-dark-border pb-1 text-xs font-bold uppercase tracking-widest text-dark-muted">
                Business Context
              </h3>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <EditableField
                  label="Owner"
                  control={
                    <input
                      value={fields.owner}
                      onChange={(event) =>
                        setFields((current) => ({ ...current, owner: event.target.value }))
                      }
                      onBlur={async (event) => {
                        await commitPatch({ owner: event.target.value });
                      }}
                      placeholder="Assign owner"
                      className="w-full rounded-xl border border-dark-border bg-dark-panel2 px-3 py-2 text-sm text-dark-text outline-none"
                    />
                  }
                />
                <InfoTile icon={<Target size={16} />} label="Signal">
                  <Badge label={signal.label} tone={signal.tone} />
                </InfoTile>
                <EditableField
                  label="Industry"
                  control={
                    <input
                      value={fields.industry}
                      onChange={(event) =>
                        setFields((current) => ({ ...current, industry: event.target.value }))
                      }
                      onBlur={async (event) => {
                        await commitPatch({ industry: event.target.value });
                      }}
                      placeholder="Industry"
                      className="w-full rounded-xl border border-dark-border bg-dark-panel2 px-3 py-2 text-sm text-dark-text outline-none"
                    />
                  }
                />
                <EditableField
                  label="Location"
                  control={
                    <input
                      value={fields.location}
                      onChange={(event) =>
                        setFields((current) => ({ ...current, location: event.target.value }))
                      }
                      onBlur={async (event) => {
                        await commitPatch({ location: event.target.value });
                      }}
                      placeholder="Location"
                      className="w-full rounded-xl border border-dark-border bg-dark-panel2 px-3 py-2 text-sm text-dark-text outline-none"
                    />
                  }
                />
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <EditableField
                  label="Business Description"
                  control={
                    <textarea
                      value={fields.business_description}
                      onChange={(event) =>
                        setFields((current) => ({
                          ...current,
                          business_description: event.target.value,
                        }))
                      }
                      onBlur={async (event) => {
                        await commitPatch({ business_description: event.target.value });
                      }}
                      rows={5}
                      className="w-full rounded-xl border border-dark-border bg-dark-panel2 px-3 py-2 text-sm text-dark-text outline-none"
                    />
                  }
                />
                <EditableField
                  label="Biggest Needs / Pain Points"
                  control={
                    <textarea
                      value={fields.biggest_needs}
                      onChange={(event) =>
                        setFields((current) => ({
                          ...current,
                          biggest_needs: event.target.value,
                        }))
                      }
                      onBlur={async (event) => {
                        await commitPatch({ biggest_needs: event.target.value });
                      }}
                      rows={5}
                      className="w-full rounded-xl border border-dark-border bg-dark-panel2 px-3 py-2 text-sm text-dark-text outline-none"
                    />
                  }
                />
              </div>

              <h3 className="border-b border-dark-border pb-1 text-xs font-bold uppercase tracking-widest text-dark-muted">
                Sales Snapshot
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <InfoTile icon={<Instagram size={16} />} label="Enrichment Snapshot">
                  <div className="space-y-2">
                    <InfoRow
                      label="Instagram"
                      value={detail.contact.instagram_handle ? `@${detail.contact.instagram_handle}` : "—"}
                    />
                    <InfoRow label="Profile summary" value={detail.contact.business_description || "—"} />
                    <InfoRow label="Pain points" value={detail.contact.biggest_needs || "—"} />
                  </div>
                </InfoTile>
                <InfoTile icon={<Globe size={16} />} label="Next Source + Links">
                  <div className="space-y-3">
                    <InfoRow label="Latest source" value={detail.contact.source_latest || "manual"} />
                    <div className="flex flex-wrap gap-2">
                      {socials.instagram && (
                        <a
                          href={socials.instagram}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-xl border border-dark-border bg-dark-panel px-3 py-2 text-sm text-dark-text transition hover:border-cm-purple/30"
                        >
                          <Instagram size={14} />
                          Instagram
                        </a>
                      )}
                      {socials.linkedin && (
                        <a
                          href={socials.linkedin}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-xl border border-dark-border bg-dark-panel px-3 py-2 text-sm text-dark-text transition hover:border-cm-purple/30"
                        >
                          <Linkedin size={14} />
                          LinkedIn
                        </a>
                      )}
                      {socials.website && (
                        <a
                          href={socials.website}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-xl border border-dark-border bg-dark-panel px-3 py-2 text-sm text-dark-text transition hover:border-cm-purple/30"
                        >
                          <Globe size={14} />
                          Website
                        </a>
                      )}
                    </div>
                  </div>
                </InfoTile>
              </div>

              {!isDraft && (
                <div className="flex flex-wrap gap-3">
                  {onEnrichLead && (
                    <button
                      onClick={() => void onEnrichLead()}
                      disabled={actionState === "enrich-one"}
                      className="inline-flex items-center gap-2 rounded-xl border border-dark-border bg-dark-panel2 px-4 py-2 text-sm font-medium text-dark-text transition hover:border-cm-purple/30 disabled:opacity-60"
                    >
                      {actionState === "enrich-one" ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                      Enrich This Lead
                    </button>
                  )}
                  <Link
                    href="/app/crm/settings"
                    className="inline-flex items-center gap-2 rounded-xl border border-dark-border bg-dark-panel2 px-4 py-2 text-sm font-medium text-dark-text transition hover:border-cm-purple/30"
                  >
                    <SlidersHorizontal size={16} />
                    CRM Settings
                  </Link>
                </div>
              )}
              {saveError && (
                <div className="rounded-xl border border-dark-danger/30 bg-dark-danger/10 px-3 py-2 text-sm text-dark-danger">
                  {saveError}
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (!portalReady) return null;
  return createPortal(modalContent, document.body);
}

export function CrmWorkspace({
  mode,
  initialPipelineData,
}: {
  mode: ViewMode;
  initialPipelineData?: InitialPipelineData;
}) {
  const initialGrouped =
    mode === "pipeline" && initialPipelineData?.grouped ? initialPipelineData.grouped : {};
  const initialContacts =
    mode === "pipeline" ? (Object.values(initialGrouped).flat() as ContactRow[]) : [];
  const initialBoardStatuses =
    mode === "pipeline" && Array.isArray(initialPipelineData?.statuses) && initialPipelineData.statuses.length
      ? initialPipelineData.statuses
      : [...PIPELINE_BOARD_STATUSES];
  const initialAllStatuses =
    mode === "pipeline" && Array.isArray(initialPipelineData?.allStatuses) && initialPipelineData.allStatuses.length
      ? initialPipelineData.allStatuses
      : [...PIPELINE_STATUSES];
  const initialProjectCatalog =
    mode === "pipeline" && Array.isArray(initialPipelineData?.projectCatalog)
      ? mergeProjectCatalog(
          initialPipelineData.projectCatalog.map((name) => ({
          name,
          displayName: formatProjectName(name),
          })),
          [initialPipelineData.project || PIPELINE_PROJECT]
        )
      : [];
  const [contacts, setContacts] = useState<ContactRow[]>(initialContacts);
  const [pipelineGroups, setPipelineGroups] = useState<Record<string, ContactRow[]>>(initialGrouped);
  const [pipelineColumns, setPipelineColumns] = useState<string[]>(initialBoardStatuses);
  const [statusOptions, setStatusOptions] = useState<string[]>(initialAllStatuses);
  const [projectCatalog, setProjectCatalog] = useState<ProjectCatalogEntry[]>(initialProjectCatalog);
  const [affiliates, setAffiliates] = useState<AffiliateRecord[]>(
    mode === "pipeline" && Array.isArray(initialPipelineData?.affiliates) ? initialPipelineData.affiliates : []
  );
  const [columnAutomationMap, setColumnAutomationMap] = useState<Record<string, ColumnAutomationInfo[]>>(
    mode === "pipeline" ? extractColumnAutomationMap(initialPipelineData) : {}
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(mode === "pipeline" ? initialContacts.length === 0 : true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionState, setActionState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState("updated_desc");
  const [tableSort, setTableSort] = useState<{ key: TableSortKey | null; direction: "asc" | "desc" }>({
    key: null,
    direction: "desc",
  });
  const [selectedProject, setSelectedProject] = useState(initialPipelineData?.project || PIPELINE_PROJECT);
  const [draggedContactId, setDraggedContactId] = useState<string | null>(null);
  const [dropColumnId, setDropColumnId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ contactId: string; position: "above" | "below" } | null>(null);
  const [showCreateStatus, setShowCreateStatus] = useState<string | null>(null);
  const [showAddColumnCard, setShowAddColumnCard] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [columnSettingsOpen, setColumnSettingsOpen] = useState<string | null>(null);
  const [deleteConfirmColumn, setDeleteConfirmColumn] = useState<string | null>(null);
  const [renamingColumn, setRenamingColumn] = useState<string | null>(null);
  const [renameColumnValue, setRenameColumnValue] = useState("");
  const suppressSelectionAfterDragRef = useRef(false);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const view = mode === "pipeline" ? "pipeline" : "contacts";
      const params = new URLSearchParams({
        view,
        search,
        status: statusFilter,
        sort,
      });
      if (selectedProject) {
        params.set("project", selectedProject);
      }
      const res = await fetch(`/api/crm?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load CRM");
      if (Array.isArray(data.allStatuses) && data.allStatuses.length) {
        setStatusOptions(data.allStatuses);
      }
      let loadedContacts: ContactRow[] = [];
      if (mode === "pipeline") {
        const grouped = data.grouped || {};
        if (Array.isArray(data.statuses) && data.statuses.length) {
          setPipelineColumns(data.statuses);
        }
        setColumnAutomationMap(extractColumnAutomationMap(data));
        if (grouped.contacted) {
          grouped.contacted = [...grouped.contacted].sort((a: ContactRow, b: ContactRow) => {
            const nameA = getDisplayName(a);
            const nameB = getDisplayName(b);
            const aUnnamed = nameA === "Unnamed lead";
            const bUnnamed = nameB === "Unnamed lead";
            if (aUnnamed !== bUnnamed) return aUnnamed ? 1 : -1;
            return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
          });
        }
        setPipelineGroups(grouped);
        const flattened = Object.values(grouped).flat() as ContactRow[];
        loadedContacts = flattened;
        setContacts(flattened);
      } else {
        loadedContacts = data.contacts || [];
        setContacts(loadedContacts);
      }
      setAffiliates(data.affiliates || []);
      if (Array.isArray(data.projectCatalog)) {
        const nextCatalog = mergeProjectCatalog(
          data.projectCatalog.map((name: string) => ({
            name,
            displayName: formatProjectName(name),
          })),
          [selectedProject, ...loadedContacts.flatMap((contact) => getProjectNames(contact))]
        );
        setProjectCatalog(nextCatalog);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load CRM");
    } finally {
      setLoading(false);
    }
  }, [mode, search, selectedProject, statusFilter, sort]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/crm/settings");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load CRM settings");
      setSettings(data);
      if (Array.isArray(data.projectCatalog)) {
        setProjectCatalog(
          mergeProjectCatalog(
            data.projectCatalog.map((name: string) => ({
              name,
              displayName: formatProjectName(name),
            })),
            [selectedProject]
          )
        );
      }
      setAffiliates(data.affiliates || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load CRM settings");
    } finally {
      setLoading(false);
    }
  }, [selectedProject]);

  const loadDetail = useCallback(async (contactId: string) => {
    setSelectedId(contactId);
    setDetailLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ view: "detail", id: contactId });
      const res = await fetch(`/api/crm?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load lead detail");
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lead detail");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === "settings" || mode === "labels") {
      void loadSettings();
      return;
    }
    if (mode === "affiliates") return;
    void loadContacts();
  }, [loadContacts, loadSettings, mode]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (mode !== "settings" && mode !== "labels" && mode !== "affiliates") {
        void loadContacts();
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [loadContacts, mode, search]);

  const groupedContacts = useMemo(() => {
    const map = new Map<string, ContactRow[]>();
    for (const status of pipelineColumns) {
      map.set(status, []);
    }
    for (const contact of contacts) {
      const bucketStatus =
        mode === "pipeline"
          ? contact.project_state || contact.pipeline_status || contact.status
          : contact.pipeline_status || contact.status;
      const bucket = map.get(bucketStatus) || [];
      bucket.push(contact);
      map.set(bucketStatus, bucket);
    }
    const contacted = map.get("contacted");
    if (contacted) {
      map.set("contacted", [...contacted].sort((a, b) => {
        const nameA = getDisplayName(a);
        const nameB = getDisplayName(b);
        const aUnnamed = nameA === "Unnamed lead";
        const bUnnamed = nameB === "Unnamed lead";
        if (aUnnamed !== bUnnamed) return aUnnamed ? 1 : -1;
        return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
      }));
    }
    return map;
  }, [contacts, mode, pipelineColumns]);

  const sortedTableContacts = useMemo(() => {
    if (mode === "pipeline" || !tableSort.key) return contacts;
    const getSignalRank = (contact: ContactRow) => {
      const signal = getSignal(contact);
      if (signal.label === "Hot") return 5;
      if (signal.label === "Product-linked") return 4;
      if (signal.label === "Profile-rich") return 3;
      if (signal.label === "Needs review") return 2;
      if (signal.label === "No contact") return 1;
      return 0;
    };
    const getStageRank = (contact: ContactRow) => {
      const idx = statusOptions.indexOf(contact.pipeline_status || contact.project_state || contact.status);
      return idx === -1 ? statusOptions.length : idx;
    };
    const compareText = (left?: string | null, right?: string | null) =>
      String(left || "").localeCompare(String(right || ""), undefined, { sensitivity: "base" });
    const compareNumber = (left: number, right: number) => left - right;
    const compareDate = (left?: string | null, right?: string | null) =>
      new Date(left || 0).getTime() - new Date(right || 0).getTime();

    const sorted = [...contacts].sort((a, b) => {
      switch (tableSort.key) {
        case "name":
          return compareText(getDisplayName(a), getDisplayName(b));
        case "projects":
          return (
            compareNumber(getProjectNames(a).length, getProjectNames(b).length) ||
            compareText(getProjectNames(a).join(" "), getProjectNames(b).join(" "))
          );
        case "stage":
          return compareNumber(getStageRank(a), getStageRank(b));
        case "signal":
          return compareNumber(getSignalRank(a), getSignalRank(b));
        case "source":
          return compareText(a.source_latest, b.source_latest);
        case "last_activity":
          return compareDate(a.latest_captured_at || a.updated_at, b.latest_captured_at || b.updated_at);
        default:
          return 0;
      }
    });

    return tableSort.direction === "asc" ? sorted : sorted.reverse();
  }, [contacts, mode, statusOptions, tableSort]);

  function toggleTableSort(key: TableSortKey) {
    setTableSort((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: key === "name" || key === "source" ? "asc" : "desc" };
    });
  }

  async function createLeadFromModal(patch: Record<string, unknown>) {
    const payload = {
      first_name: typeof patch.first_name === "string" ? patch.first_name : "",
      last_name: typeof patch.last_name === "string" ? patch.last_name : "",
      primary_email:
        typeof patch.primary_email === "string" ? patch.primary_email : "",
      primary_phone:
        typeof patch.primary_phone === "string" ? patch.primary_phone : "",
      instagram_handle:
        typeof patch.instagram_handle === "string" ? patch.instagram_handle : "",
      instagram_profile_url:
        typeof patch.instagram_profile_url === "string" ? patch.instagram_profile_url : "",
      tiktok_url:
        typeof patch.tiktok_url === "string" ? patch.tiktok_url : "",
      primary_project:
        typeof patch.primary_project === "string" && patch.primary_project
          ? normalizeProjectName(patch.primary_project)
          : PIPELINE_PROJECT,
      projects: Array.isArray(patch.projects)
        ? [
            ...new Set(
              patch.projects
                .filter((project): project is string => typeof project === "string")
                .map(normalizeProjectName)
                .filter(Boolean)
            ),
          ]
        : [],
      next_step: typeof patch.next_step === "string" ? patch.next_step : "",
      communication_channel:
        typeof patch.communication_channel === "string" ? patch.communication_channel : "",
      willing_to_pay:
        typeof patch.willing_to_pay === "number"
          ? String(patch.willing_to_pay)
          : typeof patch.willing_to_pay === "string"
            ? patch.willing_to_pay
            : "",
      pipeline_affiliate_id:
        typeof patch.pipeline_affiliate_id === "string" ? patch.pipeline_affiliate_id : "",
      notes: typeof patch.notes === "string" ? patch.notes : "",
      owner: typeof patch.owner === "string" ? patch.owner : "",
      industry: typeof patch.industry === "string" ? patch.industry : "",
      location: typeof patch.location === "string" ? patch.location : "",
      business_description:
        typeof patch.business_description === "string" ? patch.business_description : "",
      biggest_needs: typeof patch.biggest_needs === "string" ? patch.biggest_needs : "",
      lost_reason:
        typeof patch.lost_reason === "string" ? patch.lost_reason : "",
      pipeline_status:
        patch.project_state &&
        typeof patch.project_state === "object" &&
        typeof (patch.project_state as { status?: unknown }).status === "string"
          ? String((patch.project_state as { status?: unknown }).status)
          : showCreateStatus || "new",
    };

    setActionState("create");
    setError(null);
    try {
      const res = await fetch("/api/crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ingest",
          first_name: payload.first_name,
          last_name: payload.last_name,
          email: payload.primary_email || null,
          phone: payload.primary_phone || null,
          instagram_handle: payload.instagram_handle || null,
          instagram_profile_url: payload.instagram_profile_url || null,
          tiktok_url: payload.tiktok_url || null,
          primary_project: payload.primary_project,
          project: payload.primary_project,
          next_step: payload.next_step,
          communication_channel: payload.communication_channel || null,
          willing_to_pay: payload.willing_to_pay || null,
          pipeline_affiliate_id: payload.pipeline_affiliate_id || null,
          notes: payload.notes,
          owner: payload.owner,
          industry: payload.industry,
          location: payload.location,
          business_description: payload.business_description,
          biggest_needs: payload.biggest_needs,
          lost_reason: payload.lost_reason || null,
          pipeline_status: payload.pipeline_status,
          source: "manual",
          project_state: {
            project: payload.primary_project,
            status: payload.pipeline_status,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create lead");
      if (data.contact_id && payload.pipeline_status) {
        await fetch("/api/crm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            id: data.contact_id,
            primary_project: payload.primary_project,
            project: payload.primary_project,
            projects: payload.projects.length ? payload.projects : [payload.primary_project],
            project_membership_status: "new",
            project_state: {
              project: payload.primary_project,
              status: payload.pipeline_status,
            },
          }),
        });
      }
      setShowCreateStatus(null);
      await loadContacts();
      return data as ContactDetail;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create lead");
      throw err;
    } finally {
      setActionState(null);
    }
  }

  async function saveDetail(patch: Record<string, unknown>) {
    if (!selectedId) return null;
    setActionState("save");
    setError(null);
    try {
      const res = await fetch("/api/crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: selectedId, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save lead");
      setDetail(data);
      await loadContacts();
      return data as ContactDetail;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save lead");
      throw err;
    } finally {
      setActionState(null);
    }
  }

  async function enrichSelectedLead() {
    if (!selectedId) return;
    setActionState("enrich-one");
    setError(null);
    try {
      const res = await fetch("/api/crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enrich-contact", id: selectedId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to enrich lead");
      if (data.detail) {
        setDetail(data.detail);
      }
      await loadContacts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enrich lead");
    } finally {
      setActionState(null);
    }
  }

  async function enrichAllLeads() {
    setActionState("enrich-all");
    setError(null);
    try {
      const res = await fetch("/api/crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enrich-all", project: selectedProject }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to enrich leads");
      await loadContacts();
      if (selectedId) {
        await loadDetail(selectedId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enrich leads");
    } finally {
      setActionState(null);
    }
  }

  async function logCommunication(payload: { channel: string; direction: string; note: string; contacted_at: string }) {
    if (!selectedId) return;
    const res = await fetch("/api/crm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "log-communication", id: selectedId, ...payload }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to log communication");
    setDetail(data);
    await loadContacts();
  }

  async function editCommunication(communicationId: number, payload: { channel: string; direction: string; note: string; contacted_at: string }) {
    if (!selectedId) return;
    const res = await fetch("/api/crm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update-communication", id: selectedId, communication_id: communicationId, ...payload }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update communication");
    setDetail(data);
    await loadContacts();
  }

  async function deleteCommunication(communicationId: number) {
    if (!selectedId) return;
    const res = await fetch("/api/crm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-communication", id: selectedId, communication_id: communicationId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to delete communication");
    setDetail(data);
    await loadContacts();
  }

  async function deleteSelectedContact(contactId: string) {
    const confirmed = window.confirm("Delete this lead? This cannot be undone.");
    if (!confirmed) return;
    setActionState("delete");
    setError(null);
    try {
      const res = await fetch("/api/crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: contactId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete lead");
      if (selectedId === contactId) {
        setSelectedId(null);
        setDetail(null);
      }
      await loadContacts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete lead");
    } finally {
      setActionState(null);
    }
  }

  async function saveProjectState(
    contactId: string,
    nextStatus: string,
    placement?: { beforeContactId?: string; afterContactId?: string }
  ) {
    setActionState(`pipeline-${contactId}`);
    setError(null);
    try {
      const projectName = selectedProject || PIPELINE_PROJECT;
      const res = await fetch("/api/crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: contactId,
          project: projectName,
          primary_project: projectName,
          project_state: projectName
            ? {
                project: projectName,
                status: nextStatus,
                before_contact_id: placement?.beforeContactId,
                after_contact_id: placement?.afterContactId,
              }
            : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update pipeline state");
      if (selectedId === contactId) {
        setDetail(data);
      }
      await loadContacts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update pipeline state");
    } finally {
      setActionState(null);
      setDraggedContactId(null);
      setDropTarget(null);
      setDropColumnId(null);
    }
  }

  async function addPipelineColumn() {
    const status = normalizePipelineStatusToken(newColumnName);
    if (!status) {
      setError("Column name required");
      return;
    }
    setActionState("add-column");
    setError(null);
    try {
      const res = await fetch("/api/crm/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add-column",
          project: selectedProject,
          status,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add column");
      setPipelineColumns(data.config?.board_statuses || []);
      setStatusOptions(data.config?.statuses || []);
      setNewColumnName("");
      setShowAddColumnCard(false);
      await loadContacts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add column");
    } finally {
      setActionState(null);
    }
  }

  async function removePipelineColumn(status: string) {
    setActionState(`delete-column-${status}`);
    setError(null);
    try {
      const res = await fetch("/api/crm/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete-column",
          project: selectedProject,
          status,
          replacement_status: "new",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete column");
      setPipelineColumns(data.config?.board_statuses || []);
      setStatusOptions(data.config?.statuses || []);
      setColumnSettingsOpen(null);
      setDeleteConfirmColumn(null);
      await loadContacts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete column");
    } finally {
      setActionState(null);
    }
  }

  async function renamePipelineColumn(status: string) {
    const nextStatus = normalizePipelineStatusToken(renameColumnValue);
    if (!nextStatus) {
      setError("Column name required");
      return;
    }
    setActionState(`rename-column-${status}`);
    setError(null);
    try {
      const res = await fetch("/api/crm/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rename-column",
          project: selectedProject,
          status,
          next_status: nextStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to rename column");
      setPipelineColumns(data.config?.board_statuses || []);
      setStatusOptions(data.config?.statuses || []);
      setRenamingColumn(null);
      setRenameColumnValue("");
      setColumnSettingsOpen(null);
      await loadContacts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename column");
    } finally {
      setActionState(null);
    }
  }

  function handleDragStart(event: React.DragEvent, contactId: string) {
    setDraggedContactId(contactId);
    suppressSelectionAfterDragRef.current = true;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", contactId);
  }

  function handleDragEnd() {
    setDraggedContactId(null);
    setDropTarget(null);
    setDropColumnId(null);
    window.setTimeout(() => {
      suppressSelectionAfterDragRef.current = false;
    }, 0);
  }

  function handleLeadCardClick(contactId: string) {
    if (suppressSelectionAfterDragRef.current) return;
    void loadDetail(contactId);
  }

  function handleColumnDragOver(event: React.DragEvent, columnId: string) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropColumnId(columnId);
  }

  function getDropPlacement(
    columnId: string,
    target: { contactId: string; position: "above" | "below" } | null,
    contactId: string
  ) {
    if (!target) return undefined;
    const columnItems = (pipelineGroups[columnId] || groupedContacts.get(columnId) || []) as ContactRow[];
    const orderedIds = columnItems.map((item) => item.id).filter((id) => id !== contactId);
    const targetIndex = orderedIds.indexOf(target.contactId);
    if (targetIndex === -1) return undefined;

    if (target.position === "above") {
      return {
        beforeContactId: targetIndex > 0 ? orderedIds[targetIndex - 1] : undefined,
        afterContactId: orderedIds[targetIndex],
      };
    }

    return {
      beforeContactId: orderedIds[targetIndex],
      afterContactId:
        targetIndex < orderedIds.length - 1 ? orderedIds[targetIndex + 1] : undefined,
    };
  }

  async function handleColumnDrop(event: React.DragEvent, columnId: string) {
    event.preventDefault();
    const contactId = event.dataTransfer.getData("text/plain") || draggedContactId;
    if (!contactId) return;
    if (dropTarget) {
      await saveProjectState(contactId, columnId, getDropPlacement(columnId, dropTarget, contactId));
      return;
    }
    await saveProjectState(contactId, columnId);
  }

  function handleColumnDragLeave(event: React.DragEvent, columnId: string) {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      if (dropColumnId === columnId) {
        setDropColumnId(null);
        setDropTarget(null);
      }
    }
  }

  function handleCardDragOver(event: React.DragEvent, contactId: string) {
    event.preventDefault();
    event.stopPropagation();
    if (!draggedContactId || draggedContactId === contactId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const y = event.clientY - rect.top;
    const position: "above" | "below" = y < rect.height / 2 ? "above" : "below";
    setDropTarget((current) =>
      current?.contactId === contactId && current.position === position
        ? current
        : { contactId, position }
    );
  }

  function handleCardDragLeave(event: React.DragEvent) {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setDropTarget(null);
    }
  }

  async function runSettingsAction(action: "cleanup-legacy") {
    setActionState(action);
    setError(null);
    try {
      const res = await fetch("/api/crm/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Settings action failed");
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Settings action failed");
    } finally {
      setActionState(null);
    }
  }

  async function saveApprovedLabels(nextKeys: string[]) {
    setActionState("set-approved-labels");
    setError(null);
    try {
      const res = await fetch("/api/crm/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-approved-labels", keys: nextKeys }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update label approvals");
      setSettings(data.snapshot || data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update label approvals");
    } finally {
      setActionState(null);
    }
  }

  async function createAffiliateFromModal(name: string) {
    const parts = splitAffiliateName(name);
    setActionState("create-affiliate");
    setError(null);
    try {
      const res = await fetch("/api/crm/affiliates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: parts.first_name,
          last_name: parts.last_name || null,
          commission_percentage: 10,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create affiliate");
      const nextAffiliates = [...affiliates, data.affiliate].sort((a, b) =>
        a.display_name.localeCompare(b.display_name, undefined, { sensitivity: "base" })
      );
      setAffiliates(nextAffiliates);
      return data.affiliate as AffiliateRecord;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create affiliate");
      throw err;
    } finally {
      setActionState(null);
    }
  }

  async function uploadContactPhoto(contactId: string, file: File) {
    setActionState("upload-photo");
    setError(null);
    try {
      const formData = new FormData();
      formData.append("contactId", contactId);
      formData.append("file", file);
      const res = await fetch("/api/crm/photo", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to upload photo");
      if (selectedId === contactId && data.detail) {
        setDetail(data.detail);
      }
      await loadContacts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload photo");
      throw err;
    } finally {
      setActionState(null);
    }
  }

  const isPipelineMode = mode === "pipeline";

  return (
    <div className={isPipelineMode ? "flex min-h-0 flex-col gap-6" : "space-y-6"}>
      <div className={isPipelineMode ? "flex min-h-0 flex-col gap-6" : "space-y-6"}>
        {mode !== "settings" && mode !== "labels" && mode !== "affiliates" && (
          <section className="shrink-0 rounded-2xl border border-dark-border bg-dark-panel p-5 shadow-md shadow-black/20">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-1 flex-col gap-3 md:flex-row">
                <div className="relative w-full">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dark-muted"
                  />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search by name, next step, or notes..."
                    className="h-11 w-full rounded-xl border border-dark-border bg-dark-panel2 py-2 pl-9 pr-4 text-sm text-dark-text outline-none placeholder:text-dark-muted"
                  />
                </div>
                {mode !== "pipeline" && (
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    className="h-11 rounded-xl border border-dark-border bg-dark-panel2 px-4 py-2 text-sm text-dark-text outline-none"
                  >
                    <option value="">All statuses</option>
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {formatStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                )}
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                  className="h-11 rounded-xl border border-dark-border bg-dark-panel2 px-4 py-2 text-sm text-dark-text outline-none"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {mode === "pipeline" && (
                  <select
                    value={selectedProject}
                    onChange={(event) => {
                      setSelectedProject(event.target.value);
                      setSelectedId(null);
                      setDetail(null);
                    }}
                    className="h-11 rounded-xl border border-dark-border bg-dark-panel2 px-4 py-2 text-sm text-dark-text outline-none"
                  >
                    {projectCatalog.map((project) => (
                      <option key={project.name} value={project.name}>
                        {project.displayName}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowCreateStatus("new")}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-cm-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-cm-purple/80"
              >
                <UserPlus size={16} />
                Manual Lead
              </button>
              {(mode === "pipeline" || mode === "contacts") && (
                <button
                  type="button"
                  onClick={() => void enrichAllLeads()}
                  disabled={actionState === "enrich-all"}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-dark-border bg-dark-panel2 px-4 py-2 text-sm text-dark-text transition hover:border-cm-purple/30 disabled:opacity-60"
                >
                  {actionState === "enrich-all" ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  Enrich All
                </button>
              )}
            </div>
          </section>
        )}

        {error && (
          <div className="shrink-0 rounded-xl border border-dark-danger/30 bg-dark-danger/10 px-4 py-3 text-sm text-dark-danger">
            {error}
          </div>
        )}

        {mode === "pipeline" ? (
          <section
            className="overflow-x-auto overflow-y-visible pb-3"
          >
            <div className="flex min-w-max items-start gap-4">
            {pipelineColumns.map((status) => {
              const items = (pipelineGroups[status] || groupedContacts.get(status) || []) as ContactRow[];
              const columnAutomations = columnAutomationMap[status] || [];
              return (
                <div
                  key={status}
                  className="flex w-[248px] shrink-0 flex-col rounded-2xl border border-dark-border bg-dark-panel p-3 shadow-md shadow-black/20"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      {renamingColumn === status ? (
                        <input
                          autoFocus
                          value={renameColumnValue}
                          onChange={(event) => setRenameColumnValue(event.target.value)}
                          onBlur={() => void renamePipelineColumn(status)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void renamePipelineColumn(status);
                            }
                            if (event.key === "Escape") {
                              setRenamingColumn(null);
                              setRenameColumnValue("");
                            }
                          }}
                          className="w-full rounded-lg border border-dark-border bg-dark-panel2 px-2 py-1 text-sm font-semibold text-dark-text outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          onDoubleClick={() => {
                            setRenamingColumn(status);
                            setRenameColumnValue(formatStatusLabel(status));
                          }}
                          className="max-w-full truncate text-left text-sm font-semibold text-dark-text"
                          title="Double click to rename column"
                        >
                          {formatStatusLabel(status)}: <span className="text-dark-muted">{items.length}</span>
                        </button>
                      )}
                    </div>
                    <div className="relative ml-2 flex items-center gap-1">
                      {columnAutomations.length ? (
                        <div className="group relative">
                          <div
                            className="inline-flex h-6 items-center gap-1 rounded-full border border-cm-purple/40 bg-cm-purple/15 px-2 text-[11px] font-semibold text-cm-purple shadow-sm shadow-cm-purple/10"
                            aria-label={`${columnAutomations.length} automation${columnAutomations.length === 1 ? "" : "s"} linked to ${formatStatusLabel(status)}`}
                            title={`${columnAutomations.length} automation${columnAutomations.length === 1 ? "" : "s"} linked`}
                          >
                            <Zap size={12} />
                            <span>Auto {columnAutomations.length}</span>
                          </div>
                          <div className="pointer-events-none invisible absolute right-0 top-9 z-40 w-72 rounded-xl border border-dark-border bg-dark-panel2 p-3 opacity-0 shadow-xl shadow-black/30 transition group-hover:visible group-hover:opacity-100">
                            <p className="text-xs font-semibold uppercase tracking-wide text-dark-muted">
                              linked Automations
                            </p>
                            <div className="mt-2 space-y-2">
                              {columnAutomations.map((automation, index) => (
                                <div
                                  key={automation.id || `${status}-automation-${index}`}
                                  className="rounded-lg border border-dark-border bg-dark-panel px-3 py-2"
                                >
                                  <p className="text-xs font-medium text-dark-text">{automation.name}</p>
                                  <p className="mt-1 text-xs leading-5 text-dark-muted">{automation.description}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setColumnSettingsOpen((current) => (current === status ? null : status))}
                        className="inline-flex items-center justify-center rounded-lg p-1 text-dark-muted transition hover:bg-dark-panel2 hover:text-dark-text"
                        aria-label={`Column settings for ${formatStatusLabel(status)}`}
                      >
                        <SlidersHorizontal size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCreateStatus(status)}
                        className="inline-flex items-center justify-center rounded-lg p-1 text-cm-purple transition hover:bg-cm-purple/10"
                        aria-label={`Add lead to ${formatStatusLabel(status)}`}
                      >
                        <Plus size={16} />
                      </button>
                      {columnSettingsOpen === status && (
                        <div className="absolute right-0 top-9 z-40 w-56 rounded-xl border border-dark-border bg-dark-panel2 p-3 shadow-xl shadow-black/30">
                          <p className="text-xs font-semibold uppercase tracking-wide text-dark-muted">
                            Column Settings
                          </p>
                          <p className="mt-2 text-xs text-dark-muted">
                            Double click the column name to rename it.
                          </p>
                          {deleteConfirmColumn === status ? (
                            <div className="mt-3 space-y-3">
                              <div className="rounded-lg border border-dark-warn/30 bg-dark-warn/10 p-3 text-xs text-dark-text">
                                <p className="font-medium text-dark-warn">Delete this column?</p>
                                <p className="mt-1 text-dark-muted">
                                  Cards won&apos;t be deleted. They will all revert back to Possible Candidate.
                                </p>
                              </div>
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirmColumn(null)}
                                  className="inline-flex items-center rounded-lg border border-dark-border px-3 py-1.5 text-xs text-dark-text transition hover:bg-dark-panel"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void removePipelineColumn(status)}
                                  disabled={actionState === `delete-column-${status}`}
                                  className="inline-flex items-center rounded-lg bg-dark-danger px-3 py-1.5 text-xs font-medium text-white transition hover:bg-dark-danger/80 disabled:opacity-60"
                                >
                                  Confirm Delete
                                </button>
                              </div>
                            </div>
                          ) : status === "new" ? (
                            <div className="mt-3 rounded-lg border border-dark-border bg-dark-panel px-3 py-2 text-xs text-dark-muted">
                              Possible Candidate is the fallback column and cannot be deleted.
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmColumn(status)}
                              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-dark-danger/30 bg-dark-danger/10 px-3 py-2 text-xs font-medium text-dark-danger transition hover:bg-dark-danger/20"
                            >
                              <Trash2 size={12} />
                              Delete Column
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div
                    onDragOver={(event) => handleColumnDragOver(event, status)}
                    onDragLeave={(event) => handleColumnDragLeave(event, status)}
                    onDrop={(event) => {
                      void handleColumnDrop(event, status);
                    }}
                    className={`h-[calc(100dvh-24rem)] max-h-[540px] min-h-[320px] overflow-y-auto space-y-3 rounded-xl border-2 p-2 transition-colors ${
                      dropColumnId === status && draggedContactId
                        ? "border-cm-purple border-dashed bg-cm-purple/10"
                        : "border-transparent"
                    }`}
                  >
                    {items.map((contact) => (
                      <div
                        key={contact.id}
                        className="relative"
                        onDragOver={(event) => handleCardDragOver(event, contact.id)}
                        onDragLeave={handleCardDragLeave}
                      >
                        {dropTarget?.contactId === contact.id && dropTarget.position === "above" && (
                          <div className="absolute -top-[7px] left-0 right-0 z-30 pointer-events-none flex items-center">
                            <div className="w-3 h-3 rounded-full bg-cm-purple -ml-1.5 shrink-0" />
                            <div className="flex-1 h-[3px] bg-cm-purple rounded-full" />
                            <div className="w-3 h-3 rounded-full bg-cm-purple -mr-1.5 shrink-0" />
                          </div>
                        )}
                        <div className={`transition-opacity duration-150 ${contact.id === draggedContactId ? "opacity-20" : ""}`}>
                          <LeadCard
                            contact={contact}
                            active={selectedId === contact.id}
                            onClick={() => handleLeadCardClick(contact.id)}
                            draggable
                            onDragStart={(event) => handleDragStart(event, contact.id)}
                            onDragEnd={handleDragEnd}
                          />
                        </div>
                        {dropTarget?.contactId === contact.id && dropTarget.position === "below" && (
                          <div className="absolute -bottom-[7px] left-0 right-0 z-30 pointer-events-none flex items-center">
                            <div className="w-3 h-3 rounded-full bg-cm-purple -ml-1.5 shrink-0" />
                            <div className="flex-1 h-[3px] bg-cm-purple rounded-full" />
                            <div className="w-3 h-3 rounded-full bg-cm-purple -mr-1.5 shrink-0" />
                          </div>
                        )}
                      </div>
                    ))}
                    {items.length === 0 && (
                      <div className="rounded-xl border border-dashed border-dark-border px-3 py-5 text-center text-xs text-dark-muted">
                        No leads in this stage
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowCreateStatus(status)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-dark-border px-4 py-3 text-dark-muted transition-all hover:border-cm-purple hover:bg-dark-panel2 hover:text-dark-text"
                    >
                      <Plus size={18} />
                      <span className="text-sm font-medium">Add Card</span>
                    </button>
                  </div>
                </div>
              );
            })}
            <div className="flex w-[132px] shrink-0 flex-col self-start rounded-2xl border border-dashed border-dark-border bg-dark-panel/70 p-2 shadow-md shadow-black/10">
              {showAddColumnCard ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-dark-muted">New</p>
                  <input
                    autoFocus
                    value={newColumnName}
                    onChange={(event) => setNewColumnName(event.target.value)}
                    placeholder="Column"
                    className="w-full rounded-lg border border-dark-border bg-dark-panel2 px-2.5 py-2 text-xs text-dark-text outline-none placeholder:text-dark-muted"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void addPipelineColumn();
                      }
                      if (event.key === "Escape") {
                        setShowAddColumnCard(false);
                        setNewColumnName("");
                      }
                    }}
                  />
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddColumnCard(false);
                        setNewColumnName("");
                      }}
                      className="inline-flex items-center rounded-lg border border-dark-border px-2 py-1 text-[11px] text-dark-text transition hover:bg-dark-panel"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void addPipelineColumn()}
                      disabled={actionState === "add-column"}
                      className="inline-flex items-center gap-1 rounded-lg bg-cm-purple px-2 py-1 text-[11px] font-medium text-white transition hover:bg-cm-purple/80 disabled:opacity-60"
                    >
                      <Plus size={12} />
                      Create
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAddColumnCard(true)}
                  className="flex min-h-[56px] items-center justify-center gap-1.5 rounded-xl text-dark-muted transition hover:bg-dark-panel2 hover:text-dark-text"
                >
                  <Plus size={14} />
                  <span className="text-xs font-medium">Column</span>
                </button>
              )}
            </div>
            </div>
          </section>
        ) : mode === "affiliates" ? (
          <AffiliatesPanel />
        ) : mode === "labels" ? (
          <section className="space-y-4 rounded-2xl border border-dark-border bg-dark-panel p-5 shadow-md shadow-black/20">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-dark-text">Approved Label Rules</p>
              <p className="text-sm text-dark-muted">
                Checked labels stay eligible for auto-application. Unchecked labels are never auto-applied.
              </p>
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              {(settings?.approvedLabels || []).map((label) => (
                <label
                  key={label.key}
                  className="flex items-center justify-between gap-3 rounded-xl border border-dark-border bg-dark-panel2 px-4 py-3 text-sm text-dark-text"
                >
                  <div>
                    <p className="font-medium text-dark-text">{label.displayName}</p>
                    <p className="text-xs text-dark-muted">{label.key}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={label.enabled !== false}
                    onChange={(event) => {
                      const currentKeys = (settings?.approvedLabels || [])
                        .filter((item) => item.enabled !== false)
                        .map((item) => item.key);
                      const nextKeys = event.target.checked
                        ? [...new Set([...currentKeys, label.key])]
                        : currentKeys.filter((item) => item !== label.key);
                      if (settings) {
                        setSettings({
                          ...settings,
                          approvedLabels: settings.approvedLabels.map((item) =>
                            item.key === label.key ? { ...item, enabled: event.target.checked } : item
                          ),
                        });
                      }
                      void saveApprovedLabels(nextKeys);
                    }}
                  />
                </label>
              ))}
            </div>
          </section>
        ) : mode === "settings" ? (
          <section className="space-y-4 rounded-2xl border border-dark-border bg-dark-panel p-5 shadow-md shadow-black/20">
            <div className="flex flex-wrap gap-3">
              <SettingsActionButton
                busy={actionState === "cleanup-legacy"}
                label="Cleanup Empty Legacy CRM"
                onClick={() => void runSettingsAction("cleanup-legacy")}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <SettingsPanel title="Legacy Stores">
                <InfoRow
                  label="Legacy crm.json"
                  value={`${settings?.legacy.crmJson.exists ? "present" : "missing"} / ${settings?.legacy.crmJson.count ?? 0} rows`}
                />
                <InfoRow
                  label="Legacy chat widget leads"
                  value={`${settings?.legacy.chatWidgetLeads.exists ? "present" : "missing"} / ${settings?.legacy.chatWidgetLeads.count ?? 0} rows`}
                />
              </SettingsPanel>
              <SettingsPanel title="Product Lead Source">
                <div className="space-y-2">
                  <InfoRow label="Source of truth" value="CRM products table" />
                  {projectCatalog.length === 0 ? (
                    <p className="text-sm text-dark-muted">No product leads resolved yet.</p>
                  ) : (
                    projectCatalog.map((project) => (
                      <InfoRow
                        key={project.name}
                        label={project.displayName}
                        value={project.name}
                      />
                    ))
                  )}
                </div>
              </SettingsPanel>
            </div>
          </section>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-dark-border bg-dark-panel shadow-md shadow-black/20">
            {loading ? (
              <div className="flex items-center gap-2 px-5 py-6 text-sm text-dark-muted">
                <Loader2 size={16} className="animate-spin" />
                Loading leads…
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-sm">
                    <thead>
                      <tr className="border-b border-dark-border bg-dark-bg">
                        <SortableHeader label="Name" sortKey="name" activeSort={tableSort} onSort={toggleTableSort} />
                        <SortableHeader label="Product Lead" sortKey="projects" activeSort={tableSort} onSort={toggleTableSort} />
                        <SortableHeader label="Pipeline Status" sortKey="stage" activeSort={tableSort} onSort={toggleTableSort} />
                        <SortableHeader label="Fit / Signal" sortKey="signal" activeSort={tableSort} onSort={toggleTableSort} />
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-dark-muted">Next Step</th>
                        <SortableHeader label="Source" sortKey="source" activeSort={tableSort} onSort={toggleTableSort} />
                        <SortableHeader label="Last Activity" sortKey="last_activity" activeSort={tableSort} onSort={toggleTableSort} />
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-dark-muted">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-border">
                      {sortedTableContacts.map((contact) => {
                        const projects = getProjectNames(contact);
                        const signal = getSignal(contact);
                        return (
                          <tr
                            key={contact.id}
                            onClick={() => void loadDetail(contact.id)}
                            className="cursor-pointer transition-colors hover:bg-cm-purple/10"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <Avatar
                                  name={getDisplayName(contact)}
                                  photoUrl={getResolvedPhotoUrl(contact.photo_local_path, contact.photo_url)}
                                  size={38}
                                />
                                <div className="min-w-0">
                                  <p className="truncate font-semibold text-dark-text">
                                    {getDisplayName(contact)}
                                  </p>
                                  <p className="truncate text-xs text-dark-muted">
                                    {contact.primary_email || contact.email || "No email"}
                                  </p>
                                  {(contact.location || contact.industry) && (
                                    <p className="truncate text-xs text-dark-muted">
                                      {[contact.location, contact.industry].filter(Boolean).join(" · ")}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="rounded-full border border-dark-border bg-dark-panel2 px-2.5 py-1 text-[11px] text-dark-muted">
                                {contact.primary_project_display_name || (projects[0] ? formatProjectName(projects[0]) : "Pipelines")}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-2">
                                <Badge label={getSaleStageLabel(contact)} />
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Badge label={signal.label} tone={signal.tone} />
                            </td>
                            <td className="px-4 py-3 text-sm text-dark-muted">
                              {contact.next_step || "—"}
                            </td>
                            <td className="px-4 py-3 text-sm text-dark-muted">
                              {contact.source_latest || "manual"}
                            </td>
                            <td className="px-4 py-3 text-sm text-dark-muted">
                              {formatDate(contact.latest_captured_at || contact.updated_at)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void loadDetail(contact.id);
                                  }}
                                  className="inline-flex items-center gap-1 rounded-lg border border-dark-border bg-dark-panel2 px-2.5 py-1.5 text-xs font-medium text-dark-text transition hover:border-cm-purple/30"
                                >
                                  <ChevronRight size={14} />
                                  View
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {contacts.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-4 py-12 text-center text-dark-muted">
                            No leads match the current filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-dark-border px-4 py-2 text-xs text-dark-muted">
                  {sortedTableContacts.length} lead{sortedTableContacts.length === 1 ? "" : "s"}
                </div>
              </>
            )}
          </section>
        )}
      </div>

      {mode !== "settings" && mode !== "labels" && selectedId && (
        detailLoading || !detail ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 rounded-2xl border border-dark-border bg-dark-panel px-5 py-4 text-sm text-dark-muted shadow-2xl shadow-black/40">
              <Loader2 size={16} className="animate-spin" />
              Loading lead details…
            </div>
          </div>
        ) : (
          <ContactModal
            detail={detail}
            statusOptions={statusOptions}
            projectCatalog={projectCatalog}
            selectedProject={selectedProject}
            actionState={actionState}
            onClose={() => {
              setSelectedId(null);
              setDetail(null);
            }}
            onSaveDetail={saveDetail}
            onDelete={() => void deleteSelectedContact(selectedId)}
            affiliates={affiliates}
            onCreateAffiliate={createAffiliateFromModal}
            onUploadPhoto={uploadContactPhoto}
            onEnrichLead={enrichSelectedLead}
            onLogCommunication={logCommunication}
            onDeleteCommunication={deleteCommunication}
            onEditCommunication={editCommunication}
          />
        )
      )}

      {showCreateStatus && (
        <ContactModal
          detail={createEmptyContactDetail(showCreateStatus, selectedProject)}
          statusOptions={statusOptions}
          projectCatalog={
            projectCatalog.length > 0
              ? projectCatalog
              : [{ name: PIPELINE_PROJECT, displayName: PIPELINE_PROJECT_DISPLAY_NAME }]
          }
          selectedProject={selectedProject}
          actionState={actionState}
          onClose={() => setShowCreateStatus(null)}
          onSaveDetail={createLeadFromModal}
          onDelete={() => {}}
          affiliates={affiliates}
          onCreateAffiliate={createAffiliateFromModal}
          onUploadPhoto={uploadContactPhoto}
        />
      )}
    </div>
  );
}

const RECENCY_DOT_STATUSES = new Set([
  "contacted",
  "qualified",
  "qualified",
]);

function getContactRecencyDot(contact: ContactRow): { days: number | null; color: "red" | "yellow" | "green"; title: string } | null {
  const status = contact.project_state;
  if (!status || !RECENCY_DOT_STATUSES.has(status)) return null;
  if (!contact.last_contacted_at) {
    return { days: null, color: "green", title: "Never contacted — reach out" };
  }
  const daysAgo = Math.floor((Date.now() - new Date(contact.last_contacted_at).getTime()) / (1000 * 60 * 60 * 24));
  if (daysAgo <= 2) {
    return { days: daysAgo, color: "red", title: `Contacted ${daysAgo}d ago — don't touch yet` };
  }
  if (daysAgo <= 7) {
    return { days: daysAgo, color: "yellow", title: `Contacted ${daysAgo}d ago — warming off` };
  }
  return { days: daysAgo, color: "green", title: `Not contacted in ${daysAgo} days — reach out` };
}

function LeadCard({
  contact,
  active,
  onClick,
  draggable = false,
  onDragStart,
  onDragEnd,
}: {
  contact: ContactRow;
  active: boolean;
  onClick: () => void;
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent) => void;
  onDragEnd?: () => void;
}) {
  const thumbnailUrl = getResolvedPhotoUrl(contact.photo_local_path, contact.photo_url);
  const recencyDot = getContactRecencyDot(contact);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      draggable={draggable}
      onDragStart={(event) => {
        if (!draggable) return;
        onDragStart?.(event);
      }}
      onDragEnd={() => onDragEnd?.()}
      className={`w-full rounded-xl border px-1.5 pb-1.5 pt-1 text-left transition ${
        active
          ? "border-cm-purple/40 bg-cm-purple/10"
          : "border-dark-border bg-dark-panel2 hover:border-cm-purple/20"
      } ${draggable ? "cursor-grab select-none active:cursor-grabbing" : "cursor-pointer"} ${
        draggable ? "touch-none" : ""
      } ${
        (contact.project_state === "qualified" || contact.project_state === "qualified") &&
        contact.last_contacted_at &&
        Math.floor((Date.now() - new Date(contact.last_contacted_at).getTime()) / (1000 * 60 * 60 * 24)) === 0
          ? "opacity-35"
          : ""
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-5 text-dark-text">
            {getDisplayName(contact)}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {recencyDot && (
              <span
                title={recencyDot.title}
                className={`inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded px-1 text-[11px] font-bold leading-none ${
                  recencyDot.color === "red"
                    ? "bg-dark-danger/20 text-dark-danger"
                    : recencyDot.color === "yellow"
                      ? "bg-dark-warn/20 text-dark-warn"
                      : "bg-dark-success/20 text-dark-success"
                }`}
              >
                {recencyDot.days ?? "—"}
              </span>
            )}
            {thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbnailUrl}
                alt={getDisplayName(contact)}
                width={24}
                height={24}
                className="h-6 w-6 shrink-0 rounded-md object-cover"
                loading="lazy"
                decoding="async"
              />
            ) : null}
          </div>
        </div>
        <LeadCardActionIcons contact={contact} />
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  activeSort,
  onSort,
}: {
  label: string;
  sortKey: TableSortKey;
  activeSort: { key: TableSortKey | null; direction: "asc" | "desc" };
  onSort: (key: TableSortKey) => void;
}) {
  const active = activeSort.key === sortKey;
  return (
    <th className="px-4 py-3 text-left">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-dark-muted transition hover:text-dark-text"
      >
        <span>{label}</span>
        {active ? (
          activeSort.direction === "asc" ? (
            <ArrowUp size={12} />
          ) : (
            <ArrowDown size={12} />
          )
        ) : (
          <ArrowUpDown size={12} />
        )}
      </button>
    </th>
  );
}

function Badge({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "success" | "warning" | "danger" | "muted";
}) {
  const classes =
    tone === "success"
      ? "border-dark-success/30 bg-dark-success/10 text-dark-success"
      : tone === "warning"
        ? "border-dark-warn/30 bg-dark-warn/10 text-dark-warn"
        : tone === "danger"
          ? "border-dark-danger/30 bg-dark-danger/10 text-dark-danger"
          : tone === "muted"
            ? "border-dark-border bg-dark-panel text-dark-muted"
            : "border-cm-purple/30 bg-cm-purple/10 text-cm-purple";
  return <span className={`rounded-full border px-2 py-1 text-[11px] font-medium ${classes}`}>{label}</span>;
}

function SettingsActionButton({
  label,
  busy,
  onClick,
}: {
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-xl border border-dark-border bg-dark-panel2 px-4 py-2 text-sm font-medium text-dark-text transition hover:border-cm-purple/30 disabled:opacity-60"
    >
      {busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
      {label}
    </button>
  );
}

function SettingsPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dark-border bg-dark-panel2 p-4">
      <p className="mb-3 text-sm font-semibold text-dark-text">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoTile({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dark-border bg-dark-panel2 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-dark-muted">
        <span className="text-cm-purple">{icon}</span>
        <span>{label}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-dark-border bg-dark-panel px-3 py-2 text-sm">
      <span className="text-dark-muted">{label}</span>
      <span className="text-right text-dark-text">{value}</span>
    </div>
  );
}

function EditableField({
  label,
  control,
}: {
  label: string;
  control: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-dark-muted">{label}</p>
      {control}
    </div>
  );
}
