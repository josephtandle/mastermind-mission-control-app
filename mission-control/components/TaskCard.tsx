import { Trash2, Edit, X, Loader2, CheckCircle, AlertTriangle, CheckCircle2 } from "lucide-react";

interface TaskCardProps {
  id: string;
  title: string;
  description: string;
  labels: string[];
  priority: "Low" | "Med" | "High";
  dueDate?: string;
  project?: string;
  allProjects?: string[];
  executorStatus?: "running" | "completed" | "needs-attention" | null;
  executorLog?: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onClearStatus?: () => void;
  onMoveToDone?: () => void;
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDoubleClick?: () => void;
}

// Priority expressed as a left-border accent + small dot — no colored pill backgrounds
const priorityConfig = {
  High: {
    border: "border-l-2 border-l-dark-danger/60",
    dot: "bg-dark-danger",
    text: "text-dark-danger",
  },
  Med: {
    border: "border-l-2 border-l-dark-muted/30",
    dot: "bg-dark-muted/50",
    text: "text-dark-muted",
  },
  Low: {
    border: "border-l-2 border-l-dark-border",
    dot: "bg-dark-muted/25",
    text: "text-dark-muted",
  },
};

const statusConfig = {
  running: {
    icon: Loader2,
    label: "Running",
    className: "bg-cm-purple/20 text-cm-purple border-cm-purple/30",
    iconClassName: "animate-spin",
    dismissible: false,
  },
  completed: {
    icon: CheckCircle,
    label: "Auto-Completed",
    className: "bg-dark-success/20 text-dark-success border-dark-success/30",
    iconClassName: "",
    dismissible: true,
  },
  "needs-attention": {
    icon: AlertTriangle,
    label: "Needs Attention",
    className: "bg-dark-warn/20 text-dark-warn border-dark-warn/30",
    iconClassName: "",
    dismissible: true,
  },
};

export function TaskCard({
  id,
  title,
  description,
  labels: _labels,
  priority,
  dueDate,
  project,
  allProjects: _allProjects,
  executorStatus,
  executorLog,
  onEdit,
  onDelete,
  onClearStatus,
  onMoveToDone,
  draggable,
  onDragStart,
  onDragEnd,
  onDoubleClick,
}: TaskCardProps) {
  const prio = priorityConfig[priority] || priorityConfig.Med;

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDoubleClick={onDoubleClick || onEdit}
      data-card-id={id}
      className={`bg-dark-panel rounded-lg p-4 cursor-grab shadow-md shadow-black/20 hover:shadow-lg hover:shadow-black/30 transition-shadow duration-150 active:cursor-grabbing border border-r border-t border-b border-dark-border hover:border-cm-purple/40 ${prio.border}`}
    >
      {/* Executor Status Pill */}
      {executorStatus && statusConfig[executorStatus] && (() => {
        const cfg = statusConfig[executorStatus];
        const Icon = cfg.icon;
        return (
          <div className={`inline-flex items-center gap-1.5 px-2 py-1 mb-2 text-xs font-medium rounded-full border ${cfg.className}`}>
            <Icon size={12} className={cfg.iconClassName} />
            <span>{cfg.label}</span>
            {cfg.dismissible && onClearStatus && (
              <button
                onClick={(e) => { e.stopPropagation(); onClearStatus(); }}
                className="ml-0.5 p-0.5 rounded-full hover:bg-white/10 transition-colors"
                title="Clear status"
              >
                <X size={10} />
              </button>
            )}
          </div>
        );
      })()}

      {/* Executor error log */}
      {executorStatus === "needs-attention" && executorLog && (
        <pre className="text-[10px] text-dark-warn/80 bg-dark-panel2 border border-dark-warn/20 rounded px-2 py-1.5 mb-2 whitespace-pre-wrap break-words line-clamp-4 font-mono leading-relaxed">
          {executorLog}
        </pre>
      )}

      {/* Title */}
      <h3 className="font-semibold text-dark-text mb-2 line-clamp-2">
        {title}
      </h3>

      {/* Description Preview */}
      {description && (
        <p className="text-sm text-dark-muted mb-3 line-clamp-2">
          {description}
        </p>
      )}

      {/* Metadata */}
      <div className="flex flex-wrap items-center gap-1.5">
        {project && (
          <span className="px-2 py-0.5 text-xs rounded bg-dark-panel2 border border-dark-border text-dark-muted font-medium">
            {project}
          </span>
        )}
        {/* Priority — dot + label, no colored background */}
        <span className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${prio.dot}`} />
          <span className={`text-xs font-medium ${prio.text}`}>{priority || "Med"}</span>
        </span>
        {dueDate && (
          <span className="text-xs text-dark-muted">{dueDate}</span>
        )}
        {/* Actions */}
        <div className="flex items-center gap-1 ml-auto">
          {onMoveToDone && (
            <button
              onClick={(e) => { e.stopPropagation(); onMoveToDone(); }}
              className="p-1 rounded hover:bg-dark-success/10 transition-colors"
              title="Move to Done"
            >
              <CheckCircle2 size={16} className="text-dark-muted hover:text-dark-success" />
            </button>
          )}
          <button
            onClick={onEdit}
            className="p-1 rounded hover:bg-dark-panel2 transition-colors"
            title="Edit"
          >
            <Edit size={16} className="text-dark-muted" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded hover:bg-dark-danger/10 transition-colors"
            title="Delete"
          >
            <Trash2 size={16} className="text-dark-muted hover:text-dark-danger" />
          </button>
        </div>
      </div>
    </div>
  );
}
