import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import os from "os";

const WS = os.homedir();

const WORKSPACE_ROOT = WS;
const MAX_FILE_SIZE = 1024 * 1024; // 1MB

function isPathValid(requestPath: string): boolean {
  const resolvedPath = path.resolve(requestPath);
  return resolvedPath.startsWith(WORKSPACE_ROOT);
}

const EDITABLE_EXTENSIONS = new Set([
  ".md", ".txt", ".json", ".yaml", ".yml", ".toml",
  ".js", ".ts", ".tsx", ".jsx", ".mjs", ".cjs",
  ".py", ".sh", ".bash", ".zsh",
  ".css", ".scss", ".html", ".htm", ".xml",
  ".sql", ".graphql", ".gql", ".env", ".conf", ".config", ".ini",
]);

function isEditableFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return EDITABLE_EXTENSIONS.has(ext);
}

// GET - Read file
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const filePath = searchParams.get("path");

    if (!filePath || !isPathValid(filePath)) {
      return NextResponse.json(
        { error: "Invalid path" },
        { status: 400 }
      );
    }

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }

    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      return NextResponse.json(
        { error: "Path is a directory" },
        { status: 400 }
      );
    }

    if (stats.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File is too large (max 1MB)" },
        { status: 413 }
      );
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const ext = path.extname(filePath).toLowerCase();
    const isEditable = isEditableFile(filePath);

    return NextResponse.json({
      path: filePath,
      name: path.basename(filePath),
      content,
      extension: ext,
      isEditable,
      size: stats.size,
    });
  } catch (error) {
    console.error("Error reading file:", error);
    return NextResponse.json(
      { error: "Failed to read file" },
      { status: 500 }
    );
  }
}

// POST - Save file (only for .md and .txt)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { path: filePath, content } = body;

    if (!filePath || typeof content !== "string") {
      return NextResponse.json(
        { error: "Missing path or content" },
        { status: 400 }
      );
    }

    if (!isPathValid(filePath)) {
      return NextResponse.json(
        { error: "Invalid path" },
        { status: 400 }
      );
    }

    if (!isEditableFile(filePath)) {
      return NextResponse.json(
        { error: "File type not editable" },
        { status: 403 }
      );
    }

    // Create parent directory if needed
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, content, "utf-8");

    return NextResponse.json({
      success: true,
      path: filePath,
      message: "File saved successfully",
    });
  } catch (error) {
    console.error("Error saving file:", error);
    return NextResponse.json(
      { error: "Failed to save file" },
      { status: 500 }
    );
  }
}
