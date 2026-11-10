"use client";

import React, { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  HandCoins,
  Plus,
  UserCheck,
} from "lucide-react";
import { useQuickTransaction } from "@/components/layout/AppShell";
import { TransactionDetailModal } from "@/components/transactions/TransactionDetailModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import type { LoanStatus, LoanType } from "@/lib/constants";
import { formatDisplayDate } from "@/lib/date";
import { addMoney, formatMoney } from "@/lib/money";
import { useWallet } from "@/lib/offline/wallet-store";
import type { TransactionDTO } from "@/lib/types";

function StatusBadge({ status }: { status: LoanStatus }) {
  if (status === "FULLY_REPAID") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="h-3 w-3" />
        Fully Repaid
      </span>
    );
  }
  if (status === "PARTIALLY_REPAID") {
    return (
      <span className="rounded-full bg-amber-500/12 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
        Partially Repaid
      </span>
    );
  }
  return (
    <span className="rounded-full bg-rose-500/12 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
      Outstanding
    </span>
  );
}

export function LoansView() {
  const searchParams = useSearchParams();
  const initialTab =
    searchParams.get("tab") === "GIVEN" ? "GIVEN" : "RECEIVED";

  const { accounts, loans, transactions, settings, isLoading } = useWallet();
  const { openTransactionSheet } = useQuickTransaction();

  const [tab, setTab] = useState<LoanType>(initialTab);
  const [selectedPersonId, setSelectedPersonId] = useState<string>("ALL");
  const [selectedTx, setSelectedTx] = useState<TransactionDTO | null>(null);

  const accMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  const tabLoans = useMemo(
    () => loans.filter((l) => !l.isDeleted && l.loanType === tab),
    [loans, tab],
  );

  // Distinct counterparties who have loans in this tab
  const peopleOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const l of tabLoans) {
      if (!seen.has(l.counterpartyAccountId)) {
        seen.set(
          l.counterpartyAccountId,
          accMap.get(l.counterpartyAccountId)?.name || "Unknown",
        );
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [tabLoans, accMap]);

  const filteredLoans = useMemo(
    () =>
      selectedPersonId === "ALL"
        ? tabLoans
        : tabLoans.filter((l) => l.counterpartyAccountId === selectedPersonId),
    [tabLoans, selectedPersonId],
  );

  const summary = useMemo(() => {
    let totalPrincipal = "0.00";
    let totalRepaid = "0.00";
    let totalOutstanding = "0.00";
    for (const l of filteredLoans) {
      totalPrincipal = addMoney(totalPrincipal, l.originalAmount);
      totalRepaid = addMoney(totalRepaid, l.totalRepaid);
      totalOutstanding = addMoney(totalOutstanding, l.outstandingAmount);
    }
    return {
      totalPrincipal,
      totalRepaid,
      totalOutstanding,
      count: filteredLoans.length,
    };
  }, [filteredLoans]);

  // Chronological activity table for selected person (or all in tab)
  const activityHistory = useMemo(() => {
    const loanIds = new Set(filteredLoans.map((l) => l.id));
    return transactions
      .filter((tx) => tx.loanId && loanIds.has(tx.loanId))
      .sort(
        (a, b) =>
          new Date(b.transactionDate).getTime() -
            new Date(a.transactionDate).getTime() ||
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [filteredLoans, transactions]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
            Loans &amp; Repayments
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Track borrowed liabilities, money lent out, and person-wise
            repayment history
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            openTransactionSheet({
              type: tab === "RECEIVED" ? "LOAN_RECEIVED" : "LOAN_GIVEN",
            })
          }
          className="inline-flex items-center gap-1.5 rounded-2xl bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-700"
        >
          <Plus className="h-3.5 w-3.5" />
          {tab === "RECEIVED" ? "Record Loan Received" : "Record Loan Given"}
        </button>
      </div>

      {/* Main Tabs */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-200/70 p-1 dark:bg-slate-800/70">
        <button
          type="button"
          onClick={() => {
            setTab("RECEIVED");
            setSelectedPersonId("ALL");
          }}
          className={`rounded-xl py-2.5 text-xs font-bold transition ${
            tab === "RECEIVED"
              ? "bg-white text-slate-900 shadow-xs dark:bg-[#131A26] dark:text-white"
              : "text-slate-600 dark:text-slate-400"
          }`}
        >
          Loans Received (Money I Owe)
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("GIVEN");
            setSelectedPersonId("ALL");
          }}
          className={`rounded-xl py-2.5 text-xs font-bold transition ${
            tab === "GIVEN"
              ? "bg-white text-slate-900 shadow-xs dark:bg-[#131A26] dark:text-white"
              : "text-slate-600 dark:text-slate-400"
          }`}
        >
          Loans Given (Others Owe Me)
        </button>
      </div>

      {/* Person-wise Filter Chips */}
      {peopleOptions.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedPersonId("ALL")}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              selectedPersonId === "ALL"
                ? "bg-slate-900 text-white dark:bg-teal-600"
                : "border border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-[#131A26] dark:text-slate-300"
            }`}
          >
            All People
          </button>
          {peopleOptions.map((person) => (
            <button
              key={person.id}
              type="button"
              onClick={() => setSelectedPersonId(person.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                selectedPersonId === person.id
                  ? "bg-violet-600 text-white"
                  : "border border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-[#131A26] dark:text-slate-300"
              }`}
            >
              <UserCheck className="h-3.5 w-3.5" />
              {person.name}
            </button>
          ))}
        </div>
      )}

      {/* Summary Cards for Current Tab + Selected Person */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-3xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-[#131A26]">
          <div className="text-xs text-slate-500">
            {tab === "RECEIVED" ? "Total Borrowed" : "Total Lent"}
          </div>
          <div className="mt-1 text-lg font-bold text-slate-900 tabular-nums dark:text-white">
            {formatMoney(summary.totalPrincipal, settings.currencySymbol)}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-[#131A26]">
          <div className="text-xs text-slate-500">
            {tab === "RECEIVED" ? "Total Repaid" : "Total Received Back"}
          </div>
          <div className="mt-1 text-lg font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
            {formatMoney(summary.totalRepaid, settings.currencySymbol)}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-[#131A26]">
          <div className="text-xs text-slate-500">Current Outstanding</div>
          <div className="mt-1 text-lg font-bold text-violet-600 tabular-nums dark:text-violet-400">
            {formatMoney(summary.totalOutstanding, settings.currencySymbol)}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-[#131A26]">
          <div className="text-xs text-slate-500">Number of Loans</div>
          <div className="mt-1 text-lg font-bold text-slate-900 tabular-nums dark:text-white">
            {summary.count}
          </div>
        </div>
      </section>

      {/* Loan Cards */}
      {filteredLoans.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title={
            tab === "RECEIVED"
              ? "No loans received recorded"
              : "No loans given recorded"
          }
          description="Record a loan against any person or bank account — even when their custom account balance is zero."
          action={
            <button
              type="button"
              onClick={() =>
                openTransactionSheet({
                  type: tab === "RECEIVED" ? "LOAN_RECEIVED" : "LOAN_GIVEN",
                })
              }
              className="rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white"
            >
              Record Loan
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filteredLoans.map((loan) => {
            const person = accMap.get(loan.counterpartyAccountId);
            const walletAcc = accMap.get(loan.receivingOrDisbursingAccountId);
            return (
              <div
                key={loan.id}
                className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-[#131A26]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">
                      {person?.name || "Counterparty"}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {tab === "RECEIVED" ? "Into" : "From"}:{" "}
                      {walletAcc?.name || "Account"} ·{" "}
                      {formatDisplayDate(loan.loanDate, settings.dateFormat)}
                    </div>
                  </div>
                  <StatusBadge status={loan.status} />
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-3 text-xs dark:bg-slate-900/60">
                  <div>
                    <div className="text-[10px] text-slate-400">Principal</div>
                    <div className="font-bold text-slate-900 tabular-nums dark:text-white">
                      {formatMoney(
                        loan.originalAmount,
                        settings.currencySymbol,
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">
                      {tab === "RECEIVED" ? "Repaid" : "Received"}
                    </div>
                    <div className="font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                      {formatMoney(loan.totalRepaid, settings.currencySymbol)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">
                      Outstanding
                    </div>
                    <div className="font-bold text-violet-600 tabular-nums dark:text-violet-400">
                      {formatMoney(
                        loan.outstandingAmount,
                        settings.currencySymbol,
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-slate-400">
                    {loan.latestRepaymentDate
                      ? `Last repaid ${formatDisplayDate(loan.latestRepaymentDate, settings.dateFormat)}`
                      : "No repayments yet"}
                  </span>
                  {loan.status !== "FULLY_REPAID" && (
                    <button
                      type="button"
                      onClick={() =>
                        openTransactionSheet({
                          type: "LOAN_REPAYMENT",
                          loanId: loan.id,
                        })
                      }
                      className="rounded-xl bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
                    >
                      Repay
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Chronological Loan & Repayment Activity Table */}
      {activityHistory.length > 0 && (
        <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xs dark:border-slate-800 dark:bg-[#131A26]">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Loan &amp; Repayment History
              {selectedPersonId !== "ALL"
                ? ` · ${accMap.get(selectedPersonId)?.name || ""}`
                : ""}
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:bg-slate-900/60 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Activity</th>
                  <th className="px-5 py-3">Party / Account</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {activityHistory.map((tx) => {
                  const isRepay = tx.type === "LOAN_REPAYMENT";
                  const activityLabel =
                    tx.type === "LOAN_RECEIVED"
                      ? "Loan Received"
                      : tx.type === "LOAN_GIVEN"
                        ? "Loan Given"
                        : "Repayment";
                  const fromName =
                    accMap.get(tx.fromAccountId || "")?.name || "";
                  const toName = accMap.get(tx.toAccountId || "")?.name || "";

                  return (
                    <tr
                      key={tx.id}
                      onClick={() => setSelectedTx(tx)}
                      className="cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/30"
                    >
                      <td className="px-5 py-3 whitespace-nowrap text-slate-500">
                        {formatDisplayDate(
                          tx.transactionDate,
                          settings.dateFormat,
                        )}
                      </td>
                      <td className="px-5 py-3 font-semibold text-slate-900 dark:text-white">
                        <span
                          className={`inline-block rounded-lg px-2 py-0.5 text-[11px] ${
                            isRepay
                              ? "bg-teal-500/12 text-teal-700 dark:text-teal-300"
                              : "bg-violet-500/12 text-violet-700 dark:text-violet-300"
                          }`}
                        >
                          {activityLabel}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                        {fromName} → {toName}
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-slate-900 tabular-nums dark:text-white">
                        {formatMoney(tx.amount, settings.currencySymbol)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <TransactionDetailModal
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
      />
    </div>
  );
}
