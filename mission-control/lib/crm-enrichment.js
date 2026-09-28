"use strict";

const fs = require("node:fs");
const path = require("node:path");

function getCrm() {
  return require("./crm");
}

function nowIso() {
  return new Date().toISOString();
}

function asText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeHandle(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9._]/g, "");
}

function normalizeWebsiteUrl(value) {
  const raw = asText(value);
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractTitle(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtml(match[1]).trim() || null : null;
}

function extractMetaContent(html, keys = []) {
  const patterns = Array.isArray(keys) ? keys : [keys];
  for (const key of patterns) {
    const propertyPattern = new RegExp(
      `<meta[^>]+(?:property|name)=["']${escapeRegExp(key)}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    );
    const propertyMatch = String(html || "").match(propertyPattern);
    if (propertyMatch?.[1]) return decodeHtml(propertyMatch[1]).trim();

    const contentFirstPattern = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escapeRegExp(key)}["'][^>]*>`,
      "i"
    );
    const contentFirstMatch = String(html || "").match(contentFirstPattern);
    if (contentFirstMatch?.[1]) return decodeHtml(contentFirstMatch[1]).trim();
  }
  return null;
}

function extractEmails(html) {
  const emails = String(html || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return Array.from(new Set(emails.map((email) => email.trim()))).sort();
}

function toAbsoluteUrl(baseUrl, maybeRelative) {
  const text = asText(maybeRelative);
  if (!text) return null;
  try {
    return new URL(text, baseUrl).toString();
  } catch {
    return null;
  }
}

function resolveWebfetchRecipePath() {
  const workspaceRoot = path.resolve(__dirname, "..");
  const candidates = [
    process.env.WEBFETCH_FETCH_PAGE_RECIPE,
    path.join(workspaceRoot, "webfetch", "recipes", "fetch-page.js"),
    path.join(process.cwd(), "webfetch", "recipes", "fetch-page.js"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function loadWebfetchRecipe() {
  const resolved = resolveWebfetchRecipePath();
  if (!resolved) return null;
  try {
    const recipe = require(resolved);
    return typeof recipe?.runRecipe === "function" ? recipe.runRecipe : null;
  } catch {
    return null;
  }
}

async function fetchHtml(url) {
  const runFetchPage = loadWebfetchRecipe();
  if (runFetchPage) {
    const result = await Promise.resolve(runFetchPage({
      url,
      format: "html",
      noCache: true,
      browser: "headless",
    }));
    if (result?.status === "ok" && typeof result.reply === "string" && result.reply.trim()) {
      return {
        html: result.reply,
        engine: "webfetch_recipe",
        tool: "fetch-page",
      };
    }
  }

  const response = await fetch(url, {
    headers: {
      "user-agent": "AllSorted CRM Enrichment/1.0",
      accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}: ${response.status} ${response.statusText}`);
  }
  return {
    html: await response.text(),
    engine: "bundled-fallback",
    tool: "fetch",
  };
}

async function fetchWebsiteProfile(url) {
  const normalizedUrl = normalizeWebsiteUrl(url);
  if (!normalizedUrl) return null;
  const { html, engine, tool } = await fetchHtml(normalizedUrl);
  const imageUrl = toAbsoluteUrl(
    normalizedUrl,
    extractMetaContent(html, ["og:image", "twitter:image"]) || null
  );

  return {
    url: normalizedUrl,
    title: extractTitle(html),
    description: extractMetaContent(html, ["description", "og:description", "twitter:description"]),
    image_url: imageUrl,
    emails: extractEmails(html),
    engine,
    tool,
  };
}

function parseInstagramDescription(description, fallbackHandle) {
  const text = asText(description);
  if (!text) {
    return {
      full_name: null,
      bio: null,
      followers: 0,
      following: 0,
      post_count: 0,
      handle: fallbackHandle,
    };
  }

  const bioMatch = text.match(/on Instagram:\s*["“]?([\s\S]*?)["”]?$/i);
  const titleMatch = text.match(/-\s*(.*?)\s*\(@([^)]+)\)\s*on Instagram/i);
  const numberParts = text.split("-")[0]?.split(",").map((part) => part.trim()) || [];

  return {
    full_name: titleMatch?.[1] || null,
    bio: bioMatch?.[1]?.trim() || null,
    followers: Number.parseInt(numberParts[0]?.replace(/[^\d]/g, "") || "0", 10) || 0,
    following: Number.parseInt(numberParts[1]?.replace(/[^\d]/g, "") || "0", 10) || 0,
    post_count: Number.parseInt(numberParts[2]?.replace(/[^\d]/g, "") || "0", 10) || 0,
    handle: titleMatch?.[2] || fallbackHandle,
  };
}

async function fetchInstagramProfile(handle) {
  const normalizedHandle = normalizeHandle(handle);
  if (!normalizedHandle) return null;
  const profileUrl = `https://www.instagram.com/${normalizedHandle}/`;
  const { html, engine, tool } = await fetchHtml(profileUrl);
  const ogTitle = extractMetaContent(html, ["og:title"]);
  const ogDescription = extractMetaContent(html, ["og:description", "description"]);
  const parsed = parseInstagramDescription(ogDescription, normalizedHandle);
  const imageUrl = extractMetaContent(html, ["og:image", "twitter:image"]);

  return {
    handle: normalizedHandle,
    full_name:
      parsed.full_name ||
      (ogTitle ? decodeHtml(ogTitle).replace(/\s*[•-]\s*Instagram.*$/i, "").trim() : null),
    bio: parsed.bio,
    external_url: null,
    profile_url: profileUrl,
    followers: parsed.followers,
    following: parsed.following,
    post_count: parsed.post_count,
    posts_fetched: 0,
    is_verified: false,
    picture: imageUrl
      ? {
          url: imageUrl,
          local_path: null,
          width: null,
          height: null,
          mime_type: null,
          source: "instagram_profile",
          raw: { imageUrl },
        }
      : null,
    engine,
    tool,
  };
}

function buildFieldPatch(contact, websiteProfile, instagramProfile) {
  return {
    business_description:
      contact.business_description ||
      websiteProfile?.description ||
      instagramProfile?.bio ||
      null,
    location: contact.location || null,
    industry: contact.industry || null,
    biggest_needs: contact.biggest_needs || null,
  };
}

async function enrichContact(contactId, options = {}) {
  const crm = getCrm();
  const detail = crm.getContactDetail(contactId);
  if (!detail?.contact) {
    throw new Error(`CRM contact not found: ${contactId}`);
  }

  const websiteUrl =
    detail.contact.website_url ||
    detail.enrichment?.find((entry) => entry.external_url)?.external_url ||
    websiteFromEmail(detail.contact.primary_email) ||
    normalizeWebsiteUrl(options.websiteUrl) ||
    null;
  const instagramHandle =
    detail.contact.instagram_handle ||
    normalizeHandle(detail.contact.instagram_profile_url?.split("/").filter(Boolean).pop()) ||
    null;

  if (!websiteUrl && !instagramHandle) {
    return {
      ok: false,
      skipped: true,
      reason: "No website or Instagram handle available to enrich",
      detail,
    };
  }

  const enrichedAt = nowIso();
  const sources = [];
  let websiteProfile = null;
  let instagramProfile = null;

  if (websiteUrl) {
    try {
      websiteProfile = await fetchWebsiteProfile(websiteUrl);
      if (websiteProfile) {
        sources.push({ type: "website", engine: websiteProfile.engine, tool: websiteProfile.tool, url: websiteProfile.url });
      }
    } catch (error) {
      sources.push({ type: "website", error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (instagramHandle) {
    try {
      instagramProfile = await fetchInstagramProfile(instagramHandle);
      if (instagramProfile) {
        sources.push({ type: "instagram_profile", engine: instagramProfile.engine, tool: instagramProfile.tool, url: instagramProfile.profile_url });
      }
    } catch (error) {
      sources.push({ type: "instagram_profile", error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (instagramProfile) {
    crm.applyInstagramEnrichment(contactId, instagramProfile, {
      reason: "crm_webfetch_enrichment",
      enrichedAt,
    });
  }

  const fieldPatch = buildFieldPatch(detail.contact, websiteProfile, instagramProfile);
  const hasFieldPatch = Object.values(fieldPatch).some(Boolean);
  if (hasFieldPatch) {
    const db = crm.getDb(false);
    crm.applyEnrichedContactFields(
      db,
      contactId,
      fieldPatch,
      "crm_webfetch_enrichment",
      {
        updatedAt: enrichedAt,
        reason: "crm_webfetch_enrichment",
      }
    );
  }

  const nextDetail = crm.getContactDetail(contactId);
  return {
    ok: true,
    contact_id: contactId,
    detail: nextDetail,
    sources,
    website_profile: websiteProfile,
    instagram_profile: instagramProfile,
  };
}

// Free and consumer mailbox domains: an address here says nothing about the
// person's business, so it is never turned into a website.
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "msn.com",
  "yahoo.com", "yahoo.co.uk", "ymail.com", "rocketmail.com", "icloud.com", "me.com", "mac.com",
  "aol.com", "proton.me", "protonmail.com", "pm.me", "gmx.com", "gmx.de", "gmx.net", "mail.com",
  "zoho.com", "yandex.com", "yandex.ru", "qq.com", "163.com", "126.com", "web.de", "hey.com",
  "fastmail.com", "tutanota.com", "comcast.net", "att.net", "verizon.net", "sbcglobal.net",
]);

function emailDomain(email) {
  const text = String(email || "").trim().toLowerCase();
  const at = text.lastIndexOf("@");
  if (at < 1) return null;
  const domain = text.slice(at + 1).replace(/\.+$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) ? domain : null;
}

function isFreeEmailDomain(domain) {
  if (!domain) return true;
  if (FREE_EMAIL_DOMAINS.has(domain)) return true;
  return /^(yahoo|hotmail|outlook|live|icloud)\./.test(domain);
}

function websiteFromEmail(email) {
  const domain = emailDomain(email);
  if (!domain || isFreeEmailDomain(domain)) return null;
  return `https://${domain}`;
}

// Decide who Enrich All should research and what it can research them from.
function selectEnrichmentCandidates(contacts = []) {
  const candidates = [];
  const skipped = [];
  for (const contact of contacts) {
    const needsEnrichment = !contact.business_description || !contact.photo_url;
    if (!needsEnrichment) {
      skipped.push({ contact_id: contact.id, reason: "already_enriched" });
      continue;
    }
    const website = normalizeWebsiteUrl(contact.website_url) || websiteFromEmail(contact.primary_email);
    const instagram = contact.instagram_handle || contact.instagram_profile_url || null;
    if (!website && !instagram) {
      skipped.push({
        contact_id: contact.id,
        reason: contact.primary_email ? "personal_email_only" : "no_website_instagram_or_business_email",
      });
      continue;
    }
    candidates.push({
      contact,
      website,
      website_source: contact.website_url ? "website" : website ? "email_domain" : null,
      instagram,
    });
  }
  return { candidates, skipped };
}

const SKIP_REASON_TEXT = {
  already_enriched: "already enriched",
  personal_email_only: "only a personal email (gmail, outlook and similar)",
  no_website_instagram_or_business_email: "no website, Instagram or business email",
  time_limit: "not reached before the time limit",
};

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label)), Math.max(1, ms)); }),
  ]).finally(() => clearTimeout(timer));
}

async function enrichAllContacts(options = {}) {
  const crm = getCrm();
  const project = String(options.project || "pipeline");
  const concurrency = Math.max(1, Math.min(3, Number(options.concurrency) || 3));
  const deadlineMs = Number(options.deadlineMs) || 90000;
  const perContactMs = Number(options.perContactMs) || 30000;
  const enrichOne = options.enrichFn || enrichContact;
  const contacts = options.contacts || crm.listContacts({ project, sort: "updated_desc" }).contacts || [];
  const { candidates, skipped: selectionSkipped } = selectEnrichmentCandidates(contacts);

  const startedAt = Date.now();
  const results = [];
  const notReached = [];
  let cursor = 0;
  async function worker() {
    while (cursor < candidates.length) {
      const candidate = candidates[cursor++];
      const remaining = deadlineMs - (Date.now() - startedAt);
      if (remaining <= 0) {
        notReached.push({ contact_id: candidate.contact.id, reason: "time_limit" });
        continue;
      }
      try {
        const result = await withTimeout(
          Promise.resolve(enrichOne(candidate.contact.id, { websiteUrl: candidate.website })),
          Math.min(perContactMs, remaining),
          "Timed out while researching this contact"
        );
        results.push({ ...(result || {}), contact_id: candidate.contact.id, detail: undefined });
      } catch (error) {
        results.push({ ok: false, contact_id: candidate.contact.id, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker()));

  const completed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok && !r.skipped).length;
  const skippedList = [
    ...selectionSkipped,
    ...results.filter((r) => r.skipped).map((r) => ({ contact_id: r.contact_id, reason: "no_website_instagram_or_business_email" })),
    ...notReached,
  ];
  const reasons = {};
  for (const entry of skippedList) reasons[entry.reason] = (reasons[entry.reason] || 0) + 1;
  const partial = notReached.length > 0;
  const nothingToResearch = skippedList.filter((e) => e.reason !== "already_enriched" && e.reason !== "time_limit").length;
  const reasonText = Object.entries(reasons)
    .map(([reason, count]) => `${count} ${SKIP_REASON_TEXT[reason] || reason}`)
    .join(", ");

  return {
    ok: true,
    total_contacts: contacts.length,
    total_candidates: candidates.length,
    completed,
    failed,
    skipped: skippedList.length,
    nothing_to_research: nothingToResearch,
    reasons,
    reason_text: reasonText,
    partial,
    note: partial ? `Stopped after ${Math.round(deadlineMs / 1000)}s; ${notReached.length} contact(s) were not reached. Run Enrich All again to continue.` : null,
    results: results.map(({ detail, website_profile, instagram_profile, ...rest }) => rest),
  };
}

module.exports = {
  FREE_EMAIL_DOMAINS,
  emailDomain,
  isFreeEmailDomain,
  websiteFromEmail,
  selectEnrichmentCandidates,
  enrichAllContacts,
  enrichContact,
  loadWebfetchRecipe,
  resolveWebfetchRecipePath,
};
