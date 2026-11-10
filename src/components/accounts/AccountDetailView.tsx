"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  Building2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  UserCheck,
  Wallet,
} from "lucide-react";
import { AccountFormModal } from "@/components/accounts/AccountFormModal";
import { useQuickTransaction } from "@/components/layout/AppShell";
import { TransactionDetailModal } from "@/components/transactions/TransactionDetailModal";
import { TransactionList } from "@/components/transactions/TransactionList";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { addMoney, formatMoney } from "@/lib/money";
import { useWallet } from "@/lib/offline/wallet-store";
import type { TransactionDTO } from "@/lib/types";

type HistoryFilter =
  | "ALL"
  | "EXPENSE"
  | "INCOME"
  | "ADD_BALANCE"
  | "ACCOUNT_TRANSFER"
  | "LOAN"
  | "LOAN_REPAYMENT"
  | "BANK_INTEREST";

const HISTORY_FILTERS: Array<{ id: HistoryFilter; label: string }> = [
  { id: "ALL", label: "All" },
  { id: "EXPENSE", label: "Expenses" },
  { id: "INCOME", label: "Income" },
  { id: "ADD_BALANCE", label: "Balance Added" },
  { id: "ACCOUNT_TRANSFER", label: "Transfers" },
  { id: "LOAN", label: "Loans" },
  { id: "LOAN_REPAYMENT", label: "Repayments" },
  { id: "BANK_INTEREST", label: "Interest" },
];

export function AccountDetailView({ accountId }: { accountId: string }) {
  const router = useRouter();
  const {
    accounts,
    transactions,
    settings,
    isLoading,
    deleteOrArchiveAccount,
  } = useWallet();
  const { openTransactionSheet } = useQuickTransaction();
  const { showToast } = useToast();

  const [filter, setFilter] = useState<HistoryFilter>("ALL");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<TransactionDTO | null>(null);

  const account = useMemo(
    () => accounts.find((a) => a.id === accountId || a.clientId === accountId),
    [accounts, accountId],
  );

  const accountTxs = useMemo(() => {
    if (!account) return [];
    return transactions.filter(
      (t) => t.fromAccountId === account.id || t.toAccountId === account.id,
    );
  }, [account, transactions]);

  const stats = useMemo(() => {
    let totalAdded = "0.00";
    let totalExpenses = "0.00";
    let totalIncome = "0.00";
    let totalTransfersIn = "0.00";
    let totalTransfersOut = "0.00";
    let totalLoans = "0.00";
    let totalInterest = "0.00";

    if (account) {
      for (const tx of accountTxs) {
        const isFrom = tx.fromAccountId === account.id;
        const isTo = tx.toAccountId === account.id;
        if (tx.type === "ADD_BALANCE" && isTo)
          totalAdded = addMoney(totalAdded, tx.amount);
        else if (tx.type === "EXPENSE" && isFrom)
          totalExpenses = addMoney(totalExpenses, tx.amount);
        else if (tx.type === "INCOME" && isTo)
          totalIncome = addMoney(totalIncome, tx.amount);
        else if (tx.type === "BANK_INTEREST" && isTo)
          totalInterest = addMoney(totalInterest, tx.amount);
        else if (tx.type === "ACCOUNT_TRANSFER") {
          if (isTo) totalTransfersIn = addMoney(totalTransfersIn, tx.amount);
          if (isFrom)
            totalTransfersOut = addMoney(totalTransfersOut, tx.amount);
        } else if (
          tx.type === "LOAN_RECEIVED" ||
          tx.type === "LOAN_GIVEN" ||
          tx.type === "LOAN_REPAYMENT"
        ) {
          totalLoans = addMoney(totalLoans, tx.amount);
        }
      }
    }

    return {
      totalAdded,
      totalExpenses,
      totalIncome,
      totalTransfersIn,
      totalTransfersOut,
      totalLoans,
      totalInterest,
    };
  }, [account, accountTxs]);

  const filteredTxs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accountTxs.filter((tx) => {
      if (filter === "LOAN") {
        if (tx.type !== "LOAN_RECEIVED" && tx.type !== "LOAN_GIVEN")
          return false;
      } else if (filter !== "ALL" && tx.type !== filter) {
        return false;
      }

      if (startDate) {
        const s = new Date(startDate);
        s.setHours(0, 0, 0, 0);
        if (new Date(tx.transactionDate) < s) return false;
      }
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        if (new Date(tx.transactionDate) > e) return false;
      }
      if (q) {
        const hay = `${tx.description} ${tx.note}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [accountTxs, filter, startDate, endDate, search]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-44 rounded-3xl" />
        <Skeleton className="h-32 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );
  }

  if (!account) {
    return (
      <EmptyState
        icon={Wallet}
        title="Account not found"
        description="This account may have been removed or is still syncing."
        action={
          <Link
            href="/accounts"
            className="rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white"
          >
            Back to Accounts
          </Link>
        }
      />
    );
  }

  const handleArchiveOrDelete = async () => {
    try {
      await deleteOrArchiveAccount(account.id);
      showToast("Account archived/deleted.", "success");
      router.push("/accounts");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not delete account.",
        "error",
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/accounts"
          className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Accounts
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
          {!account.isDefault && (
            <button
              type="button"
              onClick={handleArchiveOrDelete}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-slate-700 dark:bg-slate-900 dark:text-rose-400"
            >
              <Archive className="h-3.5 w-3.5" />
              Archive
            </button>
          )}
        </div>
      </div>

      {/* Account Balance Card */}
      <section className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-[#131A26]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500/12 text-teal-600 dark:text-teal-400">
              {account.category === "CASH" ? (
                <Wallet className="h-6 w-6" />
              ) : account.category === "BANK" ? (
                <Building2 className="h-6 w-6" />
              ) : (
                <UserCheck className="h-6 w-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                  {account.name}
                </h1>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {account.category}
                </span>
                {account.isArchived && (
                  <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                    ARCHIVED
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {[account.bankName, account.accountNumberMasked, account.description]
                  .filter(Boolean)
                  .join(" · ") || "Account ledger"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                openTransactionSheet({
                  type: "ADD_BALANCE",
                  toAccountId: account.id,
                })
              }
              className="inline-flex items-center gap-1 rounded-xl bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Balance
            </button>
            <button
              type="button"
              onClick={() =>
                openTransactionSheet({
                  type: "EXPENSE",
                  fromAccountId: account.id,
                })
              }
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
            >
              Record Expense
            </button>
            {account.category === "BANK" && account.interestEnabled && (
              <button
                type="button"
                onClick={() =>
                  openTransactionSheet({
                    type: "BANK_INTEREST",
                    toAccountId: account.id,
                  })
                }
                className="inline-flex items-center gap-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Add Interest
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/60">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total Balance
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
              {formatMoney(account.totalBalance, settings.currencySymbol)}
            </div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/60">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Main Balance
            </div>
            <div className="mt-1 text-2xl font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
              {formatMoney(account.currentMainBalance, settings.currencySymbol)}
            </div>
          </div>
          {account.category === "BANK" && account.interestEnabled && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-50/60 p-4 dark:bg-amber-950/25">
              <div className="text-xs font-medium text-amber-700 dark:text-amber-300">
                Bank Interest Balance
              </div>
              <div className="mt-1 text-2xl font-bold text-amber-600 tabular-nums dark:text-amber-400">
                {formatMoney(
                  account.currentInterestBalance,
                  settings.currencySymbol,
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Account Statistics */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Money Added", val: stats.totalAdded },
          { label: "Expenses", val: stats.totalExpenses },
          { label: "Income", val: stats.totalIncome },
          { label: "Transfers In", val: stats.totalTransfersIn },
          { label: "Transfers Out", val: stats.totalTransfersOut },
          { label: "Loan Activity", val: stats.totalLoans },
        ].map((st) => (
          <div
            key={st.label}
            className="rounded-2xl border border-slate-200/80 bg-white p-3.5 dark:border-slate-800 dark:bg-[#131A26]"
          >
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {st.label}
            </div>
            <div className="mt-1 text-sm font-bold text-slate-900 tabular-nums dark:text-white">
              {formatMoney(st.val, settings.currencySymbol)}
            </div>
          </div>
        ))}
      </section>

      {/* Transaction History */}
      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xs dark:border-slate-800 dark:bg-[#131A26]">
        <div className="space-y-3 border-b border-slate-100 p-4 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Account Transactions ({filteredTxs.length})
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="rounded-xl border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-8 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                aria-label="Start date"
                className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                aria-label="End date"
                className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {HISTORY_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                  filter === f.id
                    ? "bg-slate-900 text-white dark:bg-teal-600"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filteredTxs.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            No transactions match the selected filters.
          </div>
        ) : (
          <TransactionList
            transactions={filteredTxs}
            onSelect={setSelectedTx}
          />
        )}
      </section>

      <AccountFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        editAccount={account}
      />
      <TransactionDetailModal
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
      />
    </div>
  );
}
