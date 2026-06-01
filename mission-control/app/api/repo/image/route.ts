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

const IMAGE_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".bmp": "image/bmp",
  ".tiff": "image/tiff",
  ".tif": "image/tiff",
  ".pdf": "application/pdf",
};

export async function GET(request: NextRequest) {
  try {
    const filePath = request.nextUrl.searchParams.get("path");

    if (!filePath || !isPathValid(filePath)) {
      return new NextResponse("Invalid path", { status: 400 });
    }

    if (!fs.existsSync(filePath)) {
      return new NextResponse("File not found", { status: 404 });
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeType = IMAGE_MIME_TYPES[ext];
    if (!mimeType) {
      return new NextResponse("Not a supported file type", { status: 400 });
    }

    const stats = fs.statSync(filePath);
    const fileBuffer = fs.readFileSync(filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": stats.size.toString(),
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (error) {
    console.error("Error serving image:", error);
    return new NextResponse("Failed to read image", { status: 500 });
  }
}
