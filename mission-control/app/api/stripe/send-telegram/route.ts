import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { sendTelegramViaSharedSender } from "../../_telegram";

const WS = process.env.GET_SORTED_WORKSPACE || path.join(os.homedir(), "golden-claw");

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

export async function POST(request: Request) {
  try {
    const { message, plainText } = await request.json();

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const botToken = getEnvVar("TELEGRAM_BOT_TOKEN");
    const chatId = getEnvVar("TELEGRAM_CHAT_ID") || '';

    if (!botToken) {
      return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not configured" }, { status: 500 });
    }

    await sendTelegramViaSharedSender({
      botToken,
      chatId,
      text: message,
      agentId: "mastermind-stripe",
      messageType: "notification",
      sourcePath: "projects/mastermind-mission-control/mission-control/app/api/stripe/send-telegram/route.ts",
      plainText,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to send Telegram message";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
