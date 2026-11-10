"use client";

import React, { createContext, useContext, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Moon,
  Plus,
  Settings,
  Sun,
  Tag,
  Wallet,
  CreditCard,
} from "lucide-react";
import { SyncConflictsSheet } from "@/components/layout/SyncConflictsSheet";
import { SyncStatusBadge } from "@/components/layout/SyncStatusBadge";
import { useTheme } from "@/components/layout/ThemeProvider";
import {
  TransactionSheet,
  type TransactionSheetPrefill,
} from "@/components/transactions/TransactionSheet";
import { useWallet } from "@/lib/offline/wallet-store";

interface QuickEntryContextValue {
  openTransactionSheet: (prefill?: TransactionSheetPrefill) => void;
}

const QuickEntryContext = createContext<QuickEntryContextValue>({
  openTransactionSheet: () => {},
});

export function useQuickTransaction() {
  return useContext(QuickEntryContext);
}

const DESKTOP_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/accounts", label: "Accounts", icon: CreditCard },
  { href: "/loans", label: "Loans", icon: HandCoins },
  { href: "/categories", label: "Categories", icon: Tag },
  { href: "/settings", label: "Settings", icon: Settings },
];

const MOBILE_NAV = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/transactions", label: "Activity", icon: ArrowLeftRight },
  { href: "/loans", label: "Loans", icon: HandCoins },
  { href: "/accounts", label: "Accounts", icon: CreditCard },
  { href: "/settings", label: "More", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, sessionExpired, logout } = useWallet();
  const { resolvedTheme, setTheme } = useTheme();

  const [txSheetOpen, setTxSheetOpen] = useState(false);
  const [txPrefill, setTxPrefill] = useState<
    TransactionSheetPrefill | undefined
  >();
  const [syncSheetOpen, setSyncSheetOpen] = useState(false);

  const openTransactionSheet = (prefill?: TransactionSheetPrefill) => {
    setTxPrefill(prefill);
    setTxSheetOpen(true);
  };

  return (
    <QuickEntryContext.Provider value={{ openTransactionSheet }}>
      <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#0B0F17] dark:text-slate-100">
        {/* Desktop Sidebar */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200/80 bg-white px-4 py-5 md:flex dark:border-slate-800/80 dark:bg-[#111722]">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 px-2 pb-5"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-600 text-white shadow-sm">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <div className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                Self Wallet
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Personal Ledger
              </div>
            </div>
          </Link>

          <button
            type="button"
            onClick={() => openTransactionSheet()}
            className="mb-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 active:scale-[0.99]"
          >
            <Plus className="h-4 w-4" />
            New Transaction
          </button>

          <nav className="flex-1 space-y-1">
            {DESKTOP_NAV.map((item) => {
              const active =
                pathname === item.href ||
                pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition ${
                    active
                      ? "bg-teal-500/12 font-semibold text-teal-700 dark:text-teal-300"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <Icon className="h-4.5 w-4.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <div className="flex items-center justify-between px-1">
              <SyncStatusBadge onClick={() => setSyncSheetOpen(true)} />
              <button
                type="button"
                onClick={() =>
                  setTheme(resolvedTheme === "dark" ? "light" : "dark")
                }
                aria-label="Toggle dark mode"
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {resolvedTheme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </button>
            </div>

            {user && (
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2.5 dark:bg-slate-900/60">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                    {user.name}
                  </div>
                  <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {user.email}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  aria-label="Sign out"
                  title="Sign out"
                  className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-rose-600 dark:hover:bg-slate-800"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Mobile Top Header */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200/70 bg-white/85 px-4 py-3 backdrop-blur-md md:hidden dark:border-slate-800/70 dark:bg-[#0B0F17]/85">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-emerald-600 text-white">
              <Wallet className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
              Self Wallet
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <SyncStatusBadge onClick={() => setSyncSheetOpen(true)} />
            <button
              type="button"
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
              aria-label="Toggle theme"
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              {resolvedTheme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
          </div>
        </header>

        {/* Session Expired Banner (preserves offline data!) */}
        {sessionExpired && (
          <div className="border-b border-amber-500/30 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-900 md:ml-64 dark:bg-amber-950/50 dark:text-amber-200">
            Your session expired.{" "}
            <Link href="/login" className="font-bold underline">
              Sign in again
            </Link>{" "}
            to sync your pending offline transactions.
          </div>
        )}

        {/* Main Content */}
        <main className="mx-auto max-w-5xl px-4 pt-4 pb-28 md:ml-64 md:px-8 md:py-8">
          {children}
        </main>

        {/* Mobile Floating Action Button */}
        <button
          type="button"
          onClick={() => openTransactionSheet()}
          aria-label="Add new transaction"
          className="fixed right-4 bottom-20 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-teal-600 to-emerald-600 text-white shadow-lg shadow-teal-600/30 transition hover:scale-105 active:scale-95 md:hidden"
        >
          <Plus className="h-6 w-6" />
        </button>

        {/* Mobile Bottom Navigation */}
        <nav
          aria-label="Primary navigation"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/95 backdrop-blur-md safe-bottom md:hidden dark:border-slate-800/80 dark:bg-[#111722]/95"
        >
          <div className="grid grid-cols-5">
            {MOBILE_NAV.map((item) => {
              const active =
                pathname === item.href ||
                pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition ${
                    active
                      ? "text-teal-600 dark:text-teal-400"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        <TransactionSheet
          open={txSheetOpen}
          onClose={() => setTxSheetOpen(false)}
          prefill={txPrefill}
        />
        <SyncConflictsSheet
          open={syncSheetOpen}
          onClose={() => setSyncSheetOpen(false)}
        />
      </div>
    </QuickEntryContext.Provider>
  );
}
