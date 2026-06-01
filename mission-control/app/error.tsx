"use client";

import { AlertCircle, RefreshCw } from "lucide-react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
      <AlertCircle className="text-red-500 mb-4" size={48} />
      <h2 className="text-xl font-semibold text-slate-900 mb-2">
        Something went wrong
      </h2>
      <p className="text-slate-500 mb-6 text-center max-w-md">
        {error.message || "An unexpected error occurred"}
      </p>
      <button
        onClick={reset}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        <RefreshCw size={16} />
        Try again
      </button>
    </div>
  );
}
