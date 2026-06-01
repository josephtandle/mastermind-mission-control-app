"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import DynamicFavicon from "@/components/DynamicFavicon";
import {
  CheckSquare,
  Boxes,
  FolderOpen,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

const APP_NAME = "Mission Control";
const LOGO_PATH = "/icon-rounded.png";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tasksOpen, setTasksOpen] = useState(true);

  const isTasksActive =
    pathname === "/app/tasks" || pathname.startsWith("/app/tasks/");
  const isProjectsActive = pathname.startsWith("/app/tasks/projects");
  const isFilesActive = pathname.startsWith("/app/projects");

  const pageTitle = useMemo(() => {
    if (pathname.startsWith("/app/tasks/projects")) return "Projects";
    if (pathname.startsWith("/app/tasks")) return "Tasks";
    if (pathname.startsWith("/app/projects")) return "File Browser";
    return APP_NAME;
  }, [pathname]);

  return (
    <div className="flex h-screen bg-dark-bg">
      <DynamicFavicon logoPath={LOGO_PATH} />

      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-20"
        } bg-dark-sidebar border-r border-dark-border transition-all duration-300 flex flex-col overflow-hidden`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-border bg-gradient-to-r from-cm-purple/15 to-dark-sidebar">
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <img
                src={LOGO_PATH}
                alt={APP_NAME}
                className="w-7 h-7 rounded-lg object-cover flex-shrink-0"
              />
              <h1 className="font-bold tracking-tight text-dark-text whitespace-nowrap text-sm">
                {APP_NAME}
              </h1>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 rounded-lg hover:bg-dark-panel2 transition-colors"
          >
            {sidebarOpen ? (
              <PanelLeftClose size={20} className="text-dark-muted" />
            ) : (
              <PanelLeftOpen size={20} className="text-dark-muted" />
            )}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {/* Tasks — parent with accordion */}
          <div>
            <div
              className={`flex items-center gap-2 py-2 px-2 rounded-lg transition-colors group ${
                isTasksActive && !isProjectsActive
                  ? "bg-cm-purple/15 text-cm-purple font-medium"
                  : "text-dark-muted hover:bg-cm-purple/10 hover:text-cm-purple"
              }`}
            >
              <Link
                href="/app/tasks"
                title={!sidebarOpen ? "Tasks" : undefined}
                className="flex items-center gap-2 flex-1 min-w-0"
              >
                <CheckSquare size={20} className="flex-shrink-0" />
                {sidebarOpen && <span className="truncate">Tasks</span>}
              </Link>
              {sidebarOpen && (
                <button
                  onClick={() => setTasksOpen(!tasksOpen)}
                  className="ml-auto p-0.5 rounded hover:bg-cm-purple/15 transition-colors flex-shrink-0"
                >
                  <ChevronRight
                    size={14}
                    className={`transition-transform duration-200 ${
                      tasksOpen ? "rotate-90" : ""
                    }`}
                  />
                </button>
              )}
            </div>

            {/* Projects — child of Tasks */}
            {tasksOpen && sidebarOpen && (
              <div className="mt-0.5 ml-2 border-l-2 border-cm-purple/20 pl-3">
                <Link
                  href="/app/tasks/projects"
                  className={`flex items-center gap-2 py-1.5 px-2 rounded-lg text-sm transition-colors ${
                    isProjectsActive
                      ? "bg-cm-purple/15 text-cm-purple font-medium"
                      : "text-dark-muted hover:bg-cm-purple/10 hover:text-cm-purple"
                  }`}
                >
                  <Boxes size={14} className="flex-shrink-0" />
                  <span className="truncate">Projects</span>
                </Link>
              </div>
            )}
          </div>

          {/* File Browser */}
          <Link
            href="/app/projects"
            title={!sidebarOpen ? "File Browser" : undefined}
            className={`flex items-center gap-2 py-2 px-2 rounded-lg transition-colors ${
              isFilesActive
                ? "bg-cm-purple/15 text-cm-purple font-medium"
                : "text-dark-muted hover:bg-cm-purple/10 hover:text-cm-purple"
            }`}
          >
            <FolderOpen size={20} className="flex-shrink-0" />
            {sidebarOpen && <span className="truncate">File Browser</span>}
          </Link>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-dark-border space-y-2">
          <div className="flex items-center gap-2 text-xs text-dark-muted">
            <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
            {sidebarOpen && <span className="truncate">Ready</span>}
          </div>
          {sidebarOpen && (
            <p className="text-[10px] text-dark-muted/60 leading-snug">
              A gift from Joe Che, part of his All Sorted AI operating system.
            </p>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="h-16 bg-dark-panel border-b border-dark-border flex items-center px-6 bg-gradient-to-r from-dark-panel via-dark-panel to-cm-purple/10">
          <h2 className="text-lg font-bold tracking-tight text-dark-text">
            {pageTitle}
          </h2>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="p-6 flex-1 flex flex-col min-h-0 overflow-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
