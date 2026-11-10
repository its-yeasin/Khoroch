"use client";

import React, { useMemo, useState } from "react";
import { Lock, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import {
  CATEGORY_COLOR_OPTIONS,
  CATEGORY_ICON_OPTIONS,
  CategoryIcon,
} from "@/components/transactions/CategoryIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModalOrSheet } from "@/components/ui/ModalOrSheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { addMoney, formatMoney, toMoneyNumber } from "@/lib/money";
import { useWallet } from "@/lib/offline/wallet-store";
import type { ExpenseCategoryDTO } from "@/lib/types";

export default function CategoriesPage() {
  const {
    categories,
    transactions,
    settings,
    isLoading,
    createCategory,
    updateCategory,
    deleteCategory,
  } = useWallet();
  const { showToast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<ExpenseCategoryDTO | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("tag");
  const [color, setColor] = useState("#10B981");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const statsMap = useMemo(() => {
    const map = new Map<string, { count: number; total: string }>();
    for (const tx of transactions) {
      if (tx.type !== "EXPENSE" || !tx.expenseCategoryId || tx.isDeleted) {
        continue;
      }
      const prev = map.get(tx.expenseCategoryId) ?? {
        count: 0,
        total: "0.00",
      };
      map.set(tx.expenseCategoryId, {
        count: prev.count + 1,
        total: addMoney(prev.total, tx.amount),
      });
    }
    return map;
  }, [transactions]);

  const totalSpentAll = useMemo(() => {
    let sum = "0.00";
    for (const s of statsMap.values()) {
      sum = addMoney(sum, s.total);
    }
    return toMoneyNumber(sum);
  }, [statsMap]);

  const openCreate = () => {
    setEditingCat(null);
    setName("");
    setIcon("tag");
    setColor(CATEGORY_COLOR_OPTIONS[0]);
    setError("");
    setModalOpen(true);
  };

  const openEdit = (cat: ExpenseCategoryDTO) => {
    setEditingCat(cat);
    setName(cat.name);
    setIcon(cat.icon);
    setColor(cat.color);
    setError("");
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (editingCat) {
        await updateCategory(editingCat.id, { name, icon, color });
        showToast("Category updated.", "success");
      } else {
        await createCategory({ name, icon, color });
        showToast("Category created.", "success");
      }
      setModalOpen(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save category.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat: ExpenseCategoryDTO, usedCount: number) => {
    if (usedCount > 0) {
      showToast(
        `Cannot delete "${cat.name}" because it is assigned to ${usedCount} existing transaction${usedCount === 1 ? "" : "s"}. Historical categories are preserved.`,
        "error",
      );
      return;
    }
    try {
      await deleteCategory(cat.id);
      showToast(`Deleted "${cat.name}".`, "success");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not delete category.",
        "error",
      );
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
            Expense Categories
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Categories used by historical transactions cannot be deleted
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-2xl bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-700"
        >
          <Plus className="h-3.5 w-3.5" />
          New Category
        </button>
      </div>

      {categories.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="No categories"
          description="Create expense categories to organize your spending."
          action={
            <button
              type="button"
              onClick={openCreate}
              className="rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white"
            >
              Add Category
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {categories.map((cat) => {
            const stat = statsMap.get(cat.id) ?? { count: 0, total: "0.00" };
            const pct =
              totalSpentAll > 0
                ? Math.round((toMoneyNumber(stat.total) / totalSpentAll) * 100)
                : 0;

            return (
              <div
                key={cat.id}
                className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-[#131A26]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <CategoryIcon icon={cat.icon} color={cat.color} size="lg" />
                    <div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                        {cat.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {stat.count} expense{stat.count === 1 ? "" : "s"} ·{" "}
                        <span className="font-semibold text-slate-700 tabular-nums dark:text-slate-200">
                          {formatMoney(stat.total, settings.currencySymbol)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(cat)}
                      aria-label={`Edit ${cat.name}`}
                      className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(cat, stat.count)}
                      aria-label={`Delete ${cat.name}`}
                      title={
                        stat.count > 0
                          ? "In use by existing transactions — cannot delete"
                          : "Delete unused category"
                      }
                      className={`rounded-xl p-2 transition ${
                        stat.count > 0
                          ? "cursor-not-allowed text-slate-300 dark:text-slate-600"
                          : "text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      }`}
                    >
                      {stat.count > 0 ? (
                        <Lock className="h-4 w-4" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: cat.color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ModalOrSheet
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCat ? `Edit ${editingCat.name}` : "Create Category"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Category Name
            </label>
            <input
              type="text"
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Groceries"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full border-2 transition ${
                    color === c
                      ? "scale-110 border-slate-900 dark:border-white"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Select color ${c}`}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Icon
            </label>
            <div className="grid grid-cols-7 gap-2">
              {CATEGORY_ICON_OPTIONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  className={`flex items-center justify-center rounded-2xl border p-2 ${
                    icon === ic
                      ? "border-teal-600 bg-teal-50 dark:border-teal-500 dark:bg-teal-950/50"
                      : "border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <CategoryIcon icon={ic} color={color} size="sm" />
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-2xl bg-teal-600 py-3 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60"
          >
            {saving
              ? "Saving..."
              : editingCat
                ? "Save Changes"
                : "Create Category"}
          </button>
        </form>
      </ModalOrSheet>
    </div>
  );
}
