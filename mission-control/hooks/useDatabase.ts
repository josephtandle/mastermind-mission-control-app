import { useState, useEffect, useCallback } from 'react';

export interface Column {
  id: string;
  title: string;
  color: string;
}

export interface Card {
  _id: string;
  title: string;
  description: string;
  labels: string[];
  priority: 'Low' | 'Med' | 'High';
  column: string;
  dueDate?: string;
  project?: string;
  model?: string;
  executorStatus?: 'running' | 'completed' | 'needs-attention' | null;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectMeta {
  description: string;
  monetizationLevel: 'High' | 'Medium' | 'Low';
  dueDate?: string;
  status?: 'Active' | 'Completed' | 'Hidden';
  monthlyIncome?: number;
  timeToIncome?: 'Immediate' | 'Short-term' | 'Medium' | 'Long';
  timeSaved?: 'High' | 'Medium' | 'Low';
}

export function useDatabase() {
  const [columns, setColumns] = useState<Column[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [projectMeta, setProjectMeta] = useState<Record<string, ProjectMeta>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/db');
      if (!response.ok) throw new Error('Failed to load data');
      const data = await response.json();
      setColumns(data.columns || []);
      setCards(data.cards || []);
      setProjects(data.projects || []);
      setProjectMeta(data.projectMeta || {});
      setError(null);
    } catch (err) {
      console.error('Database load error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setColumns([]);
      setCards([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const refresh = useCallback(() => loadData(), [loadData]);

  // Create card
  const createCard = async (card: Omit<Card, '_id' | 'createdAt' | 'updatedAt' | 'order'> & { order?: number }) => {
    const response = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', card }),
    });
    if (!response.ok) throw new Error('Failed to create card');
    const newCard = await response.json();
    setCards(prev => [...prev, newCard]);
    return newCard;
  };

  // Update card
  const updateCard = async (id: string, updates: Partial<Card>) => {
    const response = await fetch('/api/db', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', id, updates }),
    });
    if (!response.ok) throw new Error('Failed to update card');
    const updated = await response.json();
    setCards(prev => prev.map(c => c._id === id ? updated : c));
    return updated;
  };

  // Move card to column
  const moveCard = async (id: string, column: string) => {
    const targetColumnCards = cards.filter((c) => c.column === column);
    const nextOrder = targetColumnCards.length;
    return updateCard(id, { column, order: nextOrder } as Partial<Card>);
  };

  // Reorder cards
  const reorderCardsInColumn = async (draggedId: string, targetId: string, position: 'above' | 'below') => {
    const draggedCard = cards.find((c) => c._id === draggedId);
    const targetCard = cards.find((c) => c._id === targetId);
    if (!draggedCard || !targetCard) throw new Error('Invalid reorder operation');

    const targetColumn = targetCard.column;
    const sourceColumn = draggedCard.column;
    const isCrossColumn = sourceColumn !== targetColumn;
    const movedCard = { ...draggedCard, column: targetColumn };

    const targetColumnCards = cards
      .filter((c) => c.column === targetColumn && c._id !== draggedId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const targetIndex = targetColumnCards.findIndex((c) => c._id === targetId);
    const insertIndex = position === 'above' ? targetIndex : targetIndex + 1;
    targetColumnCards.splice(insertIndex, 0, movedCard);

    const updatedTargetCards: Card[] = targetColumnCards.map((card, index) => ({
      ...card,
      column: targetColumn,
      order: index,
    }));

    let updatedSourceCards: Card[] = [];
    if (isCrossColumn) {
      updatedSourceCards = cards
        .filter((c) => c.column === sourceColumn && c._id !== draggedId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((card, index) => ({ ...card, order: index }));
    }

    const allUpdatedCards = [...updatedTargetCards, ...updatedSourceCards];

    const response = await fetch('/api/db', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reorder', cards: allUpdatedCards }),
    });
    if (!response.ok) throw new Error('Failed to reorder cards');

    const updatedIds = new Set(allUpdatedCards.map((c) => c._id));
    setCards(prev => [...prev.filter((c) => !updatedIds.has(c._id)), ...allUpdatedCards]);
    return allUpdatedCards;
  };

  // Delete card
  const deleteCard = async (id: string) => {
    const response = await fetch('/api/db', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    });
    if (!response.ok) throw new Error('Failed to delete card');
    setCards(prev => prev.filter(c => c._id !== id));
  };

  // Create column
  const createColumn = async (column: { title: string; color?: string }) => {
    const response = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create-column', column }),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to create column');
    }
    const newColumn = await response.json();
    setColumns(prev => [...prev, newColumn]);
    return newColumn;
  };

  // Update column
  const updateColumn = async (id: string, updates: Partial<Column>) => {
    const response = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update-column', id, updates }),
    });
    if (!response.ok) throw new Error('Failed to update column');
    const updated = await response.json();
    setColumns(prev => prev.map(c => c.id === id ? updated : c));
    if (updates.id && updates.id !== id) {
      setCards(prev => prev.map(c => c.column === id ? { ...c, column: updates.id! } : c));
    }
    return updated;
  };

  // Create project
  const createProject = async (name: string) => {
    const response = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create-project', name }),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to create project');
    }
    const data = await response.json();
    setProjects(data.projects);
    return data.projects;
  };

  // Delete project
  const deleteProject = async (name: string) => {
    const response = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete-project', name }),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to delete project');
    }
    const data = await response.json();
    setProjects(data.projects);
    if (data.projectMeta) setProjectMeta(data.projectMeta);
    // Clear deleted project from local cards state too
    setCards(prev => prev.map(c => c.project === name ? { ...c, project: undefined } : c));
    return data.projects;
  };

  // Update project metadata (description, monetizationLevel)
  const updateProjectMeta = async (name: string, updates: Partial<ProjectMeta>) => {
    const response = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update-project-meta', name, ...updates }),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to update project meta');
    }
    const data = await response.json();
    setProjectMeta(data.projectMeta);
    return data.projectMeta;
  };

  // Reorder projects
  const reorderProjects = async (orderedNames: string[]) => {
    const response = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reorder-projects', projects: orderedNames }),
    });
    if (!response.ok) throw new Error('Failed to reorder projects');
    setProjects(orderedNames);
  };

  // Rename project
  const renameProject = async (oldName: string, newName: string) => {
    const response = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rename-project', oldName, newName }),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to rename project');
    }
    const data = await response.json();
    setProjects(data.projects);
    if (data.projectMeta) setProjectMeta(data.projectMeta);
    setCards(prev => prev.map(c => c.project === oldName ? { ...c, project: newName } : c));
    return data.projects;
  };

  // Reorder columns
  const reorderColumns = async (orderedColumns: Column[]) => {
    const response = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reorder-columns', columns: orderedColumns }),
    });
    if (!response.ok) throw new Error('Failed to reorder columns');
    setColumns(orderedColumns);
  };

  // Delete column
  const deleteColumn = async (id: string) => {
    const response = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete-column', id }),
    });
    if (!response.ok) throw new Error('Failed to delete column');
    setColumns(prev => prev.filter(c => c.id !== id));
    setCards(prev => prev.map(c => c.column === id ? { ...c, column: 'backlog' } : c));
  };

  return {
    columns,
    cards,
    projects,
    projectMeta,
    isLoading,
    error,
    refresh,
    createCard,
    updateCard,
    moveCard,
    reorderCardsInColumn,
    deleteCard,
    createColumn,
    updateColumn,
    reorderColumns,
    deleteColumn,
    createProject,
    renameProject,
    deleteProject,
    updateProjectMeta,
    reorderProjects,
  };
}
