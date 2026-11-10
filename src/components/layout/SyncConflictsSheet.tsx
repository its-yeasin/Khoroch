"use client";

import React from "react";
import { AlertTriangle, Clock, RefreshCw, Trash2 } from "lucide-react";
import { ModalOrSheet } from "@/components/ui/ModalOrSheet";
import { useWallet } from "@/lib/offline/wallet-store";
import { formatMoney } from "@/lib/money";

export function SyncConflictsSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    pendingOps,
    isOnline,
    isSyncing,
    syncNow,
    discardFailedOp,
    lastSyncedAt,
    settings,
  } = useWallet();

  return (
    <ModalOrSheet
      open={open}
      onClose={onClose}
      title="Offline Sync Queue"
      subtitle={
        lastSyncedAt
          ? `Last synced ${new Date(lastSyncedAt).toLocaleString()}`
          : "Manage pending and failed offline operations"
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-xs dark:bg-slate-900/70">
          <span className="font-medium text-slate-600 dark:text-slate-300">
            Connection: {isOnline ? "Online" : "Offline"}
          </span>
          <button
            type="button"
            disabled={!isOnline || isSyncing || pendingOps.length === 0}
            onClick={() => syncNow(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`}
            />
            {isSyncing ? "Syncing..." : "Retry All"}
          </button>
        </div>

        {pendingOps.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            All operations are synchronized with the server.
          </p>
        ) : (
          <div className="space-y-3">
            {pendingOps.map((op) => {
              const amount = op.payload?.amount
                ? formatMoney(String(op.payload.amount), settings.currencySymbol)
                : "";
              const label = String(
                op.payload?.type || op.payload?.name || op.opType,
              ).replaceAll("_", " ");

              return (
                <div
                  key={op.opId}
                  className={`rounded-2xl border p-4 ${
                    op.status === "FAILED"
                      ? "border-rose-500/35 bg-rose-50/70 dark:bg-rose-950/30"
                      : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        {op.status === "FAILED" ? (
                          <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                        ) : (
                          <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        )}
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                          {label}
                          {amount ? ` · ${amount}` : ""}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Queued {new Date(op.createdAt).toLocaleString()}
                      </p>
                      {op.errorMessage && (
                        <p className="mt-2 rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-700 dark:text-rose-300">
                          {op.errorMessage}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => discardFailedOp(op.opId)}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-600 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                      title="Discard local pending operation"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Discard
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ModalOrSheet>
  );
}
