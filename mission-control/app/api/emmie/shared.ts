import fs from "fs";
import { promises as fsp } from "fs";
import os from "os";
import path from "path";

export const WORKSPACE_ROOT = path.join(os.homedir(), ".myos", "workspace");
export const EMMIE_DIR = path.join(WORKSPACE_ROOT, "agents", "emmie");
export const LOGS_DIR = path.join(WORKSPACE_ROOT, "logs");
export const CLEANUP_SCRIPT = path.join(WORKSPACE_ROOT, "bin", "gmail-cleanup");
export const METRICS_PATH = path.join(EMMIE_DIR, "emmie-metrics.csv");
export const ACCOUNTS_PATH = path.join(EMMIE_DIR, "accounts.json");

export interface EmmieAccount {
  id: string;
  displayName: string;
  email: string;
  rulesProfile: string;
  rulesPath: string;
  authMode?: string;
  authorization?: {
    status?: string;
    setupCommand?: string;
  };
  cleanup?: {
    enabled?: boolean;
    script?: string;
    mode?: string;
  };
  triage?: {
    enabled?: boolean;
    mode?: string;
    includeFinanceSweep?: boolean;
  };
}

interface AccountsFile {
  defaultAccount?: string;
  accounts?: EmmieAccount[];
}

export interface CleanupSummary {
  inboxBefore: number | null;
  inboxAfter: number | null;
  reduction: number | null;
  promotionsDeleted: number | null;
  socialDeleted: number | null;
  updatesDeleted: number | null;
  primaryDeleted: number | null;
  phishingDeleted: number | null;
  filedTotal: number | null;
  grandTotalDeleted: number | null;
  keptWhitelisted: number | null;
  actionableLogged: number | null;
  actionableFiled: number | null;
  actionableDeleted: number | null;
  actionableAlerts: number | null;
}

export async function readAccountsFile(): Promise<AccountsFile> {
  const raw = await fsp.readFile(ACCOUNTS_PATH, "utf8");
  return JSON.parse(raw) as AccountsFile;
}

export async function getDefaultAccount(): Promise<EmmieAccount | null> {
  try {
    const data = await readAccountsFile();
    const accounts = data.accounts || [];
    if (!accounts.length) return null;
    const match = accounts.find((account) => account.id === data.defaultAccount);
    return match || accounts[0];
  } catch {
    return null;
  }
}

export function extractLatestRunSegment(raw: string): string {
  const marker = "=== Emmy's Gmail Cleanup Started ===";
  const index = raw.lastIndexOf(marker);
  return index >= 0 ? raw.slice(index) : raw;
}

function parseCount(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : null;
}

export function parseCleanupSummary(text: string): CleanupSummary {
  const reductionMatch = text.match(
    /Total inbox reduction:\s*(\d+)\s+emails?\s*\(from\s*(\d+)\s*[^\d]+(\d+)\)/i
  );

  return {
    inboxBefore: reductionMatch ? Number.parseInt(reductionMatch[2], 10) : parseCount(text, /Inbox count before cleanup:\s*(\d+)/i),
    inboxAfter: reductionMatch ? Number.parseInt(reductionMatch[3], 10) : parseCount(text, /Inbox count after cleanup:\s*(\d+)/i),
    reduction: reductionMatch ? Number.parseInt(reductionMatch[1], 10) : parseCount(text, /Inbox reduction:\s*(\d+)/i),
    promotionsDeleted: parseCount(text, /Promotions:\s*deleted\s*(\d+)/i),
    socialDeleted: parseCount(text, /Social(?:\s*\([^)]+\))?:\s*deleted\s*(\d+)/i),
    updatesDeleted: parseCount(text, /Updates(?:\s*\([^)]+\))?:\s*deleted\s*(\d+)/i),
    primaryDeleted:
      parseCount(text, /Primary \(sender\/subject\):\s*deleted\s*(\d+)/i) ??
      parseCount(text, /Primary \(conservative\):\s*deleted\s*(\d+)/i),
    phishingDeleted: parseCount(text, /Phishing deleted:\s*(\d+)/i),
    filedTotal:
      parseCount(text, /Filed to folders \(Phase 6\):\s*(\d+)/i) ??
      parseCount(text, /Total filed \(all phases\):\s*(\d+)/i),
    grandTotalDeleted: parseCount(text, /Grand total deleted:\s*(\d+)/i),
    keptWhitelisted: parseCount(text, /Promotions:\s*deleted\s*\d+\s*\(kept\s*(\d+)\s+whitelisted\)/i),
    actionableLogged: parseCount(text, /Phase 8 \(actionable\/log\):\s*logged\s*(\d+)/i),
    actionableFiled: parseCount(text, /Phase 8 \(actionable\/log\):\s*logged\s*\d+,\s*filed\s*(\d+)/i),
    actionableDeleted: parseCount(text, /Phase 8 \(actionable\/log\):\s*logged\s*\d+,\s*filed\s*\d+,\s*deleted\s*(\d+)/i),
    actionableAlerts: parseCount(text, /Phase 8 \(actionable\/log\):.*alerts\s*(\d+)/i),
  };
}

export function extractLearningPatterns(text: string): string[] {
  const marker = "New sender patterns not yet in Emmy's rules:";
  const start = text.indexOf(marker);
  if (start === -1) return [];

  const lines = text
    .slice(start + marker.length)
    .split("\n")
    .map((line) => line.replace(/^\[[^\]]+\]\s*/, "").trim())
    .map((line) => line.replace(/^[•-]\s*/, "").trim())
    .filter(Boolean);

  const patterns: string[] = [];
  for (const line of lines) {
    if (line.startsWith("===") || /^Total inbox reduction:/i.test(line)) break;
    if (!line.startsWith("rs.") && !line.includes("(") && !line.includes(".")) continue;
    patterns.push(line);
  }

  return patterns;
}

export function parseLogTimestamp(line: string): string | null {
  const match = line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/);
  return match?.[1] || null;
}

export async function listCleanupLogs(limit = 20) {
  const entries = await fsp.readdir(LOGS_DIR, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /^gmail-cleanup-.*\.log$/.test(entry.name))
      .filter((entry) => !entry.name.endsWith("-stdout.log") && !entry.name.endsWith("-stderr.log"))
      .map(async (entry) => {
        const fullPath = path.join(LOGS_DIR, entry.name);
        const stat = await fsp.stat(fullPath);
        return {
          name: entry.name,
          fullPath,
          mtimeMs: stat.mtimeMs,
        };
      })
  );

  return files.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, limit);
}

export async function readMaybe(pathname: string): Promise<string | null> {
  try {
    return await fsp.readFile(pathname, "utf8");
  } catch {
    return null;
  }
}

export function fileExists(pathname: string): boolean {
  return fs.existsSync(pathname);
}
