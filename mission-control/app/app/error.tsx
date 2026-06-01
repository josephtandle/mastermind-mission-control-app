"use client";

import { AlertCircle, RefreshCw } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <AlertCircle className="text-dark-danger mb-4" size={40} />
      <h2 className="text-lg  font-semibold text-dark-text mb-2">
        Something went wrong
      </h2>
      <p className="text-sm text-dark-muted mb-6 text-center max-w-md">
        {error.message || "An unexpected error occurred"}
      </p>
      <button
        onClick={reset}
        className="flex items-center gap-2 px-4 py-2 bg-cm-purple text-white rounded-lg hover:bg-cm-purple/80 transition-colors"
      >
        <RefreshCw size={16} />
        Try again
      </button>
    </div>
  );
}
