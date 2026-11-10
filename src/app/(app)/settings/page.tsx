"use client";

import React, { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  Check,
  Download,
  LogOut,
  RefreshCw,
  Smartphone,
  Tag,
  Upload,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import {
  DATE_FORMATS,
  THEME_OPTIONS,
  type DashboardRange,
  type DateFormatOption,
  type ThemeOption,
} from "@/lib/constants";
import { pullServerSnapshot } from "@/lib/offline/sync-engine";
import { useWallet } from "@/lib/offline/wallet-store";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const CURRENCY_PRESETS = [
  { code: "BDT", symbol: "৳", label: "BDT (৳)" },
  { code: "USD", symbol: "$", label: "USD ($)" },
  { code: "EUR", symbol: "€", label: "EUR (€)" },
  { code: "GBP", symbol: "£", label: "GBP (£)" },
  { code: "INR", symbol: "₹", label: "INR (₹)" },
];

const emptySubscribe = () => () => {};

function useIsStandalonePWA(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as { standalone?: boolean }).standalone),
    () => false,
  );
}

export default function SettingsPage() {
  const {
    user,
    settings,
    isOnline,
    isSyncing,
    pendingOps,
    lastSyncedAt,
    syncNow,
    updateSettings,
    logout,
  } = useWallet();
  const { showToast } = useToast();
  const isStandalone = useIsStandalonePWA();

  const [draftName, setDraftName] = useState<string | null>(null);
  const [draftCurrency, setDraftCurrency] = useState<{
    code: string;
    symbol: string;
  } | null>(null);
  const [draftDateFormat, setDraftDateFormat] =
    useState<DateFormatOption | null>(null);
  const [draftTheme, setDraftTheme] = useState<ThemeOption | null>(null);
  const [draftRange, setDraftRange] = useState<Exclude<
    DashboardRange,
    "CUSTOM"
  > | null>(null);

  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const name = draftName ?? user?.name ?? "";
  const currencyCode = draftCurrency?.code ?? settings.currencyCode;
  const currencySymbol = draftCurrency?.symbol ?? settings.currencySymbol;
  const dateFormat = draftDateFormat ?? settings.dateFormat;
  const theme = draftTheme ?? settings.theme;
  const defaultRange = draftRange ?? settings.defaultDashboardRange;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateSettings({
        name,
        currencyCode,
        currencySymbol,
        dateFormat,
        theme,
        defaultDashboardRange: defaultRange,
      });
      setDraftName(null);
      setDraftCurrency(null);
      setDraftDateFormat(null);
      setDraftTheme(null);
      setDraftRange(null);
      showToast("Settings saved.", "success");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not save settings.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleInstallPwa = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const res = await installPrompt.userChoice;
    if (res.outcome === "accepted") {
      showToast("Self Wallet installed!", "success");
      setInstallPrompt(null);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await fetch("/api/data/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Import failed.");
      }
      if (user?.id) {
        await pullServerSnapshot(user.id);
      }
      showToast(
        `Imported ${data.importedTransactions} txns (${data.skippedDuplicates} duplicates skipped).`,
        "success",
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Invalid backup file.",
        "error",
      );
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
            More &amp; Settings
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Preferences, categories, offline sync, PWA install, and backups
          </p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center gap-1.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-500/20 dark:text-rose-400"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign Out
        </button>
      </div>

      <Link
        href="/categories"
        className="flex items-center justify-between rounded-3xl border border-slate-200/80 bg-white p-4 shadow-2xs transition hover:border-teal-500/40 md:hidden dark:border-slate-800 dark:bg-[#131A26]"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-500/12 text-teal-600 dark:text-teal-400">
            <Tag className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-white">
              Expense Categories
            </div>
            <div className="text-xs text-slate-500">
              Create, customize, and view category stats
            </div>
          </div>
        </div>
        <span className="text-xs font-semibold text-teal-600">Open →</span>
      </Link>

      <form
        onSubmit={handleSave}
        className="space-y-4 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-[#131A26]"
      >
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">
          Profile &amp; Preferences
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Full Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setDraftName(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Email
            </label>
            <input
              type="email"
              disabled
              value={user?.email || ""}
              className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/50"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Currency
            </label>
            <select
              value={currencyCode}
              onChange={(e) => {
                const found = CURRENCY_PRESETS.find(
                  (c) => c.code === e.target.value,
                );
                setDraftCurrency({
                  code: e.target.value,
                  symbol: found?.symbol || currencySymbol,
                });
              }}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              {CURRENCY_PRESETS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Date Format
            </label>
            <select
              value={dateFormat}
              onChange={(e) =>
                setDraftDateFormat(e.target.value as DateFormatOption)
              }
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              {DATE_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Appearance Theme
            </label>
            <select
              value={theme}
              onChange={(e) => setDraftTheme(e.target.value as ThemeOption)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm capitalize dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              {THEME_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Default Dashboard Range
            </label>
            <select
              value={defaultRange}
              onChange={(e) =>
                setDraftRange(
                  e.target.value as Exclude<DashboardRange, "CUSTOM">,
                )
              }
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              <option value="TODAY">Today</option>
              <option value="WEEK">This Week</option>
              <option value="MONTH">This Month</option>
              <option value="YEAR">This Year</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-2xl bg-teal-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-60"
        >
          <Check className="h-4 w-4" />
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </form>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="space-y-3 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-[#131A26]">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Data Synchronization
          </h2>
          <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
            <p>
              Network:{" "}
              <span className="font-semibold text-slate-900 dark:text-white">
                {isOnline ? "Online" : "Offline"}
              </span>
            </p>
            <p>
              Pending offline items:{" "}
              <span className="font-semibold text-slate-900 dark:text-white">
                {pendingOps.length}
              </span>
            </p>
            <p>
              Last synced:{" "}
              <span className="font-semibold text-slate-900 dark:text-white">
                {lastSyncedAt
                  ? new Date(lastSyncedAt).toLocaleString()
                  : "Not synced yet"}
              </span>
            </p>
          </div>
          <button
            type="button"
            disabled={!isOnline || isSyncing}
            onClick={() => syncNow(true)}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`}
            />
            {isSyncing ? "Synchronizing..." : "Synchronize Now"}
          </button>
        </section>

        <section className="space-y-3 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-[#131A26]">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Install Self Wallet (PWA)
            </h2>
          </div>
          {isStandalone ? (
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Running in installed standalone app mode.
            </p>
          ) : installPrompt ? (
            <button
              type="button"
              onClick={handleInstallPwa}
              className="rounded-2xl bg-teal-600 px-4 py-2 text-xs font-bold text-white hover:bg-teal-700"
            >
              Install App on Device
            </button>
          ) : (
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              In Google Chrome on Android or Desktop, open the browser menu
              (&vellip;) and select <strong>Install app</strong> or{" "}
              <strong>Add to Home Screen</strong>. On iOS Safari, tap{" "}
              <strong>Share &rarr; Add to Home Screen</strong>.
            </p>
          )}
        </section>
      </div>

      <section className="space-y-4 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-[#131A26]">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Export, Backup &amp; Restore
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Restoring a JSON backup automatically skips duplicate transactions
            using idempotency keys.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <a
            href="/api/data/export?format=csv"
            download
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </a>

          <a
            href="/api/data/export?format=json"
            download
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <Download className="h-4 w-4" />
            Full JSON Backup
          </a>

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-700">
            <Upload className="h-4 w-4" />
            {importing ? "Restoring..." : "Import JSON Backup"}
            <input
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
              disabled={!isOnline || importing}
              className="hidden"
            />
          </label>
        </div>
      </section>
    </div>
  );
}
