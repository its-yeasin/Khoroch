export const ACCOUNT_CATEGORIES = ["CASH", "BANK", "CUSTOM"] as const;
export type AccountCategory = (typeof ACCOUNT_CATEGORIES)[number];

export const BALANCE_TYPES = ["MAIN", "INTEREST"] as const;
export type BalanceType = (typeof BALANCE_TYPES)[number];

export const TRANSACTION_TYPES = [
  "ADD_BALANCE",
  "EXPENSE",
  "LOAN_RECEIVED",
  "LOAN_GIVEN",
  "LOAN_REPAYMENT",
  "INCOME",
  "BANK_INTEREST",
  "ACCOUNT_TRANSFER",
  "BALANCE_ADJUSTMENT",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const ADJUSTMENT_DIRECTIONS = ["INCREASE", "DECREASE"] as const;
export type AdjustmentDirection = (typeof ADJUSTMENT_DIRECTIONS)[number];

export const LOAN_TYPES = ["RECEIVED", "GIVEN"] as const;
export type LoanType = (typeof LOAN_TYPES)[number];

export const LOAN_STATUSES = [
  "OUTSTANDING",
  "PARTIALLY_REPAID",
  "FULLY_REPAID",
] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];

export const SYNC_STATUSES = ["SYNCED", "PENDING", "FAILED"] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const DASHBOARD_RANGES = [
  "TODAY",
  "WEEK",
  "MONTH",
  "YEAR",
  "CUSTOM",
] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export const DATE_FORMATS = [
  "DD MMM YYYY",
  "MM/DD/YYYY",
  "YYYY-MM-DD",
] as const;
export type DateFormatOption = (typeof DATE_FORMATS)[number];

export const THEME_OPTIONS = ["system", "light", "dark"] as const;
export type ThemeOption = (typeof THEME_OPTIONS)[number];

export interface DefaultCategorySeed {
  name: string;
  icon: string;
  color: string;
}

export const DEFAULT_EXPENSE_CATEGORIES: DefaultCategorySeed[] = [
  { name: "Food", icon: "utensils", color: "#F97316" },
  { name: "Transport", icon: "car", color: "#3B82F6" },
  { name: "Shopping", icon: "shopping-bag", color: "#EC4899" },
  { name: "Bills", icon: "receipt", color: "#EAB308" },
  { name: "Health", icon: "heart-pulse", color: "#EF4444" },
  { name: "Entertainment", icon: "film", color: "#8B5CF6" },
  { name: "Education", icon: "graduation-cap", color: "#06B6D4" },
  { name: "Others", icon: "tag", color: "#64748B" },
];

export const TRANSACTION_TYPE_META: Record<
  TransactionType,
  {
    label: string;
    shortLabel: string;
    colorClass: string;
    bgClass: string;
    sign: "+" | "-" | "~";
  }
> = {
  ADD_BALANCE: {
    label: "Balance Added",
    shortLabel: "Added",
    colorClass: "text-emerald-600 dark:text-emerald-400",
    bgClass: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    sign: "+",
  },
  EXPENSE: {
    label: "Expense",
    shortLabel: "Expense",
    colorClass: "text-rose-600 dark:text-rose-400",
    bgClass: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
    sign: "-",
  },
  INCOME: {
    label: "Income",
    shortLabel: "Income",
    colorClass: "text-emerald-600 dark:text-emerald-400",
    bgClass: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    sign: "+",
  },
  BANK_INTEREST: {
    label: "Bank Interest",
    shortLabel: "Interest",
    colorClass: "text-amber-600 dark:text-amber-400",
    bgClass: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
    sign: "+",
  },
  ACCOUNT_TRANSFER: {
    label: "Account Transfer",
    shortLabel: "Transfer",
    colorClass: "text-blue-600 dark:text-blue-400",
    bgClass: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
    sign: "~",
  },
  LOAN_RECEIVED: {
    label: "Loan Received",
    shortLabel: "Borrowed",
    colorClass: "text-violet-600 dark:text-violet-400",
    bgClass: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
    sign: "+",
  },
  LOAN_GIVEN: {
    label: "Loan Given",
    shortLabel: "Lent",
    colorClass: "text-sky-600 dark:text-sky-400",
    bgClass: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
    sign: "-",
  },
  LOAN_REPAYMENT: {
    label: "Loan Repayment",
    shortLabel: "Repayment",
    colorClass: "text-teal-600 dark:text-teal-400",
    bgClass: "bg-teal-500/12 text-teal-600 dark:text-teal-400",
    sign: "~",
  },
  BALANCE_ADJUSTMENT: {
    label: "Balance Adjustment",
    shortLabel: "Adjustment",
    colorClass: "text-slate-600 dark:text-slate-300",
    bgClass: "bg-slate-500/12 text-slate-600 dark:text-slate-300",
    sign: "~",
  },
};
