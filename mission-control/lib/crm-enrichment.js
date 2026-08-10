"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const crm = require("./crm");

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

function resolveWebfetchApiPath() {
  const home = os.homedir();
  const candidates = [
    process.env.WEBFETCH_API_PATH,
    path.join(home, ".config", "allsorted", "configured_fetch", "api.js"),
    path.join(home, ".local", "share", "allsorted", "configured_fetch", "api.js"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function loadWebfetchApi() {
  const resolved = resolveWebfetchApiPath();
  if (!resolved) return null;
  try {
    return require(resolved);
  } catch {
    return null;
  }
}

async function fetchHtml(url) {
  const webfetch = loadWebfetchApi();
  if (webfetch?.fetchUrl) {
    const result = await webfetch.fetchUrl(url, {
      format: "html",
      noCache: true,
      browser: "headless",
    });
    if (result?.success && typeof result.data === "string" && result.data.trim()) {
      return {
        html: result.data,
        engine: "configured_fetch",
        tool: result.tool || "configured_fetch",
      };
    }
  }

  const response = await fetch(url, {
    headers: {
      "user-agent": "AllSorted CRM Enrichment/1.0",
      accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
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

async function enrichContact(contactId) {
  const detail = crm.getContactDetail(contactId);
  if (!detail?.contact) {
    throw new Error(`CRM contact not found: ${contactId}`);
  }

  const websiteUrl =
    detail.contact.website_url ||
    detail.enrichment?.find((entry) => entry.external_url)?.external_url ||
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

async function enrichAllContacts(options = {}) {
  const project = String(options.project || "pipeline");
  const contacts = crm.listContacts({ project, sort: "updated_desc" }).contacts || [];
  const candidates = contacts.filter((contact) => {
    const hasSource = Boolean(contact.website_url || contact.instagram_handle || contact.instagram_profile_url);
    const needsEnrichment = !contact.business_description || !contact.photo_url;
    return hasSource && needsEnrichment;
  });

  const results = [];
  for (const contact of candidates) {
    try {
      results.push(await enrichContact(contact.id));
    } catch (error) {
      results.push({
        ok: false,
        contact_id: contact.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    ok: true,
    total_candidates: candidates.length,
    completed: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok && !result.skipped).length,
    skipped: results.filter((result) => result.skipped).length,
    results,
  };
}

module.exports = {
  enrichAllContacts,
  enrichContact,
};
