import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'lib', 'db.json');

interface Column {
  id: string;
  title: string;
  color: string;
}

interface Card {
  _id: string;
  title: string;
  description: string;
  labels: string[];
  priority: 'Low' | 'Med' | 'High';
  column: string;
  dueDate?: string;
  project?: string;
  model?: string;
  order: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

interface ProjectMeta {
  description: string;
  monetizationLevel: 'High' | 'Medium' | 'Low';
  dueDate?: string;
  status?: 'Active' | 'Completed' | 'Hidden';
  monthlyIncome?: number;
  timeToIncome?: 'Immediate' | 'Short-term' | 'Medium' | 'Long';
  timeSaved?: 'High' | 'Medium' | 'Low';
}

interface Database {
  columns: Column[];
  cards: Card[];
  projects: string[];
  projectMeta: Record<string, ProjectMeta>;
}

const DEFAULT_COLUMNS: Column[] = [
  { id: 'backlog', title: 'Backlog', color: 'slate' },
  { id: 'doing', title: 'Doing', color: 'blue' },
  { id: 'review', title: 'Review', color: 'purple' },
  { id: 'done', title: 'Done', color: 'green' },
];

const DEFAULT_PROJECTS: string[] = [
  'Masterminds',
  'HQ',
  'Rio',
  'Passive Income',
  'AI Operating System',
];

const PRIORITY_NORMALIZE: Record<string, Card['priority']> = {
  low: 'Low', medium: 'Med', med: 'Med', high: 'High',
};

async function readDB(): Promise<Database> {
  try {
    const content = await fs.readFile(DB_PATH, 'utf-8');
    const data = JSON.parse(content);
    const cards: Card[] = (data.cards || []).map((c: any) => {
      // Normalize columnId → column
      if (c.columnId && !c.column) { c = { ...c, column: c.columnId }; delete c.columnId; }
      // Normalize tags → labels
      if (!c.labels && c.tags) { c = { ...c, labels: c.tags }; delete c.tags; }
      if (!c.labels) c = { ...c, labels: [] };
      // Normalize priority
      if (c.priority && !['Low', 'Med', 'High'].includes(c.priority)) {
        c = { ...c, priority: PRIORITY_NORMALIZE[c.priority.toLowerCase()] || 'Med' };
      }
      if (!c.priority) c = { ...c, priority: 'Med' };
      // Normalize createdAt
      if (typeof c.createdAt === 'string') c = { ...c, createdAt: new Date(c.createdAt).getTime() };
      if (!c.description) c = { ...c, description: '' };
      return c as Card;
    });
    return {
      columns: data.columns || DEFAULT_COLUMNS,
      cards,
      projects: data.projects || DEFAULT_PROJECTS,
      projectMeta: data.projectMeta || {},
    };
  } catch (error) {
    console.error('Error reading DB:', error);
    return { columns: DEFAULT_COLUMNS, cards: [], projects: DEFAULT_PROJECTS, projectMeta: {} };
  }
}

async function writeDB(db: Database): Promise<void> {
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

export async function GET() {
  try {
    const db = await readDB();
    return NextResponse.json(db);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to read database' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    const db = await readDB();

    if (action === 'create' && body.card) {
      const card = body.card;
      const columnCards = db.cards.filter((c) => c.column === card.column);
      const nextOrder = columnCards.length;

      const newCard: Card = {
        ...card,
        _id: card._id || `card_${Date.now()}`,
        order: card.order !== undefined ? card.order : nextOrder,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      db.cards.push(newCard);
      await writeDB(db);
      return NextResponse.json(newCard);
    }

    if (action === 'create-column' && body.column) {
      const col = body.column;
      const id = col.id || col.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

      if (db.columns.some((c) => c.id === id)) {
        return NextResponse.json({ error: 'Column already exists' }, { status: 400 });
      }

      const newColumn: Column = {
        id,
        title: col.title,
        color: col.color || 'slate',
      };

      db.columns.push(newColumn);
      await writeDB(db);
      return NextResponse.json(newColumn);
    }

    if (action === 'update-column' && body.id && body.updates) {
      const idx = db.columns.findIndex((c) => c.id === body.id);
      if (idx === -1) {
        return NextResponse.json({ error: 'Column not found' }, { status: 404 });
      }

      // If renaming the id, update all cards too
      const oldId = db.columns[idx].id;
      const newId = body.updates.id || oldId;

      db.columns[idx] = { ...db.columns[idx], ...body.updates };

      if (newId !== oldId) {
        db.cards = db.cards.map((c) =>
          c.column === oldId ? { ...c, column: newId } : c
        );
      }

      await writeDB(db);
      return NextResponse.json(db.columns[idx]);
    }

    if (action === 'delete-column' && body.id) {
      const idx = db.columns.findIndex((c) => c.id === body.id);
      if (idx === -1) {
        return NextResponse.json({ error: 'Column not found' }, { status: 404 });
      }

      // Move orphan cards to backlog
      db.cards = db.cards.map((c) =>
        c.column === body.id ? { ...c, column: 'backlog' } : c
      );
      db.columns.splice(idx, 1);
      await writeDB(db);
      return NextResponse.json({ success: true });
    }

    if (action === 'reorder-columns' && Array.isArray(body.columns)) {
      db.columns = body.columns;
      await writeDB(db);
      return NextResponse.json({ columns: db.columns });
    }

    if (action === 'create-project' && body.name) {
      const name = body.name.trim();
      if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
      if (!db.projects) db.projects = [...DEFAULT_PROJECTS];
      if (db.projects.includes(name)) {
        return NextResponse.json({ error: 'Project already exists' }, { status: 400 });
      }
      db.projects.push(name);
      await writeDB(db);
      return NextResponse.json({ projects: db.projects });
    }

    if (action === 'rename-project' && body.oldName && body.newName) {
      const oldName = body.oldName.trim();
      const newName = body.newName.trim();
      if (!newName) return NextResponse.json({ error: 'Name required' }, { status: 400 });
      if (!db.projects) db.projects = [...DEFAULT_PROJECTS];
      if (!db.projects.includes(oldName)) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      if (db.projects.includes(newName) && newName !== oldName) return NextResponse.json({ error: 'Name already taken' }, { status: 400 });
      db.projects = db.projects.map((p) => (p === oldName ? newName : p));
      db.cards = db.cards.map((c) => c.project === oldName ? { ...c, project: newName } : c);
      if (db.projectMeta && db.projectMeta[oldName]) {
        db.projectMeta[newName] = db.projectMeta[oldName];
        delete db.projectMeta[oldName];
      }
      await writeDB(db);
      return NextResponse.json({ projects: db.projects, projectMeta: db.projectMeta });
    }

    if (action === 'delete-project' && body.name) {
      const name = body.name.trim();
      if (!db.projects) db.projects = [...DEFAULT_PROJECTS];
      db.projects = db.projects.filter((p) => p !== name);
      if (db.projectMeta) delete db.projectMeta[name];
      // Clear project field on any cards that used this project
      db.cards = db.cards.map((c) =>
        c.project === name ? { ...c, project: undefined } : c
      );
      await writeDB(db);
      return NextResponse.json({ projects: db.projects, projectMeta: db.projectMeta });
    }

    if (action === 'update-project-meta' && body.name) {
      const name = body.name.trim();
      if (!db.projectMeta) db.projectMeta = {};
      db.projectMeta[name] = {
        description: body.description ?? db.projectMeta[name]?.description ?? '',
        monetizationLevel: body.monetizationLevel ?? db.projectMeta[name]?.monetizationLevel ?? 'Medium',
        dueDate: body.dueDate !== undefined ? body.dueDate : db.projectMeta[name]?.dueDate,
        status: body.status ?? db.projectMeta[name]?.status ?? 'Active',
        monthlyIncome: body.monthlyIncome !== undefined ? body.monthlyIncome : db.projectMeta[name]?.monthlyIncome,
        timeToIncome: body.timeToIncome !== undefined ? body.timeToIncome : db.projectMeta[name]?.timeToIncome,
        timeSaved: body.timeSaved !== undefined ? body.timeSaved : db.projectMeta[name]?.timeSaved,
      };
      await writeDB(db);
      return NextResponse.json({ projectMeta: db.projectMeta });
    }

    if (action === 'reorder-projects' && Array.isArray(body.projects)) {
      db.projects = body.projects;
      await writeDB(db);
      return NextResponse.json({ projects: db.projects });
    }

    return NextResponse.json(
      { error: 'Invalid action or missing data' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error in POST:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { action, id, updates } = await request.json();

    if (action !== 'update' || !id || !updates) {
      return NextResponse.json(
        { error: 'Invalid action or missing id/updates' },
        { status: 400 }
      );
    }

    const db = await readDB();
    const cardIndex = db.cards.findIndex((c) => c._id === id);

    if (cardIndex === -1) {
      return NextResponse.json(
        { error: 'Card not found' },
        { status: 404 }
      );
    }

    const oldColumn = db.cards[cardIndex].column;
    const newColumn = updates.column || oldColumn;
    const updated: Card = {
      ...db.cards[cardIndex],
      ...updates,
      updatedAt: Date.now(),
      // Stamp completedAt when card moves to done
      ...(newColumn === 'done' && oldColumn !== 'done' ? { completedAt: Date.now() } : {}),
    };

    db.cards[cardIndex] = updated;
    await writeDB(db);

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error in PUT:', error);
    return NextResponse.json(
      { error: 'Failed to update card' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { action, cards } = await request.json();

    if (action !== 'reorder' || !Array.isArray(cards)) {
      return NextResponse.json(
        { error: 'Invalid action or missing cards' },
        { status: 400 }
      );
    }

    const db = await readDB();

    const updatedCards: Card[] = [];
    for (const card of cards) {
      const cardIndex = db.cards.findIndex((c) => c._id === card._id);
      if (cardIndex !== -1) {
        const oldColumn = db.cards[cardIndex].column;
        const newColumn = card.column || oldColumn;
        const updated: Card = {
          ...db.cards[cardIndex],
          ...card,
          updatedAt: Date.now(),
          // Stamp completedAt when card moves to done
          ...(newColumn === 'done' && oldColumn !== 'done' ? { completedAt: Date.now() } : {}),
        };
        db.cards[cardIndex] = updated;
        updatedCards.push(updated);
      }
    }

    await writeDB(db);

    return NextResponse.json({ cards: updatedCards });
  } catch (error) {
    console.error('Error in PATCH:', error);
    return NextResponse.json(
      { error: 'Failed to reorder cards' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { action, id } = await request.json();

    if (action !== 'delete' || !id) {
      return NextResponse.json(
        { error: 'Invalid action or missing id' },
        { status: 400 }
      );
    }

    const db = await readDB();
    const initialLength = db.cards.length;
    db.cards = db.cards.filter((c) => c._id !== id);

    if (db.cards.length === initialLength) {
      return NextResponse.json(
        { error: 'Card not found' },
        { status: 404 }
      );
    }

    await writeDB(db);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE:', error);
    return NextResponse.json(
      { error: 'Failed to delete card' },
      { status: 500 }
    );
  }
}
