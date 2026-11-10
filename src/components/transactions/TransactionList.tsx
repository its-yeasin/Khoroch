"use client";

import React from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  HandCoins,
  PlusCircle,
  Scale,
  Sparkles,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { CategoryIcon } from "@/components/transactions/CategoryIcon";
import { TRANSACTION_TYPE_META } from "@/lib/constants";
import { formatDisplayDate } from "@/lib/date";
import { formatMoney } from "@/lib/money";
import { useWallet } from "@/lib/offline/wallet-store";
import type { TransactionDTO } from "@/lib/types";

function TransactionBadge({ tx }: { tx: TransactionDTO }) {
  const meta = TRANSACTION_TYPE_META[tx.type];
  const baseClass = `flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${meta.bgClass}`;

  switch (tx.type) {
    case "ADD_BALANCE":
      return (
        <div className={baseClass}>
          <PlusCircle className="h-5 w-5" />
        </div>
      );
    case "INCOME":
      return (
        <div className={baseClass}>
          <ArrowDownLeft className="h-5 w-5" />
        </div>
      );
    case "EXPENSE":
      return (
        <div className={baseClass}>
          <ArrowUpRight className="h-5 w-5" />
        </div>
      );
    case "BANK_INTEREST":
      return (
        <div className={baseClass}>
          <Sparkles className="h-5 w-5" />
        </div>
      );
    case "ACCOUNT_TRANSFER":
      return (
        <div className={baseClass}>
          <ArrowLeftRight className="h-5 w-5" />
        </div>
      );
    case "LOAN_RECEIVED":
    case "LOAN_GIVEN":
    case "LOAN_REPAYMENT":
      return (
        <div className={baseClass}>
          <HandCoins className="h-5 w-5" />
        </div>
      );
    case "BALANCE_ADJUSTMENT":
      return (
        <div className={baseClass}>
          <Scale className="h-5 w-5" />
        </div>
      );
  }
}

export function TransactionList({
  transactions,
  onSelect,
}: {
  transactions: TransactionDTO[];
  onSelect?: (tx: TransactionDTO) => void;
}) {
  const { accounts, categories, loans, settings } = useWallet();

  const accMap = React.useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );
  const catMap = React.useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const loanMap = React.useMemo(
    () => new Map(loans.map((l) => [l.id, l])),
    [loans],
  );

  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
      {transactions.map((tx) => {
        const meta = TRANSACTION_TYPE_META[tx.type];
        const fromAcc = tx.fromAccountId ? accMap.get(tx.fromAccountId) : null;
        const toAcc = tx.toAccountId ? accMap.get(tx.toAccountId) : null;
        const cat = tx.expenseCategoryId
          ? catMap.get(tx.expenseCategoryId)
          : null;
        const loan = tx.loanId ? loanMap.get(tx.loanId) : null;

        let routeText = meta.label;
        if (tx.type === "EXPENSE") {
          routeText = `${fromAcc?.name || "Account"} → ${cat?.name || "Expense"}`;
        } else if (tx.type === "ACCOUNT_TRANSFER") {
          routeText = `${fromAcc?.name || "From"} → ${toAcc?.name || "To"}`;
        } else if (tx.type === "LOAN_RECEIVED") {
          routeText = `From ${fromAcc?.name || "Lender"} → ${toAcc?.name || "Account"}`;
        } else if (tx.type === "LOAN_GIVEN") {
          routeText = `From ${fromAcc?.name || "Account"} → ${toAcc?.name || "Borrower"}`;
        } else if (tx.type === "LOAN_REPAYMENT") {
          routeText = `${fromAcc?.name || "From"} → ${toAcc?.name || "To"}`;
        } else if (tx.type === "ADD_BALANCE" || tx.type === "INCOME" || tx.type === "BANK_INTEREST") {
          routeText = `To ${toAcc?.name || "Account"}`;
        } else if (tx.type === "BALANCE_ADJUSTMENT") {
          const target =
            tx.adjustmentDirection === "INCREASE" ? toAcc?.name : fromAcc?.name;
          routeText = `${tx.adjustmentDirection === "INCREASE" ? "+" : "-"} ${target || "Account"}`;
        }

        const isPositive =
          tx.type === "ADD_BALANCE" ||
          tx.type === "INCOME" ||
          tx.type === "BANK_INTEREST" ||
          tx.type === "LOAN_RECEIVED" ||
          (tx.type === "LOAN_REPAYMENT" && loan?.loanType === "GIVEN") ||
          (tx.type === "BALANCE_ADJUSTMENT" &&
            tx.adjustmentDirection === "INCREASE");

        const isNegative =
          tx.type === "EXPENSE" ||
          tx.type === "LOAN_GIVEN" ||
          (tx.type === "LOAN_REPAYMENT" && loan?.loanType === "RECEIVED") ||
          (tx.type === "BALANCE_ADJUSTMENT" &&
            tx.adjustmentDirection === "DECREASE");

        const amountColor = isPositive
          ? "text-emerald-600 dark:text-emerald-400"
          : isNegative
            ? "text-rose-600 dark:text-rose-400"
            : "text-slate-900 dark:text-white";

        const signPrefix = isPositive ? "+" : isNegative ? "-" : "";

        const usesInterest =
          tx.fromBalanceType === "INTEREST" || tx.toBalanceType === "INTEREST";

        return (
          <button
            key={tx.id}
            type="button"
            onClick={() => onSelect?.(tx)}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50/80 dark:hover:bg-slate-800/30"
          >
            {tx.type === "EXPENSE" && cat ? (
              <CategoryIcon icon={cat.icon} color={cat.color} />
            ) : (
              <TransactionBadge tx={tx} />
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                  {tx.description || (tx.type === "EXPENSE" && cat ? cat.name : meta.label)}
                </span>
                {usesInterest && (
                  <span className="shrink-0 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                    Interest
                  </span>
                )}
                {tx.syncStatus === "PENDING" && (
                  <span
                    title="Pending offline sync"
                    className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300"
                  >
                    <Clock className="h-2.5 w-2.5" />
                    Pending
                  </span>
                )}
                {tx.syncStatus === "FAILED" && (
                  <span
                    title={tx.syncError || "Sync failed"}
                    className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-300"
                  >
                    <AlertTriangle className="h-2.5 w-2.5" />
                    Sync Failed
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                {routeText} · {formatDisplayDate(tx.transactionDate, settings.dateFormat)}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <div className={`text-sm font-bold tabular-nums ${amountColor}`}>
                {signPrefix}
                {formatMoney(tx.amount, settings.currencySymbol)}
              </div>
              <div className="text-[10px] font-medium text-slate-400">
                {meta.shortLabel}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
