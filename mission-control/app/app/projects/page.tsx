"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  ChevronRight,
  ChevronDown,
  File,
  FileText,
  FileCode,
  FileJson,
  Folder,
  FolderOpen,
  Save,
  AlertCircle,
  RefreshCw,
  Image,
  Video,
  Music,
  Search,
  Trash2,
  RotateCcw,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import remarkGfm from "remark-gfm";
const ReactMarkdown = dynamic(() => import("react-markdown"), { ssr: false });

interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
  size?: number;
}

function getFileIcon(name: string, isSelected: boolean) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const color = isSelected ? "text-cm-purple" : "text-dark-muted";
  if (["md", "txt", "rst"].includes(ext))
    return <FileText size={15} className={color} />;
  if (["json", "yaml", "yml", "toml"].includes(ext))
    return <FileJson size={15} className={isSelected ? "text-cm-purple" : "text-amber-400"} />;
  if (
    ["js", "ts", "tsx", "jsx", "py", "sh", "bash", "rb", "go", "rs", "java", "c", "cpp", "h", "css", "html"].includes(ext)
  )
    return <FileCode size={15} className={isSelected ? "text-cm-purple" : "text-dark-success"} />;
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"].includes(ext))
    return <Image size={15} className={isSelected ? "text-cm-purple" : "text-purple-400"} />;
  if (["mp4", "mov", "webm", "mkv", "avi"].includes(ext))
    return <Video size={15} className={isSelected ? "text-cm-purple" : "text-dark-muted"} />;
  if (["mp3", "wav", "m4a", "ogg", "flac", "aac"].includes(ext))
    return <Music size={15} className={isSelected ? "text-cm-purple" : "text-dark-danger"} />;
  if (ext === "pdf")
    return <FileText size={15} className={isSelected ? "text-cm-purple" : "text-dark-danger"} />;
  return <File size={15} className={color} />;
}

const TEXT_EXTENSIONS = new Set([
  "md", "txt", "rst", "json", "yaml", "yml", "toml", "env",
  "js", "ts", "tsx", "jsx", "mjs", "cjs",
  "py", "sh", "bash", "zsh", "fish",
  "rb", "go", "rs", "java", "c", "cpp", "h", "hpp",
  "css", "scss", "less", "html", "htm", "xml", "svg",
  "sql", "graphql", "gql",
  "dockerfile", "makefile", "gitignore", "gitattributes",
  "lock", "log", "csv", "conf", "config", "ini", "plist",
]);

function isTextFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (TEXT_EXTENSIONS.has(ext)) return true;
  // Files with no extension that are likely text (Makefile, Dockerfile, etc.)
  if (!name.includes(".")) return true;
  return false;
}

const EDITABLE_EXTENSIONS = new Set(["md", "txt", "json", "js", "ts", "tsx", "jsx", "py", "sh", "yaml", "yml", "css", "html"]);

function isEditableFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return EDITABLE_EXTENSIONS.has(ext);
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp", "tiff", "tif"]);

function isImageFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return IMAGE_EXTENSIONS.has(ext);
}

const HTML_EXTENSIONS = new Set(["html", "htm"]);

function isHtmlFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return HTML_EXTENSIONS.has(ext);
}

const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "mkv", "avi"]);
function isVideoFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return VIDEO_EXTENSIONS.has(ext);
}

const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a", "ogg", "flac", "aac"]);
function isAudioFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return AUDIO_EXTENSIONS.has(ext);
}

function isCsvFile(name: string): boolean {
  return (name.split(".").pop()?.toLowerCase() || "") === "csv";
}

const TYPE_FILTER_EXTENSIONS: Record<string, Set<string>> = {
  images: new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp", "tiff", "tif"]),
  code: new Set(["js", "ts", "tsx", "jsx", "py", "sh", "bash", "rb", "go", "rs", "java", "c", "cpp", "h", "css", "scss", "html", "htm", "sql", "graphql"]),
  docs: new Set(["md", "txt", "rst", "pdf", "docx"]),
  pdf: new Set(["pdf"]),
  video: new Set(["mp4", "mov", "webm", "mkv", "avi"]),
  audio: new Set(["mp3", "wav", "m4a", "ogg", "flac", "aac"]),
  data: new Set(["json", "yaml", "yml", "toml", "csv", "sqlite", "db", "env"]),
};

const TYPE_FILTER_OPTIONS = [
  { key: "all", label: "All" },
  { key: "images", label: "Images" },
  { key: "code", label: "Code" },
  { key: "docs", label: "Docs" },
  { key: "pdf", label: "PDF" },
  { key: "video", label: "Video" },
  { key: "audio", label: "Audio" },
  { key: "data", label: "Data" },
];

function CsvTable({ content }: { content: string }) {
  const rows = useMemo(() => {
    const lines = content.split("\n").filter((l) => l.trim());
    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
          else { inQuotes = !inQuotes; }
        } else if (ch === "," && !inQuotes) {
          result.push(current.trim()); current = "";
        } else {
          current += ch;
        }
      }
      result.push(current.trim());
      return result;
    };
    return lines.slice(0, 502).map(parseLine);
  }, [content]);

  if (rows.length === 0) return <p className="p-4 text-sm text-dark-muted">Empty CSV</p>;
  const headers = rows[0];
  const dataRows = rows.slice(1, 501);

  return (
    <div className="p-4 overflow-auto h-full">
      {rows.length > 501 && (
        <p className="text-xs text-dark-muted mb-2">Showing first 500 rows</p>
      )}
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-cm-purple/15 sticky top-0">
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left font-semibold text-cm-purple border-b border-cm-purple/20 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataRows.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? "bg-dark-panel" : "bg-dark-panel2"}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-1.5 text-dark-text border-b border-dark-border whitespace-nowrap max-w-xs truncate" title={cell}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ProjectsPage() {
  const [treeData, setTreeData] = useState<FileTreeNode[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<{
    name: string;
    ext: string;
    isEditable: boolean;
    isBinary: boolean;
    isImage: boolean;
    isPdf: boolean;
    isVideo: boolean;
    isAudio: boolean;
  } | null>(null);
  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("");
  const [undoStack, setUndoStack] = useState<Array<{ type: string; originalPath: string; trashPath: string; name: string }>>([]);
  const [rootName, setRootName] = useState("workspace");

  // Resizable divider
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadTree();
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [sidebarWidth]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = e.clientX - dragStartX.current;
      const newWidth = Math.max(160, Math.min(600, dragStartWidth.current + delta));
      setSidebarWidth(newWidth);
    };
    const onMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const loadTree = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch("/api/repo/tree?depth=2");
      if (!response.ok) throw new Error("Failed to load file tree");
      const data = await response.json();
      setTreeData(data.tree || []);
      if (data.name) setRootName(data.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  const filterTree = useCallback(
    (nodes: FileTreeNode[], filters: { text: string; type: string; project: string }): FileTreeNode[] => {
      const { text, type, project } = filters;
      const lowerText = text.toLowerCase();
      const typeSet = type !== "all" ? TYPE_FILTER_EXTENSIONS[type] : null;

      let roots = nodes;
      if (project) {
        const projectsNode = nodes.find((n) => n.name === "projects" && n.type === "directory");
        if (projectsNode) {
          const specific = (projectsNode.children || []).find((n) => n.name === project && n.type === "directory");
          roots = specific ? [specific] : [];
        } else {
          roots = [];
        }
      }

      // No text or type filter — return the scoped tree as-is (don't prune directories)
      if (!lowerText && !typeSet) {
        return roots;
      }

      const recurse = (nodes: FileTreeNode[]): FileTreeNode[] => {
        return nodes.reduce<FileTreeNode[]>((acc, node) => {
          if (node.type === "file") {
            const nameMatch = !lowerText || node.name.toLowerCase().includes(lowerText);
            const ext = node.name.split(".").pop()?.toLowerCase() || "";
            const typeMatch = !typeSet || typeSet.has(ext);
            if (nameMatch && typeMatch) acc.push(node);
          } else {
            const childResults = recurse(node.children || []);
            if (childResults.length > 0) acc.push({ ...node, children: childResults });
          }
          return acc;
        }, []);
      };

      return recurse(roots);
    },
    []
  );

  const displayedTree = useMemo(
    () => filterTree(treeData, { text: searchText, type: typeFilter, project: projectFilter }),
    [filterTree, treeData, searchText, typeFilter, projectFilter]
  );

  const hasActiveFilter = searchText || typeFilter !== "all" || projectFilter;

  const projectOptions = useMemo(() => {
    const projectsNode = treeData.find((n) => n.name === "projects" && n.type === "directory");
    if (!projectsNode) return [];
    return (projectsNode.children || [])
      .filter((n) => n.type === "directory")
      .map((n) => n.name)
      .sort();
  }, [treeData]);

  const searchExpandedDirs = useMemo<Set<string> | null>(() => {
    if (!hasActiveFilter) return null;
    const dirs = new Set<string>();
    const collectDirs = (nodes: FileTreeNode[]) => {
      for (const node of nodes) {
        if (node.type === "directory") {
          dirs.add(node.path);
          if (node.children) collectDirs(node.children);
        }
      }
    };
    collectDirs(displayedTree);
    return dirs;
  }, [displayedTree, hasActiveFilter]);

  const loadFile = async (filePath: string) => {
    try {
      setError(null);
      setIsEditing(false);
      setIsSaving(false);
      setIsFileLoading(true);
      const name = filePath.split("/").pop() || "";
      const ext = name.includes(".") ? "." + name.split(".").pop()?.toLowerCase() : "";

      if (isImageFile(name)) {
        setFileContent("");
        setFileInfo({ name, ext, isEditable: false, isBinary: false, isImage: true, isPdf: false, isVideo: false, isAudio: false });
        setSelectedFile(filePath);
        return;
      }

      if (ext === ".pdf") {
        setFileContent("");
        setFileInfo({ name, ext, isEditable: false, isBinary: false, isImage: false, isPdf: true, isVideo: false, isAudio: false });
        setSelectedFile(filePath);
        return;
      }

      if (isVideoFile(name)) {
        setFileContent("");
        setFileInfo({ name, ext, isEditable: false, isBinary: false, isImage: false, isPdf: false, isVideo: true, isAudio: false });
        setSelectedFile(filePath);
        return;
      }

      if (isAudioFile(name)) {
        setFileContent("");
        setFileInfo({ name, ext, isEditable: false, isBinary: false, isImage: false, isPdf: false, isVideo: false, isAudio: true });
        setSelectedFile(filePath);
        return;
      }

      if (!isTextFile(name)) {
        setFileContent("");
        setFileInfo({ name, ext, isEditable: false, isBinary: true, isImage: false, isPdf: false, isVideo: false, isAudio: false });
        setSelectedFile(filePath);
        return;
      }

      const response = await fetch(`/api/repo/file?path=${encodeURIComponent(filePath)}`);
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to load file");
      }
      const data = await response.json();
      setFileContent(data.content);
      setFileInfo({
        name: data.name,
        ext: data.extension,
        isEditable: isEditableFile(data.name),
        isBinary: false,
        isImage: false,
        isPdf: false,
        isVideo: false,
        isAudio: false,
      });
      setSelectedFile(filePath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setSelectedFile(null);
    } finally {
      setIsFileLoading(false);
    }
  };

  const openWithSystem = async (filePath: string) => {
    await fetch("/api/repo/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: filePath }),
    });
  };

  const deleteFile = async () => {
    if (!selectedFile) return;
    try {
      setError(null);
      const response = await fetch("/api/repo/trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selectedFile }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to move to trash");
      }
      const data = await response.json();
      setUndoStack((prev) => [...prev, { type: "trash", originalPath: data.originalPath, trashPath: data.trashPath, name: data.name }]);
      setSelectedFile(null);
      setFileInfo(null);
      setFileContent("");
      loadTree();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const undoLast = async () => {
    const action = undoStack[undoStack.length - 1];
    if (!action) return;
    try {
      setError(null);
      const response = await fetch("/api/repo/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalPath: action.originalPath, trashPath: action.trashPath }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to undo");
      }
      setUndoStack((prev) => prev.slice(0, -1));
      loadTree();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleFileClick = (filePath: string) => {
    loadFile(filePath);
  };

  const saveFile = async () => {
    if (!selectedFile) return;
    try {
      setIsSaving(true);
      setError(null);
      const response = await fetch("/api/repo/file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selectedFile, content: fileContent }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to save file");
      }
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsSaving(false);
    }
  };

  const injectChildren = useCallback((nodes: FileTreeNode[], targetPath: string, children: FileTreeNode[]): FileTreeNode[] => {
    return nodes.map((n) => {
      if (n.path === targetPath) return { ...n, children };
      if (n.children) return { ...n, children: injectChildren(n.children, targetPath, children) };
      return n;
    });
  }, []);

  const toggleDir = useCallback(async (dirPath: string, node: FileTreeNode) => {
    const newExpanded = new Set(expandedDirs);
    if (newExpanded.has(dirPath)) {
      newExpanded.delete(dirPath);
      setExpandedDirs(newExpanded);
      return;
    }

    newExpanded.add(dirPath);
    setExpandedDirs(newExpanded);

    // Lazy-load children if not yet fetched
    if (!node.children || node.children.length === 0) {
      setLoadingDirs((prev) => new Set(prev).add(dirPath));
      try {
        const res = await fetch(`/api/repo/tree?path=${encodeURIComponent(dirPath)}&depth=1`);
        if (res.ok) {
          const data = await res.json();
          setTreeData((prev) => injectChildren(prev, dirPath, data.tree || []));
        }
      } finally {
        setLoadingDirs((prev) => { const s = new Set(prev); s.delete(dirPath); return s; });
      }
    }
  }, [expandedDirs, injectChildren]);

  const TreeNode = ({ node, level = 0 }: { node: FileTreeNode; level?: number }) => {
    const isDir = node.type === "directory";
    const isExpanded = searchExpandedDirs ? searchExpandedDirs.has(node.path) : expandedDirs.has(node.path);
    const isSelected = selectedFile === node.path;
    const indent = level * 19 + 8;

    if (isDir) {
      const isLoadingDir = loadingDirs.has(node.path);
      return (
        <div>
          <button
            onClick={() => toggleDir(node.path, node)}
            onMouseDown={(e) => e.preventDefault()}
            className="w-full flex items-center gap-1.5 py-0.5 text-dark-text hover:bg-dark-panel2 rounded transition-colors text-xs"
            style={{ paddingLeft: `${indent}px`, paddingRight: "8px" }}
          >
            <span className="text-dark-muted flex-shrink-0">
              {isLoadingDir
                ? <RefreshCw size={13} className="animate-spin" />
                : isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </span>
            <span className="flex-shrink-0">
              {isExpanded
                ? <FolderOpen size={14} className="text-amber-400" />
                : <Folder size={14} className="text-amber-400" />}
            </span>
            <span className="truncate font-medium">{node.name}</span>
          </button>
          {isExpanded && node.children && (
            <div>
              {node.children.map((child) => (
                <TreeNode key={child.path} node={child} level={level + 1} />
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <button
        onClick={() => handleFileClick(node.path)}
        onMouseDown={(e) => e.preventDefault()}
        title={`Open ${node.name}`}
        className={`w-full flex items-center gap-1.5 py-0.5 rounded transition-colors text-xs ${
          isSelected
            ? "bg-cm-purple/15 text-cm-purple font-medium"
            : "text-dark-muted hover:bg-dark-panel2"
        }`}
        style={{ paddingLeft: `${indent}px`, paddingRight: "8px" }}
      >
        <span className="flex-shrink-0">{getFileIcon(node.name, isSelected)}</span>
        <span className="truncate">{node.name}</span>
        {node.size !== undefined && node.size > 10240 && (
          <span className="text-xs text-dark-muted ml-auto flex-shrink-0">
            {(node.size / 1024).toFixed(0)}KB
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Top Bar with Search */}
      <div className="flex-shrink-0 bg-gradient-to-r from-cm-purple/10 via-dark-panel to-dark-panel rounded-lg px-4 py-3 space-y-3">
        {/* Row 1: Title + Actions */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-dark-text">File Browser</h2>
          <div className="flex items-center gap-2">
            {undoStack.length > 0 && (
              <button
                onClick={undoLast}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-dark-panel border border-cm-purple/20 text-cm-purple rounded-lg hover:bg-cm-purple/10 transition-colors"
                title={`Undo: restore "${undoStack[undoStack.length - 1].name}"`}
              >
                <RotateCcw size={14} />
                Undo
              </button>
            )}
            <button
              onClick={loadTree}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-dark-panel border border-cm-purple/20 text-dark-text rounded-lg hover:bg-cm-purple/10 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
              Reload
            </button>
          </div>
        </div>
        {/* Row 2: Search + Type Chips + Project Dropdown */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-shrink-0 w-56">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-muted" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search files..."
              className="w-full pl-8 pr-6 py-1.5 text-xs bg-dark-panel2 border border-dark-border rounded-lg placeholder:text-dark-muted text-dark-text focus:outline-none focus:ring-2 focus:ring-cm-purple focus:border-cm-purple transition-colors"
            />
            {searchText && (
              <button
                onClick={() => setSearchText("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-dark-muted hover:text-dark-text transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {TYPE_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setTypeFilter(typeFilter === opt.key ? "all" : opt.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                  typeFilter === opt.key
                    ? "bg-cm-purple text-white"
                    : "bg-dark-panel2 text-dark-muted border border-dark-border hover:bg-cm-purple/15 hover:text-cm-purple"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-dark-panel2 border border-dark-border rounded-lg text-dark-text focus:outline-none focus:ring-2 focus:ring-cm-purple focus:border-cm-purple transition-colors"
          >
            <option value="">All Projects</option>
            {projectOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Split Pane */}
      <div ref={containerRef} className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div
          className="bg-dark-panel rounded-l-lg border border-dark-border overflow-hidden flex flex-col flex-shrink-0"
          style={{ width: sidebarWidth }}
        >
          <div className="px-3 py-2 border-b border-dark-border flex-shrink-0">
            <p className="text-xs text-dark-muted font-mono font-dm-mono truncate">{rootName}</p>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {isLoading ? (
              <div className="p-4 text-center text-dark-muted">
                <p className="text-xs">Loading...</p>
              </div>
            ) : displayedTree.length === 0 ? (
              <div className="p-4 text-center text-dark-muted">
                <p className="text-xs">{hasActiveFilter ? "No matching files" : "No files found"}</p>
              </div>
            ) : (
              displayedTree.map((node) => <TreeNode key={node.path} node={node} />)
            )}
          </div>
          <div className="px-3 py-1.5 border-t border-dark-border flex-shrink-0">
            <p className="text-xs text-dark-muted">Click to open</p>
          </div>
        </div>

        {/* Drag Handle */}
        <div
          onMouseDown={onMouseDown}
          className="w-1.5 bg-dark-border hover:bg-cm-purple-mid cursor-col-resize flex-shrink-0 transition-colors active:bg-cm-purple"
          title="Drag to resize"
        />

        {/* Content Area */}
        <div className="flex-1 bg-dark-panel rounded-r-lg border border-dark-border border-l-0 overflow-hidden flex flex-col min-w-0">
          {selectedFile ? (
            <>
              {/* File Header */}
              <div className="px-4 py-2.5 border-b border-dark-border flex-shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold tracking-tight text-dark-text text-sm">{fileInfo?.name}</h3>
                    <p className="text-xs text-dark-muted font-mono font-dm-mono truncate mt-0.5">{selectedFile}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {fileInfo?.isEditable && !fileInfo.isBinary && (
                      <>
                        {isEditing && (
                          <button
                            onClick={saveFile}
                            disabled={isSaving}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-cm-purple text-white rounded-lg hover:bg-cm-purple/80 transition-colors disabled:opacity-50"
                          >
                            <Save size={14} />
                            {isSaving ? "Saving..." : "Save"}
                          </button>
                        )}
                        <button
                          onClick={() => setIsEditing(!isEditing)}
                          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                            isEditing
                              ? "bg-cm-purple/15 text-cm-purple hover:bg-cm-purple/15"
                              : "bg-cm-purple text-white hover:bg-cm-purple/80"
                          }`}
                        >
                          {isEditing ? "Preview" : "Edit"}
                        </button>
                      </>
                    )}
                    <button
                      onClick={deleteFile}
                      className="p-1.5 text-dark-muted hover:text-dark-danger hover:bg-dark-danger/10 rounded-lg transition-colors"
                      title="Move to trash"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-3 m-3 p-3 bg-dark-danger/10 border border-dark-danger/30 rounded-lg flex-shrink-0">
                  <AlertCircle size={16} className="text-dark-danger flex-shrink-0" />
                  <p className="text-xs text-dark-danger">{error}</p>
                </div>
              )}

              {/* Content */}
              <div className="flex-1 overflow-auto">
                {isFileLoading ? (
                  <div className="flex items-center justify-center h-full text-dark-muted">
                    <p className="text-sm">Loading file...</p>
                  </div>
                ) : fileInfo?.isImage ? (
                  <div className="flex flex-col items-center justify-center h-full p-6 gap-4">
                    <img
                      src={`/api/repo/image?path=${encodeURIComponent(selectedFile)}`}
                      alt={fileInfo.name}
                      className="max-w-full max-h-[calc(100%-3rem)] object-contain rounded-lg shadow-sm"
                      onError={(e) => {
                        const target = e.currentTarget;
                        target.style.display = "none";
                        target.nextElementSibling?.classList.remove("hidden");
                      }}
                    />
                    <p className="hidden text-xs text-dark-muted">Failed to load image</p>
                    <button
                      onClick={() => selectedFile && openWithSystem(selectedFile)}
                      className="flex-shrink-0 px-3 py-1.5 text-xs bg-cm-purple/15 text-cm-purple rounded-lg hover:bg-cm-purple/20 transition-colors"
                    >
                      Open with System
                    </button>
                  </div>
                ) : fileInfo?.isVideo ? (
                  <div className="flex flex-col items-center justify-center h-full p-6 gap-4">
                    <video
                      controls
                      className="max-w-full max-h-[calc(100%-3rem)] rounded-lg shadow-sm"
                      src={`/api/repo/media?path=${encodeURIComponent(selectedFile)}`}
                    />
                    <button
                      onClick={() => selectedFile && openWithSystem(selectedFile)}
                      className="flex-shrink-0 px-3 py-1.5 text-xs bg-cm-purple/15 text-cm-purple rounded-lg hover:bg-cm-purple/20 transition-colors"
                    >
                      Open with System
                    </button>
                  </div>
                ) : fileInfo?.isAudio ? (
                  <div className="flex flex-col items-center justify-center h-full p-6 gap-6">
                    <Music size={48} className="text-cm-purple-mid opacity-50" />
                    <p className="text-sm font-medium text-dark-muted">{fileInfo.name}</p>
                    <audio
                      controls
                      className="w-full max-w-md"
                      src={`/api/repo/media?path=${encodeURIComponent(selectedFile)}`}
                    />
                    <button
                      onClick={() => selectedFile && openWithSystem(selectedFile)}
                      className="flex-shrink-0 px-3 py-1.5 text-xs bg-cm-purple/15 text-cm-purple rounded-lg hover:bg-cm-purple/20 transition-colors"
                    >
                      Open with System
                    </button>
                  </div>
                ) : fileInfo?.isPdf ? (
                  <iframe
                    src={`/api/repo/image?path=${encodeURIComponent(selectedFile)}`}
                    title={fileInfo.name}
                    className="w-full h-full border-none"
                  />
                ) : fileInfo?.isBinary ? (
                  <div className="flex items-center justify-center h-full text-dark-muted">
                    <div className="text-center">
                      <File size={40} className="mx-auto mb-3 opacity-20" />
                      <p className="text-sm font-medium text-dark-muted">Cannot preview this file</p>
                      <p className="text-xs mt-1 text-dark-muted">{fileInfo.name}</p>
                      <button
                        onClick={() => selectedFile && openWithSystem(selectedFile)}
                        className="mt-4 px-4 py-2 text-sm bg-cm-purple text-white rounded-lg hover:bg-cm-purple/80 transition-colors"
                      >
                        Open with System
                      </button>
                    </div>
                  </div>
                ) : isEditing ? (
                  <textarea
                    value={fileContent}
                    onChange={(e) => setFileContent(e.target.value)}
                    className="w-full h-full p-4 font-mono font-dm-mono text-xs resize-none focus:outline-none border-none leading-relaxed bg-dark-panel text-dark-text"
                    spellCheck="false"
                  />
                ) : fileInfo?.ext === ".md" ? (
                  <div className="p-6 prose prose-sm prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{fileContent}</ReactMarkdown>
                  </div>
                ) : isCsvFile(fileInfo?.name || "") ? (
                  <CsvTable content={fileContent} />
                ) : isHtmlFile(fileInfo?.name || "") ? (
                  <iframe
                    srcDoc={fileContent}
                    sandbox="allow-same-origin"
                    title={fileInfo?.name || "HTML Preview"}
                    className="w-full h-full border-none"
                  />
                ) : (
                  <pre className="p-4 font-mono font-dm-mono text-xs text-dark-text overflow-auto leading-relaxed whitespace-pre-wrap">
                    {fileContent}
                  </pre>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-dark-muted">
              <div className="text-center">
                <File size={44} className="mx-auto mb-4 opacity-15" />
                <p className="text-sm font-medium text-dark-muted">No file open</p>
                <p className="text-xs mt-1 text-dark-muted">Click a file to open it</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
