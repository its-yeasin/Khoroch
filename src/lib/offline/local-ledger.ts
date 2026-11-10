import type {
  AccountCategory,
  AdjustmentDirection,
  BalanceType,
  LoanStatus,
  TransactionType,
} from "@/lib/constants";
import {
  addMoney,
  compareMoney,
  isNonNegativeMoney,
  isPositiveMoney,
  subMoney,
  toMoneyString,
} from "@/lib/money";
import { getOfflineDB } from "@/lib/offline/db";
import type {
  AccountDTO,
  ExpenseCategoryDTO,
  LoanDTO,
  PendingOperation,
  TransactionDTO,
} from "@/lib/types";

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function createLocalAccount(
  userId: string,
  input: {
    name: string;
    category: AccountCategory;
    bankName?: string;
    accountNumber?: string;
    initialMainBalance?: string;
    initialInterestBalance?: string;
    interestEnabled?: boolean;
    description?: string;
  },
): Promise<AccountDTO> {
  const db = getOfflineDB();
  const now = new Date().toISOString();
  const clientId = generateId();
  const isBank = input.category === "BANK";
  const interestEnabled = isBank ? Boolean(input.interestEnabled) : false;
  const initialMain = toMoneyString(input.initialMainBalance ?? "0.00");
  const initialInterest = interestEnabled
    ? toMoneyString(input.initialInterestBalance ?? "0.00")
    : "0.00";

  if (!input.name.trim()) {
    throw new Error("Account name is required.");
  }
  if (compareMoney(initialMain, "0.00") < 0) {
    throw new Error("Initial main balance cannot be negative.");
  }

  const trimmedNum = input.accountNumber?.trim();
  const masked = trimmedNum
    ? trimmedNum.length <= 4
      ? "••••"
      : `•••• ${trimmedNum.slice(-4)}`
    : undefined;

  const account: AccountDTO = {
    id: clientId,
    userId,
    clientId,
    name: input.name.trim(),
    category: input.category,
    bankName: isBank ? input.bankName?.trim() || undefined : undefined,
    accountNumberMasked: isBank ? masked : undefined,
    initialMainBalance: initialMain,
    currentMainBalance: initialMain,
    initialInterestBalance: initialInterest,
    currentInterestBalance: initialInterest,
    totalBalance: interestEnabled
      ? addMoney(initialMain, initialInterest)
      : initialMain,
    interestEnabled,
    description: input.description?.trim() ?? "",
    isDefault: false,
    isArchived: false,
    version: 0,
    createdAt: now,
    updatedAt: now,
    syncStatus: "PENDING",
  };

  const op: PendingOperation = {
    opId: generateId(),
    userId,
    opType: "CREATE_ACCOUNT",
    clientEntityId: clientId,
    payload: {
      clientId,
      name: account.name,
      category: account.category,
      bankName: account.bankName,
      accountNumber: trimmedNum,
      initialMainBalance: initialMain,
      initialInterestBalance: initialInterest,
      interestEnabled,
      description: account.description,
    },
    createdAt: now,
    status: "PENDING",
    retryCount: 0,
  };

  await db.transaction("rw", db.accounts, db.pendingOps, async () => {
    await db.accounts.put(account);
    await db.pendingOps.put(op);
  });

  return account;
}

export async function createLocalCategory(
  userId: string,
  input: { name: string; icon?: string; color?: string },
): Promise<ExpenseCategoryDTO> {
  const db = getOfflineDB();
  const name = input.name.trim();
  if (!name) throw new Error("Category name is required.");

  const existing = await db.categories
    .where("userId")
    .equals(userId)
    .toArray();
  if (existing.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
    throw new Error(`Category "${name}" already exists.`);
  }

  const now = new Date().toISOString();
  const clientId = generateId();
  const category: ExpenseCategoryDTO = {
    id: clientId,
    userId,
    clientId,
    name,
    icon: input.icon || "tag",
    color: input.color || "#64748B",
    isDefault: false,
    createdAt: now,
    updatedAt: now,
    syncStatus: "PENDING",
  };

  const op: PendingOperation = {
    opId: generateId(),
    userId,
    opType: "CREATE_CATEGORY",
    clientEntityId: clientId,
    payload: {
      clientId,
      name,
      icon: category.icon,
      color: category.color,
    },
    createdAt: now,
    status: "PENDING",
    retryCount: 0,
  };

  await db.transaction("rw", db.categories, db.pendingOps, async () => {
    await db.categories.put(category);
    await db.pendingOps.put(op);
  });

  return category;
}

export interface LocalTransactionInput {
  clientTransactionId?: string;
  type: TransactionType;
  amount: string;
  fromAccountId?: string | null;
  toAccountId?: string | null;
  fromBalanceType?: BalanceType | null;
  toBalanceType?: BalanceType | null;
  expenseCategoryId?: string | null;
  loanId?: string | null;
  adjustmentDirection?: AdjustmentDirection | null;
  description?: string;
  note?: string;
  attachmentName?: string;
  attachmentDataUrl?: string;
  transactionDate?: string;
}

function resolveLocalBucket(
  acc: AccountDTO,
  requested: BalanceType | null | undefined,
  forceInterest = false,
): BalanceType {
  if (forceInterest) {
    if (acc.category !== "BANK" || !acc.interestEnabled) {
      throw new Error(`Account "${acc.name}" does not have interest enabled.`);
    }
    return "INTEREST";
  }
  if (requested === "INTEREST") {
    if (acc.category !== "BANK" || !acc.interestEnabled) {
      throw new Error(
        `Interest balance is not enabled for "${acc.name}".`,
      );
    }
    return "INTEREST";
  }
  return "MAIN";
}

function adjustLocalAccountBalance(
  acc: AccountDTO,
  bucket: BalanceType,
  sign: 1 | -1,
  amountStr: string,
): AccountDTO {
  const curr =
    bucket === "INTEREST" ? acc.currentInterestBalance : acc.currentMainBalance;
  const next = sign === 1 ? addMoney(curr, amountStr) : subMoney(curr, amountStr);
  if (sign === -1 && compareMoney(next, "0.00") < 0) {
    throw new Error(
      `Insufficient ${bucket === "INTEREST" ? "interest" : "main"} balance in "${acc.name}". Available: ${curr}, Required: ${amountStr}.`,
    );
  }
  const nextMain = bucket === "MAIN" ? next : acc.currentMainBalance;
  const nextInt = bucket === "INTEREST" ? next : acc.currentInterestBalance;
  return {
    ...acc,
    currentMainBalance: nextMain,
    currentInterestBalance: nextInt,
    totalBalance: acc.interestEnabled ? addMoney(nextMain, nextInt) : nextMain,
    version: acc.version + 1,
    updatedAt: new Date().toISOString(),
  };
}

export async function createLocalTransaction(
  userId: string,
  input: LocalTransactionInput,
): Promise<{ transaction: TransactionDTO; loan: LoanDTO | null }> {
  const db = getOfflineDB();
  const amountStr = toMoneyString(input.amount);
  if (!isPositiveMoney(amountStr)) {
    throw new Error("Transaction amount must be greater than zero.");
  }

  const clientTransactionId = input.clientTransactionId || generateId();
  const now = new Date().toISOString();
  const txDate = input.transactionDate
    ? new Date(input.transactionDate).toISOString()
    : now;

  return db.transaction(
    "rw",
    [db.accounts, db.categories, db.loans, db.transactions, db.pendingOps],
    async () => {
      const existing = await db.transactions
        .where("clientTransactionId")
        .equals(clientTransactionId)
        .first();
      if (existing) {
        const existingLoan = existing.loanId
          ? ((await db.loans.get(existing.loanId)) ?? null)
          : null;
        return { transaction: existing, loan: existingLoan };
      }

      const loadAcc = async (id: string | null | undefined, label: string) => {
        if (!id) throw new Error(`${label} account is required.`);
        const acc = await db.accounts.get(id);
        if (!acc || acc.userId !== userId) {
          throw new Error(`${label} account not found.`);
        }
        if (acc.isArchived) {
          throw new Error(`${label} account "${acc.name}" is archived.`);
        }
        return acc;
      };

      let fromAccountId: string | null = null;
      let toAccountId: string | null = null;
      let fromBalanceType: BalanceType | null = null;
      let toBalanceType: BalanceType | null = null;
      let expenseCategoryId: string | null = null;
      let loanId: string | null = null;
      let clientLoanId: string | undefined;
      let adjustmentDirection: AdjustmentDirection | null = null;
      let createdOrUpdatedLoan: LoanDTO | null = null;

      switch (input.type) {
        case "ADD_BALANCE":
        case "INCOME": {
          const toAcc = await loadAcc(input.toAccountId, "Destination");
          const bucket = resolveLocalBucket(toAcc, input.toBalanceType);
          const updated = adjustLocalAccountBalance(
            toAcc,
            bucket,
            1,
            amountStr,
          );
          await db.accounts.put(updated);
          toAccountId = toAcc.id;
          toBalanceType = bucket;
          break;
        }
        case "BANK_INTEREST": {
          const toAcc = await loadAcc(input.toAccountId, "Bank");
          const bucket = resolveLocalBucket(toAcc, "INTEREST", true);
          const updated = adjustLocalAccountBalance(
            toAcc,
            bucket,
            1,
            amountStr,
          );
          await db.accounts.put(updated);
          toAccountId = toAcc.id;
          toBalanceType = bucket;
          break;
        }
        case "EXPENSE": {
          const fromAcc = await loadAcc(input.fromAccountId, "Source");
          if (!input.expenseCategoryId) {
            throw new Error("Expense category is required.");
          }
          const cat = await db.categories.get(input.expenseCategoryId);
          if (!cat || cat.userId !== userId) {
            throw new Error("Expense category not found.");
          }
          const bucket = resolveLocalBucket(fromAcc, input.fromBalanceType);
          const updated = adjustLocalAccountBalance(
            fromAcc,
            bucket,
            -1,
            amountStr,
          );
          await db.accounts.put(updated);
          fromAccountId = fromAcc.id;
          fromBalanceType = bucket;
          expenseCategoryId = cat.id;
          break;
        }
        case "ACCOUNT_TRANSFER": {
          const fromAcc = await loadAcc(input.fromAccountId, "Source");
          const toAcc = await loadAcc(input.toAccountId, "Destination");
          const fromBucket = resolveLocalBucket(fromAcc, input.fromBalanceType);
          const toBucket = resolveLocalBucket(toAcc, input.toBalanceType);
          if (fromAcc.id === toAcc.id && fromBucket === toBucket) {
            throw new Error(
              "Source and destination account balance buckets must be different.",
            );
          }
          const updatedFrom = adjustLocalAccountBalance(
            fromAcc,
            fromBucket,
            -1,
            amountStr,
          );
          await db.accounts.put(updatedFrom);
          const targetTo = toAcc.id === updatedFrom.id ? updatedFrom : toAcc;
          const updatedTo = adjustLocalAccountBalance(
            targetTo,
            toBucket,
            1,
            amountStr,
          );
          await db.accounts.put(updatedTo);
          fromAccountId = fromAcc.id;
          toAccountId = toAcc.id;
          fromBalanceType = fromBucket;
          toBalanceType = toBucket;
          break;
        }
        case "LOAN_RECEIVED": {
          const lenderAcc = await loadAcc(input.fromAccountId, "Lender");
          const recAcc = await loadAcc(input.toAccountId, "Receiving");
          if (lenderAcc.id === recAcc.id) {
            throw new Error("Lender and receiving account cannot be the same.");
          }
          const bucket = resolveLocalBucket(recAcc, input.toBalanceType);
          const updated = adjustLocalAccountBalance(
            recAcc,
            bucket,
            1,
            amountStr,
          );
          await db.accounts.put(updated);
          fromAccountId = lenderAcc.id;
          toAccountId = recAcc.id;
          toBalanceType = bucket;
          break;
        }
        case "LOAN_GIVEN": {
          const disbAcc = await loadAcc(input.fromAccountId, "Disbursing");
          const borAcc = await loadAcc(input.toAccountId, "Borrower");
          if (disbAcc.id === borAcc.id) {
            throw new Error(
              "Disbursing and borrower account cannot be the same.",
            );
          }
          const bucket = resolveLocalBucket(disbAcc, input.fromBalanceType);
          const updated = adjustLocalAccountBalance(
            disbAcc,
            bucket,
            -1,
            amountStr,
          );
          await db.accounts.put(updated);
          fromAccountId = disbAcc.id;
          toAccountId = borAcc.id;
          fromBalanceType = bucket;
          break;
        }
        case "LOAN_REPAYMENT": {
          if (!input.loanId) throw new Error("Loan reference is required.");
          const loan = await db.loans.get(input.loanId);
          if (!loan || loan.userId !== userId || loan.isDeleted) {
            throw new Error("Loan not found.");
          }
          if (compareMoney(amountStr, loan.outstandingAmount) > 0) {
            throw new Error(
              `Repayment (${amountStr}) cannot exceed outstanding loan balance (${loan.outstandingAmount}).`,
            );
          }
          if (loan.loanType === "RECEIVED") {
            const payAcc = await loadAcc(input.fromAccountId, "Paying");
            const bucket = resolveLocalBucket(payAcc, input.fromBalanceType);
            const updated = adjustLocalAccountBalance(
              payAcc,
              bucket,
              -1,
              amountStr,
            );
            await db.accounts.put(updated);
            fromAccountId = payAcc.id;
            fromBalanceType = bucket;
            toAccountId = loan.counterpartyAccountId;
          } else {
            const recAcc = await loadAcc(input.toAccountId, "Receiving");
            const bucket = resolveLocalBucket(recAcc, input.toBalanceType);
            const updated = adjustLocalAccountBalance(
              recAcc,
              bucket,
              1,
              amountStr,
            );
            await db.accounts.put(updated);
            fromAccountId = loan.counterpartyAccountId;
            toAccountId = recAcc.id;
            toBalanceType = bucket;
          }
          loanId = loan.id;
          const nextRepaid = addMoney(loan.totalRepaid, amountStr);
          const nextOutstanding = subMoney(loan.originalAmount, nextRepaid);
          const nextStatus: LoanStatus =
            compareMoney(nextOutstanding, "0.00") === 0
              ? "FULLY_REPAID"
              : "PARTIALLY_REPAID";
          createdOrUpdatedLoan = {
            ...loan,
            totalRepaid: nextRepaid,
            outstandingAmount: nextOutstanding,
            latestRepaymentDate: txDate,
            status: nextStatus,
            transactionIds: [...loan.transactionIds, clientTransactionId],
            version: loan.version + 1,
            updatedAt: now,
            syncStatus: "PENDING",
          };
          await db.loans.put(createdOrUpdatedLoan);
          break;
        }
        case "BALANCE_ADJUSTMENT": {
          const dir = input.adjustmentDirection;
          if (dir !== "INCREASE" && dir !== "DECREASE") {
            throw new Error("Adjustment direction is required.");
          }
          adjustmentDirection = dir;
          if (dir === "INCREASE") {
            const toAcc = await loadAcc(input.toAccountId, "Target");
            const bucket = resolveLocalBucket(toAcc, input.toBalanceType);
            await db.accounts.put(
              adjustLocalAccountBalance(toAcc, bucket, 1, amountStr),
            );
            toAccountId = toAcc.id;
            toBalanceType = bucket;
          } else {
            const fromAcc = await loadAcc(input.fromAccountId, "Target");
            const bucket = resolveLocalBucket(fromAcc, input.fromBalanceType);
            await db.accounts.put(
              adjustLocalAccountBalance(fromAcc, bucket, -1, amountStr),
            );
            fromAccountId = fromAcc.id;
            fromBalanceType = bucket;
          }
          break;
        }
      }

      if (input.type === "LOAN_RECEIVED" || input.type === "LOAN_GIVEN") {
        clientLoanId = generateId();
        loanId = clientLoanId;
        const isReceived = input.type === "LOAN_RECEIVED";
        createdOrUpdatedLoan = {
          id: clientLoanId,
          userId,
          clientLoanId,
          loanType: isReceived ? "RECEIVED" : "GIVEN",
          counterpartyAccountId: isReceived ? fromAccountId! : toAccountId!,
          originalAmount: amountStr,
          totalRepaid: "0.00",
          outstandingAmount: amountStr,
          receivingOrDisbursingAccountId: isReceived
            ? toAccountId!
            : fromAccountId!,
          originTransactionId: clientTransactionId,
          transactionIds: [clientTransactionId],
          loanDate: txDate,
          latestRepaymentDate: null,
          status: "OUTSTANDING",
          isDeleted: false,
          version: 0,
          createdAt: now,
          updatedAt: now,
          syncStatus: "PENDING",
        };
        await db.loans.put(createdOrUpdatedLoan);
      }

      const tx: TransactionDTO = {
        id: clientTransactionId,
        clientTransactionId,
        userId,
        type: input.type,
        amount: amountStr,
        fromAccountId,
        toAccountId,
        fromBalanceType,
        toBalanceType,
        expenseCategoryId,
        loanId,
        adjustmentDirection,
        description: input.description ?? "",
        note: input.note ?? "",
        attachmentName: input.attachmentName,
        attachmentDataUrl: input.attachmentDataUrl,
        transactionDate: txDate,
        isDeleted: false,
        syncStatus: "PENDING",
        createdAt: now,
        updatedAt: now,
      };

      const op: PendingOperation = {
        opId: generateId(),
        userId,
        opType: "CREATE_TRANSACTION",
        clientEntityId: clientTransactionId,
        payload: {
          clientTransactionId,
          clientLoanId,
          type: tx.type,
          amount: tx.amount,
          fromAccountId: tx.fromAccountId,
          toAccountId: tx.toAccountId,
          fromBalanceType: tx.fromBalanceType,
          toBalanceType: tx.toBalanceType,
          expenseCategoryId: tx.expenseCategoryId,
          loanId: tx.loanId,
          adjustmentDirection: tx.adjustmentDirection,
          description: tx.description,
          note: tx.note,
          attachmentName: tx.attachmentName,
          attachmentDataUrl: tx.attachmentDataUrl,
          transactionDate: tx.transactionDate,
        },
        createdAt: now,
        status: "PENDING",
        retryCount: 0,
      };

      await db.transactions.put(tx);
      await db.pendingOps.put(op);

      return { transaction: tx, loan: createdOrUpdatedLoan };
    },
  );
}

/**
 * Recomputes all local IndexedDB account balances and loan summaries
 * deterministically from opening balances + active local transactions.
 */
export async function recalculateLocalLedger(userId: string): Promise<void> {
  const db = getOfflineDB();
  await db.transaction(
    "rw",
    [db.accounts, db.loans, db.transactions],
    async () => {
      const [accounts, loans, txs] = await Promise.all([
        db.accounts.where("userId").equals(userId).toArray(),
        db.loans.where("userId").equals(userId).toArray(),
        db.transactions.where("userId").equals(userId).toArray(),
      ]);

      const accMap = new Map(
        accounts.map((a) => [
          a.id,
          {
            ...a,
            currentMainBalance: a.initialMainBalance,
            currentInterestBalance: a.initialInterestBalance,
          },
        ]),
      );

      const activeLoans = loans.filter((l) => !l.isDeleted);
      const loanMap = new Map(
        activeLoans.map((l) => [
          l.id,
          {
            ...l,
            totalRepaid: "0.00",
            outstandingAmount: l.originalAmount,
            latestRepaymentDate: null as string | null,
            transactionIds: [l.originTransactionId],
          },
        ]),
      );

      const activeTxs = txs
        .filter((t) => !t.isDeleted)
        .sort(
          (a, b) =>
            new Date(a.transactionDate).getTime() -
              new Date(b.transactionDate).getTime() ||
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );

      const applyDelta = (
        id: string | null,
        bucket: BalanceType | null,
        sign: 1 | -1,
        amt: string,
      ) => {
        if (!id) return;
        const a = accMap.get(id);
        if (!a) return;
        if (bucket === "INTEREST") {
          a.currentInterestBalance =
            sign === 1
              ? addMoney(a.currentInterestBalance, amt)
              : subMoney(a.currentInterestBalance, amt);
        } else {
          a.currentMainBalance =
            sign === 1
              ? addMoney(a.currentMainBalance, amt)
              : subMoney(a.currentMainBalance, amt);
        }
      };

      for (const tx of activeTxs) {
        if (
          (tx.type === "LOAN_RECEIVED" || tx.type === "LOAN_GIVEN") &&
          tx.loanId
        ) {
          const l = loanMap.get(tx.loanId);
          if (l) {
            l.originalAmount = tx.amount;
            l.loanDate = tx.transactionDate;
            l.transactionIds = [tx.id];
          }
        }
      }

      for (const tx of activeTxs) {
        switch (tx.type) {
          case "ADD_BALANCE":
          case "INCOME":
          case "BANK_INTEREST":
          case "LOAN_RECEIVED":
            applyDelta(tx.toAccountId, tx.toBalanceType, 1, tx.amount);
            break;
          case "EXPENSE":
          case "LOAN_GIVEN":
            applyDelta(tx.fromAccountId, tx.fromBalanceType, -1, tx.amount);
            break;
          case "ACCOUNT_TRANSFER":
            applyDelta(tx.fromAccountId, tx.fromBalanceType, -1, tx.amount);
            applyDelta(tx.toAccountId, tx.toBalanceType, 1, tx.amount);
            break;
          case "BALANCE_ADJUSTMENT":
            if (tx.adjustmentDirection === "INCREASE") {
              applyDelta(tx.toAccountId, tx.toBalanceType, 1, tx.amount);
            } else {
              applyDelta(tx.fromAccountId, tx.fromBalanceType, -1, tx.amount);
            }
            break;
          case "LOAN_REPAYMENT":
            if (tx.loanId) {
              const l = loanMap.get(tx.loanId);
              if (l) {
                l.totalRepaid = addMoney(l.totalRepaid, tx.amount);
                l.transactionIds.push(tx.id);
                if (
                  !l.latestRepaymentDate ||
                  tx.transactionDate > l.latestRepaymentDate
                ) {
                  l.latestRepaymentDate = tx.transactionDate;
                }
                if (l.loanType === "RECEIVED") {
                  applyDelta(
                    tx.fromAccountId,
                    tx.fromBalanceType,
                    -1,
                    tx.amount,
                  );
                } else {
                  applyDelta(tx.toAccountId, tx.toBalanceType, 1, tx.amount);
                }
              }
            }
            break;
        }
      }

      for (const acc of accMap.values()) {
        if (
          !isNonNegativeMoney(acc.currentMainBalance) ||
          !isNonNegativeMoney(acc.currentInterestBalance)
        ) {
          throw new Error(
            `Change would make "${acc.name}" balance negative.`,
          );
        }
      }

      for (const l of loanMap.values()) {
        if (compareMoney(l.totalRepaid, l.originalAmount) > 0) {
          throw new Error("Repayments cannot exceed loan principal.");
        }
        const outstanding = subMoney(l.originalAmount, l.totalRepaid);
        l.outstandingAmount = outstanding;
        l.status =
          compareMoney(outstanding, "0.00") === 0
            ? "FULLY_REPAID"
            : compareMoney(l.totalRepaid, "0.00") > 0
              ? "PARTIALLY_REPAID"
              : "OUTSTANDING";
      }

      await db.accounts.bulkPut(
        Array.from(accMap.values()).map((a) => ({
          ...a,
          totalBalance: a.interestEnabled
            ? addMoney(a.currentMainBalance, a.currentInterestBalance)
            : a.currentMainBalance,
        })),
      );
      await db.loans.bulkPut(Array.from(loanMap.values()));
    },
  );
}
