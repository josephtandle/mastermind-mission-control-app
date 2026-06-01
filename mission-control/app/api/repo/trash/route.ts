import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
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

    const trashDir = path.join(os.homedir(), ".Trash");
    const filename = path.basename(filePath);
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);

    // Handle name conflicts
    let trashPath = path.join(trashDir, filename);
    if (fs.existsSync(trashPath)) {
      trashPath = path.join(trashDir, `${base}_${Date.now()}${ext}`);
    }

    fs.renameSync(filePath, trashPath);

    return NextResponse.json({
      success: true,
      originalPath: filePath,
      trashPath,
      name: filename,
    });
  } catch (error) {
    console.error("Error moving to trash:", error);
    return NextResponse.json({ error: "Failed to move to trash" }, { status: 500 });
  }
}
