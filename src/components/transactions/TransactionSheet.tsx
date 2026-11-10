"use client";

import React, { useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  Calculator,
  Calendar,
  Check,
  Plus,
  Sparkles,
  UserCheck,
  Wallet,
} from "lucide-react";
import { ModalOrSheet } from "@/components/ui/ModalOrSheet";
import {
  CATEGORY_COLOR_OPTIONS,
  CATEGORY_ICON_OPTIONS,
  CategoryIcon,
} from "@/components/transactions/CategoryIcon";
import { useToast } from "@/components/ui/Toast";
import type {
  AdjustmentDirection,
  BalanceType,
  TransactionType,
} from "@/lib/constants";
import { toDateInputValue } from "@/lib/date";
import { compareMoney, formatMoney, isPositiveMoney } from "@/lib/money";
import { useWallet } from "@/lib/offline/wallet-store";
import type { AccountDTO } from "@/lib/types";

export interface TransactionSheetPrefill {
  type?: TransactionType;
  fromAccountId?: string;
  toAccountId?: string;
  loanId?: string;
}

const PRIMARY_TABS: Array<{ id: string; label: string; type: TransactionType }> = [
  { id: "EXPENSE", label: "Expense", type: "EXPENSE" },
  { id: "INCOME", label: "Income", type: "INCOME" },
  { id: "ADD_BALANCE", label: "Add Bal", type: "ADD_BALANCE" },
  { id: "ACCOUNT_TRANSFER", label: "Transfer", type: "ACCOUNT_TRANSFER" },
  { id: "LOAN", label: "Loan", type: "LOAN_RECEIVED" },
  { id: "BANK_INTEREST", label: "Interest", type: "BANK_INTEREST" },
  { id: "BALANCE_ADJUSTMENT", label: "Adjust", type: "BALANCE_ADJUSTMENT" },
];

function AccountChipIcon({ category }: { category: AccountDTO["category"] }) {
  if (category === "CASH") return <Wallet className="h-4 w-4" />;
  if (category === "BANK") return <Building2 className="h-4 w-4" />;
  return <UserCheck className="h-4 w-4" />;
}

function TransactionSheetForm({
  onClose,
  prefill,
}: {
  onClose: () => void;
  prefill?: TransactionSheetPrefill;
}) {
  const {
    activeAccounts,
    categories,
    loans,
    settings,
    createTransaction,
    createAccount,
    createCategory,
  } = useWallet();
  const { showToast } = useToast();

  const walletAccounts = useMemo(
    () =>
      activeAccounts.filter(
        (a) => a.category === "CASH" || a.category === "BANK",
      ),
    [activeAccounts],
  );
  const interestBanks = useMemo(
    () =>
      activeAccounts.filter(
        (a) => a.category === "BANK" && a.interestEnabled,
      ),
    [activeAccounts],
  );
  const counterpartyAccounts = useMemo(() => {
    const custom = activeAccounts.filter((a) => a.category === "CUSTOM");
    const banks = activeAccounts.filter((a) => a.category === "BANK");
    return [...custom, ...banks];
  }, [activeAccounts]);

  const openLoans = useMemo(
    () => loans.filter((l) => !l.isDeleted && l.status !== "FULLY_REPAID"),
    [loans],
  );

  const defaultCash = useMemo(
    () =>
      walletAccounts.find((a) => a.isDefault) || walletAccounts[0] || null,
    [walletAccounts],
  );

  const cashId = defaultCash?.id || "";
  const secondWalletId =
    walletAccounts.find((a) => a.id !== cashId)?.id || cashId;
  const firstCounterpartyId = counterpartyAccounts[0]?.id || "";
  const initialType = prefill?.type || "EXPENSE";

  const getInitialFrom = () => {
    if (prefill?.fromAccountId) return prefill.fromAccountId;
    if (initialType === "ACCOUNT_TRANSFER") return secondWalletId;
    if (initialType === "LOAN_RECEIVED") return firstCounterpartyId;
    return cashId;
  };

  const getInitialTo = () => {
    if (prefill?.toAccountId) return prefill.toAccountId;
    if (initialType === "LOAN_GIVEN") return firstCounterpartyId;
    if (initialType === "BANK_INTEREST") return interestBanks[0]?.id || "";
    return cashId;
  };

  const [txType, setTxType] = useState<TransactionType>(initialType);
  const [amount, setAmount] = useState("");
  const [showKeypad, setShowKeypad] = useState(false);
  const [fromAccountId, setFromAccountId] = useState(getInitialFrom);
  const [toAccountId, setToAccountId] = useState(getInitialTo);
  const [useFromInterest, setUseFromInterest] = useState(false);
  const [useToInterest, setUseToInterest] = useState(false);
  const [categoryId, setCategoryId] = useState(categories[0]?.id || "");
  const [loanId, setLoanId] = useState(
    prefill?.loanId || openLoans[0]?.id || "",
  );
  const [adjustmentDirection, setAdjustmentDirection] =
    useState<AdjustmentDirection>("INCREASE");
  const [txDate, setTxDate] = useState(() => toDateInputValue(new Date()));
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [attachmentName, setAttachmentName] = useState<string | undefined>();
  const [attachmentDataUrl, setAttachmentDataUrl] = useState<
    string | undefined
  >();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [showQuickPerson, setShowQuickPerson] = useState(false);
  const [quickPersonName, setQuickPersonName] = useState("");
  const [showQuickCat, setShowQuickCat] = useState(false);
  const [quickCatName, setQuickCatName] = useState("");
  const [quickCatColor, setQuickCatColor] = useState(CATEGORY_COLOR_OPTIONS[0]);
  const [quickCatIcon, setQuickCatIcon] = useState(CATEGORY_ICON_OPTIONS[0]);

  const handleSelectType = (nextType: TransactionType) => {
    setTxType(nextType);
    setError("");
    setUseFromInterest(false);
    setUseToInterest(false);

    if (nextType === "EXPENSE") {
      setFromAccountId(cashId);
      if (!categoryId && categories[0]) setCategoryId(categories[0].id);
    } else if (nextType === "ADD_BALANCE" || nextType === "INCOME") {
      setToAccountId(cashId);
    } else if (nextType === "BANK_INTEREST") {
      setToAccountId(interestBanks[0]?.id || "");
    } else if (nextType === "ACCOUNT_TRANSFER") {
      setFromAccountId(secondWalletId);
      setToAccountId(cashId);
    } else if (nextType === "LOAN_RECEIVED") {
      setFromAccountId(counterpartyAccounts[0]?.id || "");
      setToAccountId(cashId);
    } else if (nextType === "LOAN_GIVEN") {
      setFromAccountId(cashId);
      setToAccountId(counterpartyAccounts[0]?.id || "");
    } else if (nextType === "LOAN_REPAYMENT") {
      if (!loanId && openLoans[0]) setLoanId(openLoans[0].id);
      setFromAccountId(cashId);
      setToAccountId(cashId);
    } else if (nextType === "BALANCE_ADJUSTMENT") {
      setFromAccountId(cashId);
      setToAccountId(cashId);
    }
  };

  const selectedFromAccount = useMemo(
    () => activeAccounts.find((a) => a.id === fromAccountId) || null,
    [activeAccounts, fromAccountId],
  );
  const selectedToAccount = useMemo(
    () => activeAccounts.find((a) => a.id === toAccountId) || null,
    [activeAccounts, toAccountId],
  );
  const selectedLoan = useMemo(
    () => openLoans.find((l) => l.id === loanId) || null,
    [openLoans, loanId],
  );

  const effectiveFromInterest =
    useFromInterest &&
    selectedFromAccount?.category === "BANK" &&
    selectedFromAccount.interestEnabled;
  const effectiveToInterest =
    useToInterest &&
    selectedToAccount?.category === "BANK" &&
    selectedToAccount.interestEnabled;

  const isLoanTab =
    txType === "LOAN_RECEIVED" ||
    txType === "LOAN_GIVEN" ||
    txType === "LOAN_REPAYMENT";

  const appendKeypad = (char: string) => {
    if (char === "BACK") {
      setAmount((prev) => prev.slice(0, -1));
      return;
    }
    if (char === "." && amount.includes(".")) return;
    if (amount.includes(".")) {
      const [, dec] = amount.split(".");
      if (dec && dec.length >= 2) return;
    }
    setAmount((prev) => (prev === "0" && char !== "." ? char : prev + char));
  };

  const handleQuickCreatePerson = async () => {
    if (!quickPersonName.trim()) return;
    try {
      const created = await createAccount({
        name: quickPersonName.trim(),
        category: "CUSTOM",
        initialMainBalance: "0.00",
        description: "Added from transaction entry",
      });
      if (txType === "LOAN_RECEIVED") {
        setFromAccountId(created.id);
      } else {
        setToAccountId(created.id);
      }
      setQuickPersonName("");
      setShowQuickPerson(false);
      showToast(`Added "${created.name}"`, "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add person.");
    }
  };

  const handleQuickCreateCategory = async () => {
    if (!quickCatName.trim()) return;
    try {
      const created = await createCategory({
        name: quickCatName.trim(),
        icon: quickCatIcon,
        color: quickCatColor,
      });
      setCategoryId(created.id);
      setQuickCatName("");
      setShowQuickCat(false);
      showToast(`Category "${created.name}" created`, "success");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create category.",
      );
    }
  };

  const handleAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 180 * 1024) {
      setError("Attachment must be under 180 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAttachmentName(file.name);
      setAttachmentDataUrl(
        typeof reader.result === "string" ? reader.result : undefined,
      );
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!amount || !/^\d+(\.\d{1,2})?$/.test(amount.trim())) {
      setError("Enter a valid numeric amount (up to 2 decimals).");
      return;
    }
    if (!isPositiveMoney(amount)) {
      setError("Amount must be greater than zero.");
      return;
    }

    const fromBucket: BalanceType | null = effectiveFromInterest
      ? "INTEREST"
      : "MAIN";
    const toBucket: BalanceType | null =
      txType === "BANK_INTEREST" || effectiveToInterest ? "INTEREST" : "MAIN";

    const todayStr = toDateInputValue(new Date());
    const txIso =
      txDate === todayStr
        ? new Date().toISOString()
        : new Date(`${txDate}T12:00:00`).toISOString();

    setSubmitting(true);
    try {
      if (txType === "EXPENSE") {
        await createTransaction({
          type: "EXPENSE",
          amount,
          fromAccountId,
          fromBalanceType: fromBucket,
          expenseCategoryId: categoryId,
          description,
          note,
          attachmentName,
          attachmentDataUrl,
          transactionDate: txIso,
        });
      } else if (txType === "ADD_BALANCE" || txType === "INCOME") {
        await createTransaction({
          type: txType,
          amount,
          toAccountId,
          toBalanceType: toBucket,
          description,
          note,
          attachmentName,
          attachmentDataUrl,
          transactionDate: txIso,
        });
      } else if (txType === "BANK_INTEREST") {
        await createTransaction({
          type: "BANK_INTEREST",
          amount,
          toAccountId,
          toBalanceType: "INTEREST",
          description: description || "Bank interest credited",
          note,
          transactionDate: txIso,
        });
      } else if (txType === "ACCOUNT_TRANSFER") {
        await createTransaction({
          type: "ACCOUNT_TRANSFER",
          amount,
          fromAccountId,
          fromBalanceType: fromBucket,
          toAccountId,
          toBalanceType: toBucket,
          description,
          note,
          transactionDate: txIso,
        });
      } else if (txType === "LOAN_RECEIVED") {
        await createTransaction({
          type: "LOAN_RECEIVED",
          amount,
          fromAccountId,
          toAccountId,
          toBalanceType: toBucket,
          description,
          note,
          transactionDate: txIso,
        });
      } else if (txType === "LOAN_GIVEN") {
        await createTransaction({
          type: "LOAN_GIVEN",
          amount,
          fromAccountId,
          fromBalanceType: fromBucket,
          toAccountId,
          description,
          note,
          transactionDate: txIso,
        });
      } else if (txType === "LOAN_REPAYMENT") {
        if (!selectedLoan) {
          throw new Error("Select an outstanding loan to repay.");
        }
        if (compareMoney(amount, selectedLoan.outstandingAmount) > 0) {
          throw new Error(
            `Repayment cannot exceed outstanding loan (${formatMoney(selectedLoan.outstandingAmount, settings.currencySymbol)}).`,
          );
        }
        await createTransaction({
          type: "LOAN_REPAYMENT",
          amount,
          loanId: selectedLoan.id,
          fromAccountId:
            selectedLoan.loanType === "RECEIVED" ? fromAccountId : undefined,
          fromBalanceType:
            selectedLoan.loanType === "RECEIVED" ? fromBucket : null,
          toAccountId:
            selectedLoan.loanType === "GIVEN" ? toAccountId : undefined,
          toBalanceType:
            selectedLoan.loanType === "GIVEN" ? toBucket : null,
          description,
          note,
          transactionDate: txIso,
        });
      } else if (txType === "BALANCE_ADJUSTMENT") {
        await createTransaction({
          type: "BALANCE_ADJUSTMENT",
          amount,
          adjustmentDirection,
          fromAccountId:
            adjustmentDirection === "DECREASE" ? fromAccountId : null,
          fromBalanceType:
            adjustmentDirection === "DECREASE" ? fromBucket : null,
          toAccountId:
            adjustmentDirection === "INCREASE" ? toAccountId : null,
          toBalanceType:
            adjustmentDirection === "INCREASE" ? toBucket : null,
          description: description || "Manual balance adjustment",
          note,
          transactionDate: txIso,
        });
      }

      showToast("Transaction saved!", "success");
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save transaction.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const renderAccountBalanceChips = (
    list: AccountDTO[],
    selectedId: string,
    onSelect: (id: string) => void,
    label: string,
    showInterestOption: boolean,
    useInterest: boolean,
    onToggleInterest: (checked: boolean) => void,
    interestOnlyForce = false,
  ) => {
    const selectedAcc = list.find((a) => a.id === selectedId);
    const hasInterest =
      selectedAcc?.category === "BANK" && selectedAcc.interestEnabled;

    return (
      <div className="space-y-2">
        <label className="block text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
          {label}
        </label>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {list.map((acc) => {
            const active = acc.id === selectedId;
            return (
              <button
                key={acc.id}
                type="button"
                onClick={() => {
                  onSelect(acc.id);
                  onToggleInterest(false);
                }}
                className={`flex shrink-0 items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-left transition ${
                  active
                    ? "border-teal-600 bg-teal-50 text-teal-900 shadow-xs dark:border-teal-500 dark:bg-teal-950/50 dark:text-teal-100"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300"
                }`}
              >
                <AccountChipIcon category={acc.category} />
                <div>
                  <div className="text-xs font-semibold leading-tight">
                    {acc.name}
                  </div>
                  <div className="text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                    {acc.category === "BANK" && acc.interestEnabled
                      ? `M ${formatMoney(acc.currentMainBalance, settings.currencySymbol, { trimWholeDecimals: true })} · I ${formatMoney(acc.currentInterestBalance, settings.currencySymbol, { trimWholeDecimals: true })}`
                      : formatMoney(acc.totalBalance, settings.currencySymbol, {
                          trimWholeDecimals: true,
                        })}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {showInterestOption && hasInterest && !interestOnlyForce && (
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-50/70 px-3.5 py-2.5 text-xs dark:bg-amber-950/30">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={useInterest}
                onChange={(e) => onToggleInterest(e.target.checked)}
                className="h-4 w-4 rounded accent-amber-600"
              />
              <span className="font-semibold text-amber-900 dark:text-amber-200">
                Use bank interest balance only
              </span>
            </div>
            <span className="font-mono text-[11px] font-semibold text-amber-700 tabular-nums dark:text-amber-300">
              {useInterest
                ? `Interest: ${formatMoney(selectedAcc.currentInterestBalance, settings.currencySymbol)}`
                : `Main: ${formatMoney(selectedAcc.currentMainBalance, settings.currencySymbol)}`}
            </span>
          </label>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Type Pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {PRIMARY_TABS.map((tab) => {
          const active = tab.id === "LOAN" ? isLoanTab : txType === tab.type;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleSelectType(tab.type)}
              className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                active
                  ? "bg-slate-900 text-white dark:bg-teal-600"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Loan Sub-Tabs */}
      {isLoanTab && (
        <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800/80">
          {[
            { type: "LOAN_RECEIVED" as const, label: "Borrowed" },
            { type: "LOAN_GIVEN" as const, label: "Lent Out" },
            { type: "LOAN_REPAYMENT" as const, label: "Repayment" },
          ].map((sub) => (
            <button
              key={sub.type}
              type="button"
              onClick={() => handleSelectType(sub.type)}
              className={`rounded-xl py-2 text-xs font-semibold transition ${
                txType === sub.type
                  ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              {sub.label}
            </button>
          ))}
        </div>
      )}

      {/* Amount Display */}
      <div className="rounded-3xl border border-slate-200/90 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Amount ({settings.currencyCode})
          </span>
          <button
            type="button"
            onClick={() => setShowKeypad((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-teal-700 hover:bg-teal-500/10 dark:text-teal-300"
          >
            <Calculator className="h-3.5 w-3.5" />
            {showKeypad ? "Hide Keypad" : "Touch Keypad"}
          </button>
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-slate-400">
            {settings.currencySymbol}
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.00"
            aria-label="Transaction amount"
            className="w-full bg-transparent text-3xl font-bold tracking-tight text-slate-900 outline-none tabular-nums placeholder:text-slate-300 dark:text-white dark:placeholder:text-slate-700"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {["100", "200", "500", "1000", "5000"].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setAmount(preset)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-teal-500 hover:text-teal-700 tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              {settings.currencySymbol}
              {preset}
            </button>
          ))}
        </div>

        {showKeypad && (
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {[
              "1",
              "2",
              "3",
              "4",
              "5",
              "6",
              "7",
              "8",
              "9",
              ".",
              "0",
              "BACK",
            ].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => appendKeypad(key)}
                className="rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-800 active:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {key === "BACK" ? "⌫" : key}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Context-Aware Transaction Fields */}
      {txType === "EXPENSE" && (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                To · Expense Category
              </label>
              <button
                type="button"
                onClick={() => setShowQuickCat((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 dark:text-teal-400"
              >
                <Plus className="h-3.5 w-3.5" />
                New Category
              </button>
            </div>

            {showQuickCat && (
              <div className="space-y-2 rounded-2xl border border-teal-500/30 bg-teal-50/50 p-3 dark:bg-teal-950/30">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={quickCatName}
                    onChange={(e) => setQuickCatName(e.target.value)}
                    placeholder="Category name (e.g. Coffee)"
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={handleQuickCreateCategory}
                    className="rounded-xl bg-teal-600 px-3 py-2 text-xs font-semibold text-white"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORY_COLOR_OPTIONS.slice(0, 6).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setQuickCatColor(c)}
                      className={`h-5 w-5 rounded-full border-2 ${quickCatColor === c ? "border-slate-900 dark:border-white" : "border-transparent"}`}
                      style={{ backgroundColor: c }}
                      aria-label={`Color ${c}`}
                    />
                  ))}
                  {CATEGORY_ICON_OPTIONS.slice(0, 6).map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setQuickCatIcon(ic)}
                      className={`rounded-lg px-2 py-0.5 text-[10px] font-medium ${quickCatIcon === ic ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-4 gap-2">
              {categories.map((cat) => {
                const active = cat.id === categoryId;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryId(cat.id)}
                    className={`flex flex-col items-center gap-1.5 rounded-2xl border p-2.5 text-center transition ${
                      active
                        ? "border-teal-600 bg-teal-50/70 dark:border-teal-500 dark:bg-teal-950/40"
                        : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50"
                    }`}
                  >
                    <CategoryIcon
                      icon={cat.icon}
                      color={cat.color}
                      size="sm"
                    />
                    <span className="line-clamp-1 text-[11px] font-medium text-slate-800 dark:text-slate-200">
                      {cat.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {renderAccountBalanceChips(
            walletAccounts,
            fromAccountId,
            setFromAccountId,
            "From · Payment Account",
            true,
            effectiveFromInterest,
            setUseFromInterest,
          )}
        </>
      )}

      {(txType === "ADD_BALANCE" || txType === "INCOME") &&
        renderAccountBalanceChips(
          walletAccounts,
          toAccountId,
          setToAccountId,
          "To · Destination Account",
          true,
          effectiveToInterest,
          setUseToInterest,
        )}

      {txType === "BANK_INTEREST" && (
        <div className="space-y-2">
          {interestBanks.length === 0 ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-50 p-3.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              No bank accounts currently have interest enabled. Enable
              &ldquo;Track separate interest balance&rdquo; in Accounts first.
            </div>
          ) : (
            <>
              {renderAccountBalanceChips(
                interestBanks,
                toAccountId,
                setToAccountId,
                "To · Bank Interest Bucket",
                false,
                true,
                () => undefined,
                true,
              )}
              <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                <Sparkles className="h-3.5 w-3.5" />
                Credited strictly to the separate Bank Interest balance.
              </p>
            </>
          )}
        </div>
      )}

      {txType === "ACCOUNT_TRANSFER" && (
        <div className="space-y-3">
          {renderAccountBalanceChips(
            walletAccounts,
            fromAccountId,
            setFromAccountId,
            "From · Source Account",
            true,
            effectiveFromInterest,
            setUseFromInterest,
          )}
          <div className="flex justify-center">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800">
              <ArrowRight className="h-4 w-4 rotate-90" />
            </div>
          </div>
          {renderAccountBalanceChips(
            walletAccounts,
            toAccountId,
            setToAccountId,
            "To · Destination Account",
            true,
            effectiveToInterest,
            setUseToInterest,
          )}
        </div>
      )}

      {(txType === "LOAN_RECEIVED" || txType === "LOAN_GIVEN") && (
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                {txType === "LOAN_RECEIVED"
                  ? "From · Lender (Person or Bank)"
                  : "To · Borrower (Person or Entity)"}
              </label>
              <button
                type="button"
                onClick={() => setShowQuickPerson((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 dark:text-teal-400"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Person
              </button>
            </div>

            {showQuickPerson && (
              <div className="flex gap-2 rounded-2xl border border-teal-500/30 bg-teal-50/50 p-2.5 dark:bg-teal-950/30">
                <input
                  type="text"
                  value={quickPersonName}
                  onChange={(e) => setQuickPersonName(e.target.value)}
                  placeholder="Person / Entity name (e.g. John)"
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={handleQuickCreatePerson}
                  className="rounded-xl bg-teal-600 px-3 py-2 text-xs font-semibold text-white"
                >
                  Save
                </button>
              </div>
            )}

            {counterpartyAccounts.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700">
                Add a person (Custom account) or bank above to record this loan.
              </p>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {counterpartyAccounts.map((acc) => {
                  const selected =
                    txType === "LOAN_RECEIVED"
                      ? acc.id === fromAccountId
                      : acc.id === toAccountId;
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() =>
                        txType === "LOAN_RECEIVED"
                          ? setFromAccountId(acc.id)
                          : setToAccountId(acc.id)
                      }
                      className={`flex shrink-0 items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-xs font-semibold transition ${
                        selected
                          ? "border-violet-600 bg-violet-50 text-violet-900 dark:border-violet-500 dark:bg-violet-950/50 dark:text-violet-100"
                          : "border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300"
                      }`}
                    >
                      <AccountChipIcon category={acc.category} />
                      <span>{acc.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {txType === "LOAN_RECEIVED"
            ? renderAccountBalanceChips(
                walletAccounts,
                toAccountId,
                setToAccountId,
                "To · Receiving Account",
                true,
                effectiveToInterest,
                setUseToInterest,
              )
            : renderAccountBalanceChips(
                walletAccounts,
                fromAccountId,
                setFromAccountId,
                "From · Disbursing Account",
                true,
                effectiveFromInterest,
                setUseFromInterest,
              )}
        </div>
      )}

      {txType === "LOAN_REPAYMENT" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="block text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Select Outstanding Loan
            </label>
            {openLoans.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-3.5 text-xs text-slate-500 dark:border-slate-700">
                No outstanding loans right now.
              </div>
            ) : (
              <div className="space-y-2">
                {openLoans.map((l) => {
                  const person = activeAccounts.find(
                    (a) => a.id === l.counterpartyAccountId,
                  );
                  const active = l.id === loanId;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setLoanId(l.id)}
                      className={`flex w-full items-center justify-between rounded-2xl border px-3.5 py-3 text-left text-xs transition ${
                        active
                          ? "border-teal-600 bg-teal-50/70 dark:border-teal-500 dark:bg-teal-950/40"
                          : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/50"
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {person?.name || "Counterparty"} ·{" "}
                          <span
                            className={
                              l.loanType === "RECEIVED"
                                ? "text-violet-600 dark:text-violet-400"
                                : "text-sky-600 dark:text-sky-400"
                            }
                          >
                            {l.loanType === "RECEIVED" ? "I Owe" : "Owes Me"}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          Original:{" "}
                          {formatMoney(
                            l.originalAmount,
                            settings.currencySymbol,
                          )}{" "}
                          · Repaid:{" "}
                          {formatMoney(l.totalRepaid, settings.currencySymbol)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-slate-900 tabular-nums dark:text-white">
                          {formatMoney(
                            l.outstandingAmount,
                            settings.currencySymbol,
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400">
                          Outstanding
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedLoan && (
            <>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setAmount(selectedLoan.outstandingAmount)}
                  className="rounded-lg bg-teal-500/10 px-2.5 py-1 text-xs font-semibold text-teal-700 dark:text-teal-300"
                >
                  Fill remaining (
                  {formatMoney(
                    selectedLoan.outstandingAmount,
                    settings.currencySymbol,
                  )}
                  )
                </button>
              </div>
              {selectedLoan.loanType === "RECEIVED"
                ? renderAccountBalanceChips(
                    walletAccounts,
                    fromAccountId,
                    setFromAccountId,
                    "From · Paying Account",
                    true,
                    effectiveFromInterest,
                    setUseFromInterest,
                  )
                : renderAccountBalanceChips(
                    walletAccounts,
                    toAccountId,
                    setToAccountId,
                    "To · Receiving Account",
                    true,
                    effectiveToInterest,
                    setUseToInterest,
                  )}
            </>
          )}
        </div>
      )}

      {txType === "BALANCE_ADJUSTMENT" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(["INCREASE", "DECREASE"] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                onClick={() => setAdjustmentDirection(dir)}
                className={`rounded-2xl border py-2.5 text-xs font-semibold transition ${
                  adjustmentDirection === dir
                    ? "border-teal-600 bg-teal-50 text-teal-900 dark:border-teal-500 dark:bg-teal-950/50 dark:text-teal-100"
                    : "border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-400"
                }`}
              >
                {dir === "INCREASE"
                  ? "+ Increase Balance"
                  : "- Decrease Balance"}
              </button>
            ))}
          </div>
          {adjustmentDirection === "INCREASE"
            ? renderAccountBalanceChips(
                activeAccounts,
                toAccountId,
                setToAccountId,
                "Target Account",
                true,
                effectiveToInterest,
                setUseToInterest,
              )
            : renderAccountBalanceChips(
                activeAccounts,
                fromAccountId,
                setFromAccountId,
                "Target Account",
                true,
                effectiveFromInterest,
                setUseFromInterest,
              )}
        </div>
      )}

      {/* Date + Description + Note */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Date
          </label>
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Calendar className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="date"
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pr-2.5 pl-8 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <button
              type="button"
              onClick={() => setTxDate(toDateInputValue(new Date()))}
              className="rounded-xl border border-slate-200 px-2.5 py-2 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
            >
              Today
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Description
          </label>
          <input
            type="text"
            maxLength={200}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short label (optional)"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Optional Note
          </label>
          <input
            type="text"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Details or reference..."
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Optional Receipt Attachment
          </label>
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={handleAttachment}
            className="w-full text-[11px] text-slate-500 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 dark:file:bg-slate-800 dark:file:text-slate-200"
          />
          {attachmentName && (
            <p className="mt-1 truncate text-[11px] text-teal-600 dark:text-teal-400">
              Attached: {attachmentName}
            </p>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-500/30 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-600 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-teal-700 active:scale-[0.99] disabled:opacity-60"
      >
        <Check className="h-4 w-4" />
        {submitting ? "Saving..." : "Save Transaction"}
      </button>
    </form>
  );
}

export function TransactionSheet({
  open,
  onClose,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  prefill?: TransactionSheetPrefill;
}) {
  return (
    <ModalOrSheet
      open={open}
      onClose={onClose}
      title="Record Transaction"
      subtitle="Every operation updates your ledger atomically"
      maxWidthClass="sm:max-w-xl"
    >
      {open && (
        <TransactionSheetForm
          key={`${prefill?.type || "EXPENSE"}-${prefill?.fromAccountId || ""}-${prefill?.toAccountId || ""}-${prefill?.loanId || ""}`}
          onClose={onClose}
          prefill={prefill}
        />
      )}
    </ModalOrSheet>
  );
}
