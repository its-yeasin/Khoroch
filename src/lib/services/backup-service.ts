import { z } from "zod";
import mongoose from "mongoose";
import {
  ACCOUNT_CATEGORIES,
  ADJUSTMENT_DIRECTIONS,
  BALANCE_TYPES,
  TRANSACTION_TYPES,
} from "@/lib/constants";
import { AccountModel } from "@/lib/db/models/Account";
import { ExpenseCategoryModel } from "@/lib/db/models/ExpenseCategory";
import { LoanModel } from "@/lib/db/models/Loan";
import { TransactionModel } from "@/lib/db/models/Transaction";
import { AppError } from "@/lib/errors";
import { createAccount } from "@/lib/services/account-service";
import { createCategory } from "@/lib/services/category-service";
import { createTransaction } from "@/lib/services/ledger";
import { getFullSnapshot } from "@/lib/services/sync-service";

const backupSchema = z.object({
  version: z.number().optional(),
  accounts: z
    .array(
      z.object({
        id: z.string(),
        clientId: z.string().optional(),
        name: z.string().min(1),
        category: z.enum(ACCOUNT_CATEGORIES),
        bankName: z.string().optional(),
        initialMainBalance: z.string().optional(),
        initialInterestBalance: z.string().optional(),
        interestEnabled: z.boolean().optional(),
        description: z.string().optional(),
        isDefault: z.boolean().optional(),
      }),
    )
    .default([]),
  categories: z
    .array(
      z.object({
        id: z.string(),
        clientId: z.string().optional(),
        name: z.string().min(1),
        icon: z.string().optional(),
        color: z.string().optional(),
      }),
    )
    .default([]),
  transactions: z
    .array(
      z.object({
        id: z.string().optional(),
        clientTransactionId: z.string().min(1),
        type: z.enum(TRANSACTION_TYPES),
        amount: z.string(),
        fromAccountId: z.string().nullable().optional(),
        toAccountId: z.string().nullable().optional(),
        fromBalanceType: z.enum(BALANCE_TYPES).nullable().optional(),
        toBalanceType: z.enum(BALANCE_TYPES).nullable().optional(),
        expenseCategoryId: z.string().nullable().optional(),
        loanId: z.string().nullable().optional(),
        adjustmentDirection: z.enum(ADJUSTMENT_DIRECTIONS).nullable().optional(),
        description: z.string().optional(),
        note: z.string().optional(),
        transactionDate: z.string(),
      }),
    )
    .default([]),
  loans: z
    .array(
      z.object({
        id: z.string(),
        originTransactionId: z.string().optional(),
      }),
    )
    .optional(),
});

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function exportUserData(
  userId: string,
  format: "json" | "csv",
): Promise<{ content: string; contentType: string; filename: string }> {
  const snapshot = await getFullSnapshot(userId);
  const dateTag = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    const payload = {
      app: "Self Wallet",
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: snapshot.settings,
      accounts: snapshot.accounts,
      categories: snapshot.categories,
      loans: snapshot.loans,
      transactions: snapshot.transactions,
    };
    return {
      content: JSON.stringify(payload, null, 2),
      contentType: "application/json; charset=utf-8",
      filename: `self-wallet-backup-${dateTag}.json`,
    };
  }

  const accMap = new Map(snapshot.accounts.map((a) => [a.id, a.name]));
  const catMap = new Map(snapshot.categories.map((c) => [c.id, c.name]));

  const headers = [
    "TransactionID",
    "ClientTransactionID",
    "Date",
    "Type",
    "Amount",
    "FromAccount",
    "FromBalanceBucket",
    "ToAccount",
    "ToBalanceBucket",
    "Category",
    "Description",
    "Note",
  ];

  const rows = snapshot.transactions.map((tx) =>
    [
      tx.id,
      tx.clientTransactionId,
      tx.transactionDate,
      tx.type,
      tx.amount,
      tx.fromAccountId ? (accMap.get(tx.fromAccountId) ?? tx.fromAccountId) : "",
      tx.fromBalanceType ?? "",
      tx.toAccountId ? (accMap.get(tx.toAccountId) ?? tx.toAccountId) : "",
      tx.toBalanceType ?? "",
      tx.expenseCategoryId
        ? (catMap.get(tx.expenseCategoryId) ?? tx.expenseCategoryId)
        : "",
      tx.description,
      tx.note,
    ]
      .map((cell) => escapeCsvCell(String(cell ?? "")))
      .join(","),
  );

  return {
    content: [headers.join(","), ...rows].join("\n"),
    contentType: "text/csv; charset=utf-8",
    filename: `self-wallet-transactions-${dateTag}.csv`,
  };
}

export async function importUserBackup(userId: string, rawPayload: unknown) {
  const parsed = backupSchema.safeParse(rawPayload);
  if (!parsed.success) {
    throw new AppError(
      400,
      "INVALID_BACKUP_FORMAT",
      parsed.error.issues[0]?.message || "Invalid backup JSON format.",
    );
  }

  const data = parsed.data;
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const [existingAccounts, existingCategories, existingTxs] = await Promise.all([
    AccountModel.find({ userId: userObjectId }).lean(),
    ExpenseCategoryModel.find({ userId: userObjectId }).lean(),
    TransactionModel.find({ userId: userObjectId })
      .select("_id clientTransactionId loanId")
      .lean(),
  ]);

  const accountIdMap = new Map<string, string>();
  const categoryIdMap = new Map<string, string>();
  const loanIdMap = new Map<string, string>();

  const defaultCash = existingAccounts.find(
    (a) => a.isDefault && a.category === "CASH",
  );

  let importedAccounts = 0;
  let importedCategories = 0;
  let importedTransactions = 0;
  let skippedDuplicates = 0;
  const errors: string[] = [];

  for (const acc of data.accounts) {
    if (acc.isDefault && acc.category === "CASH" && defaultCash) {
      accountIdMap.set(acc.id, defaultCash._id.toString());
      continue;
    }
    const existing = existingAccounts.find(
      (ea) =>
        (acc.clientId && ea.clientId === acc.clientId) ||
        (ea.name.toLowerCase() === acc.name.trim().toLowerCase() &&
          ea.category === acc.category),
    );
    if (existing) {
      accountIdMap.set(acc.id, existing._id.toString());
      continue;
    }
    const res = await createAccount(userId, {
      clientId: acc.clientId || `import-acct-${acc.id}`,
      name: acc.name,
      category: acc.category,
      bankName: acc.bankName,
      initialMainBalance: acc.initialMainBalance ?? "0.00",
      initialInterestBalance: acc.initialInterestBalance ?? "0.00",
      interestEnabled: acc.interestEnabled ?? false,
      description: acc.description ?? "",
    });
    accountIdMap.set(acc.id, res.account.id);
    if (!res.duplicate) importedAccounts += 1;
  }

  for (const cat of data.categories) {
    const existing = existingCategories.find(
      (ec) => ec.nameLower === cat.name.trim().toLowerCase(),
    );
    if (existing) {
      categoryIdMap.set(cat.id, existing._id.toString());
      continue;
    }
    const res = await createCategory(userId, {
      clientId: cat.clientId || `import-cat-${cat.id}`,
      name: cat.name,
      icon: cat.icon ?? "tag",
      color: cat.color ?? "#64748B",
    });
    categoryIdMap.set(cat.id, res.category.id);
    if (!res.duplicate) importedCategories += 1;
  }

  // Pre-seed loan map if origin transactions already exist
  const existingTxByClientId = new Map(
    existingTxs.map((t) => [t.clientTransactionId, t]),
  );
  if (data.loans) {
    const originClientIdByOldLoanId = new Map<string, string>();
    for (const tx of data.transactions) {
      if (
        (tx.type === "LOAN_RECEIVED" || tx.type === "LOAN_GIVEN") &&
        tx.loanId
      ) {
        originClientIdByOldLoanId.set(tx.loanId, tx.clientTransactionId);
      }
    }
    for (const oldLoan of data.loans) {
      const originClientId = originClientIdByOldLoanId.get(oldLoan.id);
      if (originClientId) {
        const existingTx = existingTxByClientId.get(originClientId);
        if (existingTx?.loanId) {
          loanIdMap.set(oldLoan.id, existingTx.loanId.toString());
        }
      }
    }
  }

  // Process non-repayment transactions first (chronologically), then repayments
  const sortedTxs = [...data.transactions].sort((a, b) => {
    const aIsRepay = a.type === "LOAN_REPAYMENT" ? 1 : 0;
    const bIsRepay = b.type === "LOAN_REPAYMENT" ? 1 : 0;
    if (aIsRepay !== bIsRepay) return aIsRepay - bIsRepay;
    return (
      new Date(a.transactionDate).getTime() -
      new Date(b.transactionDate).getTime()
    );
  });

  for (const tx of sortedTxs) {
    try {
      const mappedLoanId = tx.loanId
        ? (loanIdMap.get(tx.loanId) ?? tx.loanId)
        : null;
      const res = await createTransaction(userId, {
        clientTransactionId: tx.clientTransactionId,
        type: tx.type,
        amount: tx.amount,
        fromAccountId: tx.fromAccountId
          ? (accountIdMap.get(tx.fromAccountId) ?? tx.fromAccountId)
          : null,
        toAccountId: tx.toAccountId
          ? (accountIdMap.get(tx.toAccountId) ?? tx.toAccountId)
          : null,
        fromBalanceType: tx.fromBalanceType ?? null,
        toBalanceType: tx.toBalanceType ?? null,
        expenseCategoryId: tx.expenseCategoryId
          ? (categoryIdMap.get(tx.expenseCategoryId) ?? tx.expenseCategoryId)
          : null,
        loanId: mappedLoanId,
        adjustmentDirection: tx.adjustmentDirection ?? null,
        description: tx.description ?? "",
        note: tx.note ?? "",
        transactionDate: tx.transactionDate,
      });

      if (tx.loanId && res.loan) {
        loanIdMap.set(tx.loanId, res.loan.id);
      } else if (
        (tx.type === "LOAN_RECEIVED" || tx.type === "LOAN_GIVEN") &&
        tx.loanId &&
        res.transaction.loanId
      ) {
        loanIdMap.set(tx.loanId, res.transaction.loanId);
      }

      if (res.duplicate) {
        skippedDuplicates += 1;
      } else {
        importedTransactions += 1;
      }
    } catch (err) {
      errors.push(
        `Transaction ${tx.clientTransactionId}: ${err instanceof Error ? err.message : "Failed"}`,
      );
    }
  }

  // Also check if any loans in DB match clientLoanId cleanly
  void LoanModel;

  return {
    importedAccounts,
    importedCategories,
    importedTransactions,
    skippedDuplicates,
    errors,
  };
}
