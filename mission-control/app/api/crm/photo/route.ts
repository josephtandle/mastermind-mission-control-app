import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const crm = require("../../../../lib/crm");
const execFileAsync = promisify(execFile);

// Resolve the CRM workspace the same way lib/crm.js does (it does not export the path).
const CRM_INSTALL_STATE = path.join(process.cwd(), ".allsorted-crm-install.json");
function installedWorkspacePath(): string { try { const state = JSON.parse(readFileSync(CRM_INSTALL_STATE, "utf8")); if (typeof state.workspaceRoot === "string" && state.workspaceRoot) return path.resolve(state.workspaceRoot); } catch {} return path.resolve(process.cwd(), ".."); }
const WORKSPACE_PATH = process.env.CRM_WORKSPACE_PATH || process.env.ALLSORTED_WORKSPACE || installedWorkspacePath();
const PHOTO_DIR = path.join(WORKSPACE_PATH, "data", "crm-contact-photos");
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function extensionForType(type: string) {
  switch (type) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}

async function convertWithSips(tempPath: string, outputPath: string) {
  await execFileAsync("sips", [
    tempPath,
    "--resampleHeightWidthMax",
    "320",
    "--setProperty",
    "format",
    "jpeg",
    "--setProperty",
    "formatOptions",
    "70",
    "--out",
    outputPath,
  ]);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const contactId = String(formData.get("contactId") || "").trim();
    const file = formData.get("file");

    if (!contactId) {
      return NextResponse.json({ error: "contactId required" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
    }

    await fs.mkdir(PHOTO_DIR, { recursive: true });
    const ext = extensionForType(file.type);
    const stamp = Date.now();
    const tempPath = path.join(PHOTO_DIR, `${contactId}-${stamp}-raw.${ext}`);
    const jpegPath = path.join(PHOTO_DIR, `${contactId}-${stamp}.jpg`);
    const passthroughPath = path.join(PHOTO_DIR, `${contactId}-${stamp}.${ext}`);
    const bytes = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(tempPath, bytes);

    let absolutePath = jpegPath;
    try {
      await convertWithSips(tempPath, jpegPath);
      await fs.rm(tempPath, { force: true });
    } catch {
      absolutePath = passthroughPath;
      await fs.rename(tempPath, passthroughPath);
    }

    const detail = crm.saveContactPhoto(contactId, absolutePath);
    return NextResponse.json({
      ok: true,
      photo_local_path: absolutePath,
      detail,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown CRM photo upload error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
