import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

const HOME = os.homedir();
const EXECUTOR_PATH = path.join(process.cwd(), "executor.py");
async function updateCard(cardId: string, updates: Record<string, unknown>) {
  // Write directly to db.json — avoids hardcoding a port
  const DB_PATH = path.join(process.cwd(), "lib", "db.json");
  try {
    const raw = require("fs").readFileSync(DB_PATH, "utf8");
    const db = JSON.parse(raw);
    for (const card of db.cards) {
      if (card._id === cardId) {
        Object.assign(card, updates);
        card.updatedAt = Date.now();
        break;
      }
    }
    require("fs").writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  } catch {
    /* ignore */
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;
  if (!cardId) {
    return NextResponse.json({ error: "Missing cardId" }, { status: 400 });
  }

  if (!fs.existsSync(EXECUTOR_PATH)) {
    return NextResponse.json(
      { error: "executor.py not found — make sure you cloned the full repo" },
      { status: 500 }
    );
  }

  try {
    await updateCard(cardId, { executorStatus: "running" });

    const cleanEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (k !== "CLAUDECODE" && v !== undefined) {
        cleanEnv[k] = v;
      }
    }
    cleanEnv.PATH =
      `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${path.join(HOME, "bin")}`;
    cleanEnv.HOME = HOME;

    const child = spawn("python3", [EXECUTOR_PATH, "--card", cardId], {
      detached: true,
      stdio: "ignore",
      env: cleanEnv,
      cwd: HOME,
    });
    child.unref();

    return NextResponse.json({ started: true, cardId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await updateCard(cardId, { executorStatus: "needs-attention" });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
