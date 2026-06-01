import { useState, useEffect, useRef } from "react";

const LAST_USED_KEY = 'mc-last-used-projects';
function getLastUsedProjects(): string[] {
  try { return JSON.parse(localStorage.getItem(LAST_USED_KEY) || '[]').slice(0, 2); } catch { return []; }
}
function pushLastUsedProject(project: string) {
  const cur = getLastUsedProjects();
  const next = [project, ...cur.filter(p => p !== project)].slice(0, 2);
  try { localStorage.setItem(LAST_USED_KEY, JSON.stringify(next)); } catch {}
}
import { X, ArrowUpToLine, CheckCircle2, Copy, Check, Tag, Calendar, Cpu, Flag, FolderOpen, Plus, ChevronDown, Trash2, Pencil, Play, Loader2, AlertCircle } from "lucide-react";

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: TaskData) => void;
  initialData?: TaskData;
  onMoveToTop?: () => void;
  onMoveToDone?: () => void;
  cardId?: string;
  executorStatus?: string;
  projects?: string[];
  onCreateProject?: (name: string) => Promise<void>;
  onRenameProject?: (oldName: string, newName: string) => Promise<void>;
  onDeleteProject?: (name: string) => Promise<void>;
}

export interface TaskData {
  title: string;
  description: string;
  labels: string[];
  priority: "Low" | "Med" | "High";
  dueDate?: string;
  model?: string;
  project?: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  Low: "bg-dark-success/20 text-dark-success border-dark-success/30",
  Med: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  High: "bg-dark-danger/20 text-dark-danger border-dark-danger/30",
};

export function TaskModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  onMoveToTop,
  onMoveToDone,
  cardId,
  executorStatus: initialExecStatus,
  projects = [],
  onCreateProject,
  onRenameProject,
  onDeleteProject,
}: TaskModalProps) {
  const [copied, setCopied] = useState(false);
  const [labelInput, setLabelInput] = useState("");
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState("");
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [lastUsedProjects, setLastUsedProjects] = useState<string[]>([]);
  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const projectSearchRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState<TaskData>(
    initialData || {
      title: "",
      description: "",
      labels: [],
      priority: "Low",
      dueDate: "",
      model: "sonnet",
      project: "",
    }
  );
  const [executing, setExecuting] = useState(false);
  const [execStatus, setExecStatus] = useState<string | undefined>(initialExecStatus);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setExecStatus(initialExecStatus);
  }, [initialExecStatus]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Initialize the form only when the modal opens or switches to a different card,
  // never on incidental parent re-renders (status poll, 30s auto-refresh, Move to
  // Top/Done). The parent rebuilds `initialData` as a new object literal on every
  // render, so depending on it directly would wipe an in-progress edit. A ref keyed
  // on the open-session identity guards against that.
  const initializedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      initializedKeyRef.current = null;
      return;
    }
    const key = cardId ?? "__new__";
    if (initializedKeyRef.current === key) return;
    initializedKeyRef.current = key;

    if (initialData) {
      setFormData({ ...initialData, labels: initialData.labels ?? [] });
    } else {
      setFormData({
        title: "",
        description: "",
        labels: [],
        priority: "Low",
        dueDate: "",
        model: "sonnet",
        project: "",
      });
      setLabelInput("");
      setIsAddingProject(false);
      setNewProjectName("");
    }
    setTimeout(() => titleRef.current?.focus(), 50);
  }, [isOpen, cardId, initialData]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleEscape);
      return () => window.removeEventListener("keydown", handleEscape);
    }
    return undefined;
  }, [isOpen, onClose]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) {
        setProjectDropdownOpen(false);
      }
    };
    if (projectDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
    return undefined;
  }, [projectDropdownOpen]);

  if (!isOpen) return null;

  const handleAddLabel = () => {
    const val = labelInput.trim();
    if (val && !formData.labels.includes(val)) {
      setFormData({ ...formData, labels: [...formData.labels, val] });
      setLabelInput("");
    }
  };

  const handleRemoveLabel = (label: string) => {
    setFormData({ ...formData, labels: formData.labels.filter((l) => l !== label) });
  };

  const handleSave = () => {
    if (formData.title.trim()) {
      onSave(formData);
      onClose();
    }
  };

  const handleCopyId = () => {
    if (cardId) {
      navigator.clipboard.writeText(`In reference to the Task Card ${cardId}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  async function handleExecute() {
    if (!cardId || executing) return;
    setExecuting(true);
    setExecStatus("running");
    try {
      const res = await fetch(`/api/tasks/${cardId}/execute`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        setExecStatus("error");
        setExecuting(false);
        alert(`Failed to start: ${err.error}`);
        return;
      }
      // Poll every 3s until status is no longer "running"
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/db?id=${encodeURIComponent(cardId)}`);
          const card = await r.json();
          const status = card?.executorStatus;
          setExecStatus(status);
          if (status && status !== "running") {
            clearInterval(pollRef.current!);
            setExecuting(false);
          }
        } catch {
          /* ignore poll errors */
        }
      }, 3000);
    } catch {
      setExecStatus("error");
      setExecuting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-dark-panel rounded-2xl w-full max-w-5xl h-[88vh] flex flex-col shadow-2xl shadow-black/40 overflow-hidden border border-dark-border">

        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-dark-border shrink-0">
          <span className="text-xs font-semibold tracking-widest text-dark-muted uppercase">
            {initialData ? "Edit Task" : "New Task"}
          </span>
          <div className="flex items-center gap-3">
            {cardId && (
              <button
                onClick={handleCopyId}
                className="flex items-center gap-1.5 text-xs text-dark-muted hover:text-dark-text font-mono transition-colors group"
                title="Copy card ID"
              >
                {cardId}
                {copied
                  ? <Check size={12} className="text-dark-success" />
                  : <Copy size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                }
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-dark-panel2 transition-colors"
            >
              <X size={20} className="text-dark-muted" />
            </button>
          </div>
        </div>

        {/* Body: two columns */}
        <div className="flex flex-1 min-h-0">

          {/* Left: Title + Description */}
          <div className="flex flex-col flex-1 min-w-0 p-8 gap-4 border-r border-dark-border">
            {/* Title */}
            <input
              ref={titleRef}
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full text-2xl font-bold text-dark-text placeholder-dark-muted border-0 outline-none focus:ring-0 bg-transparent leading-tight"
              placeholder="Task title…"
            />

            {/* Description */}
            <div className="flex flex-col flex-1 min-h-0">
              <label className="text-xs font-semibold text-dark-muted uppercase tracking-widest mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="flex-1 w-full px-4 py-3 text-sm text-dark-text leading-relaxed bg-dark-panel2 border border-dark-border rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-cm-purple transition-colors placeholder:text-dark-muted"
                placeholder="Add a description, context, or instructions… (markdown supported)"
              />
            </div>

            {/* Labels */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-dark-muted uppercase tracking-widest mb-2">
                <Tag size={12} /> Labels
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddLabel(); } }}
                  className="flex-1 px-3 py-1.5 text-sm border border-dark-border rounded-lg bg-dark-panel2 text-dark-text focus:outline-none focus:ring-2 focus:ring-cm-purple"
                  placeholder="Add label and press Enter…"
                />
                <button
                  onClick={handleAddLabel}
                  className="px-3 py-1.5 text-sm bg-dark-panel2 text-dark-text rounded-lg hover:bg-cm-purple/10 transition-colors"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {formData.labels.map((label) => (
                  <span
                    key={label}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-cm-purple/10 text-cm-purple border border-cm-purple/20 text-xs rounded-full"
                  >
                    {label}
                    <button onClick={() => handleRemoveLabel(label)} className="hover:text-dark-danger transition-colors">
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Metadata sidebar */}
          <div className="w-72 shrink-0 flex flex-col p-6 gap-6 overflow-y-auto bg-dark-panel2/60">

            {/* Priority */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-dark-muted uppercase tracking-widest mb-3">
                <Flag size={12} /> Priority
              </label>
              <div className="flex gap-2">
                {(["Low", "Med", "High"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setFormData({ ...formData, priority: p })}
                    className={`flex-1 py-2 text-sm font-medium border rounded-lg transition-colors ${
                      formData.priority === p
                        ? PRIORITY_COLORS[p] + " ring-2 ring-offset-1 ring-offset-dark-panel2 " + (p === "High" ? "ring-red-500/50" : p === "Med" ? "ring-amber-500/50" : "ring-dark-muted/30")
                        : "bg-dark-panel text-dark-muted border-dark-border hover:bg-dark-panel2"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Due Date */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-dark-muted uppercase tracking-widest mb-3">
                <Calendar size={12} /> Due Date
              </label>
              <input
                type="date"
                value={formData.dueDate || ""}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-dark-border rounded-lg bg-dark-panel2 text-dark-text focus:outline-none focus:ring-2 focus:ring-cm-purple"
              />
            </div>

            {/* AI Model */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-dark-muted uppercase tracking-widest mb-3">
                <Cpu size={12} /> AI Model
              </label>
              <select
                value={formData.model || "sonnet"}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-dark-border rounded-lg bg-dark-panel2 text-dark-text focus:outline-none focus:ring-2 focus:ring-cm-purple"
              >
                <option value="sonnet">Sonnet (Default)</option>
                <option value="haiku">Haiku (Faster, lighter tasks)</option>
              </select>
            </div>

            {/* Project */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-dark-muted uppercase tracking-widest mb-3">
                <FolderOpen size={12} /> Project
              </label>
              <div ref={projectDropdownRef} className="relative">
                {/* Trigger */}
                <button
                  type="button"
                  onClick={() => {
                    const opening = !projectDropdownOpen;
                    setProjectDropdownOpen(opening);
                    setIsAddingProject(false);
                    setNewProjectName('');
                    if (opening) {
                      setProjectSearch('');
                      setLastUsedProjects(getLastUsedProjects());
                      setTimeout(() => projectSearchRef.current?.focus(), 30);
                    }
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm border border-dark-border rounded-lg bg-dark-panel2 hover:border-cm-purple focus:outline-none focus:ring-2 focus:ring-cm-purple transition-colors"
                >
                  <span className={formData.project ? "text-dark-text" : "text-dark-muted"}>
                    {formData.project || "No project"}
                  </span>
                  <ChevronDown size={14} className="text-dark-muted shrink-0" />
                </button>

                {/* Dropdown */}
                {projectDropdownOpen && (() => {
                  const q = projectSearch.toLowerCase();
                  const validLastUsed = lastUsedProjects.filter(p => projects.includes(p) && p.toLowerCase().includes(q));
                  const lastUsedSet = new Set(validLastUsed);
                  const rest = projects
                    .filter(p => !lastUsedSet.has(p) && p.toLowerCase().includes(q))
                    .sort((a, b) => a.localeCompare(b));
                  const showNoProject = !q || 'no project'.includes(q);

                  const renderProjectRow = (p: string) => (
                    <div
                      key={p}
                      className={`group flex items-center gap-1 px-3 py-1.5 transition-colors hover:bg-cm-purple/10 ${formData.project === p ? "bg-cm-purple/10" : ""}`}
                    >
                      {editingProject === p ? (
                        <>
                          <input
                            type="text"
                            value={editingProjectName}
                            onChange={(e) => setEditingProjectName(e.target.value)}
                            onKeyDown={async (e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const newName = editingProjectName.trim();
                                if (newName && newName !== p && onRenameProject) {
                                  await onRenameProject(p, newName);
                                  if (formData.project === p) setFormData({ ...formData, project: newName });
                                }
                                setEditingProject(null);
                              }
                              if (e.key === "Escape") setEditingProject(null);
                            }}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 px-2 py-0.5 text-sm border border-cm-purple rounded bg-dark-panel text-dark-text focus:outline-none"
                          />
                          <button type="button" onClick={async (e) => {
                            e.stopPropagation();
                            const newName = editingProjectName.trim();
                            if (newName && newName !== p && onRenameProject) {
                              await onRenameProject(p, newName);
                              if (formData.project === p) setFormData({ ...formData, project: newName });
                            }
                            setEditingProject(null);
                          }} className="p-1 bg-cm-purple text-white rounded hover:bg-purple2 transition-colors shrink-0">
                            <Check size={11} />
                          </button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); setEditingProject(null); }} className="p-1 text-dark-muted hover:bg-dark-panel2 rounded transition-colors shrink-0">
                            <X size={11} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => { setFormData({ ...formData, project: p }); pushLastUsedProject(p); setProjectDropdownOpen(false); }}
                            className={`flex-1 text-left text-sm py-0.5 ${formData.project === p ? "text-cm-purple font-medium" : "text-dark-text"}`}
                          >
                            {p}
                          </button>
                          {onRenameProject && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); setEditingProject(p); setEditingProjectName(p); }}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded text-dark-muted hover:text-cm-purple hover:bg-cm-purple/10 transition-all shrink-0" title={`Rename "${p}"`}>
                              <Pencil size={11} />
                            </button>
                          )}
                          {onDeleteProject && (
                            <button type="button" onClick={async (e) => {
                              e.stopPropagation();
                              if (confirm(`Delete project "${p}"? Cards assigned to it will have no project.`)) {
                                await onDeleteProject(p);
                                if (formData.project === p) setFormData({ ...formData, project: "" });
                              }
                            }} className="opacity-0 group-hover:opacity-100 p-1 rounded text-dark-muted hover:text-dark-danger hover:bg-dark-danger/10 transition-all shrink-0" title={`Delete "${p}"`}>
                              <Trash2 size={11} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  );

                  return (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-dark-panel2 border border-dark-border rounded-lg shadow-lg shadow-black/30 z-50 overflow-hidden">
                    {/* Search */}
                    <div className="px-2 pt-2 pb-1">
                      <input
                        ref={projectSearchRef}
                        type="text"
                        value={projectSearch}
                        onChange={e => setProjectSearch(e.target.value)}
                        placeholder="Search projects…"
                        className="w-full px-2.5 py-1.5 text-sm bg-dark-panel border border-dark-border rounded-md text-dark-text placeholder-dark-muted/50 focus:outline-none focus:border-cm-purple"
                      />
                    </div>

                    <div className="max-h-56 overflow-y-auto">
                      {/* No project */}
                      {showNoProject && (
                        <button type="button"
                          onClick={() => { setFormData({ ...formData, project: "" }); setProjectDropdownOpen(false); }}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-cm-purple/10 ${!formData.project ? "text-dark-muted font-medium" : "text-dark-muted"}`}
                        >
                          No project
                        </button>
                      )}

                      {/* Last used */}
                      {validLastUsed.length > 0 && validLastUsed.map(p => renderProjectRow(p))}

                      {/* Divider between last-used and rest */}
                      {validLastUsed.length > 0 && rest.length > 0 && (
                        <div className="mx-3 my-1 border-t border-dark-border" />
                      )}

                      {/* Alphabetical rest */}
                      {rest.map(p => renderProjectRow(p))}

                      {/* Empty state */}
                      {validLastUsed.length === 0 && rest.length === 0 && !showNoProject && (
                        <p className="px-3 py-3 text-sm text-dark-muted/50 text-center">No matches</p>
                      )}
                    </div>

                    {/* Add new project — hidden while searching */}
                    {!projectSearch && (isAddingProject ? (
                      <div className="flex items-center gap-1.5 px-3 py-2 border-t border-dark-border">
                        <input
                          type="text"
                          value={newProjectName}
                          onChange={(e) => setNewProjectName(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const name = newProjectName.trim();
                              if (name && onCreateProject) {
                                await onCreateProject(name);
                                setFormData({ ...formData, project: name });
                              }
                              setIsAddingProject(false);
                              setNewProjectName("");
                              setProjectDropdownOpen(false);
                            }
                            if (e.key === "Escape") {
                              setIsAddingProject(false);
                              setNewProjectName("");
                            }
                          }}
                          autoFocus
                          placeholder="Project name…"
                          className="flex-1 px-2 py-1 text-sm border border-cm-purple rounded bg-dark-panel text-dark-text focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            const name = newProjectName.trim();
                            if (name && onCreateProject) {
                              await onCreateProject(name);
                              setFormData({ ...formData, project: name });
                            }
                            setIsAddingProject(false);
                            setNewProjectName("");
                            setProjectDropdownOpen(false);
                          }}
                          className="p-1 bg-cm-purple text-white rounded hover:bg-purple2 transition-colors"
                        >
                          <Check size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => { setIsAddingProject(false); setNewProjectName(""); }}
                          className="p-1 text-dark-muted hover:bg-dark-panel2 rounded transition-colors"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsAddingProject(true)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-cm-purple hover:bg-cm-purple/10 border-t border-dark-border transition-colors"
                      >
                        <Plus size={13} /> New project
                      </button>
                    ))}
                  </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-8 py-4 border-t border-dark-border bg-dark-panel shrink-0">
          <div className="flex items-center gap-2">
            {onMoveToTop && (
              <button
                onClick={onMoveToTop}
                className="flex items-center gap-2 px-3 py-2 text-sm text-dark-muted border border-dark-border rounded-lg hover:bg-dark-warn/10 hover:text-dark-warn hover:border-dark-warn/30 transition-colors"
                title="Move this card to the top of its list"
              >
                <ArrowUpToLine size={15} />
                Move to Top
              </button>
            )}
            {onMoveToDone && (
              <button
                onClick={onMoveToDone}
                className="flex items-center gap-2 px-3 py-2 text-sm text-dark-muted border border-dark-border rounded-lg hover:bg-dark-success/10 hover:text-dark-success hover:border-dark-success/30 transition-colors"
                title="Move this card to the top of Done"
              >
                <CheckCircle2 size={15} />
                Move to Done
              </button>
            )}
            {cardId && (
              <button
                onClick={handleExecute}
                disabled={executing}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  execStatus === "completed"
                    ? "bg-dark-success/15 text-dark-success border border-dark-success/30 cursor-default"
                    : execStatus === "needs-attention" || execStatus === "error"
                    ? "bg-dark-danger/15 text-dark-danger border border-dark-danger/30"
                    : executing
                    ? "bg-cm-purple/15 text-cm-purple border border-cm-purple/30 cursor-wait"
                    : "bg-dark-panel2 border border-dark-border text-dark-muted hover:text-dark-text hover:border-cm-purple/40"
                }`}
                title="Execute this task using the Task Executor"
              >
                {executing ? (
                  <><Loader2 size={13} className="animate-spin" /> Running...</>
                ) : execStatus === "completed" ? (
                  <><Check size={13} /> Done</>
                ) : execStatus === "needs-attention" || execStatus === "error" ? (
                  <><AlertCircle size={13} /> Failed</>
                ) : (
                  <><Play size={13} /> Execute Task</>
                )}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-dark-muted border border-dark-border rounded-lg hover:bg-dark-panel2 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!formData.title.trim()}
              className="px-5 py-2 text-sm font-semibold bg-cm-purple text-white rounded-lg hover:bg-purple2 disabled:opacity-40 transition-colors"
            >
              Save Task
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
