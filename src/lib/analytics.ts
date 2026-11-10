import type { DashboardRange } from "@/lib/constants";
import { getDateRangeBounds } from "@/lib/date";
import { addMoney, toMoneyNumber, toMoneyString } from "@/lib/money";
import type {
  AccountDTO,
  ExpenseCategoryDTO,
  TransactionDTO,
} from "@/lib/types";

export interface DashboardSummary {
  totalCash: string;
  totalBankBalance: string;
  totalAssets: string;
  totalOutstandingLoansReceived: string;
  totalOutstandingLoansGiven: string;
  totalExpenses: string;
  totalIncome: string;
  totalInterestEarned: string;
  walletAccounts: AccountDTO[];
  recentTransactions: TransactionDTO[];
  expenseByCategory: Array<{
    categoryId: string;
    name: string;
    color: string;
    icon: string;
    amount: string;
    numericAmount: number;
  }>;
  dailySeries: Array<{
    date: string;
    income: number;
    expense: number;
  }>;
}

export function buildDashboardSummaryFromData(params: {
  accounts: AccountDTO[];
  categories: ExpenseCategoryDTO[];
  loans: Array<{
    loanType: "RECEIVED" | "GIVEN";
    outstandingAmount: string;
    isDeleted: boolean;
  }>;
  transactions: TransactionDTO[];
  range: DashboardRange;
  customStart?: string;
  customEnd?: string;
}): DashboardSummary {
  const { start, end } = getDateRangeBounds(
    params.range,
    params.customStart,
    params.customEnd,
  );

  let totalCash = "0.00";
  let totalBankBalance = "0.00";
  const walletAccounts: AccountDTO[] = [];

  for (const acc of params.accounts) {
    if (acc.isArchived) continue;
    if (acc.category === "CASH") {
      totalCash = addMoney(totalCash, acc.totalBalance);
      walletAccounts.push(acc);
    } else if (acc.category === "BANK") {
      totalBankBalance = addMoney(totalBankBalance, acc.totalBalance);
      walletAccounts.push(acc);
    }
  }

  const totalAssets = addMoney(totalCash, totalBankBalance);

  let totalOutstandingLoansReceived = "0.00";
  let totalOutstandingLoansGiven = "0.00";
  for (const loan of params.loans) {
    if (loan.isDeleted) continue;
    if (loan.loanType === "RECEIVED") {
      totalOutstandingLoansReceived = addMoney(
        totalOutstandingLoansReceived,
        loan.outstandingAmount,
      );
    } else {
      totalOutstandingLoansGiven = addMoney(
        totalOutstandingLoansGiven,
        loan.outstandingAmount,
      );
    }
  }

  const catMap = new Map<string, ExpenseCategoryDTO>();
  for (const c of params.categories) {
    catMap.set(c.id, c);
  }

  let totalExpenses = "0.00";
  let totalIncome = "0.00";
  let totalInterestEarned = "0.00";
  const categoryTotals = new Map<string, string>();
  const dayBuckets = new Map<string, { income: string; expense: string }>();

  const activeTxs = params.transactions.filter((t) => !t.isDeleted);

  for (const tx of activeTxs) {
    const dt = new Date(tx.transactionDate);
    if (dt < start || dt > end) continue;
    const amt = toMoneyString(tx.amount);
    const dayKey = dt.toISOString().slice(0, 10);
    const dayEntry = dayBuckets.get(dayKey) ?? {
      income: "0.00",
      expense: "0.00",
    };

    if (tx.type === "EXPENSE") {
      totalExpenses = addMoney(totalExpenses, amt);
      dayEntry.expense = addMoney(dayEntry.expense, amt);
      if (tx.expenseCategoryId) {
        categoryTotals.set(
          tx.expenseCategoryId,
          addMoney(categoryTotals.get(tx.expenseCategoryId) ?? "0.00", amt),
        );
      }
    } else if (tx.type === "INCOME") {
      totalIncome = addMoney(totalIncome, amt);
      dayEntry.income = addMoney(dayEntry.income, amt);
    } else if (tx.type === "BANK_INTEREST") {
      totalInterestEarned = addMoney(totalInterestEarned, amt);
      totalIncome = addMoney(totalIncome, amt);
      dayEntry.income = addMoney(dayEntry.income, amt);
    }

    dayBuckets.set(dayKey, dayEntry);
  }

  const expenseByCategory = Array.from(categoryTotals.entries())
    .map(([categoryId, amount]) => {
      const cat = catMap.get(categoryId);
      return {
        categoryId,
        name: cat?.name ?? "Others",
        color: cat?.color ?? "#64748B",
        icon: cat?.icon ?? "tag",
        amount,
        numericAmount: toMoneyNumber(amount),
      };
    })
    .sort((a, b) => b.numericAmount - a.numericAmount);

  const dailySeries = Array.from(dayBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, val]) => ({
      date,
      income: toMoneyNumber(val.income),
      expense: toMoneyNumber(val.expense),
    }));

  const recentTransactions = [...activeTxs]
    .sort(
      (a, b) =>
        new Date(b.transactionDate).getTime() -
          new Date(a.transactionDate).getTime() ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, 10);

  return {
    totalCash,
    totalBankBalance,
    totalAssets,
    totalOutstandingLoansReceived,
    totalOutstandingLoansGiven,
    totalExpenses,
    totalIncome,
    totalInterestEarned,
    walletAccounts,
    recentTransactions,
    expenseByCategory,
    dailySeries,
  };
}
