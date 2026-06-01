import { NextRequest, NextResponse } from "next/server";
import * as path from "path";
import * as fs from "fs";
import { exec } from "child_process";
import os from "os";

const WS = os.homedir();

const WORKSPACE_ROOT = WS;

function isPathValid(requestPath: string): boolean {
  const resolvedPath = path.resolve(requestPath);
  return resolvedPath.startsWith(WORKSPACE_ROOT);
}

export async function POST(request: NextRequest) {
  try {
    const { path: filePath } = await request.json();

    if (!filePath || !isPathValid(filePath)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    await new Promise<void>((resolve, reject) => {
      exec(`open "${filePath.replace(/"/g, '\\"')}"`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error opening file:", error);
    return NextResponse.json({ error: "Failed to open file" }, { status: 500 });
  }
}
