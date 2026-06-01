"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft, Plus, GripVertical, Trash2, Pencil, Check, X, Boxes, FilterX, Crosshair,
} from "lucide-react";
import { useDatabase, ProjectMeta } from "@/hooks/useDatabase";

type MonetizationLevel = 'High' | 'Medium' | 'Low';
type ProjectStatus = 'Active' | 'Completed' | 'Hidden';
type TimeToIncome = 'Immediate' | 'Short-term' | 'Medium' | 'Long';
type TimeSaved = 'High' | 'Medium' | 'Low';
type StatusFilter = 'Active' | 'Completed' | 'Hidden' | 'All';

interface ProjectRow {
  name: string;
  description: string;
  monetizationLevel: MonetizationLevel;
  dueDate: string;
  status: ProjectStatus;
  monthlyIncome: number | null;
  timeToIncome: TimeToIncome | null;
  timeSaved: TimeSaved;
}

const monetizationColor: Record<MonetizationLevel, string> = {
  High: 'text-dark-text',
  Medium: 'text-dark-muted/80',
  Low: 'text-dark-muted/40',
};

const statusColor: Record<ProjectStatus, string> = {
  Active: 'text-cm-purple',
  Completed: 'text-dark-muted/60',
  Hidden: 'text-dark-muted/30',
};

const timeToIncomeColor: Record<TimeToIncome, string> = {
  Immediate: 'text-dark-success',
  'Short-term': 'text-dark-text',
  Medium: 'text-dark-muted/80',
  Long: 'text-dark-muted/40',
};

const timeSavedColor: Record<TimeSaved, string> = {
  High: 'text-dark-text',
  Medium: 'text-dark-muted/80',
  Low: 'text-dark-muted/40',
};

// ── Sub-components (module level per CLAUDE.md scroll rule) ────────

interface SmartDropdownProps {
  label: string;
  labelClass: string;
  options: { value: string; label: string; className: string }[];
  onSelect: (value: string) => void;
}

function SmartDropdown({ label, labelClass, options, onSelect }: SmartDropdownProps) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleClick = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setOpenUpward(window.innerHeight - rect.bottom < options.length * 36 + 16);
    }
    setOpen(v => !v);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        onClick={handleClick}
        className={`px-2.5 py-0.5 text-xs rounded-full bg-dark-panel2 border border-dark-border font-medium hover:border-cm-purple/50 transition-colors ${labelClass}`}
      >
        {label}
      </button>
      {open && (
        <div className={`absolute left-0 z-50 bg-dark-panel2 border border-dark-border rounded-lg shadow-xl shadow-black/40 py-1 min-w-[110px] ${openUpward ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onSelect(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-cm-purple/10 transition-colors ${opt.className}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface EditModalProps {
  row: ProjectRow;
  onSave: (originalName: string, updates: Partial<ProjectMeta> & { newName?: string }) => void;
  onClose: () => void;
}

function EditModal({ row, onSave, onClose }: EditModalProps) {
  const [name, setName] = useState(row.name);
  const [description, setDescription] = useState(row.description);
  const [monetizationLevel, setMonetizationLevel] = useState<MonetizationLevel>(row.monetizationLevel);
  const [dueDate, setDueDate] = useState(row.dueDate);
  const [status, setStatus] = useState<ProjectStatus>(row.status);
  const [monthlyIncome, setMonthlyIncome] = useState(row.monthlyIncome !== null ? String(row.monthlyIncome) : '');
  const [timeToIncome, setTimeToIncome] = useState<TimeToIncome | null>(row.timeToIncome);
  const [timeSaved, setTimeSaved] = useState<TimeSaved>(row.timeSaved);

  const handleSave = () => {
    const income = monthlyIncome.trim() ? parseFloat(monthlyIncome) : undefined;
    onSave(row.name, { newName: name.trim() || row.name, description, monetizationLevel, dueDate, status, monthlyIncome: isNaN(income as number) ? undefined : income, timeToIncome: timeToIncome ?? undefined, timeSaved });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-dark-panel border border-dark-border rounded-xl shadow-2xl shadow-black/60 w-full max-w-lg mx-4">
        <div className="flex items-start justify-between p-6 border-b border-dark-border">
          <div>
            <p className="text-xs font-semibold text-dark-muted uppercase tracking-widest mb-1">High-Level Projects</p>
            <h2 className="text-lg font-bold text-dark-text tracking-tight">{row.name}</h2>
            <p className="text-sm text-dark-muted mt-0.5">Manage and prioritize your projects</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-dark-panel2 transition-colors">
            <X size={16} className="text-dark-muted" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-dark-muted uppercase tracking-wide mb-1.5">Project Name</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
              className="w-full px-3 py-2 text-sm bg-dark-panel2 border border-dark-border rounded-lg outline-none focus:border-cm-purple focus:ring-2 focus:ring-cm-purple/20 text-dark-text"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-dark-muted uppercase tracking-wide mb-1.5">Description</label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)} rows={3}
              className="w-full px-3 py-2 text-sm bg-dark-panel2 border border-dark-border rounded-lg outline-none focus:border-cm-purple focus:ring-2 focus:ring-cm-purple/20 text-dark-text resize-y"
              placeholder="Short description of this project..."
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-dark-muted uppercase tracking-wide mb-1.5">Monetization</label>
            <div className="flex gap-2">
              {(['High', 'Medium', 'Low'] as MonetizationLevel[]).map(l => (
                <button key={l} onClick={() => setMonetizationLevel(l)}
                  className={`px-4 py-1.5 text-sm rounded-lg border transition-colors ${monetizationLevel === l ? 'bg-cm-purple/20 border-cm-purple text-dark-text' : 'bg-dark-panel2 border-dark-border text-dark-muted hover:border-cm-purple/40'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-dark-muted uppercase tracking-wide mb-1.5">Status</label>
            <div className="flex gap-2">
              {(['Active', 'Completed', 'Hidden'] as ProjectStatus[]).map(s => (
                <button key={s} onClick={() => setStatus(s)}
                  className={`px-4 py-1.5 text-sm rounded-lg border transition-colors ${status === s ? 'bg-cm-purple/20 border-cm-purple text-dark-text' : 'bg-dark-panel2 border-dark-border text-dark-muted hover:border-cm-purple/40'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-dark-muted uppercase tracking-wide mb-1.5">Horizon</label>
            <div className="flex gap-2">
              {(['Immediate', 'Short-term', 'Medium', 'Long'] as TimeToIncome[]).map(t => (
                <button key={t} onClick={() => setTimeToIncome(timeToIncome === t ? null : t)}
                  className={`px-4 py-1.5 text-sm rounded-lg border transition-colors ${timeToIncome === t ? 'bg-cm-purple/20 border-cm-purple text-dark-text' : 'bg-dark-panel2 border-dark-border text-dark-muted hover:border-cm-purple/40'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-dark-muted uppercase tracking-wide mb-1.5">Time Saved</label>
            <div className="flex gap-2">
              {(['High', 'Medium', 'Low'] as TimeSaved[]).map(t => (
                <button key={t} onClick={() => setTimeSaved(t)}
                  className={`px-4 py-1.5 text-sm rounded-lg border transition-colors ${timeSaved === t ? 'bg-cm-purple/20 border-cm-purple text-dark-text' : 'bg-dark-panel2 border-dark-border text-dark-muted hover:border-cm-purple/40'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-dark-muted uppercase tracking-wide mb-1.5">Est. Monthly Income</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-dark-muted">$</span>
              <input type="number" min="0" step="100" value={monthlyIncome}
                onChange={e => setMonthlyIncome(e.target.value)}
                placeholder="0"
                className="w-full pl-6 pr-3 py-2 text-sm bg-dark-panel2 border border-dark-border rounded-lg outline-none focus:border-cm-purple focus:ring-2 focus:ring-cm-purple/20 text-dark-text placeholder:text-dark-muted/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-dark-muted uppercase tracking-wide mb-1.5">Due Date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              className="px-3 py-2 text-sm bg-dark-panel2 border border-dark-border rounded-lg outline-none focus:border-cm-purple focus:ring-2 focus:ring-cm-purple/20 text-dark-text [color-scheme:dark]"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-dark-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-dark-muted hover:bg-dark-panel2 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-cm-purple hover:bg-cm-purple/80 rounded-lg transition-colors">
            <Check size={14} />Save
          </button>
        </div>
      </div>
    </div>
  );
}

interface CreateModalProps {
  onSave: (name: string, meta: Partial<ProjectMeta>) => void;
  onClose: () => void;
}

function CreateModal({ onSave, onClose }: CreateModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [monetizationLevel, setMonetizationLevel] = useState<MonetizationLevel>('Medium');
  const [status, setStatus] = useState<ProjectStatus>('Active');
  const [dueDate, setDueDate] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [timeToIncome, setTimeToIncome] = useState<TimeToIncome>('Medium');
  const [timeSaved, setTimeSaved] = useState<TimeSaved>('Medium');

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const income = monthlyIncome.trim() ? parseFloat(monthlyIncome) : undefined;
    onSave(trimmed, { description, monetizationLevel, status, dueDate, monthlyIncome: income && !isNaN(income) ? income : undefined, timeToIncome, timeSaved });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-dark-panel border border-dark-border rounded-xl shadow-2xl shadow-black/60 w-full max-w-lg mx-4">
        <div className="flex items-start justify-between p-6 border-b border-dark-border">
          <div>
            <p className="text-xs font-semibold text-dark-muted uppercase tracking-widest mb-1">High-Level Projects</p>
            <h2 className="text-lg font-bold text-dark-text tracking-tight">New Project</h2>
            <p className="text-sm text-dark-muted mt-0.5">Fill in the details and hit Save</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-dark-panel2 transition-colors">
            <X size={16} className="text-dark-muted" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-dark-muted uppercase tracking-wide mb-1.5">Project Name</label>
            <input autoFocus type="text" value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
              className="w-full px-3 py-2 text-sm bg-dark-panel2 border border-dark-border rounded-lg outline-none focus:border-cm-purple focus:ring-2 focus:ring-cm-purple/20 text-dark-text"
              placeholder="Project name..."
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-dark-muted uppercase tracking-wide mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              className="w-full px-3 py-2 text-sm bg-dark-panel2 border border-dark-border rounded-lg outline-none focus:border-cm-purple focus:ring-2 focus:ring-cm-purple/20 text-dark-text resize-y"
              placeholder="Short description..."
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-dark-muted uppercase tracking-wide mb-1.5">Monetization</label>
            <div className="flex gap-2">
              {(['High', 'Medium', 'Low'] as MonetizationLevel[]).map(l => (
                <button key={l} onClick={() => setMonetizationLevel(l)}
                  className={`px-4 py-1.5 text-sm rounded-lg border transition-colors ${monetizationLevel === l ? 'bg-cm-purple/20 border-cm-purple text-dark-text' : 'bg-dark-panel2 border-dark-border text-dark-muted hover:border-cm-purple/40'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-dark-muted uppercase tracking-wide mb-1.5">Status</label>
            <div className="flex gap-2">
              {(['Active', 'Completed', 'Hidden'] as ProjectStatus[]).map(s => (
                <button key={s} onClick={() => setStatus(s)}
                  className={`px-4 py-1.5 text-sm rounded-lg border transition-colors ${status === s ? 'bg-cm-purple/20 border-cm-purple text-dark-text' : 'bg-dark-panel2 border-dark-border text-dark-muted hover:border-cm-purple/40'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-dark-muted uppercase tracking-wide mb-1.5">Horizon</label>
            <div className="flex gap-2">
              {(['Immediate', 'Short-term', 'Medium', 'Long'] as TimeToIncome[]).map(t => (
                <button key={t} onClick={() => setTimeToIncome(t)}
                  className={`px-4 py-1.5 text-sm rounded-lg border transition-colors ${timeToIncome === t ? 'bg-cm-purple/20 border-cm-purple text-dark-text' : 'bg-dark-panel2 border-dark-border text-dark-muted hover:border-cm-purple/40'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-dark-muted uppercase tracking-wide mb-1.5">Time Saved</label>
            <div className="flex gap-2">
              {(['High', 'Medium', 'Low'] as TimeSaved[]).map(t => (
                <button key={t} onClick={() => setTimeSaved(t)}
                  className={`px-4 py-1.5 text-sm rounded-lg border transition-colors ${timeSaved === t ? 'bg-cm-purple/20 border-cm-purple text-dark-text' : 'bg-dark-panel2 border-dark-border text-dark-muted hover:border-cm-purple/40'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-dark-muted uppercase tracking-wide mb-1.5">Est. Monthly Income</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-dark-muted">$</span>
                <input type="number" min="0" step="100" value={monthlyIncome} onChange={e => setMonthlyIncome(e.target.value)} placeholder="0"
                  className="w-full pl-6 pr-3 py-2 text-sm bg-dark-panel2 border border-dark-border rounded-lg outline-none focus:border-cm-purple focus:ring-2 focus:ring-cm-purple/20 text-dark-text placeholder:text-dark-muted/50"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-dark-muted uppercase tracking-wide mb-1.5">Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-dark-panel2 border border-dark-border rounded-lg outline-none focus:border-cm-purple focus:ring-2 focus:ring-cm-purple/20 text-dark-text [color-scheme:dark]"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-dark-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-dark-muted hover:bg-dark-panel2 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={!name.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-cm-purple hover:bg-cm-purple/80 rounded-lg transition-colors disabled:opacity-40">
            <Check size={14} />Save
          </button>
        </div>
      </div>
    </div>
  );
}

type EditingField = 'name' | 'description' | 'dueDate' | 'monthlyIncome' | null;

interface ProjectRowItemProps {
  row: ProjectRow;
  isDragging: boolean;
  isDragTarget: boolean;
  onDragStart: (e: React.DragEvent, name: string) => void;
  onDragOver: (e: React.DragEvent, name: string) => void;
  onDrop: (e: React.DragEvent, name: string) => void;
  onDragEnd: () => void;
  onOpenModal: (row: ProjectRow) => void;
  onDelete: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onUpdateMeta: (name: string, updates: Partial<ProjectMeta>) => void;
}

function ProjectRowItem({
  row, isDragging, isDragTarget,
  onDragStart, onDragOver, onDrop, onDragEnd,
  onOpenModal, onDelete, onRename, onUpdateMeta,
}: ProjectRowItemProps) {
  const [editingField, setEditingField] = useState<EditingField>(null);
  const [nameVal, setNameVal] = useState(row.name);
  const [descVal, setDescVal] = useState(row.description);
  const [dateVal, setDateVal] = useState(row.dueDate);
  const [incomeVal, setIncomeVal] = useState(row.monthlyIncome !== null ? String(row.monthlyIncome) : '');

  useEffect(() => { if (editingField !== 'name') setNameVal(row.name); }, [row.name, editingField]);
  useEffect(() => { if (editingField !== 'description') setDescVal(row.description); }, [row.description, editingField]);
  useEffect(() => { if (editingField !== 'dueDate') setDateVal(row.dueDate); }, [row.dueDate, editingField]);
  useEffect(() => { if (editingField !== 'monthlyIncome') setIncomeVal(row.monthlyIncome !== null ? String(row.monthlyIncome) : ''); }, [row.monthlyIncome, editingField]);

  const saveName = () => {
    const t = nameVal.trim();
    if (t && t !== row.name) onRename(row.name, t); else setNameVal(row.name);
    setEditingField(null);
  };
  const saveDesc = () => {
    if (descVal !== row.description) onUpdateMeta(row.name, { description: descVal });
    setEditingField(null);
  };
  const saveDate = () => {
    if (dateVal !== row.dueDate) onUpdateMeta(row.name, { dueDate: dateVal });
    setEditingField(null);
  };
  const saveIncome = () => {
    const parsed = incomeVal.trim() ? parseFloat(incomeVal) : null;
    const val = parsed !== null && !isNaN(parsed) ? parsed : null;
    if (val !== row.monthlyIncome) onUpdateMeta(row.name, { monthlyIncome: val ?? undefined });
    setEditingField(null);
  };

  const formattedDate = row.dueDate
    ? new Date(row.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
    : null;

  const statusOptions = (['Active', 'Completed', 'Hidden'] as ProjectStatus[]).map(s => ({
    value: s, label: s, className: statusColor[s],
  }));

  const monetizationOptions = (['High', 'Medium', 'Low'] as MonetizationLevel[]).map(l => ({
    value: l, label: l, className: monetizationColor[l],
  }));

  return (
    <tr
      draggable={editingField === null}
      onDragStart={e => onDragStart(e, row.name)}
      onDragOver={e => onDragOver(e, row.name)}
      onDrop={e => onDrop(e, row.name)}
      onDragEnd={onDragEnd}
      className={`border-b border-dark-border transition-all group ${isDragging ? 'opacity-30' : ''} ${isDragTarget ? 'bg-cm-purple/5 border-l-2 border-l-cm-purple' : 'hover:bg-dark-panel2/30'}`}
    >
      <td className="w-8 px-3 py-4">
        <GripVertical size={14} className="text-dark-muted/30 cursor-grab active:cursor-grabbing group-hover:text-dark-muted transition-colors" />
      </td>

      {/* Name */}
      <td className="px-4 py-4" onDoubleClick={() => setEditingField('name')}>
        {editingField === 'name' ? (
          <input autoFocus type="text" value={nameVal}
            onChange={e => setNameVal(e.target.value)}
            onBlur={saveName}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); saveName(); } if (e.key === 'Escape') { setNameVal(row.name); setEditingField(null); } }}
            className="w-full px-2 py-1 text-base font-medium bg-dark-panel2 border border-cm-purple rounded outline-none focus:ring-2 focus:ring-cm-purple/20 text-dark-text tracking-tight"
          />
        ) : (
          <span className="text-base font-medium text-dark-text tracking-tight cursor-text select-none" title="Double-click to edit">{row.name}</span>
        )}
      </td>

      {/* Description */}
      <td className="px-4 py-4" onDoubleClick={() => setEditingField('description')}>
        {editingField === 'description' ? (
          <input autoFocus type="text" value={descVal}
            onChange={e => setDescVal(e.target.value)}
            onBlur={saveDesc}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); saveDesc(); } if (e.key === 'Escape') { setDescVal(row.description); setEditingField(null); } }}
            className="w-full px-2 py-1 text-sm bg-dark-panel2 border border-cm-purple rounded outline-none focus:ring-2 focus:ring-cm-purple/20 text-dark-text"
          />
        ) : (
          <span className="text-sm text-dark-muted cursor-text select-none block truncate" title={row.description || undefined}>
            {row.description || <span className="text-dark-muted/30">—</span>}
          </span>
        )}
      </td>

      {/* Monetization */}
      <td className="px-4 py-4">
        <SmartDropdown
          label={row.monetizationLevel}
          labelClass={monetizationColor[row.monetizationLevel]}
          options={monetizationOptions}
          onSelect={v => onUpdateMeta(row.name, { monetizationLevel: v as MonetizationLevel })}
        />
      </td>

      {/* Est. Monthly Income */}
      <td className="px-4 py-4" onClick={() => setEditingField('monthlyIncome')}>
        {editingField === 'monthlyIncome' ? (
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-dark-muted">$</span>
            <input autoFocus type="number" min="0" step="100" value={incomeVal}
              onChange={e => setIncomeVal(e.target.value)}
              onBlur={saveIncome}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); saveIncome(); } if (e.key === 'Escape') { setIncomeVal(row.monthlyIncome !== null ? String(row.monthlyIncome) : ''); setEditingField(null); } }}
              className="w-full pl-5 pr-2 py-1 text-sm bg-dark-panel2 border border-cm-purple rounded outline-none focus:ring-2 focus:ring-cm-purple/20 text-dark-text"
            />
          </div>
        ) : (
          <span className="text-sm text-dark-muted cursor-pointer select-none">
            {row.monthlyIncome !== null ? `$${row.monthlyIncome.toLocaleString()}` : <span className="text-dark-muted/30">—</span>}
          </span>
        )}
      </td>

      {/* Horizon */}
      <td className="px-4 py-4">
        <SmartDropdown
          label={row.timeToIncome ?? 'Medium'}
          labelClass={timeToIncomeColor[(row.timeToIncome ?? 'Medium') as TimeToIncome]}
          options={(['Immediate', 'Short-term', 'Medium', 'Long'] as TimeToIncome[]).map(t => ({ value: t, label: t, className: timeToIncomeColor[t] }))}
          onSelect={v => onUpdateMeta(row.name, { timeToIncome: v as TimeToIncome })}
        />
      </td>

      {/* Due Date */}
      <td className="px-4 py-4" onDoubleClick={() => setEditingField('dueDate')}>
        {editingField === 'dueDate' ? (
          <input autoFocus type="date" value={dateVal}
            onChange={e => setDateVal(e.target.value)}
            onBlur={saveDate}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); saveDate(); } if (e.key === 'Escape') { setDateVal(row.dueDate); setEditingField(null); } }}
            className="w-full px-2 py-1 text-sm bg-dark-panel2 border border-cm-purple rounded outline-none focus:ring-2 focus:ring-cm-purple/20 text-dark-text [color-scheme:dark]"
          />
        ) : (
          <span className="text-sm text-dark-muted cursor-text select-none" title="Double-click to edit">
            {formattedDate || <span className="text-dark-muted/30">—</span>}
          </span>
        )}
      </td>

      {/* Status */}
      <td className="px-4 py-4">
        <SmartDropdown
          label={row.status}
          labelClass={statusColor[row.status]}
          options={statusOptions}
          onSelect={v => onUpdateMeta(row.name, { status: v as ProjectStatus })}
        />
      </td>

      {/* Time Saved */}
      <td className="px-4 py-4">
        <SmartDropdown
          label={row.timeSaved}
          labelClass={timeSavedColor[row.timeSaved]}
          options={(['High', 'Medium', 'Low'] as TimeSaved[]).map(t => ({ value: t, label: t, className: timeSavedColor[t] }))}
          onSelect={v => onUpdateMeta(row.name, { timeSaved: v as TimeSaved })}
        />
      </td>

      {/* Actions */}
      <td className="px-3 py-4 w-16">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onOpenModal(row)} className="p-1 rounded hover:bg-dark-panel2 transition-colors" title="Edit"><Pencil size={12} className="text-dark-muted" /></button>
          <button onClick={() => onDelete(row.name)} className="p-1 rounded hover:bg-dark-danger/10 transition-colors" title="Delete"><Trash2 size={12} className="text-dark-muted hover:text-dark-danger" /></button>
        </div>
      </td>
    </tr>
  );
}

// ── Filter dropdown ─────────────────────────────────────────────────

const FILTER_STORAGE_KEY = 'mc-projects-filters-v1';

interface FilterDropdownProps {
  label: string;
  values: string[];
  options: { value: string; label: string }[];
  onChange: (values: string[]) => void;
}

function FilterDropdown({ label, values, options, onChange }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setOpenUpward(window.innerHeight - rect.bottom < (options.length + 2) * 36 + 16);
    }
    setOpen(v => !v);
  };

  const toggle = (v: string) => {
    onChange(values.includes(v) ? values.filter(x => x !== v) : [...values, v]);
  };

  const isFiltered = values.length > 0;
  const buttonLabel = values.length === 0 ? 'All' : values.length === 1 ? values[0] : `${values.length} selected`;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        onClick={handleOpen}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
          isFiltered
            ? 'bg-cm-purple/10 border-cm-purple/40 text-dark-text'
            : 'bg-dark-panel border-dark-border text-dark-muted hover:border-cm-purple/30 hover:text-dark-text'
        }`}
      >
        <span className="text-dark-muted/60 uppercase tracking-wide font-semibold text-[10px]">{label}</span>
        <span>{buttonLabel}</span>
        <span className="text-dark-muted/40 text-[10px]">▾</span>
      </button>
      {open && (
        <div className={`absolute left-0 z-50 bg-dark-panel2 border border-dark-border rounded-lg shadow-xl shadow-black/40 py-1 min-w-[150px] ${openUpward ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => toggle(opt.value)}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors hover:bg-cm-purple/10 ${values.includes(opt.value) ? 'text-dark-text' : 'text-dark-muted'}`}
            >
              <span className={`w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center border text-[9px] ${values.includes(opt.value) ? 'bg-cm-purple border-cm-purple text-white' : 'border-dark-border'}`}>
                {values.includes(opt.value) ? '✓' : ''}
              </span>
              {opt.label}
            </button>
          ))}
          {isFiltered && (
            <>
              <div className="border-t border-dark-border my-1" />
              <button onClick={() => onChange([])} className="w-full text-left px-3 py-1.5 text-xs text-dark-muted/50 hover:text-dark-muted transition-colors">
                Clear
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sortable column header ───────────────────────────────────────────

type SortColumn = 'name' | 'monetization' | 'income' | 'horizon' | 'dueDate' | 'status' | 'timeSaved';

interface SortableHeaderProps {
  label: string;
  column: SortColumn;
  sortConfig: { column: SortColumn; dir: 'asc' | 'desc' } | null;
  onSort: (column: SortColumn) => void;
}

function SortableHeader({ label, column, sortConfig, onSort }: SortableHeaderProps) {
  const active = sortConfig?.column === column;
  const dir = active ? sortConfig!.dir : null;
  return (
    <button
      onClick={() => onSort(column)}
      className={`flex items-center gap-1.5 uppercase tracking-wide font-semibold text-xs hover:text-dark-text transition-colors ${active ? 'text-dark-text' : 'text-dark-muted'}`}
    >
      {label}
      <span className={`text-[10px] ${active ? 'text-cm-purple' : 'text-dark-muted/40'}`}>
        {dir === 'asc' ? '↑' : dir === 'desc' ? '↓' : '↕'}
      </span>
    </button>
  );
}

// ── Page ────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const {
    projects, projectMeta,
    createProject, deleteProject, renameProject,
    updateProjectMeta, reorderProjects,
  } = useDatabase();

  const [isCreating, setIsCreating] = useState(false);
  const [editingRow, setEditingRow] = useState<ProjectRow | null>(null);
  const [draggedName, setDraggedName] = useState<string | null>(null);
  const [dragTargetName, setDragTargetName] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ column: SortColumn; dir: 'asc' | 'desc' } | null>(null);
  const [statusFilter, setStatusFilter] = useState<string[]>(() => {
    try { const s = localStorage.getItem(FILTER_STORAGE_KEY); if (s) return JSON.parse(s).status ?? ['Active']; } catch {}
    return ['Active'];
  });
  const [monetizationFilter, setMonetizationFilter] = useState<string[]>(() => {
    try { const s = localStorage.getItem(FILTER_STORAGE_KEY); if (s) return JSON.parse(s).monetization ?? []; } catch {}
    return [];
  });
  const [horizonFilter, setHorizonFilter] = useState<string[]>(() => {
    try { const s = localStorage.getItem(FILTER_STORAGE_KEY); if (s) return JSON.parse(s).horizon ?? []; } catch {}
    return [];
  });
  const [timeSavedFilter, setTimeSavedFilter] = useState<string[]>(() => {
    try { const s = localStorage.getItem(FILTER_STORAGE_KEY); if (s) return JSON.parse(s).timeSaved ?? []; } catch {}
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
        status: statusFilter,
        monetization: monetizationFilter,
        horizon: horizonFilter,
        timeSaved: timeSavedFilter,
      }));
    } catch {}
  }, [statusFilter, monetizationFilter, horizonFilter, timeSavedFilter]);

  const monetizationRank: Record<MonetizationLevel, number> = { High: 0, Medium: 1, Low: 2 };

  const toggleSort = (column: SortColumn) => {
    setSortConfig(prev => {
      if (!prev || prev.column !== column) return { column, dir: 'asc' };
      if (prev.dir === 'asc') return { column, dir: 'desc' };
      return null;
    });
  };

  const rows: ProjectRow[] = projects.map(name => ({
    name,
    description: projectMeta[name]?.description ?? '',
    monetizationLevel: projectMeta[name]?.monetizationLevel ?? 'Medium',
    dueDate: projectMeta[name]?.dueDate ?? '',
    status: projectMeta[name]?.status ?? 'Active',
    monthlyIncome: projectMeta[name]?.monthlyIncome ?? null,
    timeToIncome: projectMeta[name]?.timeToIncome ?? 'Medium',
    timeSaved: projectMeta[name]?.timeSaved ?? 'Medium',
  }));

  const filteredRows = rows
    .filter(r => statusFilter.length === 0 || statusFilter.includes(r.status))
    .filter(r => monetizationFilter.length === 0 || monetizationFilter.includes(r.monetizationLevel))
    .filter(r => horizonFilter.length === 0 || horizonFilter.includes(r.timeToIncome ?? 'Medium'))
    .filter(r => timeSavedFilter.length === 0 || timeSavedFilter.includes(r.timeSaved));

  const displayRows = sortConfig
    ? [...filteredRows].sort((a, b) => {
        const { column, dir } = sortConfig;
        let cmp = 0;
        if (column === 'name') cmp = a.name.localeCompare(b.name);
        else if (column === 'monetization') cmp = monetizationRank[a.monetizationLevel] - monetizationRank[b.monetizationLevel];
        else if (column === 'income') cmp = (a.monthlyIncome ?? -1) - (b.monthlyIncome ?? -1);
        else if (column === 'horizon') { const hRank: Record<TimeToIncome, number> = { Immediate: 0, 'Short-term': 1, Medium: 2, Long: 3 }; cmp = hRank[a.timeToIncome ?? 'Medium'] - hRank[b.timeToIncome ?? 'Medium']; }
        else if (column === 'dueDate') cmp = (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
        else if (column === 'status') cmp = a.status.localeCompare(b.status);
        else if (column === 'timeSaved') { const r: Record<TimeSaved, number> = { High: 0, Medium: 1, Low: 2 }; cmp = r[a.timeSaved] - r[b.timeSaved]; }
        return dir === 'asc' ? cmp : -cmp;
      })
    : filteredRows;

  const handleCreate = useCallback(async (name: string, meta: Partial<ProjectMeta>) => {
    try {
      await createProject(name);
      await updateProjectMeta(name, meta);
    } catch (err) { console.error(err); }
  }, [createProject, updateProjectMeta]);

  const handleDelete = useCallback(async (name: string) => {
    if (!confirm(`Delete "${name}"? Cards assigned to it will be unassigned.`)) return;
    try { await deleteProject(name); } catch (err) { console.error(err); }
  }, [deleteProject]);

  const handleRename = useCallback(async (oldName: string, newName: string) => {
    try { await renameProject(oldName, newName); } catch (err) { console.error(err); }
  }, [renameProject]);

  const handleUpdateMeta = useCallback(async (name: string, updates: Partial<ProjectMeta>) => {
    try { await updateProjectMeta(name, updates); } catch (err) { console.error(err); }
  }, [updateProjectMeta]);

  const handleSaveModal = useCallback(async (originalName: string, updates: Partial<ProjectMeta> & { newName?: string }) => {
    try {
      const { newName, ...meta } = updates;
      if (newName && newName !== originalName) {
        await renameProject(originalName, newName);
        await updateProjectMeta(newName, meta);
      } else {
        await updateProjectMeta(originalName, meta);
      }
    } catch (err) { console.error(err); }
  }, [renameProject, updateProjectMeta]);

  const handleSniper = useCallback(() => {
    setStatusFilter(['Active']);
    setMonetizationFilter(['High']);
    setHorizonFilter(['Immediate', 'Medium']);
    setSortConfig({ column: 'income', dir: 'desc' });
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, name: string) => {
    e.dataTransfer.effectAllowed = 'move';
    setDraggedName(name);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, name: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (name !== draggedName) setDragTargetName(name);
  }, [draggedName]);

  const handleDrop = useCallback(async (e: React.DragEvent, targetName: string) => {
    e.preventDefault();
    if (!draggedName || draggedName === targetName) return;
    const newOrder = displayRows.map(r => r.name);
    const fromIdx = newOrder.indexOf(draggedName);
    const toIdx = newOrder.indexOf(targetName);
    if (fromIdx === -1 || toIdx === -1) return;
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, draggedName);
    // Merge back with hidden rows not in current filter
    const hiddenNames = rows.filter(r => !displayRows.find(d => d.name === r.name)).map(r => r.name);
    setDraggedName(null);
    setDragTargetName(null);
    setSortConfig(null);
    try { await reorderProjects([...newOrder, ...hiddenNames]); } catch (err) { console.error(err); }
  }, [draggedName, displayRows, rows, reorderProjects]);

  const handleDragEnd = useCallback(() => {
    setDraggedName(null);
    setDragTargetName(null);
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-dark-panel border border-dark-border rounded-xl p-6">
        <div className="flex items-center gap-4">
          <Link href="/app/tasks" className="p-1.5 rounded-lg hover:bg-dark-panel2 transition-colors" title="Back to Tasks">
            <ArrowLeft size={16} className="text-dark-muted" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cm-purple/15 flex items-center justify-center">
              <Boxes size={20} className="text-cm-purple" />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <h1 className="text-xl font-bold tracking-tight text-dark-text">High-Level Projects</h1>
                <span className="bg-dark-panel2 border border-dark-border text-dark-muted rounded-full px-2 py-0.5 text-xs">
                  {displayRows.length !== rows.length ? `${displayRows.length} of ${rows.length}` : displayRows.length}
                </span>
              </div>
              <p className="text-sm text-dark-muted">This is intended to help you get a high-level view of the projects you should be working on.</p>
            </div>
          </div>
          <div className="ml-auto">
            <button onClick={() => setIsCreating(true)} className="flex items-center gap-2 px-3 py-1.5 text-sm text-white bg-cm-purple hover:bg-cm-purple/80 rounded-lg transition-colors">
              <Plus size={16} />New Project
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar: filter dropdowns */}
      <div className="flex items-center gap-2">
        <FilterDropdown
          label="Status"
          values={statusFilter}
          options={[
            { value: 'Active', label: 'Active' },
            { value: 'Completed', label: 'Completed' },
            { value: 'Hidden', label: 'Hidden' },
          ]}
          onChange={setStatusFilter}
        />
        <FilterDropdown
          label="Monetization"
          values={monetizationFilter}
          options={[
            { value: 'High', label: 'High' },
            { value: 'Medium', label: 'Medium' },
            { value: 'Low', label: 'Low' },
          ]}
          onChange={setMonetizationFilter}
        />
        <FilterDropdown
          label="Horizon"
          values={horizonFilter}
          options={[
            { value: 'Immediate', label: 'Immediate' },
            { value: 'Short-term', label: 'Short-term' },
            { value: 'Medium', label: 'Medium' },
            { value: 'Long', label: 'Long' },
          ]}
          onChange={setHorizonFilter}
        />
        <FilterDropdown
          label="Time Saved"
          values={timeSavedFilter}
          options={[
            { value: 'High', label: 'High' },
            { value: 'Medium', label: 'Medium' },
            { value: 'Low', label: 'Low' },
          ]}
          onChange={setTimeSavedFilter}
        />
        <button
          onClick={handleSniper}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-dark-border text-dark-muted hover:border-cm-purple/40 hover:text-dark-text transition-colors"
          title="Sniper: High monetization, Active, Immediate/Medium horizon, sorted by income"
        >
          <Crosshair size={13} />
          Sniper
        </button>
        {(statusFilter.length > 0 || monetizationFilter.length > 0 || horizonFilter.length > 0 || timeSavedFilter.length > 0) && (
          <button
            onClick={() => { setStatusFilter([]); setMonetizationFilter([]); setHorizonFilter([]); setTimeSavedFilter([]); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-dark-danger/40 text-dark-danger hover:bg-dark-danger/10 transition-colors"
          >
            <FilterX size={13} />
            Clear All Filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-dark-panel border border-dark-border rounded-xl overflow-visible">
        <table className="w-full table-fixed">
          <colgroup>
            <col className="w-8" />        {/* drag */}
            <col className="w-[130px]" />  {/* Project */}
            <col />                         {/* Description — fills remaining */}
            <col className="w-[110px]" />  {/* Monetization */}
            <col className="w-[100px]" />  {/* Est. Mo. Income */}
            <col className="w-[100px]" />  {/* Horizon */}
            <col className="w-[120px]" />  {/* Due Date */}
            <col className="w-[90px]" />   {/* Status */}
            <col className="w-[100px]" />  {/* Time Saved */}
            <col className="w-[60px]" />   {/* Actions */}
          </colgroup>
          <thead>
            <tr className="border-b border-dark-border">
              <th className="px-3 py-3" />
              <th className="px-4 py-3 text-left"><SortableHeader label="Project" column="name" sortConfig={sortConfig} onSort={toggleSort} /></th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-dark-muted uppercase tracking-wide">Description</th>
              <th className="px-4 py-3 text-left"><SortableHeader label="Monetization" column="monetization" sortConfig={sortConfig} onSort={toggleSort} /></th>
              <th className="px-4 py-3 text-left"><SortableHeader label="Est. Mo. Income" column="income" sortConfig={sortConfig} onSort={toggleSort} /></th>
              <th className="px-4 py-3 text-left"><SortableHeader label="Horizon" column="horizon" sortConfig={sortConfig} onSort={toggleSort} /></th>
              <th className="px-4 py-3 text-left"><SortableHeader label="Due Date" column="dueDate" sortConfig={sortConfig} onSort={toggleSort} /></th>
              <th className="px-4 py-3 text-left"><SortableHeader label="Status" column="status" sortConfig={sortConfig} onSort={toggleSort} /></th>
              <th className="px-4 py-3 text-left"><SortableHeader label="Time Saved" column="timeSaved" sortConfig={sortConfig} onSort={toggleSort} /></th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-6 py-12 text-center text-dark-muted text-sm">
                  {statusFilter === 'Active' ? 'No active projects. Change the filter to see others.' : 'No projects here.'}
                </td>
              </tr>
            )}
            {displayRows.map(row => (
              <ProjectRowItem
                key={row.name}
                row={row}
                isDragging={draggedName === row.name}
                isDragTarget={dragTargetName === row.name}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                onOpenModal={setEditingRow}
                onDelete={handleDelete}
                onRename={handleRename}
                onUpdateMeta={handleUpdateMeta}
              />
            ))}
          </tbody>
        </table>
      </div>

      {editingRow && (
        <EditModal row={editingRow} onSave={handleSaveModal} onClose={() => setEditingRow(null)} />
      )}
      {isCreating && (
        <CreateModal onSave={handleCreate} onClose={() => setIsCreating(false)} />
      )}
    </div>
  );
}
