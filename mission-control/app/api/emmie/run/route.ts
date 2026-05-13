import { execFile } from "child_process";
import { promisify } from "util";
import { NextResponse } from "next/server";
import { CLEANUP_SCRIPT, WORKSPACE_ROOT, getDefaultAccount } from "../shared";

const execFileAsync = promisify(execFile);

let isRunning = false;

export async function GET() {
  const account = await getDefaultAccount();
  return NextResponse.json({
    running: isRunning,
    account: account?.email || null,
    rulesProfile: account?.rulesProfile || null,
  });
}

export async function POST() {
  if (isRunning) {
    return NextResponse.json({ error: "Emmy is already running" }, { status: 409 });
  }

  const account = await getDefaultAccount();
  isRunning = true;

  try {
    const args: string[] = [];
    if (account?.email) {
      args.push("--account", account.email);
    }
    if (account?.rulesProfile) {
      args.push("--profile", account.rulesProfile);
    }

    const result = await execFileAsync(CLEANUP_SCRIPT, args, {
      cwd: WORKSPACE_ROOT,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 5 * 60 * 1000,
    });

    return NextResponse.json({
      success: true,
      message: "Cleanup completed successfully",
      account: account?.email || null,
      output: (result.stdout || "").slice(-3000),
      stderr: (result.stderr || "").slice(-1000),
    });
  } catch (error: unknown) {
    const err = error as {
      message?: string;
      stdout?: string;
      stderr?: string;
    };

    return NextResponse.json(
      {
        success: false,
        error: err.message || "Script execution failed",
        output: (err.stdout || "").slice(-3000),
        stderr: (err.stderr || "").slice(-1000),
      },
      { status: 500 }
    );
  } finally {
    isRunning = false;
  }
}
