"use client";

import React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  Clock,
  RefreshCw,
} from "lucide-react";
import { useWallet } from "@/lib/offline/wallet-store";

export function SyncStatusBadge({
  onClick,
}: {
  onClick?: () => void;
}) {
  const { syncState, pendingOps, syncNow, isOnline } = useWallet();

  const failedCount = pendingOps.filter((o) => o.status === "FAILED").length;
  const pendingCount = pendingOps.filter((o) => o.status !== "FAILED").length;

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    if (isOnline && pendingCount > 0) {
      syncNow(false);
    }
  };

  if (syncState === "SYNCING") {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-1 text-xs font-semibold text-teal-700 dark:text-teal-300"
      >
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        <span>Syncing</span>
      </button>
    );
  }

  if (syncState === "FAILED") {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/12 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-500/20 dark:text-rose-300"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        <span>Sync Failed ({failedCount})</span>
      </button>
    );
  }

  if (syncState === "OFFLINE") {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/12 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300"
      >
        <CloudOff className="h-3.5 w-3.5" />
        <span>
          Offline{pendingOps.length > 0 ? ` · ${pendingOps.length}` : ""}
        </span>
      </button>
    );
  }

  if (syncState === "PENDING") {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
      >
        <Clock className="h-3.5 w-3.5" />
        <span>Pending ({pendingCount})</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
      title="All changes synced"
    >
      <CheckCircle2 className="h-3.5 w-3.5" />
      <span>Synced</span>
    </button>
  );
}
