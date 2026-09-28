#!/usr/bin/env node
/**
 * validate-crm-install.js <mission-control-path> <base-url>
 *
 * Checks a Mission Control install end to end:
 *   - every app page responds 200 at <base-url> (tasks, projects, CRM tabs)
 *   - data/crm.db exists inside the app folder and holds sample contacts
 *     (or the owner already cleared them with "Clear sample data")
 *   - the CRM link is present in app/app/_nav/nav-data.ts
 *   - /api/crm/automations/settings reports every channel with live_enabled false
 *
 * Example:
 *   node scripts/validate-crm-install.js . http://localhost:3001
 *
 * Exit code 0 when every check passes, 1 otherwise. install/install.mjs
 * reuses runStaticChecks() for its own verification step.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PAGES = [
  "/app/tasks",
  "/app/tasks/projects",
  "/app/crm",
  "/app/crm/pipeline",
  "/app/crm/contacts",
  "/app/crm/templates",
  "/app/crm/automations",
  "/app/crm/settings",
];

function check(name, ok, detail = "") {
  return { name, ok: Boolean(ok), detail };
}

function countSampleContacts(dbPath, appRoot) {
  try {
    const Database = require(path.join(appRoot, "node_modules", "better-sqlite3"));
    const db = new Database(dbPath, { readonly: true });
    try {
      const row = db.prepare("SELECT COUNT(*) AS n FROM crm_contacts").get();
      return Number(row?.n || 0);
    } finally {
      db.close();
    }
  } catch (error) {
    return { error: String(error?.message || error) };
  }
}

// "Clear sample data" in the CRM sets this flag. An empty CRM is the expected
// state after that, not a broken install.
function sampleDataWasCleared(dbPath, appRoot) {
  try {
    const Database = require(path.join(appRoot, "node_modules", "better-sqlite3"));
    const db = new Database(dbPath, { readonly: true });
    try {
      const row = db.prepare("SELECT value FROM crm_settings WHERE key = 'crm.sample_data.cleared'").get();
      return row?.value === "true" || row?.value === "1";
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}

// Sample cards placed in the pipeline (crm_contact_projects) must not all sit
// in one column. Cards not yet placed are placed on the first CRM load.
function sampleCardColumns(dbPath, appRoot) {
  try {
    const Database = require(path.join(appRoot, "node_modules", "better-sqlite3"));
    const db = new Database(dbPath, { readonly: true });
    try {
      const rows = db
        .prepare("SELECT DISTINCT pipeline_status FROM crm_contact_projects WHERE contact_id GLOB 'demo-contact-*' AND project_name = 'pipeline'")
        .all();
      return rows.map((row) => row.pipeline_status);
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

function runStaticChecks(appRoot) {
  const root = path.resolve(appRoot);
  const checks = [];

  checks.push(check("package.json present", fs.existsSync(path.join(root, "package.json")), root));
  checks.push(check("node_modules installed", fs.existsSync(path.join(root, "node_modules")), "run npm install"));

  for (const rel of [
    "app/app/tasks/page.tsx",
    "app/app/tasks/projects/page.tsx",
    "app/app/crm/page.tsx",
    "app/app/crm/pipeline/page.tsx",
    "app/app/crm/contacts/page.tsx",
    "app/app/crm/templates/page.tsx",
    "app/app/crm/automations/page.tsx",
    "app/app/crm/settings/page.tsx",
    "app/api/crm/route.ts",
    "app/api/crm/automations/settings/route.ts",
    "lib/crm.js",
    "executor.py",
  ]) {
    checks.push(check(`file ${rel}`, fs.existsSync(path.join(root, rel))));
  }

  const navPath = path.join(root, "app", "app", "_nav", "nav-data.ts");
  const nav = fs.existsSync(navPath) ? fs.readFileSync(navPath, "utf8") : "";
  checks.push(check("CRM link in app/app/_nav/nav-data.ts", /href:\s*["'`]\/app\/crm["'`]/.test(nav)));

  const dbPath = path.join(root, "data", "crm.db");
  const dbExists = fs.existsSync(dbPath);
  checks.push(check("data/crm.db exists inside the app folder", dbExists, dbPath));
  if (dbExists) {
    const count = countSampleContacts(dbPath, root);
    if (typeof count === "number") {
      const cleared = count === 0 && sampleDataWasCleared(dbPath, root);
      checks.push(check("data/crm.db holds sample contacts", count > 0 || cleared, cleared ? "0 contacts, sample data cleared by the owner" : `${count} contacts`));
      const columns = count > 0 ? sampleCardColumns(dbPath, root) : null;
      if (columns && columns.length) {
        checks.push(check("sample cards spread across pipeline columns", columns.length >= 2, columns.join(", ")));
      }
    }
    else checks.push(check("data/crm.db readable through better-sqlite3", false, count.error));
  }

  return checks;
}

async function fetchStatus(url, options = {}) {
  try {
    // Follow redirects (for example /app/crm -> /app/crm/pipeline) and judge the final page.
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(options.timeoutMs || 30000) });
    return { status: response.status, response, finalUrl: response.url };
  } catch (error) {
    return { status: 0, error: String(error?.message || error) };
  }
}

async function runHttpChecks(baseUrl) {
  const base = String(baseUrl || "").replace(/\/$/, "");
  const checks = [];
  for (const page of PAGES) {
    const result = await fetchStatus(`${base}${page}`);
    const redirected = result.finalUrl && !result.finalUrl.endsWith(page) ? ` (redirected to ${new URL(result.finalUrl).pathname})` : "";
    checks.push(check(`GET ${page}`, result.status === 200, result.status ? `HTTP ${result.status}${redirected}` : result.error));
  }

  const settings = await fetchStatus(`${base}/api/crm/automations/settings`);
  if (settings.status !== 200) {
    checks.push(check("GET /api/crm/automations/settings", false, settings.status ? `HTTP ${settings.status}` : settings.error));
  } else {
    let body = null;
    try {
      body = await settings.response.json();
    } catch {
      body = null;
    }
    const channels = body?.settings?.channels || null;
    const names = channels ? Object.keys(channels) : [];
    checks.push(check("automation settings list channels", names.length > 0, names.join(", ")));
    for (const name of names) {
      checks.push(check(`channel ${name} live_enabled is false`, channels[name]?.live_enabled === false));
    }
    const emailProviders = Array.isArray(channels?.email?.providers) ? channels.email.providers : [];
    const configured = emailProviders.filter((provider) => provider.configured && provider.transactional).map((provider) => provider.label);
    checks.push(
      check(
        "email providers reported",
        true,
        configured.length ? `configured: ${configured.join(", ")}` : "none configured (automations draft only)"
      )
    );
  }
  return checks;
}

function printChecks(checks) {
  for (const item of checks) {
    console.log(`${item.ok ? "ok  " : "FAIL"} ${item.name}${item.detail ? `: ${item.detail}` : ""}`);
  }
}

async function main(argv) {
  const [appRootArg, baseUrlArg] = argv;
  if (!appRootArg || !baseUrlArg) {
    console.error("usage: node scripts/validate-crm-install.js <mission-control-path> <base-url>");
    process.exit(2);
  }
  const appRoot = path.resolve(appRootArg);
  console.log(`[validate] app: ${appRoot}`);
  console.log(`[validate] url: ${baseUrlArg}`);
  const staticChecks = runStaticChecks(appRoot);
  printChecks(staticChecks);
  const httpChecks = await runHttpChecks(baseUrlArg);
  printChecks(httpChecks);
  const all = [...staticChecks, ...httpChecks];
  const failed = all.filter((item) => !item.ok);
  console.log(`[validate] ${all.length - failed.length}/${all.length} checks passed`);
  if (failed.length) {
    console.log(`[validate] FAIL: ${failed.map((item) => item.name).join("; ")}`);
    process.exit(1);
  }
  console.log("[validate] PASS");
}

module.exports = { PAGES, runStaticChecks, runHttpChecks };

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error?.stack || error);
    process.exit(1);
  });
}
