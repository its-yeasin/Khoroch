"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  ChevronRight,
  Plus,
  Sparkles,
  UserCheck,
  Wallet,
} from "lucide-react";
import { AccountFormModal } from "@/components/accounts/AccountFormModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import type { AccountCategory } from "@/lib/constants";
import { addMoney, formatMoney } from "@/lib/money";
import { useWallet } from "@/lib/offline/wallet-store";

export default function AccountsPage() {
  const { accounts, loans, settings, isLoading, updateAccount } = useWallet();
  const [modalOpen, setModalOpen] = useState(false);
  const [defaultCat, setDefaultCat] =
    useState<Exclude<AccountCategory, "CASH">>("BANK");
  const [showArchived, setShowArchived] = useState(false);

  const cashAccounts = useMemo(
    () => accounts.filter((a) => !a.isArchived && a.category === "CASH"),
    [accounts],
  );
  const bankAccounts = useMemo(
    () => accounts.filter((a) => !a.isArchived && a.category === "BANK"),
    [accounts],
  );
  const customAccounts = useMemo(
    () => accounts.filter((a) => !a.isArchived && a.category === "CUSTOM"),
    [accounts],
  );
  const archivedAccounts = useMemo(
    () => accounts.filter((a) => a.isArchived),
    [accounts],
  );

  // Per-counterparty outstanding loans (strictly separate from account balance)
  const loanSummaryByPerson = useMemo(() => {
    const map = new Map<string, { owed: string; receivable: string }>();
    for (const l of loans) {
      if (l.isDeleted) continue;
      const prev = map.get(l.counterpartyAccountId) ?? {
        owed: "0.00",
        receivable: "0.00",
      };
      if (l.loanType === "RECEIVED") {
        prev.owed = addMoney(prev.owed, l.outstandingAmount);
      } else {
        prev.receivable = addMoney(prev.receivable, l.outstandingAmount);
      }
      map.set(l.counterpartyAccountId, prev);
    }
    return map;
  }, [loans]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-3xl" />
        <Skeleton className="h-44 rounded-3xl" />
        <Skeleton className="h-44 rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
            Accounts
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Manage cash, bank balances, bank interest, and people/custom
            counterparties
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setDefaultCat("CUSTOM");
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#131A26] dark:text-slate-200"
          >
            <UserCheck className="h-3.5 w-3.5" />
            Add Person
          </button>
          <button
            type="button"
            onClick={() => {
              setDefaultCat("BANK");
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-2xl bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Bank
          </button>
        </div>
      </div>

      {/* Cash */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
          Cash Wallet
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cashAccounts.map((acc) => (
            <Link
              key={acc.id}
              href={`/accounts/${acc.id}`}
              className="flex items-center justify-between rounded-3xl border border-slate-200/80 bg-white p-4 shadow-2xs transition hover:border-teal-500/40 dark:border-slate-800 dark:bg-[#131A26]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
                  <Wallet className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      {acc.name}
                    </span>
                    {acc.isDefault && (
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {acc.description || "Physical cash wallet"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-slate-900 tabular-nums dark:text-white">
                  {formatMoney(acc.currentMainBalance, settings.currencySymbol)}
                </span>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Bank Accounts */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
          Bank Accounts ({bankAccounts.length})
        </h2>
        {bankAccounts.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No bank accounts yet"
            description="Add DBBL, IFIC Bank, BRAC Bank, or any bank account — with optional separate interest tracking."
            action={
              <button
                type="button"
                onClick={() => {
                  setDefaultCat("BANK");
                  setModalOpen(true);
                }}
                className="rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white"
              >
                Add Bank Account
              </button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {bankAccounts.map((acc) => (
              <Link
                key={acc.id}
                href={`/accounts/${acc.id}`}
                className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-2xs transition hover:border-teal-500/40 dark:border-slate-800 dark:bg-[#131A26]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-500/12 text-teal-600 dark:text-teal-400">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                          {acc.name}
                        </span>
                        {acc.interestEnabled && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                            <Sparkles className="h-2.5 w-2.5" />
                            Interest
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {[acc.bankName, acc.accountNumberMasked]
                          .filter(Boolean)
                          .join(" · ") || "Bank account"}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </div>

                <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                  <div className="space-y-0.5">
                    <div className="text-slate-500">
                      Main:{" "}
                      <span className="font-semibold text-slate-900 tabular-nums dark:text-white">
                        {formatMoney(
                          acc.currentMainBalance,
                          settings.currencySymbol,
                        )}
                      </span>
                    </div>
                    {acc.interestEnabled && (
                      <div className="text-amber-600 dark:text-amber-400">
                        Interest:{" "}
                        <span className="font-semibold tabular-nums">
                          {formatMoney(
                            acc.currentInterestBalance,
                            settings.currencySymbol,
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400">Total</div>
                    <div className="text-base font-bold text-slate-900 tabular-nums dark:text-white">
                      {formatMoney(acc.totalBalance, settings.currencySymbol)}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Custom Accounts (People / Organizations) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              People &amp; Custom Accounts ({customAccounts.length})
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Used as loan counterparties; kept separate from dashboard assets.
            </p>
          </div>
        </div>

        {customAccounts.length === 0 ? (
          <EmptyState
            icon={UserCheck}
            title="No custom accounts yet"
            description="Add people or organizations (e.g. John, Alex, Office) to track loans and repayments."
            action={
              <button
                type="button"
                onClick={() => {
                  setDefaultCat("CUSTOM");
                  setModalOpen(true);
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                Add Custom Account
              </button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {customAccounts.map((acc) => {
              const loanInfo = loanSummaryByPerson.get(acc.id);
              return (
                <Link
                  key={acc.id}
                  href={`/accounts/${acc.id}`}
                  className="flex items-center justify-between rounded-3xl border border-slate-200/80 bg-white p-4 shadow-2xs transition hover:border-violet-500/40 dark:border-slate-800 dark:bg-[#131A26]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500/12 text-violet-600 dark:text-violet-400">
                      <UserCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                        {acc.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        Account Bal:{" "}
                        {formatMoney(
                          acc.currentMainBalance,
                          settings.currencySymbol,
                        )}
                      </div>
                      {loanInfo &&
                        (Number(loanInfo.owed) > 0 ||
                          Number(loanInfo.receivable) > 0) && (
                          <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] font-semibold">
                            {Number(loanInfo.owed) > 0 && (
                              <span className="text-violet-600 dark:text-violet-400">
                                Owe:{" "}
                                {formatMoney(
                                  loanInfo.owed,
                                  settings.currencySymbol,
                                )}
                              </span>
                            )}
                            {Number(loanInfo.receivable) > 0 && (
                              <span className="text-sky-600 dark:text-sky-400">
                                Receivable:{" "}
                                {formatMoney(
                                  loanInfo.receivable,
                                  settings.currencySymbol,
                                )}
                              </span>
                            )}
                          </div>
                        )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Archived Accounts */}
      {archivedAccounts.length > 0 && (
        <section className="space-y-2">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400"
          >
            {showArchived ? "Hide" : "Show"} Archived Accounts (
            {archivedAccounts.length})
          </button>
          {showArchived && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {archivedAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-100/70 p-4 dark:border-slate-800 dark:bg-slate-900/40"
                >
                  <div>
                    <Link
                      href={`/accounts/${acc.id}`}
                      className="text-sm font-semibold text-slate-700 hover:underline dark:text-slate-300"
                    >
                      {acc.name}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {acc.category} ·{" "}
                      {formatMoney(acc.totalBalance, settings.currencySymbol)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateAccount(acc.id, { isArchived: false })
                    }
                    className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <AccountFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        defaultCategory={defaultCat}
      />
    </div>
  );
}
