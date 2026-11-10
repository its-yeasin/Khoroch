"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  HandCoins,
  Plus,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useQuickTransaction } from "@/components/layout/AppShell";
import {
  CashflowBarChart,
  ExpenseDonutChart,
} from "@/components/dashboard/DashboardCharts";
import { TransactionDetailModal } from "@/components/transactions/TransactionDetailModal";
import { TransactionList } from "@/components/transactions/TransactionList";
import { EmptyState } from "@/components/ui/EmptyState";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import type { DashboardRange } from "@/lib/constants";
import { toDateInputValue } from "@/lib/date";
import { compareMoney, formatMoney } from "@/lib/money";
import { useWallet } from "@/lib/offline/wallet-store";
import { buildDashboardSummaryFromData } from "@/lib/analytics";
import type { TransactionDTO } from "@/lib/types";

const RANGE_OPTIONS: Array<{ id: DashboardRange; label: string }> = [
  { id: "TODAY", label: "Today" },
  { id: "WEEK", label: "Week" },
  { id: "MONTH", label: "Month" },
  { id: "YEAR", label: "Year" },
  { id: "CUSTOM", label: "Custom" },
];

export function DashboardView() {
  const {
    user,
    accounts,
    categories,
    loans,
    transactions,
    settings,
    isLoading,
  } = useWallet();
  const { openTransactionSheet } = useQuickTransaction();

  const [range, setRange] = useState<DashboardRange>(
    settings.defaultDashboardRange || "MONTH",
  );
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return toDateInputValue(d);
  });
  const [customEnd, setCustomEnd] = useState(() => toDateInputValue(new Date()));
  const [selectedTx, setSelectedTx] = useState<TransactionDTO | null>(null);

  const summary = useMemo(
    () =>
      buildDashboardSummaryFromData({
        accounts,
        categories,
        loans,
        transactions,
        range,
        customStart,
        customEnd,
      }),
    [accounts, categories, loans, transactions, range, customStart, customEnd],
  );

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Greeting & Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
          </p>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
            Financial Overview
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openTransactionSheet({ type: "EXPENSE" })}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-[#131A26] dark:text-slate-200"
          >
            <ArrowUpRight className="h-3.5 w-3.5 text-rose-500" />
            Expense
          </button>
          <button
            type="button"
            onClick={() => openTransactionSheet({ type: "ADD_BALANCE" })}
            className="inline-flex items-center gap-1.5 rounded-2xl bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-teal-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Balance
          </button>
        </div>
      </div>

      {/* Hero Total Assets Card */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950 p-6 text-white shadow-lg dark:from-[#111927] dark:to-teal-950/90">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-teal-200">
              <TrendingUp className="h-3 w-3" />
              Net Cash &amp; Bank Assets
            </span>
            <div className="mt-3 text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">
              {formatMoney(summary.totalAssets, settings.currencySymbol)}
            </div>
            <p className="mt-1 text-xs text-slate-300">
              Excludes borrowed loans and custom counterparty accounts
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="rounded-2xl bg-white/8 px-4 py-3 backdrop-blur-xs">
              <div className="text-[11px] text-slate-300">Total Cash</div>
              <div className="mt-0.5 text-base font-bold tabular-nums">
                {formatMoney(summary.totalCash, settings.currencySymbol)}
              </div>
            </div>
            <div className="rounded-2xl bg-white/8 px-4 py-3 backdrop-blur-xs">
              <div className="text-[11px] text-slate-300">Total Banks</div>
              <div className="mt-0.5 text-base font-bold tabular-nums">
                {formatMoney(summary.totalBankBalance, settings.currencySymbol)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Date Range Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setRange(opt.id)}
              className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                range === opt.id
                  ? "bg-slate-900 text-white dark:bg-teal-600"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-[#131A26] dark:text-slate-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {range === "CUSTOM" && (
          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
        )}
      </div>

      {/* 4 Financial Summary Cards */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-[#131A26]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Income
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
              <ArrowDownLeft className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-lg font-bold text-slate-900 tabular-nums dark:text-white">
            {formatMoney(summary.totalIncome, settings.currencySymbol)}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-[#131A26]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Expenses
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-rose-500/12 text-rose-600 dark:text-rose-400">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-lg font-bold text-slate-900 tabular-nums dark:text-white">
            {formatMoney(summary.totalExpenses, settings.currencySymbol)}
          </div>
        </div>

        <Link
          href="/loans?tab=RECEIVED"
          className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-2xs transition hover:border-violet-500/40 dark:border-slate-800 dark:bg-[#131A26]"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Loans I Owe
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-violet-500/12 text-violet-600 dark:text-violet-400">
              <HandCoins className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-lg font-bold text-violet-600 tabular-nums dark:text-violet-400">
            {formatMoney(
              summary.totalOutstandingLoansReceived,
              settings.currencySymbol,
            )}
          </div>
        </Link>

        <Link
          href="/loans?tab=GIVEN"
          className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-2xs transition hover:border-sky-500/40 dark:border-slate-800 dark:bg-[#131A26]"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Loans Receivable
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-sky-500/12 text-sky-600 dark:text-sky-400">
              <HandCoins className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-lg font-bold text-sky-600 tabular-nums dark:text-sky-400">
            {formatMoney(
              summary.totalOutstandingLoansGiven,
              settings.currencySymbol,
            )}
          </div>
        </Link>
      </section>

      {/* Account Cards (Strictly Cash & Bank only; Custom accounts excluded!) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Accounts
          </h2>
          <Link
            href="/accounts"
            className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-700 dark:text-teal-400"
          >
            Manage Accounts
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summary.walletAccounts.map((acc) => {
            const hasInterest =
              acc.category === "BANK" &&
              acc.interestEnabled &&
              compareMoney(acc.currentInterestBalance, "0.00") >= 0;
            return (
              <Link
                key={acc.id}
                href={`/accounts/${acc.id}`}
                className="group rounded-3xl border border-slate-200/80 bg-white p-4 shadow-2xs transition hover:border-teal-500/40 hover:shadow-sm dark:border-slate-800 dark:bg-[#131A26]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-2xl ${
                        acc.category === "CASH"
                          ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                          : "bg-teal-500/12 text-teal-600 dark:text-teal-400"
                      }`}
                    >
                      {acc.category === "CASH" ? (
                        <Wallet className="h-4.5 w-4.5" />
                      ) : (
                        <Building2 className="h-4.5 w-4.5" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900 group-hover:text-teal-700 dark:text-white dark:group-hover:text-teal-300">
                        {acc.name}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {acc.category === "CASH"
                          ? "Cash Wallet"
                          : acc.bankName || "Bank Account"}
                      </div>
                    </div>
                  </div>
                  {acc.category === "BANK" && acc.interestEnabled && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/12 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                      <Sparkles className="h-2.5 w-2.5" />
                      Interest
                    </span>
                  )}
                </div>

                <div className="mt-4 flex items-baseline justify-between">
                  <span className="text-xl font-bold text-slate-900 tabular-nums dark:text-white">
                    {formatMoney(acc.totalBalance, settings.currencySymbol)}
                  </span>
                  {hasInterest && (
                    <span className="text-[11px] font-medium text-amber-600 tabular-nums dark:text-amber-400">
                      +
                      {formatMoney(
                        acc.currentInterestBalance,
                        settings.currencySymbol,
                        { trimWholeDecimals: true },
                      )}{" "}
                      int
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-[#131A26]">
          <h3 className="mb-4 text-sm font-bold text-slate-900 dark:text-white">
            Expense Breakdown
          </h3>
          <ExpenseDonutChart
            data={summary.expenseByCategory}
            currencySymbol={settings.currencySymbol}
          />
        </div>
        <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-[#131A26]">
          <h3 className="mb-4 text-sm font-bold text-slate-900 dark:text-white">
            Cashflow Trend
          </h3>
          <CashflowBarChart
            series={summary.dailySeries}
            currencySymbol={settings.currencySymbol}
          />
        </div>
      </section>

      {/* Recent Activity */}
      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xs dark:border-slate-800 dark:bg-[#131A26]">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Recent Activity
          </h2>
          <Link
            href="/transactions"
            className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-700 dark:text-teal-400"
          >
            View All
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {summary.recentTransactions.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Wallet}
              title="No transactions yet"
              description="Tap the + button to record your first balance addition, expense, or loan."
              action={
                <button
                  type="button"
                  onClick={() => openTransactionSheet()}
                  className="rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white"
                >
                  Record Transaction
                </button>
              }
            />
          </div>
        ) : (
          <TransactionList
            transactions={summary.recentTransactions}
            onSelect={setSelectedTx}
          />
        )}
      </section>

      <TransactionDetailModal
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
      />
    </div>
  );
}
