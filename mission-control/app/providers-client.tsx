"use client";

import dynamic from "next/dynamic";

const ProvidersInner = dynamic(() => import("./providers").then(m => ({ default: m.Providers })), {
  ssr: false,
});

export function ProvidersWrapper({ children }: { children: React.ReactNode }) {
  return <ProvidersInner>{children}</ProvidersInner>;
}
