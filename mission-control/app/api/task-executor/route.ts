import { NextResponse } from "next/server";
import { execSync, spawn } from "child_process";
import os from "os";
import path from "path";
import { resolvePythonInvocation } from "@/lib/python-command";

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
    const python = resolvePythonInvocation();
    if (!python) {
      return NextResponse.json(
        { error: "Python 3 was not found on PATH" },
        { status: 500 }
      );
    }

    const child = spawn(python.command, [...python.prefixArgs, EXECUTOR_PATH], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        HOME,
      },
      cwd: HOME,
    });
    child.unref();

    return NextResponse.json({ success: true, message: "Task executor started", running: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to start task executor";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
