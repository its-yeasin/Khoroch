import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { hashPassword } from "@/lib/auth/password";
import { resetTransactionSupportCache } from "@/lib/db/transaction";
import { UserModel } from "@/lib/db/models/User";
import { getOfflineDB, resetOfflineDBInstance } from "@/lib/offline/db";
import {
  createLocalAccount,
  createLocalCategory,
  createLocalTransaction,
} from "@/lib/offline/local-ledger";
import {
  applySnapshotToOfflineDB,
  discardPendingOperation,
} from "@/lib/offline/sync-engine";
import { ensureUserBootstrap } from "@/lib/services/bootstrap";
import {
  getFullSnapshot,
  processSyncBatch,
} from "@/lib/services/sync-service";

let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  await mongoose.connect(replSet.getUri());
  resetTransactionSupportCache();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

beforeEach(async () => {
  const collections = await mongoose.connection.db?.collections();
  if (collections) {
    for (const c of collections) {
      await c.deleteMany({});
    }
  }
  const db = getOfflineDB();
  await db.delete();
  await resetOfflineDBInstance();
});

describe("Scenario 7: Offline-first IndexedDB operations & backend synchronization", () => {
  it("queues offline accounts, categories, transactions, survives reload, syncs cleanly without duplicates, and preserves failed conflicts", async () => {
    const user = await UserModel.create({
      name: "Offline Tester",
      email: "offline@example.com",
      passwordHash: await hashPassword("OfflinePass123"),
    });
    const userId = user._id.toString();
    await ensureUserBootstrap(userId);

    // 1. Online initial load caches snapshot to IndexedDB
    const initialSnapshot = await getFullSnapshot(userId);
    await applySnapshotToOfflineDB(userId, initialSnapshot);

    const db = getOfflineDB();
    const cachedAccounts = await db.accounts.where("userId").equals(userId).toArray();
    const cash = cachedAccounts.find((a) => a.isDefault && a.category === "CASH")!;
    expect(cash.currentMainBalance).toBe("0.00");

    // 2. Disconnect internet: perform offline operations
    const offlineAlex = await createLocalAccount(userId, {
      name: "Alex",
      category: "CUSTOM",
    });
    const offlineCat = await createLocalCategory(userId, {
      name: "Snacks",
      icon: "coffee",
      color: "#F97316",
    });
    await createLocalTransaction(userId, {
      type: "ADD_BALANCE",
      amount: "500",
      toAccountId: cash.id,
      description: "Pocket cash",
    });
    await createLocalTransaction(userId, {
      type: "EXPENSE",
      amount: "100",
      fromAccountId: cash.id,
      expenseCategoryId: offlineCat.id,
      description: "Coffee & snacks",
    });
    await createLocalTransaction(userId, {
      type: "LOAN_GIVEN",
      amount: "150",
      fromAccountId: cash.id,
      toAccountId: offlineAlex.id,
      description: "Lent offline",
    });

    // Simulate reload while still offline (close & re-open Dexie)
    await resetOfflineDBInstance();
    const dbReloaded = getOfflineDB();
    const reloadedCash = await dbReloaded.accounts.get(cash.id);
    expect(reloadedCash?.currentMainBalance).toBe("250.00");
    const pendingOps = await dbReloaded.pendingOps
      .where("userId")
      .equals(userId)
      .sortBy("createdAt");
    expect(pendingOps).toHaveLength(5);

    // 3. Reconnect & synchronize with server
    const syncRes = await processSyncBatch(userId, pendingOps);
    expect(syncRes.results.every((r) => r.status === "SYNCED")).toBe(true);
    expect(syncRes.snapshot.accounts.find((a) => a.isDefault)?.currentMainBalance).toBe(
      "250.00",
    );
    expect(syncRes.snapshot.loans[0]?.outstandingAmount).toBe("150.00");

    // 4. Retry exact same sync batch -> MUST NOT duplicate transactions
    const retryRes = await processSyncBatch(userId, pendingOps);
    expect(retryRes.results.every((r) => r.status === "SYNCED")).toBe(true);
    expect(retryRes.snapshot.transactions).toHaveLength(3);
    expect(retryRes.snapshot.accounts.find((a) => a.isDefault)?.currentMainBalance).toBe(
      "250.00",
    );

    // Clear synced ops locally & apply authoritative snapshot
    await dbReloaded.pendingOps.clear();
    await applySnapshotToOfflineDB(userId, syncRes.snapshot);

    // 5. Conflict / Insufficient balance failure preservation test:
    // Record a local 200 expense (succeeds locally against 250), AND force a server conflict
    // by spending 200 on server directly from another session, then syncing!
    await createLocalTransaction(userId, {
      type: "EXPENSE",
      amount: "200",
      fromAccountId: cash.id,
      expenseCategoryId: syncRes.snapshot.categories[0].id,
      description: "Conflicting offline expense",
    });
    // Meanwhile another device spends 100 on server (server Cash becomes 150)
    await processSyncBatch(userId, [
      {
        opId: "other-device-op",
        opType: "CREATE_TRANSACTION",
        clientEntityId: "other-device-tx-001",
        payload: {
          type: "EXPENSE",
          amount: "100",
          fromAccountId: cash.id,
          expenseCategoryId: syncRes.snapshot.categories[0].id,
          description: "Other device expense",
        },
        createdAt: new Date().toISOString(),
      },
    ]);

    const conflictOps = await dbReloaded.pendingOps
      .where("userId")
      .equals(userId)
      .sortBy("createdAt");
    const conflictBatch = await processSyncBatch(userId, conflictOps);
    expect(conflictBatch.results[0].status).toBe("FAILED");
    expect(conflictBatch.results[0].code).toBe("INSUFFICIENT_BALANCE");

    // Mark failed locally and apply server snapshot — failed tx MUST NOT be silently discarded
    await dbReloaded.pendingOps.put({
      ...conflictOps[0],
      status: "FAILED",
      errorCode: conflictBatch.results[0].code,
      errorMessage: conflictBatch.results[0].message,
    });
    const failedTx = await dbReloaded.transactions
      .where("clientTransactionId")
      .equals(conflictOps[0].clientEntityId)
      .first();
    await dbReloaded.transactions.put({
      ...failedTx!,
      syncStatus: "FAILED",
      syncError: conflictBatch.results[0].message,
    });

    await applySnapshotToOfflineDB(userId, conflictBatch.snapshot);

    const cashAfterConflict = await dbReloaded.accounts.get(cash.id);
    // Server balance (150.00) is authoritative — NOT overwritten by local failed debit!
    expect(cashAfterConflict?.currentMainBalance).toBe("150.00");
    // Failed transaction stays visible locally for user review
    const preservedFailed = await dbReloaded.transactions
      .where("clientTransactionId")
      .equals(conflictOps[0].clientEntityId)
      .first();
    expect(preservedFailed?.syncStatus).toBe("FAILED");

    // User discards failed op
    await discardPendingOperation(userId, conflictOps[0].opId);
    const remainingOps = await dbReloaded.pendingOps
      .where("userId")
      .equals(userId)
      .toArray();
    expect(remainingOps).toHaveLength(0);
  });
});
