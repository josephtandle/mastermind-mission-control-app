export interface NavEntry {
  readonly name: string;
  readonly href: string;
}

export const NAV_ENTRIES: readonly NavEntry[] = [
  { name: "Tasks", href: "/app/tasks" },
  { name: "Projects", href: "/app/tasks/projects" },
  { name: "File Browser", href: "/app/projects" },
  { name: "CRM", href: "/app/crm" },
] as const;
