"use client";

import React from "react";
import { formatMoney } from "@/lib/money";

export function ExpenseDonutChart({
  data,
  currencySymbol,
}: {
  data: Array<{
    categoryId: string;
    name: string;
    color: string;
    amount: string;
    numericAmount: number;
  }>;
  currencySymbol: string;
}) {
  const total = data.reduce((sum, d) => sum + d.numericAmount, 0);

  if (total <= 0 || data.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center text-xs text-slate-400">
        No expenses recorded in this period.
      </div>
    );
  }

  const radius = 54;
  const circumference = 2 * Math.PI * radius;

  const segments = data.reduce<
    Array<{
      item: (typeof data)[number];
      dashArray: string;
      dashOffset: number;
      nextOffset: number;
    }>
  >((acc, item) => {
    const prevOffset = acc.length > 0 ? acc[acc.length - 1].nextOffset : 0;
    const pct = item.numericAmount / total;
    const len = pct * circumference;
    acc.push({
      item,
      dashArray: `${len} ${circumference - len}`,
      dashOffset: -prevOffset,
      nextOffset: prevOffset + len,
    });
    return acc;
  }, []);

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="16"
            className="text-slate-100 dark:text-slate-800"
          />
          {segments.map(({ item, dashArray, dashOffset }) => (
            <circle
              key={item.categoryId}
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={item.color}
              strokeWidth="16"
              strokeDasharray={dashArray}
              strokeDashoffset={dashOffset}
              strokeLinecap="butt"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-medium text-slate-400">Spent</span>
          <span className="text-xs font-bold text-slate-900 tabular-nums dark:text-white">
            {formatMoney(total, currencySymbol, { trimWholeDecimals: true })}
          </span>
        </div>
      </div>

      <div className="w-full flex-1 space-y-2">
        {data.slice(0, 5).map((item) => {
          const pct = Math.round((item.numericAmount / total) * 100);
          return (
            <div
              key={item.categoryId}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate font-medium text-slate-700 dark:text-slate-300">
                  {item.name}
                </span>
              </div>
              <div className="shrink-0 font-semibold text-slate-900 tabular-nums dark:text-white">
                {formatMoney(item.amount, currencySymbol, {
                  trimWholeDecimals: true,
                })}{" "}
                <span className="font-normal text-slate-400">({pct}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CashflowBarChart({
  series,
  currencySymbol,
}: {
  series: Array<{ date: string; income: number; expense: number }>;
  currencySymbol: string;
}) {
  if (series.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center text-xs text-slate-400">
        No income or expense activity in this period.
      </div>
    );
  }

  const recent = series.slice(-10);
  const maxVal = Math.max(
    1,
    ...recent.flatMap((d) => [d.income, d.expense]),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-4 text-[11px] font-medium">
        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
          Income
        </span>
        <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
          <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" />
          Expense
        </span>
      </div>

      <div className="flex h-36 items-end gap-2 border-b border-slate-100 pb-1 dark:border-slate-800">
        {recent.map((day) => {
          const incPct = Math.round((day.income / maxVal) * 100);
          const expPct = Math.round((day.expense / maxVal) * 100);
          const shortDay = day.date.slice(5);
          return (
            <div
              key={day.date}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1"
              title={`${day.date}: +${formatMoney(day.income, currencySymbol)} / -${formatMoney(day.expense, currencySymbol)}`}
            >
              <div className="flex h-full w-full items-end justify-center gap-1">
                <div
                  className="w-2.5 rounded-t-md bg-emerald-500/85 transition-all"
                  style={{ height: `${Math.max(day.income > 0 ? 6 : 0, incPct)}%` }}
                />
                <div
                  className="w-2.5 rounded-t-md bg-rose-500/85 transition-all"
                  style={{ height: `${Math.max(day.expense > 0 ? 6 : 0, expPct)}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-400 tabular-nums">
                {shortDay}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
