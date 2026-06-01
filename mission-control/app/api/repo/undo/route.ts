import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import os from "os";

const WS = os.homedir();

const WORKSPACE_ROOT = WS;

export async function POST(request: NextRequest) {
  try {
    const { originalPath, trashPath } = await request.json();

    if (!originalPath || !trashPath) {
      return NextResponse.json({ error: "Missing paths" }, { status: 400 });
    }

    if (!path.resolve(originalPath).startsWith(WORKSPACE_ROOT)) {
      return NextResponse.json({ error: "Invalid original path" }, { status: 400 });
    }

    if (!fs.existsSync(trashPath)) {
      return NextResponse.json({ error: "File no longer in trash" }, { status: 404 });
    }

    if (fs.existsSync(originalPath)) {
      return NextResponse.json({ error: "A file already exists at the original location" }, { status: 409 });
    }

    const parentDir = path.dirname(originalPath);
    if (!fs.existsSync(parentDir)) {
      return NextResponse.json({ error: "Original directory no longer exists" }, { status: 400 });
    }

    fs.renameSync(trashPath, originalPath);

    return NextResponse.json({ success: true, restoredPath: originalPath });
  } catch (error) {
    console.error("Error restoring file:", error);
    return NextResponse.json({ error: "Failed to restore file" }, { status: 500 });
  }
}
