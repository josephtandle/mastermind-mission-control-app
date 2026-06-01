"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useDatabase, Column } from "@/hooks/useDatabase";
import { TaskCard } from "@/components/TaskCard";
import { TaskModal, TaskData } from "@/components/TaskModal";
import { Plus, AlertCircle, RefreshCw, Pencil, Trash2, X, Check, Play, Loader2, Search, ChevronDown, Settings2, FlaskConical } from "lucide-react";

type CardType = any;

const COLUMN_COLORS = [
  "slate", "blue", "purple", "green", "amber", "red", "pink", "indigo", "teal", "orange",
];

export default function TasksPage() {
  const {
    columns, cards, projects, isLoading, error,
    refresh, createCard, updateCard, moveCard, reorderCardsInColumn, deleteCard,
    createColumn, updateColumn, reorderColumns, deleteColumn, createProject, renameProject, deleteProject,
  } = useDatabase();

  const [localCards, setLocalCards] = useState<any>(cards);
  useEffect(() => { setLocalCards(cards); }, [cards]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<CardType | null>(null);
  const [newColumnId, setNewColumnId] = useState<string>("backlog");
  const [newCardPosition, setNewCardPosition] = useState<'top' | 'bottom'>('bottom');
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ cardId: string; position: 'above' | 'below' } | null>(null);
  const [dropColumnId, setDropColumnId] = useState<string | null>(null);

  // Column drag state
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);
  const [dropColumnTargetId, setDropColumnTargetId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(error);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRunningExecutor, setIsRunningExecutor] = useState(false);
  const [isClearingSamples, setIsClearingSamples] = useState(false);

  // First-visit onboarding overlay
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    const seen = localStorage.getItem("mc-tasks-onboarding-seen");
    if (!seen) setShowOnboarding(true);
  }, []);
  const dismissOnboarding = () => {
    setShowOnboarding(false);
    localStorage.setItem("mc-tasks-onboarding-seen", "1");
  };

  // Poll task-executor status
  const checkExecutorStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/task-executor");
      const data = await res.json();
      setIsRunningExecutor(data.running);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    checkExecutorStatus();
    const interval = setInterval(checkExecutorStatus, 15000);
    return () => clearInterval(interval);
  }, [checkExecutorStatus]);

  // Project filter state
  const [selectedProject, setSelectedProject] = useState<string>("All");
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const projectDropdownRef = useRef<HTMLDivElement>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const searchResults = searchQuery.trim().length > 0
    ? (localCards || []).filter((card: any) => {
        const q = searchQuery.toLowerCase();
        return (
          card.title?.toLowerCase().includes(q) ||
          card.description?.toLowerCase().includes(q) ||
          card.labels?.some((l: string) => l.toLowerCase().includes(q))
        );
      })
    : [];

  const getColumnTitle = (columnId: string) => {
    return columns.find((c) => c.id === columnId)?.title || columnId;
  };

  // Close search dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close project dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) {
        setIsProjectDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close add-list dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        addListDropdownRef.current &&
        !addListDropdownRef.current.contains(e.target as Node) &&
        addListButtonRef.current &&
        !addListButtonRef.current.contains(e.target as Node)
      ) {
        setIsAddingList(false);
        setNewListTitle("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Column editing state
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnTitle, setEditingColumnTitle] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // Add list state
  const [isAddingList, setIsAddingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState("");
  const newListInputRef = useRef<HTMLInputElement>(null);
  const addListButtonRef = useRef<HTMLButtonElement>(null);
  const addListDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setLocalError(error); }, [error]);

  useEffect(() => {
    if (editingColumnId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingColumnId]);

  useEffect(() => {
    if (isAddingList && newListInputRef.current) {
      newListInputRef.current.focus();
    }
  }, [isAddingList]);

  const getCardsByColumn = (columnId: string) => {
    if (!localCards) return [];
    return localCards
      .filter((card: any) => {
        if (card.column !== columnId) return false;
        if (selectedProject !== "All" && (card.project || "") !== selectedProject) return false;
        return true;
      })
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  const handleRunExecutor = async () => {
    try {
      const res = await fetch("/api/task-executor", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setLocalError(data.error || "Failed to start task executor");
      } else {
        setIsRunningExecutor(true);
      }
    } catch {
      setLocalError("Failed to start task executor");
    }
  };

  const handleClearSamples = async () => {
    setIsClearingSamples(true);
    try {
      const res = await fetch("/api/tasks/clear-samples", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setLocalError(data.error || "Failed to clear sample cards");
      } else {
        await refresh();
      }
    } catch {
      setLocalError("Failed to clear sample cards");
    } finally {
      setIsClearingSamples(false);
    }
  };

  const handleCreateCard = async (data: TaskData) => {
    try {
      setLocalError(null);
      if (newCardPosition === 'top') {
        // Insert at top: set order=0 and bump existing cards
        const columnCards = (localCards || [])
          .filter((c: any) => c.column === newColumnId)
          .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
        const bumpedCards = columnCards.map((c: any, i: number) => ({ ...c, order: i + 1 }));
        if (bumpedCards.length > 0) {
          await fetch("/api/db", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "reorder", cards: bumpedCards }),
          });
        }
        await createCard({
          title: data.title,
          description: data.description,
          labels: data.labels,
          priority: data.priority,
          dueDate: data.dueDate,
          project: data.project,
          model: data.model,
          column: newColumnId,
          order: 0,
        });
      } else {
        await createCard({
          title: data.title,
          description: data.description,
          labels: data.labels,
          priority: data.priority,
          dueDate: data.dueDate,
          project: data.project,
          model: data.model,
          column: newColumnId,
        });
      }
      // No refresh() — createCard already updates cards state,
      // which flows to localCards via useEffect. refresh() triggers
      // isLoading→true, causing the whole board to flash.
      setIsModalOpen(false);
      setNewColumnId("backlog");
      setNewCardPosition('bottom');
    } catch (err) {
      setLocalError("Failed to create card");
    }
  };

  const handleEditCard = async (data: TaskData) => {
    if (!editingCardId) return;
    try {
      setLocalError(null);
      await updateCard(editingCardId, {
        title: data.title,
        description: data.description,
        labels: data.labels,
        priority: data.priority,
        dueDate: data.dueDate,
        project: data.project,
        model: data.model,
      });
      setEditingCardId(null);
      setEditingCard(null);
      setIsModalOpen(false);
    } catch (err) {
      setLocalError("Failed to update card");
    }
  };

  const handleMoveToTop = async () => {
    if (!editingCardId) return;
    const card = (localCards || []).find((c: any) => c._id === editingCardId);
    if (!card) return;
    try {
      setLocalError(null);
      const columnCards = (localCards || [])
        .filter((c: any) => c.column === card.column && c._id !== editingCardId)
        .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
      const reordered = [
        { ...card, order: 0 },
        ...columnCards.map((c: any, i: number) => ({ ...c, order: i + 1 })),
      ];
      // Optimistic update — no refresh needed, keeps modal open and scroll position intact
      const orderMap = Object.fromEntries(reordered.map((c: any) => [c._id, c.order]));
      setLocalCards((prev: any) => (prev || []).map((c: any) =>
        c._id in orderMap ? { ...c, order: orderMap[c._id] } : c
      ));
      fetch("/api/db", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reorder", cards: reordered }),
      }).catch(() => setLocalError("Failed to move card to top"));
    } catch (err) {
      setLocalError("Failed to move card to top");
    }
  };

  const doMoveToDone = async (targetCardId: string) => {
    const card = (localCards || []).find((c: any) => c._id === targetCardId);
    if (!card) return;
    const doneColumn = columns.find((c) => c.title.toLowerCase() === "done");
    if (!doneColumn) { setLocalError("No 'Done' column found"); return; }
    const doneCards = (localCards || [])
      .filter((c: any) => c.column === doneColumn.id)
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
    const movedCard = { ...card, column: doneColumn.id, order: 0 };
    const bumpedCards = doneCards.map((c: any, i: number) => ({ ...c, order: i + 1 }));
    const allReordered = [movedCard, ...bumpedCards];
    const updateMap = Object.fromEntries(allReordered.map((c: any) => [c._id, c]));
    setLocalCards((prev: any) => (prev || []).map((c: any) =>
      c._id in updateMap ? updateMap[c._id] : c
    ));
    fetch("/api/db", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reorder", cards: allReordered }),
    }).catch(() => setLocalError("Failed to move card to Done"));
  };

  const handleMoveToDone = async () => {
    if (!editingCardId) return;
    try {
      setLocalError(null);
      await doMoveToDone(editingCardId);
      setEditingCardId(null);
      setEditingCard(null);
      setIsModalOpen(false);
    } catch (err) {
      setLocalError("Failed to move card to Done");
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    if (confirm("Are you sure you want to delete this card?")) {
      try {
        setLocalError(null);
        await deleteCard(cardId);
      } catch (err) {
        setLocalError("Failed to delete card");
      }
    }
  };

  // Column management
  const handleStartEditColumn = (col: Column) => {
    setEditingColumnId(col.id);
    setEditingColumnTitle(col.title);
  };

  const handleSaveColumnTitle = async () => {
    if (!editingColumnId || !editingColumnTitle.trim()) {
      setEditingColumnId(null);
      return;
    }
    try {
      setLocalError(null);
      await updateColumn(editingColumnId, { title: editingColumnTitle.trim() });
    } catch (err) {
      setLocalError("Failed to update column");
    }
    setEditingColumnId(null);
  };

  const handleDeleteColumn = async (colId: string) => {
    const cardCount = getCardsByColumn(colId).length;
    const msg = cardCount > 0
      ? `Delete this list? ${cardCount} card(s) will be moved to Backlog.`
      : "Delete this list?";
    if (confirm(msg)) {
      try {
        setLocalError(null);
        await deleteColumn(colId);
      } catch (err) {
        setLocalError("Failed to delete column");
      }
    }
  };

  const handleAddList = async () => {
    if (!newListTitle.trim()) {
      setIsAddingList(false);
      return;
    }
    try {
      setLocalError(null);
      await createColumn({ title: newListTitle.trim(), color: COLUMN_COLORS[columns.length % COLUMN_COLORS.length] });
      setNewListTitle("");
      setIsAddingList(false);
    } catch (err) {
      setLocalError("Failed to create list");
    }
  };

  // Column drag handlers
  const handleColumnDragStart = (e: React.DragEvent, columnId: string) => {
    if (draggedCardId) return; // don't interfere with card drags
    setDraggedColumnId(columnId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `col:${columnId}`);
  };

  const handleColumnHeaderDragOver = (e: React.DragEvent, columnId: string) => {
    if (!draggedColumnId || draggedColumnId === columnId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropColumnTargetId(columnId);
  };

  const handleColumnHeaderDrop = async (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    if (!draggedColumnId || draggedColumnId === columnId) return;
    const fromIndex = columns.findIndex(c => c.id === draggedColumnId);
    const toIndex = columns.findIndex(c => c.id === columnId);
    if (fromIndex === -1 || toIndex === -1) return;
    const reordered = [...columns];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setDraggedColumnId(null);
    setDropColumnTargetId(null);
    try {
      await reorderColumns(reordered);
    } catch {
      setLocalError("Failed to reorder lists");
    }
  };

  const handleColumnHeaderDragEnd = () => {
    setDraggedColumnId(null);
    setDropColumnTargetId(null);
  };

  // Card drag handlers
  const handleDragStart = (e: React.DragEvent, cardId: string) => {
    setDraggedCardId(cardId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", cardId);
    const ghost = document.createElement('div');
    ghost.style.width = '1px';
    ghost.style.height = '1px';
    ghost.style.opacity = '0.01';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    requestAnimationFrame(() => document.body.removeChild(ghost));
  };

  const handleDragEnd = () => {
    setDraggedCardId(null);
    setDropTarget(null);
    setDropColumnId(null);
  };

  const handleColumnDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropColumnId(columnId);
  };

  const handleColumnDrop = async (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    if (!draggedCardId) return;
    if (dropTarget) {
      try {
        setLocalError(null);
        await reorderCardsInColumn(draggedCardId, dropTarget.cardId, dropTarget.position);
      } catch (err) {
        setLocalError("Failed to move card");
      }
    } else {
      try {
        setLocalError(null);
        await moveCard(draggedCardId, columnId);
      } catch (err) {
        setLocalError("Failed to move card");
      }
    }
    setDraggedCardId(null);
    setDropTarget(null);
    setDropColumnId(null);
  };

  const handleColumnDragLeave = (e: React.DragEvent, columnId: string) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      if (dropColumnId === columnId) {
        setDropColumnId(null);
        setDropTarget(null);
      }
    }
  };

  const handleCardDragOver = (e: React.DragEvent, cardId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedCardId || draggedCardId === cardId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const position: 'above' | 'below' = y < rect.height / 2 ? 'above' : 'below';
    setDropTarget(prev => {
      if (prev?.cardId === cardId && prev?.position === position) return prev;
      return { cardId, position };
    });
  };

  const handleCardDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropTarget(null);
    }
  };

  const handleOpenNewCard = (columnId: string, position: 'top' | 'bottom' = 'bottom') => {
    setEditingCardId(null);
    setEditingCard(null);
    setNewColumnId(columnId);
    setNewCardPosition(position);
    setIsModalOpen(true);
  };

  const handleOpenEditCard = (card: CardType) => {
    setEditingCard(card);
    setEditingCardId(card._id);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingCardId(null);
    setEditingCard(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="inline-block p-3 rounded-lg bg-cm-purple/20 mb-3">
            <span className="text-2xl">...</span>
          </div>
          <p className="text-dark-muted">Loading tasks...</p>
        </div>
      </div>
    );
  }


  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      {/* First-visit onboarding overlay */}
      {showOnboarding && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-lg mx-4 bg-dark-panel border border-dark-border rounded-2xl p-8 shadow-2xl">
            <button onClick={dismissOnboarding} className="absolute top-4 right-4 text-dark-muted hover:text-dark-text">
              <X size={20} />
            </button>
            <h2 className="text-xl font-bold text-dark-text mb-4">Welcome to your Task Board</h2>
            <div className="space-y-3 text-sm text-dark-muted leading-relaxed">
              <p className="text-dark-text font-medium">This is your command center for managing work between you and the AI.</p>
              <div className="space-y-2">
                <p><span className="text-cm-purple font-medium">Columns</span> represent stages of work. Drag cards between them to update status. You can add, rename, or reorder columns.</p>
                <p><span className="text-cm-purple font-medium">Cards</span> are individual tasks. Double-click any card to edit its title, description, project, and priority.</p>
                <p><span className="text-cm-purple font-medium">AI (Auto Execute)</span> is special: the AI agent monitors this column and automatically picks up tasks to execute on a schedule.</p>
                <p><span className="text-cm-purple font-medium">Human Must Do</span> is where the AI places tasks it cannot handle on its own, things that need your personal action.</p>
                <p><span className="text-cm-purple font-medium">Projects</span> let you group related cards together. Filter by project using the dropdown in the header. Manage projects in the Projects tab.</p>
              </div>
              <div className="pt-3 border-t border-dark-border">
                <p className="text-xs text-dark-muted">Sample cards are pre-loaded to show you how things work. Use the "Clear Sample Cards" button to remove them when you're ready to start fresh.</p>
              </div>
            </div>
            <button
              onClick={dismissOnboarding}
              className="mt-6 w-full py-2.5 bg-cm-purple text-white font-medium rounded-lg hover:bg-cm-purple/90 transition-colors"
            >
              Got it, let's go
            </button>
          </div>
        </div>
      )}

      {/* Header with Search & Refresh */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold tracking-tight text-dark-text shrink-0">Task Board</h2>

        {/* Search Bar */}
        <div ref={searchRef} className="relative flex-1 min-w-[160px] max-w-md">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setSearchQuery("");
                  setIsSearchFocused(false);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder="Search cards..."
              className="w-full pl-9 pr-8 py-1.5 text-sm bg-dark-panel2 border border-dark-border rounded-lg outline-none focus:bg-dark-panel focus:border-cm-purple focus:ring-2 focus:ring-cm-purple/20 transition-all placeholder:text-dark-muted text-dark-text"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(""); setIsSearchFocused(false); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-dark-muted hover:text-dark-text"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Search Results Dropdown */}
          {isSearchFocused && searchQuery.trim().length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-dark-panel2 border border-dark-border rounded-lg shadow-lg shadow-black/30 z-50 max-h-80 overflow-y-auto">
              {searchResults.length === 0 ? (
                <div className="px-4 py-3 text-sm text-dark-muted">No cards found</div>
              ) : (
                <>
                  <div className="px-3 py-2 text-xs text-dark-muted font-medium border-b border-dark-border">
                    {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                  </div>
                  {searchResults.map((card: any) => (
                    <button
                      key={card._id}
                      onClick={() => {
                        handleOpenEditCard(card);
                        setSearchQuery("");
                        setIsSearchFocused(false);
                      }}
                      className="w-full text-left px-3 py-2.5 hover:bg-cm-purple/10 transition-colors border-b border-dark-border last:border-0"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-dark-text truncate">{card.title}</p>
                          {card.description && (
                            <p className="text-xs text-dark-muted truncate mt-0.5">{card.description}</p>
                          )}
                        </div>
                        <span className="shrink-0 px-2 py-0.5 text-xs bg-dark-panel2 text-dark-muted rounded font-medium">
                          {getColumnTitle(card.column)}
                        </span>
                      </div>
                      {card.labels?.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {card.labels.slice(0, 3).map((label: string) => (
                            <span key={label} className="px-1.5 py-0.5 text-[10px] bg-dark-panel2 text-dark-muted rounded">
                              {label}
                            </span>
                          ))}
                          {card.labels.length > 3 && (
                            <span className="text-[10px] text-dark-muted">+{card.labels.length - 3}</span>
                          )}
                        </div>
                      )}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Project filter */}
        <div className="relative shrink-0" ref={projectDropdownRef}>
          <button
            onClick={() => setIsProjectDropdownOpen(v => !v)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-dark-panel2 border border-dark-border rounded-lg outline-none hover:border-cm-purple/50 focus:border-cm-purple text-dark-text transition-colors"
          >
            <span>{selectedProject === "All" ? "All Projects" : selectedProject}</span>
            <ChevronDown size={14} className="text-dark-muted" />
          </button>
          {isProjectDropdownOpen && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-dark-panel2 border border-dark-border rounded-lg shadow-xl shadow-black/40 min-w-[180px] py-1">
              <button
                onClick={() => { setSelectedProject("All"); setIsProjectDropdownOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-cm-purple/10 ${selectedProject === "All" ? "text-dark-text font-medium" : "text-dark-muted"}`}
              >
                {selectedProject === "All" ? <Check size={14} className="text-cm-purple shrink-0" /> : <span className="w-3.5 shrink-0" />}
                All Projects
              </button>
              {projects.map((p) => (
                <button
                  key={p}
                  onClick={() => { setSelectedProject(p); setIsProjectDropdownOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-cm-purple/10 ${selectedProject === p ? "text-dark-text font-medium" : "text-dark-muted"}`}
                >
                  {selectedProject === p ? <Check size={14} className="text-cm-purple shrink-0" /> : <span className="w-3.5 shrink-0" />}
                  {p}
                </button>
              ))}
              <div className="border-t border-dark-border mt-1 pt-1">
                <Link
                  href="/app/tasks/projects"
                  onClick={() => setIsProjectDropdownOpen(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-dark-muted hover:text-cm-purple hover:bg-cm-purple/10 transition-colors"
                >
                  <Settings2 size={14} className="shrink-0" />
                  Manage Projects
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto shrink-0">
          {(localCards || []).some((c: any) => c.tags?.includes("sample")) && (
            <button
              onClick={handleClearSamples}
              disabled={isClearingSamples}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-dark-panel2 border border-dark-border text-dark-muted hover:text-dark-danger hover:border-dark-danger rounded-lg transition-colors disabled:opacity-50"
              title="Remove all sample cards from the board"
            >
              <FlaskConical size={14} />
              <span className="hidden sm:inline">{isClearingSamples ? "Clearing..." : "Clear Sample Cards"}</span>
            </button>
          )}
          <div className="relative">
            <button
              ref={addListButtonRef}
              onClick={() => { setIsAddingList((v) => !v); setNewListTitle(""); }}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-white bg-cm-purple hover:bg-cm-purple/80 rounded-lg transition-colors"
              title="Add a new list"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">New List</span>
            </button>
            {isAddingList && (
              <div ref={addListDropdownRef} className="absolute right-0 top-full mt-2 z-50 bg-dark-panel2 border border-dark-border rounded-lg shadow-xl shadow-black/40 p-3 w-56">
                <p className="text-xs font-semibold text-dark-muted uppercase tracking-wide mb-2">New List</p>
                <input
                  ref={newListInputRef}
                  type="text"
                  value={newListTitle}
                  onChange={(e) => setNewListTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddList();
                    if (e.key === 'Escape') { setIsAddingList(false); setNewListTitle(""); }
                  }}
                  placeholder="List name..."
                  className="w-full px-3 py-1.5 text-sm border border-dark-border rounded-lg outline-none focus:border-cm-purple focus:ring-2 focus:ring-cm-purple/20 mb-2 bg-dark-panel text-dark-text placeholder:text-dark-muted"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAddList}
                    className="flex-1 px-3 py-1.5 text-sm bg-cm-purple text-white rounded-lg hover:bg-cm-purple/80 transition-colors"
                  >
                    Add List
                  </button>
                  <button
                    onClick={() => { setIsAddingList(false); setNewListTitle(""); }}
                    className="px-3 py-1.5 text-sm text-dark-muted hover:bg-dark-panel2 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-dark-text bg-dark-panel2 hover:bg-dark-border rounded-lg transition-colors disabled:opacity-50"
            title="Refresh board"
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={handleRunExecutor}
            disabled={isRunningExecutor}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-white bg-dark-success/80 hover:bg-dark-success rounded-lg transition-colors disabled:opacity-70"
            title="Run Task Executor on Claude Code To Do tasks"
          >
            {isRunningExecutor ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Play size={16} />
            )}
            <span className="hidden sm:inline">{isRunningExecutor ? "Running..." : "Run Task Executor"}</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {localError && (
        <div className="flex items-center gap-3 p-4 bg-dark-danger/10 border border-dark-danger/30 rounded-lg">
          <AlertCircle size={20} className="text-dark-danger" />
          <p className="text-sm text-dark-danger">{localError}</p>
          <button onClick={() => setLocalError(null)} className="ml-auto text-dark-danger hover:text-dark-danger">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Kanban Board */}
      <div className="flex gap-5 overflow-x-auto pb-4 flex-1 min-h-0">
        {columns.map((column) => (
          <div
            key={column.id}
            className={`flex flex-col shrink-0 w-72 transition-opacity duration-150 ${draggedColumnId === column.id ? 'opacity-40' : ''} ${dropColumnTargetId === column.id && draggedColumnId ? 'ring-2 ring-cm-purple ring-offset-2 ring-offset-dark-bg rounded-lg' : ''}`}
            onDragOver={(e) => { if (draggedColumnId) handleColumnHeaderDragOver(e, column.id); }}
            onDrop={(e) => { if (draggedColumnId) handleColumnHeaderDrop(e, column.id); }}
          >
            {/* Column Header */}
            <div className="flex items-center justify-between mb-4 group">
              {editingColumnId === column.id ? (
                <div className="flex items-center gap-1 flex-1">
                  <input
                    ref={editInputRef}
                    value={editingColumnTitle}
                    onChange={(e) => setEditingColumnTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveColumnTitle();
                      if (e.key === 'Escape') setEditingColumnId(null);
                    }}
                    className="font-semibold text-dark-text bg-dark-panel border border-cm-purple rounded px-2 py-0.5 text-sm w-full outline-none focus:ring-2 focus:ring-cm-purple/30"
                  />
                  <button onClick={handleSaveColumnTitle} className="p-1 text-dark-success hover:bg-dark-success/10 rounded">
                    <Check size={14} />
                  </button>
                  <button onClick={() => setEditingColumnId(null)} className="p-1 text-dark-muted hover:bg-dark-panel2 rounded">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <h3
                    className="font-semibold tracking-tight text-dark-text cursor-grab active:cursor-grabbing hover:text-cm-purple transition-colors select-none"
                    draggable
                    onDragStart={(e) => handleColumnDragStart(e, column.id)}
                    onDragEnd={handleColumnHeaderDragEnd}
                    onDoubleClick={() => handleStartEditColumn(column)}
                    title="Drag to reorder · Double-click to rename"
                  >
                    {column.title}
                  </h3>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-dark-muted font-medium">
                      {getCardsByColumn(column.id).length}
                    </span>
                    <button
                      onClick={() => handleStartEditColumn(column)}
                      className="w-6 h-6 flex items-center justify-center rounded-md text-dark-muted hover:text-cm-purple hover:bg-cm-purple/10 transition-colors opacity-0 group-hover:opacity-100"
                      title="Edit column name"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => handleDeleteColumn(column.id)}
                      className="w-6 h-6 flex items-center justify-center rounded-md text-dark-muted hover:text-dark-danger hover:bg-dark-danger/10 transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete column"
                    >
                      <Trash2 size={12} />
                    </button>
                    <button
                      onClick={() => handleOpenNewCard(column.id, 'top')}
                      className="w-6 h-6 flex items-center justify-center rounded-md text-dark-muted hover:text-cm-purple hover:bg-cm-purple/10 transition-colors"
                      title={`Add card to top of ${column.title}`}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Drop Zone */}
            <div
              onDragOver={(e) => handleColumnDragOver(e, column.id)}
              onDragLeave={(e) => handleColumnDragLeave(e, column.id)}
              onDrop={(e) => handleColumnDrop(e, column.id)}
              className={`
                flex-1 min-h-0 overflow-y-auto space-y-3 p-4 rounded-lg transition-colors duration-150
                ${dropColumnId === column.id && draggedCardId
                  ? 'bg-cm-purple/10 border-2 border-cm-purple border-dashed'
                  : 'bg-dark-bg border-2 border-dark-border'
                }
              `}
            >
              {getCardsByColumn(column.id).length === 0 && draggedCardId && (
                <div className="flex items-center justify-center h-24 border-2 border-dashed border-cm-purple/30 rounded-lg bg-cm-purple/5">
                  <p className="text-sm text-cm-purple font-medium">Drop here</p>
                </div>
              )}

              {getCardsByColumn(column.id).map((card: any, cardIdx: number) => (
                <div
                  key={card._id ?? `${column.id}-${cardIdx}`}
                  className="relative"
                  onDragOver={(e) => handleCardDragOver(e, card._id)}
                  onDragLeave={handleCardDragLeave}
                >
                  {dropTarget?.cardId === card._id && dropTarget?.position === 'above' && (
                    <div className="absolute -top-[7px] left-0 right-0 z-30 pointer-events-none flex items-center">
                      <div className="w-3 h-3 rounded-full bg-cm-purple -ml-1.5 shrink-0" />
                      <div className="flex-1 h-[3px] bg-cm-purple rounded-full" />
                      <div className="w-3 h-3 rounded-full bg-cm-purple -mr-1.5 shrink-0" />
                    </div>
                  )}

                  <div className={`transition-opacity duration-150 ${card._id === draggedCardId ? 'opacity-20' : ''}`}>
                    <TaskCard
                      id={card._id}
                      title={card.title}
                      description={card.description}
                      labels={card.labels}
                      priority={card.priority}
                      dueDate={card.dueDate}
                      project={card.project}
                      allProjects={projects}
                      executorStatus={card.executorStatus}
                      executorLog={(card as any).executorLog}
                      onEdit={() => handleOpenEditCard(card)}
                      onDelete={() => handleDeleteCard(card._id)}
                      onClearStatus={() => updateCard(card._id, { executorStatus: null, executorLog: null } as any)}
                      onMoveToDone={() => doMoveToDone(card._id)}
                      onDoubleClick={() => handleOpenEditCard(card)}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, card._id)}
                      onDragEnd={handleDragEnd}
                    />
                  </div>

                  {dropTarget?.cardId === card._id && dropTarget?.position === 'below' && (
                    <div className="absolute -bottom-[7px] left-0 right-0 z-30 pointer-events-none flex items-center">
                      <div className="w-3 h-3 rounded-full bg-cm-purple -ml-1.5 shrink-0" />
                      <div className="flex-1 h-[3px] bg-cm-purple rounded-full" />
                      <div className="w-3 h-3 rounded-full bg-cm-purple -mr-1.5 shrink-0" />
                    </div>
                  )}
                </div>
              ))}

              <button
                onClick={() => handleOpenNewCard(column.id)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-dark-muted hover:bg-dark-panel hover:shadow-sm rounded-lg transition-all border-2 border-dashed border-dark-border hover:border-cm-purple"
              >
                <Plus size={18} />
                <span className="text-sm font-medium">Add Card</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Task Modal */}
      <TaskModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSave={editingCardId ? handleEditCard : handleCreateCard}
        onMoveToTop={editingCardId ? handleMoveToTop : undefined}
        onMoveToDone={editingCardId ? handleMoveToDone : undefined}
        cardId={editingCardId || undefined}
        executorStatus={editingCard?.executorStatus}
        projects={projects}
        onCreateProject={createProject}
        onRenameProject={renameProject}
        onDeleteProject={deleteProject}
        initialData={
          editingCard ? {
            title: editingCard.title,
            description: editingCard.description,
            labels: editingCard.labels,
            priority: editingCard.priority,
            dueDate: editingCard.dueDate,
            model: editingCard.model,
            project: editingCard.project,
          } : undefined
        }
      />
    </div>
  );
}
