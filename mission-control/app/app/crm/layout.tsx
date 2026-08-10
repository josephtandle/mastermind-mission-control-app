"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

function FolderTabs() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-dark-border/80">
      {SECTIONS.map((section) => {
        const active = pathname === section.href;
        return (
          <Link
            key={section.href}
            href={section.href}
            className={`rounded-t-xl border border-b-0 px-4 py-3 text-sm font-medium transition ${
              active
                ? "border-dark-border bg-dark-panel2 text-dark-text"
                : "border-transparent bg-transparent text-dark-muted hover:border-dark-border/60 hover:bg-dark-panel2/70 hover:text-dark-text"
            }`}
          >
            {section.label}
          </Link>
        );
      })}
    </div>
  );
}

const SECTIONS = [
  { href: "/app/crm/pipeline", label: "Pipeline" },
  { href: "/app/crm/contacts", label: "Contacts" },
  { href: "/app/crm/activity", label: "Activity" },
  { href: "/app/crm/templates", label: "Templates" },
  { href: "/app/crm/automations", label: "Automations" },
  { href: "/app/crm/approval", label: "Approval" },
  { href: "/app/crm/settings", label: "Settings" },
];

export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0">
        <FolderTabs />
      </div>
      <div className="flex-1 min-h-0">
        {children}
      </div>
    </div>
  );
}
