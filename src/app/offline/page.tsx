"use client";

import Link from "next/link";
import { RefreshCw, WifiOff } from "lucide-react";

export default function OfflineFallbackPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center dark:bg-[#0B0F17]">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
        <WifiOff className="h-8 w-8" />
      </div>
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">
        You&apos;re Offline
      </h1>
      <p className="mt-2 max-w-sm text-sm text-slate-600 dark:text-slate-400">
        This page hasn&apos;t been cached on your device yet. Return to your
        cached wallet dashboard to view balances or record offline transactions.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/dashboard"
          className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
        >
          Open Dashboard
        </Link>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    </div>
  );
}
