import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import os from "os";
import { sendTelegramViaSharedSender } from "../_telegram";

const WS = process.env.GET_SORTED_WORKSPACE || path.join(os.homedir(), "golden-claw");

const DB_PATH = path.join(WS, "data/mastermind-blog.db");

function getEnvVar(key: string): string {
  if (process.env[key]) return process.env[key]!;
  try {
    const envPath = path.join(WS, ".env");
    const envContent = fs.readFileSync(envPath, "utf-8");
    const match = envContent.match(new RegExp(`^${key}=(.+)$`, "m"));
    if (match) {
      process.env[key] = match[1].trim();
      return match[1].trim();
    }
  } catch { /* ignore */ }
  return "";
}

async function sendTelegram(message: string): Promise<void> {
  const botToken = getEnvVar("TELEGRAM_BOT_TOKEN");
  const chatId = getEnvVar("TELEGRAM_CHAT_ID") || '';
  if (!botToken) return;
  await sendTelegramViaSharedSender({
    botToken,
    chatId,
    text: message,
    agentId: "mastermind-mission-control",
    messageType: "notification",
    sourcePath: "projects/mastermind-mission-control/mission-control/app/api/cohorts/_utils.ts",
  }).catch(() => {});
}

/**
 * Count queued posts and send a Telegram alert if exactly 2 remain.
 * Call this after any action that removes a post from the queue.
 */
export async function checkQueueAlert(): Promise<void> {
  try {
    if (!fs.existsSync(DB_PATH)) return;
    const db = new Database(DB_PATH, { readonly: true });
    const row = db.prepare("SELECT COUNT(*) as count FROM blog_posts WHERE status = 'queued'").get() as { count: number };
    db.close();
    if (row.count === 2) {
      await sendTelegram("There's only two blogs left in the queue.");
    }
  } catch { /* non-fatal */ }
}
