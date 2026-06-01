import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import os from "os";

// Root the file browser at the user's home directory.
// os.homedir() resolves correctly on Mac (/Users/name) and Windows (C:\Users\name).
// Depth is capped at the API level so we never load the whole tree at once.
const WORKSPACE_ROOT = os.homedir();

function isPathValid(requestPath: string): boolean {
  const resolvedPath = path.resolve(requestPath);
  return resolvedPath.startsWith(WORKSPACE_ROOT);
}

interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
  size?: number;
}

function buildTree(dir: string, maxDepth = 12, currentDepth = 0): FileTreeNode[] {
  if (currentDepth >= maxDepth) return [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const result: FileTreeNode[] = [];

    for (const entry of entries) {
      // Skip hidden files and node_modules
      if (entry.name.startsWith(".") || entry.name === "node_modules") {
        continue;
      }

      const fullPath = path.join(dir, entry.name);

      if (!isPathValid(fullPath)) continue;

      const node: FileTreeNode = {
        name: entry.name,
        path: fullPath,
        type: entry.isDirectory() ? "directory" : "file",
      };

      if (entry.isDirectory()) {
        node.children = buildTree(fullPath, maxDepth, currentDepth + 1);
      } else {
        try {
          const stats = fs.statSync(fullPath);
          node.size = stats.size;
        } catch {
          node.size = 0;
        }
      }

      result.push(node);
    }

    return result.sort((a, b) => {
      if (a.type === b.type) {
        return a.name.localeCompare(b.name);
      }
      return a.type === "directory" ? -1 : 1;
    });
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const requestPath = searchParams.get("path") || WORKSPACE_ROOT;
    const depth = Math.min(parseInt(searchParams.get("depth") || "1", 10), 12);

    if (!isPathValid(requestPath)) {
      return NextResponse.json(
        { error: "Invalid path" },
        { status: 400 }
      );
    }

    if (!fs.existsSync(requestPath)) {
      return NextResponse.json({
        path: requestPath,
        name: path.basename(requestPath),
        tree: [],
      });
    }

    const stats = fs.statSync(requestPath);
    if (!stats.isDirectory()) {
      return NextResponse.json(
        { error: "Path is not a directory" },
        { status: 400 }
      );
    }

    const tree = buildTree(requestPath, depth);

    return NextResponse.json({
      path: requestPath,
      name: path.basename(requestPath),
      tree,
    });
  } catch (error) {
    console.error("Error in /api/repo/tree:", error);
    return NextResponse.json(
      { error: "Failed to read directory" },
      { status: 500 }
    );
  }
}
