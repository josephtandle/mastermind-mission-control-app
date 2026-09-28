#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { mergeDatabase, runSqlite } = require("./sqlite");
const sample = path.join(__dirname, "crm-sample.db");
const statePath = path.join(__dirname, "..", ".allsorted-crm-install.json");
function workspaceRoot() {
  const configured = process.env.CRM_WORKSPACE_PATH || process.env.ALLSORTED_WORKSPACE;
  if (configured) return path.resolve(configured);
  try { const state = JSON.parse(fs.readFileSync(statePath, "utf8")); if (typeof state.workspaceRoot === "string" && state.workspaceRoot) return path.resolve(state.workspaceRoot); } catch {}
  // Same fallback as lib/crm.js: the app folder (mission-control/) is the workspace.
  return path.resolve(__dirname, "..");
}
// True once someone pressed "Clear sample data" in the CRM. A database
// without the settings table has never been cleared.
function sampleDataCleared(databasePath) {
  try {
    if (!runSqlite(databasePath, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'crm_settings';").trim()) return false;
    const value = runSqlite(databasePath, "SELECT value FROM crm_settings WHERE key = 'crm.sample_data.cleared';").trim();
    return value === "true" || value === "1";
  } catch {
    return false;
  }
}
const target = path.join(workspaceRoot(), "data", "crm.db");
fs.mkdirSync(path.dirname(target), { recursive: true });
if (fs.existsSync(target) && sampleDataCleared(target)) {
  // Someone pressed "Clear sample data" in the CRM; never bring them back.
  console.log("[crm] Sample data was cleared in the CRM; not adding it back");
} else {
  if (!fs.existsSync(target)) fs.copyFileSync(sample, target); else mergeDatabase(target, sample);
  console.log("[crm] Demo-safe seed merge complete");
}
