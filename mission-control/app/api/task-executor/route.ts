import { NextResponse } from "next/server";
import { exec, execSync } from "child_process";
import os from "os";
import path from "path";

const HOME = os.homedir();
const EXECUTOR_PATH = path.join(process.cwd(), "executor.py");

function isRunning(): boolean {
  try {
    const out = execSync(`pgrep -f 'executor.py'`, {
      encoding: "utf-8",
      timeout: 3000,
    });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

export async function GET() {
  return NextResponse.json({ running: isRunning() });
}

export async function POST() {
  if (isRunning()) {
    return NextResponse.json({ success: false, message: "Task executor is already running", running: true });
  }

  try {
    exec(`python3 "${EXECUTOR_PATH}"`, {
      env: {
        ...process.env,
        PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${path.join(HOME, "bin")}`,
        HOME,
      },
      cwd: HOME,
    });

    return NextResponse.json({ success: true, message: "Task executor started", running: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to start task executor";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
