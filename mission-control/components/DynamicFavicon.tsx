"use client";

import { useEffect } from "react";

/**
 * DynamicFavicon — sets the browser tab favicon to match the logo
 * configured in MC Settings. When logoPath changes (e.g. custom logo
 * uploaded), the favicon updates immediately.
 *
 * Receives logoPath as a prop from the parent layout which already
 * fetches MC settings on mount.
 */

const FALLBACK_FAVICON = "/icon-rounded.png";

function setFavicon(href: string) {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = href;
}

export default function DynamicFavicon({ logoPath }: { logoPath?: string }) {
  useEffect(() => {
    setFavicon(logoPath || FALLBACK_FAVICON);
  }, [logoPath]);

  return null;
}
