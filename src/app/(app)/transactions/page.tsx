"use client";

import React, { useMemo, useState } from "react";
import { ArrowLeftRight, Filter, Plus, Search, X } from "lucide-react";
import { useQuickTransaction } from "@/components/layout/AppShell";
import { TransactionDetailModal } from "@/components/transactions/TransactionDetailModal";
import { TransactionList } from "@/components/transactions/TransactionList";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  TRANSACTION_TYPE_META,
  TRANSACTION_TYPES,
  type TransactionType,
} from "@/lib/constants";
import { compareMoney } from "@/lib/money";
import { useWallet } from "@/lib/offline/wallet-store";
import type { TransactionDTO } from "@/lib/types";

const PAGE_SIZE = 30;

export default function TransactionsPage() {
  const { accounts, categories, transactions, isLoading } = useWallet();
  const { openTransactionSheet } = useQuickTransaction();

  const [search, setSearch] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [txType, setTxType] = useState<TransactionType | "">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedTx, setSelectedTx] = useState<TransactionDTO | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (txType && tx.type !== txType) return false;
      if (
        accountId &&
        tx.fromAccountId !== accountId &&
        tx.toAccountId !== accountId
      ) {
        return false;
      }
      if (categoryId && tx.expenseCategoryId !== categoryId) return false;
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
      if (minAmount && /^\d+(\.\d{1,2})?$/.test(minAmount)) {
        if (compareMoney(tx.amount, minAmount) < 0) return false;
      }
      if (maxAmount && /^\d+(\.\d{1,2})?$/.test(maxAmount)) {
        if (compareMoney(tx.amount, maxAmount) > 0) return false;
      }
      if (q) {
        const fromName =
          accounts.find((a) => a.id === tx.fromAccountId)?.name ?? "";
        const toName =
          accounts.find((a) => a.id === tx.toAccountId)?.name ?? "";
        const catName =
          categories.find((c) => c.id === tx.expenseCategoryId)?.name ?? "";
        const hay =
          `${tx.description} ${tx.note} ${fromName} ${toName} ${catName} ${tx.type}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    transactions,
    txType,
    accountId,
    categoryId,
    startDate,
    endDate,
    minAmount,
    maxAmount,
    search,
    accounts,
    categories,
  ]);

  const activeFilterCount = [
    accountId,
    categoryId,
    txType,
    startDate,
    endDate,
    minAmount,
    maxAmount,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearch("");
    setAccountId("");
    setCategoryId("");
    setTxType("");
    setStartDate("");
    setEndDate("");
    setMinAmount("");
    setMaxAmount("");
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 rounded-3xl" />
        <Skeleton className="h-80 rounded-3xl" />
      </div>
    );
  }

  const visibleItems = filtered.slice(0, visibleCount);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
            Transactions
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {filtered.length} matching ledger entr
            {filtered.length === 1 ? "y" : "ies"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => openTransactionSheet()}
          className="inline-flex items-center gap-1.5 rounded-2xl bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-700"
        >
          <Plus className="h-3.5 w-3.5" />
          New Transaction
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="space-y-3 rounded-3xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-[#131A26]">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search description, note, account, category..."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pr-4 pl-10 text-xs text-slate-900 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-2xl border px-3.5 py-2.5 text-xs font-semibold transition ${
              showFilters || activeFilterCount > 0
                ? "border-teal-600 bg-teal-50 text-teal-800 dark:border-teal-500 dark:bg-teal-950/50 dark:text-teal-200"
                : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">
                Type
              </label>
              <select
                value={txType}
                onChange={(e) =>
                  setTxType((e.target.value as TransactionType) || "")
                }
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">All Types</option>
                {TRANSACTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TRANSACTION_TYPE_META[t].label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">
                Account
              </label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">All Accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.category})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">
                Expense Category
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-500">
                  Min Amount
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={minAmount}
                  onChange={(e) =>
                    setMinAmount(e.target.value.replace(/[^0-9.]/g, ""))
                  }
                  placeholder="0"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-500">
                  Max Amount
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={maxAmount}
                  onChange={(e) =>
                    setMaxAmount(e.target.value.replace(/[^0-9.]/g, ""))
                  }
                  placeholder="Any"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">
                From Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">
                To Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
            </div>

            {(activeFilterCount > 0 || search) && (
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear All
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Transaction Ledger List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="No transactions found"
          description={
            transactions.length === 0
              ? "Record your first expense, income, balance addition, or loan."
              : "Try adjusting your search or filter criteria."
          }
          action={
            transactions.length === 0 ? (
              <button
                type="button"
                onClick={() => openTransactionSheet()}
                className="rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white"
              >
                Add Transaction
              </button>
            ) : (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                Reset Filters
              </button>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xs dark:border-slate-800 dark:bg-[#131A26]">
          <TransactionList
            transactions={visibleItems}
            onSelect={setSelectedTx}
          />
          {visibleCount < filtered.length && (
            <div className="border-t border-slate-100 p-4 text-center dark:border-slate-800">
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
              >
                Load more ({filtered.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>
      )}

      <TransactionDetailModal
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
      />
    </div>
  );
}
