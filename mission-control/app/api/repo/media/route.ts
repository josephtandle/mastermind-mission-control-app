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

const MEDIA_MIME_TYPES: Record<string, string> = {
  // Video
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  // Audio
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
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
    const mimeType = MEDIA_MIME_TYPES[ext];
    if (!mimeType) {
      return new NextResponse("Not a supported media type", { status: 400 });
    }

    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    const rangeHeader = request.headers.get("range");

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (!match) {
        return new NextResponse("Invalid range", { status: 416 });
      }

      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : Math.min(start + 1024 * 1024, fileSize - 1);

      if (start >= fileSize || end >= fileSize || start > end) {
        return new NextResponse("Range not satisfiable", {
          status: 416,
          headers: { "Content-Range": `bytes */${fileSize}` },
        });
      }

      const chunkSize = end - start + 1;
      const chunks: Buffer[] = [];
      const fileStream = fs.createReadStream(filePath, { start, end });

      for await (const chunk of fileStream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      return new NextResponse(Buffer.concat(chunks), {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize.toString(),
          "Content-Type": mimeType,
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // No range — serve full file (for audio and small video)
    const fileBuffer = fs.readFileSync(filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": fileSize.toString(),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error serving media:", error);
    return new NextResponse("Failed to read media file", { status: 500 });
  }
}
