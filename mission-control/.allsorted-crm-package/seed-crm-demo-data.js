#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { mergeDatabase } = require("./sqlite");
const sample = path.join(__dirname, "crm-sample.db");
const statePath = path.join(__dirname, "..", ".allsorted-crm-install.json");
function workspaceRoot() {
  const configured = process.env.CRM_WORKSPACE_PATH || process.env.ALLSORTED_WORKSPACE;
  if (configured) return path.resolve(configured);
  try { const state = JSON.parse(fs.readFileSync(statePath, "utf8")); if (typeof state.workspaceRoot === "string" && state.workspaceRoot) return path.resolve(state.workspaceRoot); } catch {}
  return path.resolve(__dirname, "..", "..");
}
const target = path.join(workspaceRoot(), "data", "crm.db");
fs.mkdirSync(path.dirname(target), { recursive: true });
if (!fs.existsSync(target)) fs.copyFileSync(sample, target); else mergeDatabase(target, sample);
console.log("[crm] Demo-safe seed merge complete");
