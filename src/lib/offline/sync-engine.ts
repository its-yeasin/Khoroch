import { getOfflineDB } from "@/lib/offline/db";
import { recalculateLocalLedger } from "@/lib/offline/local-ledger";
import type {
  AccountDTO,
  ExpenseCategoryDTO,
  LoanDTO,
  PendingOperation,
  SettingsDTO,
  TransactionDTO,
  UserDTO,
} from "@/lib/types";

export interface ServerSnapshot {
  user: UserDTO | null;
  accounts: AccountDTO[];
  categories: ExpenseCategoryDTO[];
  transactions: TransactionDTO[];
  loans: LoanDTO[];
  settings: SettingsDTO | null;
  syncedAt: string;
}

export interface SyncBatchResponse {
  results: Array<{
    opId: string;
    opType: PendingOperation["opType"];
    clientEntityId: string;
    status: "SYNCED" | "FAILED";
    serverEntityId?: string;
    duplicate?: boolean;
    code?: string;
    message?: string;
  }>;
  snapshot: ServerSnapshot;
}

export interface SyncRunResult {
  syncedCount: number;
  failedCount: number;
  snapshot: ServerSnapshot | null;
}

let inFlightSync: Promise<SyncRunResult> | null = null;

export async function applySnapshotToOfflineDB(
  userId: string,
  snapshot: ServerSnapshot,
): Promise<void> {
  const db = getOfflineDB();

  await db.transaction(
    "rw",
    [
      db.accounts,
      db.categories,
      db.transactions,
      db.loans,
      db.settings,
      db.users,
      db.pendingOps,
      db.meta,
    ],
    async () => {
      const remainingOps = await db.pendingOps
        .where("userId")
        .equals(userId)
        .toArray();

      const pendingAccountIds = new Set(
        remainingOps
          .filter((o) => o.opType === "CREATE_ACCOUNT")
          .map((o) => o.clientEntityId),
      );
      const pendingCategoryIds = new Set(
        remainingOps
          .filter((o) => o.opType === "CREATE_CATEGORY")
          .map((o) => o.clientEntityId),
      );
      const pendingTxIds = new Set(
        remainingOps
          .filter((o) => o.opType === "CREATE_TRANSACTION")
          .map((o) => o.clientEntityId),
      );

      const existingAccounts = await db.accounts
        .where("userId")
        .equals(userId)
        .toArray();
      const preservedLocalAccounts = existingAccounts.filter(
        (a) =>
          pendingAccountIds.has(a.id) &&
          !snapshot.accounts.some(
            (sa) => sa.clientId && sa.clientId === a.clientId,
          ),
      );

      const existingCategories = await db.categories
        .where("userId")
        .equals(userId)
        .toArray();
      const preservedLocalCategories = existingCategories.filter(
        (c) =>
          pendingCategoryIds.has(c.id) &&
          !snapshot.categories.some(
            (sc) => sc.clientId && sc.clientId === c.clientId,
          ),
      );

      const existingTxs = await db.transactions
        .where("userId")
        .equals(userId)
        .toArray();
      const preservedLocalTxs = existingTxs.filter(
        (t) =>
          (t.syncStatus === "FAILED" || pendingTxIds.has(t.clientTransactionId)) &&
          !snapshot.transactions.some(
            (st) => st.clientTransactionId === t.clientTransactionId,
          ),
      );

      await db.accounts.where("userId").equals(userId).delete();
      await db.categories.where("userId").equals(userId).delete();
      await db.transactions.where("userId").equals(userId).delete();
      await db.loans.where("userId").equals(userId).delete();

      await db.accounts.bulkPut([
        ...snapshot.accounts,
        ...preservedLocalAccounts,
      ]);
      await db.categories.bulkPut([
        ...snapshot.categories,
        ...preservedLocalCategories,
      ]);
      await db.transactions.bulkPut([
        ...snapshot.transactions,
        ...preservedLocalTxs,
      ]);
      await db.loans.bulkPut(snapshot.loans);

      if (snapshot.settings) {
        await db.settings.put(snapshot.settings);
      }
      if (snapshot.user) {
        await db.users.put(snapshot.user);
        await db.meta.put({ key: "activeUserId", value: snapshot.user.id });
      }
      await db.meta.put({ key: "lastSyncedAt", value: snapshot.syncedAt });
    },
  );
}

export async function pullServerSnapshot(
  userId: string,
): Promise<ServerSnapshot> {
  const res = await fetch("/api/sync", {
    method: "GET",
    cache: "no-store",
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(
      errBody?.error?.message || `Failed to refresh data (${res.status})`,
    );
  }
  const snapshot = (await res.json()) as ServerSnapshot;
  await applySnapshotToOfflineDB(userId, snapshot);
  return snapshot;
}

export async function synchronizePendingOperations(
  userId: string,
  options?: { includeFailed?: boolean },
): Promise<SyncRunResult> {
  if (inFlightSync) {
    return inFlightSync;
  }

  inFlightSync = (async () => {
    const db = getOfflineDB();
    const allOps = await db.pendingOps
      .where("userId")
      .equals(userId)
      .sortBy("createdAt");

    const opsToSend = allOps.filter((o) =>
      options?.includeFailed
        ? o.status === "PENDING" || o.status === "FAILED"
        : o.status === "PENDING",
    );

    if (opsToSend.length === 0) {
      const snapshot = await pullServerSnapshot(userId);
      return { syncedCount: 0, failedCount: 0, snapshot };
    }

    // Mark syncing
    await db.pendingOps.bulkPut(
      opsToSend.map((o) => ({ ...o, status: "SYNCING" as const })),
    );

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operations: opsToSend.map((o) => ({
            opId: o.opId,
            opType: o.opType,
            clientEntityId: o.clientEntityId,
            payload: o.payload,
            createdAt: o.createdAt,
          })),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        // Revert back to PENDING on transient server/network/5xx failure; keep auth error visible
        await db.pendingOps.bulkPut(
          opsToSend.map((o) => ({
            ...o,
            status: res.status === 401 ? ("FAILED" as const) : ("PENDING" as const),
            errorMessage:
              res.status === 401
                ? "Session expired. Sign in again to sync."
                : body?.error?.message,
          })),
        );
        throw new Error(
          body?.error?.message || `Synchronization failed (${res.status})`,
        );
      }

      const data = (await res.json()) as SyncBatchResponse;
      let syncedCount = 0;
      let failedCount = 0;

      const opById = new Map(opsToSend.map((o) => [o.opId, o]));

      await db.transaction(
        "rw",
        [db.pendingOps, db.transactions],
        async () => {
          for (const result of data.results) {
            const orig = opById.get(result.opId);
            if (!orig) continue;

            if (result.status === "SYNCED") {
              syncedCount += 1;
              await db.pendingOps.delete(result.opId);
            } else {
              failedCount += 1;
              await db.pendingOps.put({
                ...orig,
                status: "FAILED",
                errorCode: result.code,
                errorMessage: result.message || "Synchronization failed.",
                retryCount: orig.retryCount + 1,
              });
              if (orig.opType === "CREATE_TRANSACTION") {
                const localTx = await db.transactions
                  .where("clientTransactionId")
                  .equals(orig.clientEntityId)
                  .first();
                if (localTx) {
                  await db.transactions.put({
                    ...localTx,
                    syncStatus: "FAILED",
                    syncError: result.message || "Synchronization failed.",
                  });
                }
              }
            }
          }
        },
      );

      await applySnapshotToOfflineDB(userId, data.snapshot);

      return { syncedCount, failedCount, snapshot: data.snapshot };
    } catch (err) {
      // If fetch threw due to network drop before reaching server, restore PENDING
      const current = await db.pendingOps.bulkGet(
        opsToSend.map((o) => o.opId),
      );
      const revertOps = current
        .filter((o): o is PendingOperation => Boolean(o && o.status === "SYNCING"))
        .map((o) => ({ ...o, status: "PENDING" as const }));
      if (revertOps.length > 0) {
        await db.pendingOps.bulkPut(revertOps);
      }
      throw err;
    }
  })();

  try {
    return await inFlightSync;
  } finally {
    inFlightSync = null;
  }
}

export async function discardPendingOperation(
  userId: string,
  opId: string,
): Promise<void> {
  const db = getOfflineDB();
  const op = await db.pendingOps.get(opId);
  if (!op || op.userId !== userId) return;

  await db.transaction(
    "rw",
    [db.pendingOps, db.transactions, db.accounts, db.categories, db.loans],
    async () => {
      await db.pendingOps.delete(opId);
      if (op.opType === "CREATE_TRANSACTION") {
        await db.transactions.delete(op.clientEntityId);
      } else if (op.opType === "CREATE_ACCOUNT") {
        await db.accounts.delete(op.clientEntityId);
      } else if (op.opType === "CREATE_CATEGORY") {
        await db.categories.delete(op.clientEntityId);
      }
    },
  );

  try {
    if (typeof navigator !== "undefined" && navigator.onLine) {
      await pullServerSnapshot(userId);
      return;
    }
  } catch {
    // Fallback to local ledger recalculation if offline
  }

  await recalculateLocalLedger(userId).catch(() => undefined);
}
