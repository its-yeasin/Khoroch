"use client";

import React, { useState } from "react";
import { Building2, Check, UserCheck } from "lucide-react";
import { ModalOrSheet } from "@/components/ui/ModalOrSheet";
import { useToast } from "@/components/ui/Toast";
import type { AccountCategory } from "@/lib/constants";
import { useWallet } from "@/lib/offline/wallet-store";
import type { AccountDTO } from "@/lib/types";

function AccountFormInner({
  onClose,
  editAccount,
  defaultCategory,
}: {
  onClose: () => void;
  editAccount?: AccountDTO | null;
  defaultCategory: Exclude<AccountCategory, "CASH">;
}) {
  const { createAccount, updateAccount, settings } = useWallet();
  const { showToast } = useToast();

  const [category, setCategory] = useState<Exclude<AccountCategory, "CASH">>(
    editAccount
      ? editAccount.category === "CUSTOM"
        ? "CUSTOM"
        : "BANK"
      : defaultCategory,
  );
  const [name, setName] = useState(editAccount?.name || "");
  const [bankName, setBankName] = useState(editAccount?.bankName || "");
  const [accountNumber, setAccountNumber] = useState("");
  const [initialMainBalance, setInitialMainBalance] = useState("0");
  const [interestEnabled, setInterestEnabled] = useState(
    editAccount?.interestEnabled ?? false,
  );
  const [initialInterestBalance, setInitialInterestBalance] = useState("0");
  const [description, setDescription] = useState(
    editAccount?.description || "",
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (editAccount) {
        await updateAccount(editAccount.id, {
          name,
          description,
          ...(editAccount.category === "BANK"
            ? {
                bankName,
                ...(accountNumber.trim() ? { accountNumber } : {}),
                interestEnabled,
              }
            : {}),
        });
        showToast("Account updated.", "success");
      } else {
        await createAccount({
          name,
          category,
          bankName: category === "BANK" ? bankName : undefined,
          accountNumber: category === "BANK" ? accountNumber : undefined,
          initialMainBalance: initialMainBalance || "0",
          interestEnabled: category === "BANK" ? interestEnabled : false,
          initialInterestBalance:
            category === "BANK" && interestEnabled
              ? initialInterestBalance || "0"
              : "0",
          description,
        });
        showToast(`${name} created.`, "success");
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save account.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const isBank = editAccount
    ? editAccount.category === "BANK"
    : category === "BANK";
  const isCash = editAccount?.category === "CASH";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!editAccount && (
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800/80">
          <button
            type="button"
            onClick={() => setCategory("BANK")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition ${
              category === "BANK"
                ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white"
                : "text-slate-600 dark:text-slate-400"
            }`}
          >
            <Building2 className="h-4 w-4" />
            Bank Account
          </button>
          <button
            type="button"
            onClick={() => setCategory("CUSTOM")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition ${
              category === "CUSTOM"
                ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white"
                : "text-slate-600 dark:text-slate-400"
            }`}
          >
            <UserCheck className="h-4 w-4" />
            Person / Custom
          </button>
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
          Account Name
        </label>
        <input
          type="text"
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={
            isBank ? "e.g. DBBL, IFIC Bank, BRAC Bank" : "e.g. John, Alex, Office"
          }
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />
      </div>

      {isBank && !isCash && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Bank Name (Optional)
              </label>
              <input
                type="text"
                maxLength={80}
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="Dutch-Bangla Bank"
                className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Account Number (Optional, encrypted)
              </label>
              <input
                type="text"
                maxLength={40}
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder={
                  editAccount?.accountNumberMasked || "e.g. 1234567890"
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-amber-500/25 bg-amber-50/60 px-4 py-3 text-xs dark:bg-amber-950/30">
            <div>
              <div className="font-semibold text-amber-900 dark:text-amber-200">
                Enable separate Bank Interest balance
              </div>
              <div className="text-[11px] text-amber-700/80 dark:text-amber-300/70">
                Tracks interest separately from your main bank balance
              </div>
            </div>
            <input
              type="checkbox"
              checked={interestEnabled}
              onChange={(e) => setInterestEnabled(e.target.checked)}
              className="h-4 w-4 accent-amber-600"
            />
          </label>
        </>
      )}

      {!editAccount && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Initial {isBank ? "Main " : ""}Balance ({settings.currencySymbol})
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={initialMainBalance}
              onChange={(e) =>
                setInitialMainBalance(e.target.value.replace(/[^0-9.]/g, ""))
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold tabular-nums dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>

          {isBank && interestEnabled && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Initial Interest Balance ({settings.currencySymbol})
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={initialInterestBalance}
                onChange={(e) =>
                  setInitialInterestBalance(
                    e.target.value.replace(/[^0-9.]/g, ""),
                  )
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold tabular-nums dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
          )}
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
          Description (Optional)
        </label>
        <input
          type="text"
          maxLength={300}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={
            isBank ? "Salary account, savings..." : "Friend, colleague, vendor..."
          }
          className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-600 py-3 text-sm font-bold text-white shadow-sm hover:bg-teal-700 disabled:opacity-60"
      >
        <Check className="h-4 w-4" />
        {submitting
          ? "Saving..."
          : editAccount
            ? "Save Changes"
            : "Create Account"}
      </button>
    </form>
  );
}

export function AccountFormModal({
  open,
  onClose,
  editAccount,
  defaultCategory = "BANK",
}: {
  open: boolean;
  onClose: () => void;
  editAccount?: AccountDTO | null;
  defaultCategory?: Exclude<AccountCategory, "CASH">;
}) {
  return (
    <ModalOrSheet
      open={open}
      onClose={onClose}
      title={editAccount ? `Edit ${editAccount.name}` : "Add Account"}
      subtitle={
        editAccount
          ? "Update account details"
          : "Create a Bank account or a Custom counterparty account"
      }
    >
      {open && (
        <AccountFormInner
          key={editAccount?.id || `new-${defaultCategory}`}
          onClose={onClose}
          editAccount={editAccount}
          defaultCategory={defaultCategory}
        />
      )}
    </ModalOrSheet>
  );
}
