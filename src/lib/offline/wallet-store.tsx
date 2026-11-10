"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/layout/ThemeProvider";
import { useToast } from "@/components/ui/Toast";
import type { AccountCategory } from "@/lib/constants";
import { getOfflineDB } from "@/lib/offline/db";
import {
  createLocalAccount,
  createLocalCategory,
  createLocalTransaction,
  recalculateLocalLedger,
  type LocalTransactionInput,
} from "@/lib/offline/local-ledger";
import {
  discardPendingOperation,
  pullServerSnapshot,
  synchronizePendingOperations,
} from "@/lib/offline/sync-engine";
import type {
  AccountDTO,
  ExpenseCategoryDTO,
  LoanDTO,
  PendingOperation,
  SettingsDTO,
  TransactionDTO,
  UserDTO,
} from "@/lib/types";

export type SyncBadgeState =
  | "OFFLINE"
  | "SYNCING"
  | "PENDING"
  | "FAILED"
  | "SYNCED";

interface WalletContextValue {
  user: UserDTO | null;
  accounts: AccountDTO[];
  activeAccounts: AccountDTO[];
  categories: ExpenseCategoryDTO[];
  transactions: TransactionDTO[];
  loans: LoanDTO[];
  settings: SettingsDTO;
  pendingOps: PendingOperation[];
  isOnline: boolean;
  isLoading: boolean;
  isSyncing: boolean;
  syncState: SyncBadgeState;
  lastSyncedAt: string | null;
  sessionExpired: boolean;
  syncNow: (includeFailed?: boolean) => Promise<void>;
  discardFailedOp: (opId: string) => Promise<void>;
  createAccount: (input: {
    name: string;
    category: AccountCategory;
    bankName?: string;
    accountNumber?: string;
    initialMainBalance?: string;
    initialInterestBalance?: string;
    interestEnabled?: boolean;
    description?: string;
  }) => Promise<AccountDTO>;
  updateAccount: (
    accountId: string,
    input: {
      name?: string;
      bankName?: string;
      accountNumber?: string;
      interestEnabled?: boolean;
      description?: string;
      isArchived?: boolean;
    },
  ) => Promise<void>;
  deleteOrArchiveAccount: (accountId: string) => Promise<void>;
  createCategory: (input: {
    name: string;
    icon?: string;
    color?: string;
  }) => Promise<ExpenseCategoryDTO>;
  updateCategory: (
    categoryId: string,
    input: { name?: string; icon?: string; color?: string },
  ) => Promise<void>;
  deleteCategory: (categoryId: string) => Promise<void>;
  createTransaction: (input: LocalTransactionInput) => Promise<TransactionDTO>;
  updateTransaction: (
    transactionId: string,
    input: Partial<LocalTransactionInput>,
  ) => Promise<void>;
  deleteTransaction: (transactionId: string) => Promise<void>;
  updateSettings: (
    input: Partial<SettingsDTO> & { name?: string },
  ) => Promise<void>;
  logout: () => Promise<void>;
}

const DEFAULT_SETTINGS: SettingsDTO = {
  userId: "",
  currencyCode: "BDT",
  currencySymbol: "৳",
  dateFormat: "DD MMM YYYY",
  theme: "system",
  defaultDashboardRange: "MONTH",
};

const WalletContext = createContext<WalletContextValue | null>(null);

function isNetworkFailure(err: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (err instanceof TypeError) return true;
  if (err instanceof Error && /network|fetch|offline/i.test(err.message)) {
    return true;
  }
  return false;
}

export function WalletProvider({
  initialUser,
  children,
}: {
  initialUser: UserDTO | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const { setTheme } = useTheme();
  const db = useMemo(() => getOfflineDB(), []);

  const [user, setUser] = useState<UserDTO | null>(initialUser);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Resolve cached user when booted offline
  useEffect(() => {
    let active = true;
    async function initUser() {
      if (initialUser) {
        await db.users.put(initialUser);
        await db.meta.put({ key: "activeUserId", value: initialUser.id });
        if (active) {
          setUser(initialUser);
        }
      } else {
        const meta = await db.meta.get("activeUserId");
        const cachedId = meta?.value ? String(meta.value) : null;
        if (cachedId) {
          const cachedUser = await db.users.get(cachedId);
          if (cachedUser && active) {
            setUser(cachedUser);
          }
        }
      }
      if (active) setBootstrapped(true);
    }
    initUser();
    return () => {
      active = false;
    };
  }, [db, initialUser]);

  const userId = user?.id ?? "";

  const accountsRaw = useLiveQuery(
    () =>
      userId
        ? db.accounts.where("userId").equals(userId).toArray()
        : Promise.resolve([] as AccountDTO[]),
    [db, userId],
  );
  const categoriesRaw = useLiveQuery(
    () =>
      userId
        ? db.categories.where("userId").equals(userId).toArray()
        : Promise.resolve([] as ExpenseCategoryDTO[]),
    [db, userId],
  );
  const transactionsRaw = useLiveQuery(
    () =>
      userId
        ? db.transactions.where("userId").equals(userId).toArray()
        : Promise.resolve([] as TransactionDTO[]),
    [db, userId],
  );
  const loansRaw = useLiveQuery(
    () =>
      userId
        ? db.loans.where("userId").equals(userId).toArray()
        : Promise.resolve([] as LoanDTO[]),
    [db, userId],
  );
  const settingsRaw = useLiveQuery(
    async () => (userId ? db.settings.get(userId) : undefined),
    [db, userId],
  );
  const pendingOpsRaw = useLiveQuery(
    () =>
      userId
        ? db.pendingOps.where("userId").equals(userId).sortBy("createdAt")
        : Promise.resolve([] as PendingOperation[]),
    [db, userId],
  );
  const lastSyncMeta = useLiveQuery(
    async () => db.meta.get("lastSyncedAt"),
    [db],
  );

  const accounts = useMemo(
    () =>
      [...(accountsRaw ?? [])].sort((a, b) => {
        if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
        return a.createdAt.localeCompare(b.createdAt);
      }),
    [accountsRaw],
  );
  const activeAccounts = useMemo(
    () => accounts.filter((a) => !a.isArchived),
    [accounts],
  );
  const categories = useMemo(
    () =>
      [...(categoriesRaw ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [categoriesRaw],
  );
  const transactions = useMemo(
    () =>
      (transactionsRaw ?? [])
        .filter((t) => !t.isDeleted)
        .sort(
          (a, b) =>
            new Date(b.transactionDate).getTime() -
              new Date(a.transactionDate).getTime() ||
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [transactionsRaw],
  );
  const loans = useMemo(
    () =>
      (loansRaw ?? [])
        .filter((l) => !l.isDeleted)
        .sort(
          (a, b) =>
            new Date(b.loanDate).getTime() - new Date(a.loanDate).getTime(),
        ),
    [loansRaw],
  );
  const settings = useMemo(
    () => settingsRaw ?? { ...DEFAULT_SETTINGS, userId },
    [settingsRaw, userId],
  );
  const pendingOps = useMemo(() => pendingOpsRaw ?? [], [pendingOpsRaw]);

  useEffect(() => {
    if (settingsRaw?.theme) {
      setTheme(settingsRaw.theme);
    }
  }, [settingsRaw?.theme, setTheme]);

  const syncNow = useCallback(
    async (includeFailed = false) => {
      if (!userId) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setIsOnline(false);
        return;
      }
      setIsSyncing(true);
      try {
        const res = await synchronizePendingOperations(userId, {
          includeFailed,
        });
        setSessionExpired(false);
        if (res.snapshot?.user) {
          setUser(res.snapshot.user);
        }
        if (res.syncedCount > 0 && res.failedCount === 0) {
          showToast(
            `Synchronized ${res.syncedCount} offline operation${res.syncedCount === 1 ? "" : "s"}.`,
            "success",
          );
        } else if (res.failedCount > 0) {
          showToast(
            `${res.failedCount} offline operation${res.failedCount === 1 ? "" : "s"} need attention.`,
            "error",
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Sync failed";
        if (/401|Session expired|Authentication/i.test(msg)) {
          setSessionExpired(true);
        } else if (!isNetworkFailure(err)) {
          showToast(msg, "error");
        }
      } finally {
        setIsSyncing(false);
      }
    },
    [showToast, userId],
  );

  // Register SW and pre-warm shell routes for offline PWA usability
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!userId || !isOnline) return;
    const routes = [
      "/dashboard",
      "/transactions",
      "/accounts",
      "/accounts/offline",
      "/loans",
      "/categories",
      "/settings",
    ];
    for (const r of routes) {
      fetch(r, { credentials: "include" }).catch(() => undefined);
    }
  }, [userId, isOnline]);

  // Listen for connectivity, visibility foregrounding, and initial sync
  useEffect(() => {
    if (!userId) return;

    const handleOnline = () => {
      setIsOnline(true);
      syncNow(false);
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        setIsOnline(true);
        syncNow(false);
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);

    let initialSyncTimer: ReturnType<typeof setTimeout> | undefined;
    if (navigator.onLine) {
      initialSyncTimer = setTimeout(() => {
        void syncNow(false);
      }, 0);
    }

    return () => {
      if (initialSyncTimer) clearTimeout(initialSyncTimer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [syncNow, userId]);

  const createAccount = useCallback(
    async (input: {
      name: string;
      category: AccountCategory;
      bankName?: string;
      accountNumber?: string;
      initialMainBalance?: string;
      initialInterestBalance?: string;
      interestEnabled?: boolean;
      description?: string;
    }): Promise<AccountDTO> => {
      if (!userId) throw new Error("Not signed in.");
      const clientId = crypto.randomUUID();
      if (isOnline && pendingOps.length === 0) {
        try {
          const res = await fetch("/api/accounts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...input, clientId }),
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(
              data?.error?.message || "Failed to create account.",
            );
          }
          await pullServerSnapshot(userId);
          return data.account;
        } catch (err) {
          if (!isNetworkFailure(err)) throw err;
        }
      }
      const local = await createLocalAccount(userId, input);
      showToast("Account saved offline — will sync when online.", "info");
      return local;
    },
    [isOnline, pendingOps.length, showToast, userId],
  );

  const updateAccount = useCallback(
    async (
      accountId: string,
      input: {
        name?: string;
        bankName?: string;
        accountNumber?: string;
        interestEnabled?: boolean;
        description?: string;
        isArchived?: boolean;
      },
    ) => {
      if (!userId) throw new Error("Not signed in.");
      if (!isOnline) {
        throw new Error("Connect to the internet to update account settings.");
      }
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Failed to update account.");
      }
      await pullServerSnapshot(userId);
    },
    [isOnline, userId],
  );

  const deleteOrArchiveAccount = useCallback(
    async (accountId: string) => {
      if (!userId) throw new Error("Not signed in.");
      if (!isOnline) {
        throw new Error("Connect to the internet to archive or delete accounts.");
      }
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Failed to delete account.");
      }
      await pullServerSnapshot(userId);
    },
    [isOnline, userId],
  );

  const createCategory = useCallback(
    async (input: {
      name: string;
      icon?: string;
      color?: string;
    }): Promise<ExpenseCategoryDTO> => {
      if (!userId) throw new Error("Not signed in.");
      const clientId = crypto.randomUUID();
      if (isOnline && pendingOps.length === 0) {
        try {
          const res = await fetch("/api/categories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...input, clientId }),
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(
              data?.error?.message || "Failed to create category.",
            );
          }
          await pullServerSnapshot(userId);
          return data.category;
        } catch (err) {
          if (!isNetworkFailure(err)) throw err;
        }
      }
      const local = await createLocalCategory(userId, input);
      showToast("Category saved offline — will sync when online.", "info");
      return local;
    },
    [isOnline, pendingOps.length, showToast, userId],
  );

  const updateCategory = useCallback(
    async (
      categoryId: string,
      input: { name?: string; icon?: string; color?: string },
    ) => {
      if (!userId) throw new Error("Not signed in.");
      if (!isOnline) {
        throw new Error("Connect to the internet to edit categories.");
      }
      const res = await fetch(`/api/categories/${categoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Failed to update category.");
      }
      await pullServerSnapshot(userId);
    },
    [isOnline, userId],
  );

  const deleteCategory = useCallback(
    async (categoryId: string) => {
      if (!userId) throw new Error("Not signed in.");
      if (!isOnline) {
        throw new Error("Connect to the internet to delete categories.");
      }
      const res = await fetch(`/api/categories/${categoryId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Failed to delete category.");
      }
      await pullServerSnapshot(userId);
    },
    [isOnline, userId],
  );

  const createTransaction = useCallback(
    async (input: LocalTransactionInput): Promise<TransactionDTO> => {
      if (!userId) throw new Error("Not signed in.");
      const clientTransactionId =
        input.clientTransactionId || crypto.randomUUID();

      if (isOnline && pendingOps.length === 0) {
        try {
          const res = await fetch("/api/transactions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": clientTransactionId,
            },
            body: JSON.stringify({ ...input, clientTransactionId }),
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(
              data?.error?.message || "Transaction could not be recorded.",
            );
          }
          await pullServerSnapshot(userId);
          return data.transaction;
        } catch (err) {
          if (!isNetworkFailure(err)) throw err;
        }
      }

      const res = await createLocalTransaction(userId, {
        ...input,
        clientTransactionId,
      });
      showToast("Saved offline — will sync automatically.", "info");
      if (isOnline) {
        syncNow(false);
      }
      return res.transaction;
    },
    [isOnline, pendingOps.length, showToast, syncNow, userId],
  );

  const updateTransaction = useCallback(
    async (
      transactionId: string,
      input: Partial<LocalTransactionInput>,
    ) => {
      if (!userId) throw new Error("Not signed in.");
      const localTx = await db.transactions.get(transactionId);

      if (isOnline && localTx?.syncStatus === "SYNCED") {
        const res = await fetch(`/api/transactions/${transactionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            data?.error?.message || "Failed to update transaction.",
          );
        }
        await pullServerSnapshot(userId);
        return;
      }

      if (!localTx) throw new Error("Transaction not found.");

      if (localTx.syncStatus !== "SYNCED") {
        // Update pending CREATE_TRANSACTION op directly
        const op = await db.pendingOps
          .where("clientEntityId")
          .equals(localTx.clientTransactionId)
          .first();
        const prevTx = { ...localTx };
        await db.transactions.put({
          ...localTx,
          ...input,
          updatedAt: new Date().toISOString(),
        });
        try {
          await recalculateLocalLedger(userId);
        } catch (err) {
          await db.transactions.put(prevTx);
          throw err;
        }
        if (op) {
          await db.pendingOps.put({
            ...op,
            status: "PENDING",
            errorMessage: undefined,
            payload: { ...op.payload, ...input },
          });
        }
        if (isOnline) syncNow(false);
        return;
      }

      // Offline edit of a synced transaction
      const prevTx = { ...localTx };
      await db.transactions.put({
        ...localTx,
        ...input,
        syncStatus: "PENDING",
        updatedAt: new Date().toISOString(),
      });
      try {
        await recalculateLocalLedger(userId);
      } catch (err) {
        await db.transactions.put(prevTx);
        throw err;
      }
      await db.pendingOps.put({
        opId: crypto.randomUUID(),
        userId,
        opType: "UPDATE_TRANSACTION",
        clientEntityId: transactionId,
        payload: input as Record<string, unknown>,
        createdAt: new Date().toISOString(),
        status: "PENDING",
        retryCount: 0,
      });
      showToast("Edit queued offline — will sync when online.", "info");
    },
    [db, isOnline, showToast, syncNow, userId],
  );

  const deleteTransaction = useCallback(
    async (transactionId: string) => {
      if (!userId) throw new Error("Not signed in.");
      const localTx = await db.transactions.get(transactionId);

      if (isOnline && localTx?.syncStatus === "SYNCED") {
        const res = await fetch(`/api/transactions/${transactionId}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            data?.error?.message || "Failed to delete transaction.",
          );
        }
        await pullServerSnapshot(userId);
        return;
      }

      if (!localTx) throw new Error("Transaction not found.");

      if (localTx.syncStatus !== "SYNCED") {
        const matchingOp = await db.pendingOps
          .where("clientEntityId")
          .equals(localTx.clientTransactionId)
          .first();
        if (matchingOp) {
          await discardPendingOperation(userId, matchingOp.opId);
        } else {
          await db.transactions.delete(transactionId);
          await recalculateLocalLedger(userId);
        }
        return;
      }

      // Offline delete of synced transaction
      const prevTx = { ...localTx };
      await db.transactions.put({ ...localTx, isDeleted: true });
      try {
        await recalculateLocalLedger(userId);
      } catch (err) {
        await db.transactions.put(prevTx);
        throw err;
      }
      await db.pendingOps.put({
        opId: crypto.randomUUID(),
        userId,
        opType: "DELETE_TRANSACTION",
        clientEntityId: transactionId,
        payload: {},
        createdAt: new Date().toISOString(),
        status: "PENDING",
        retryCount: 0,
      });
      showToast("Deletion queued offline.", "info");
    },
    [db, isOnline, showToast, userId],
  );

  const updateSettings = useCallback(
    async (input: Partial<SettingsDTO> & { name?: string }) => {
      if (!userId) throw new Error("Not signed in.");
      if (input.theme) setTheme(input.theme);
      if (!isOnline) {
        await db.settings.put({ ...settings, ...input, userId });
        showToast("Theme updated locally. Connect to save to cloud.", "info");
        return;
      }
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Failed to update settings.");
      }
      if (data.settings) await db.settings.put(data.settings);
      if (data.user) {
        setUser(data.user);
        await db.users.put(data.user);
      }
    },
    [db, isOnline, setTheme, settings, showToast, userId],
  );

  const discardFailedOp = useCallback(
    async (opId: string) => {
      if (!userId) return;
      await discardPendingOperation(userId, opId);
      showToast("Removed local conflicting operation.", "info");
    },
    [showToast, userId],
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    await db.meta.delete("activeUserId").catch(() => undefined);
    router.push("/login");
    router.refresh();
  }, [db, router]);

  const syncState: SyncBadgeState = useMemo(() => {
    if (isSyncing) return "SYNCING";
    if (pendingOps.some((o) => o.status === "FAILED")) return "FAILED";
    if (!isOnline) return "OFFLINE";
    if (pendingOps.some((o) => o.status === "PENDING")) return "PENDING";
    return "SYNCED";
  }, [isOnline, isSyncing, pendingOps]);

  const isLoading =
    !bootstrapped ||
    (Boolean(userId) &&
      (accountsRaw === undefined || transactionsRaw === undefined));

  return (
    <WalletContext.Provider
      value={{
        user,
        accounts,
        activeAccounts,
        categories,
        transactions,
        loans,
        settings,
        pendingOps,
        isOnline,
        isLoading,
        isSyncing,
        syncState,
        lastSyncedAt: lastSyncMeta?.value ? String(lastSyncMeta.value) : null,
        sessionExpired,
        syncNow,
        discardFailedOp,
        createAccount,
        updateAccount,
        deleteOrArchiveAccount,
        createCategory,
        updateCategory,
        deleteCategory,
        createTransaction,
        updateTransaction,
        deleteTransaction,
        updateSettings,
        logout,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used within WalletProvider");
  }
  return ctx;
}
