"use client";

import React, { useState } from "react";
import { Pencil, Save, Trash2 } from "lucide-react";
import { ModalOrSheet } from "@/components/ui/ModalOrSheet";
import { useToast } from "@/components/ui/Toast";
import { TRANSACTION_TYPE_META } from "@/lib/constants";
import { formatDisplayDate, toDateInputValue } from "@/lib/date";
import { formatMoney } from "@/lib/money";
import { useWallet } from "@/lib/offline/wallet-store";
import type { TransactionDTO } from "@/lib/types";

function TransactionDetailInner({
  transaction,
  onClose,
}: {
  transaction: TransactionDTO;
  onClose: () => void;
}) {
  const {
    accounts,
    categories,
    settings,
    updateTransaction,
    deleteTransaction,
  } = useWallet();
  const { showToast } = useToast();

  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(transaction.amount);
  const [description, setDescription] = useState(
    transaction.description || "",
  );
  const [note, setNote] = useState(transaction.note || "");
  const [txDate, setTxDate] = useState(
    toDateInputValue(transaction.transactionDate),
  );
  const [categoryId, setCategoryId] = useState(
    transaction.expenseCategoryId || "",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const meta = TRANSACTION_TYPE_META[transaction.type];
  const fromAcc = accounts.find((a) => a.id === transaction.fromAccountId);
  const toAcc = accounts.find((a) => a.id === transaction.toAccountId);
  const cat = categories.find((c) => c.id === transaction.expenseCategoryId);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await updateTransaction(transaction.id, {
        amount,
        description,
        note,
        transactionDate: new Date(`${txDate}T12:00:00`).toISOString(),
        ...(transaction.type === "EXPENSE" && categoryId
          ? { expenseCategoryId: categoryId }
          : {}),
      });
      showToast("Transaction updated & balances recalculated.", "success");
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update transaction.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setError("");
    setBusy(true);
    try {
      await deleteTransaction(transaction.id);
      showToast("Transaction deleted & balances reversed.", "success");
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not delete transaction.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <div className="space-y-4">
        <div className="rounded-3xl bg-slate-50 p-5 text-center dark:bg-slate-900/70">
          <span
            className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${meta.bgClass}`}
          >
            {meta.label}
          </span>
          <div className="mt-2 text-3xl font-bold text-slate-900 tabular-nums dark:text-white">
            {formatMoney(transaction.amount, settings.currencySymbol)}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {formatDisplayDate(
              transaction.transactionDate,
              settings.dateFormat,
            )}
          </p>
        </div>

        <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80 text-xs dark:divide-slate-800 dark:border-slate-800">
          {fromAcc && (
            <div className="flex justify-between px-4 py-3">
              <dt className="text-slate-500">From</dt>
              <dd className="font-semibold text-slate-900 dark:text-white">
                {fromAcc.name}
                {transaction.fromBalanceType === "INTEREST"
                  ? " (Interest)"
                  : transaction.fromBalanceType === "MAIN" &&
                      fromAcc.interestEnabled
                    ? " (Main)"
                    : ""}
              </dd>
            </div>
          )}
          {toAcc && (
            <div className="flex justify-between px-4 py-3">
              <dt className="text-slate-500">To</dt>
              <dd className="font-semibold text-slate-900 dark:text-white">
                {toAcc.name}
                {transaction.toBalanceType === "INTEREST"
                  ? " (Interest)"
                  : transaction.toBalanceType === "MAIN" &&
                      toAcc.interestEnabled
                    ? " (Main)"
                    : ""}
              </dd>
            </div>
          )}
          {cat && (
            <div className="flex justify-between px-4 py-3">
              <dt className="text-slate-500">Category</dt>
              <dd className="font-semibold text-slate-900 dark:text-white">
                {cat.name}
              </dd>
            </div>
          )}
          {transaction.description && (
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-slate-500">Description</dt>
              <dd className="text-right font-medium text-slate-900 dark:text-white">
                {transaction.description}
              </dd>
            </div>
          )}
          {transaction.note && (
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-slate-500">Note</dt>
              <dd className="text-right text-slate-700 dark:text-slate-300">
                {transaction.note}
              </dd>
            </div>
          )}
          <div className="flex justify-between px-4 py-3">
            <dt className="text-slate-500">Sync Status</dt>
            <dd className="font-semibold text-slate-900 dark:text-white">
              {transaction.syncStatus}
            </dd>
          </div>
        </dl>

        {transaction.syncError && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            Sync failure: {transaction.syncError}
          </div>
        )}

        {transaction.attachmentDataUrl &&
          transaction.attachmentDataUrl.startsWith("data:image/") && (
            <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={transaction.attachmentDataUrl}
                alt={transaction.attachmentName || "Receipt attachment"}
                className="max-h-52 w-full bg-slate-50 object-contain dark:bg-slate-900"
              />
            </div>
          )}

        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 py-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-white dark:hover:bg-slate-800"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleDelete}
            className="flex items-center justify-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 py-3 text-xs font-semibold text-rose-600 hover:bg-rose-500/20 disabled:opacity-50 dark:text-rose-400"
          >
            <Trash2 className="h-4 w-4" />
            {busy ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
          Amount ({settings.currencySymbol})
        </label>
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          required
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-lg font-bold tabular-nums dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />
      </div>

      {transaction.type === "EXPENSE" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Category
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
          Date
        </label>
        <input
          type="date"
          value={txDate}
          onChange={(e) => setTxDate(e.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
          Description
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
          Note
        </label>
        <textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-2xl border border-slate-200 py-3 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="flex items-center justify-center gap-2 rounded-2xl bg-teal-600 py-3 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {busy ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

export function TransactionDetailModal({
  transaction,
  onClose,
}: {
  transaction: TransactionDTO | null;
  onClose: () => void;
}) {
  const label = transaction
    ? TRANSACTION_TYPE_META[transaction.type].label
    : "Transaction";

  return (
    <ModalOrSheet
      open={Boolean(transaction)}
      onClose={onClose}
      title={label}
      subtitle={
        transaction
          ? `Ref: ${transaction.clientTransactionId.slice(0, 8)}`
          : undefined
      }
    >
      {transaction && (
        <TransactionDetailInner
          key={transaction.id}
          transaction={transaction}
          onClose={onClose}
        />
      )}
    </ModalOrSheet>
  );
}
