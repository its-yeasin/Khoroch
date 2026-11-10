import crypto from "node:crypto";
import mongoose, { type ClientSession } from "mongoose";
import type {
  AdjustmentDirection,
  BalanceType,
  LoanStatus,
  TransactionType,
} from "@/lib/constants";
import { AccountModel, type IAccount } from "@/lib/db/models/Account";
import { ExpenseCategoryModel } from "@/lib/db/models/ExpenseCategory";
import { LoanModel, type ILoan } from "@/lib/db/models/Loan";
import {
  TransactionModel,
  type ITransaction,
} from "@/lib/db/models/Transaction";
import { withDatabaseTransaction } from "@/lib/db/transaction";
import { AppError, isMongoDuplicateKeyError } from "@/lib/errors";
import {
  addMoney,
  compareMoney,
  isNonNegativeMoney,
  isPositiveMoney,
  subMoney,
  toMoneyString,
} from "@/lib/money";
import type { LoanDTO, TransactionDTO } from "@/lib/types";
import {
  serializeLoan,
  serializeTransaction,
} from "@/lib/services/serializers";

export interface CreateTransactionInput {
  clientTransactionId?: string;
  clientLoanId?: string;
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
  transactionDate?: string | Date;
}

export interface UpdateTransactionInput {
  type?: TransactionType;
  amount?: string;
  fromAccountId?: string | null;
  toAccountId?: string | null;
  fromBalanceType?: BalanceType | null;
  toBalanceType?: BalanceType | null;
  expenseCategoryId?: string | null;
  loanId?: string | null;
  adjustmentDirection?: AdjustmentDirection | null;
  description?: string;
  note?: string;
  transactionDate?: string | Date;
}

function toObjectId(id: string, fieldName: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(400, "INVALID_ID", `Invalid ${fieldName}.`);
  }
  return new mongoose.Types.ObjectId(id);
}

function resolveBalanceType(
  account: IAccount,
  requested: BalanceType | null | undefined,
  forceInterest = false,
): BalanceType {
  if (forceInterest) {
    if (account.category !== "BANK" || !account.interestEnabled) {
      throw new AppError(
        400,
        "INTEREST_NOT_ENABLED",
        `Account "${account.name}" does not have bank interest enabled.`,
      );
    }
    return "INTEREST";
  }

  if (requested === "INTEREST") {
    if (account.category !== "BANK" || !account.interestEnabled) {
      throw new AppError(
        400,
        "INTEREST_NOT_ENABLED",
        `Interest balance cannot be used for "${account.name}" because interest is not enabled.`,
      );
    }
    return "INTEREST";
  }

  return "MAIN";
}

function getBucketBalance(account: IAccount, bucket: BalanceType): string {
  return bucket === "INTEREST"
    ? toMoneyString(account.currentInterestBalance)
    : toMoneyString(account.currentMainBalance);
}

function bucketFieldName(
  bucket: BalanceType,
): "currentMainBalance" | "currentInterestBalance" {
  return bucket === "INTEREST"
    ? "currentInterestBalance"
    : "currentMainBalance";
}

async function applyAccountDelta(
  account: IAccount,
  bucket: BalanceType,
  deltaSign: 1 | -1,
  amountStr: string,
  session: ClientSession | null,
  rollbackStack: Array<() => Promise<void>>,
): Promise<IAccount> {
  const currentStr = getBucketBalance(account, bucket);
  const nextStr =
    deltaSign === 1
      ? addMoney(currentStr, amountStr)
      : subMoney(currentStr, amountStr);

  if (deltaSign === -1 && compareMoney(nextStr, "0.00") < 0) {
    throw new AppError(
      400,
      "INSUFFICIENT_BALANCE",
      `Insufficient ${bucket === "INTEREST" ? "interest" : "main"} balance in "${account.name}". Available: ${currentStr}, Required: ${amountStr}.`,
    );
  }

  const field = bucketFieldName(bucket);
  const updated = await AccountModel.findOneAndUpdate(
    {
      _id: account._id,
      userId: account.userId,
      version: account.version,
    },
    {
      $set: {
        [field]: mongoose.Types.Decimal128.fromString(nextStr),
      },
      $inc: { version: 1 },
    },
    { returnDocument: "after", session: session ?? undefined },
  );

  if (!updated) {
    throw new AppError(
      409,
      "CONCURRENT_MODIFICATION",
      `Account "${account.name}" was updated concurrently. Please retry.`,
    );
  }

  if (!session) {
    rollbackStack.push(async () => {
      await AccountModel.updateOne(
        { _id: account._id, userId: account.userId },
        {
          $set: {
            [field]: mongoose.Types.Decimal128.fromString(currentStr),
          },
          $inc: { version: 1 },
        },
      );
    });
  }

  return updated;
}

export async function createTransaction(
  userId: string,
  input: CreateTransactionInput,
): Promise<{
  transaction: TransactionDTO;
  loan: LoanDTO | null;
  duplicate: boolean;
}> {
  const userObjectId = toObjectId(userId, "userId");
  const clientTransactionId =
    input.clientTransactionId?.trim() || crypto.randomUUID();
  const amountStr = toMoneyString(input.amount);

  if (!isPositiveMoney(amountStr)) {
    throw new AppError(
      400,
      "INVALID_AMOUNT",
      "Transaction amount must be greater than zero.",
    );
  }

  const txDate = input.transactionDate
    ? new Date(input.transactionDate)
    : new Date();
  if (Number.isNaN(txDate.getTime())) {
    throw new AppError(400, "INVALID_DATE", "Invalid transaction date.");
  }

  try {
    return await withDatabaseTransaction(async (session) => {
      const opt = session ? { session } : {};
      const rollbackStack: Array<() => Promise<void>> = [];

      // Idempotency check
      const existing = await TransactionModel.findOne(
        { userId: userObjectId, clientTransactionId },
        null,
        opt,
      );
      if (existing) {
        let existingLoan: ILoan | null = null;
        if (existing.loanId) {
          existingLoan = await LoanModel.findById(existing.loanId, null, opt);
        }
        return {
          transaction: serializeTransaction(existing),
          loan: existingLoan ? serializeLoan(existingLoan) : null,
          duplicate: true,
        };
      }

      const loadAccount = async (
        id: string | null | undefined,
        roleLabel: string,
      ): Promise<IAccount> => {
        if (!id) {
          throw new AppError(
            400,
            "ACCOUNT_REQUIRED",
            `${roleLabel} account is required.`,
          );
        }
        const objId = toObjectId(id, roleLabel);
        const acc = await AccountModel.findOne(
          { _id: objId, userId: userObjectId },
          null,
          opt,
        );
        if (!acc) {
          throw new AppError(
            404,
            "ACCOUNT_NOT_FOUND",
            `${roleLabel} account was not found.`,
          );
        }
        if (acc.isArchived) {
          throw new AppError(
            400,
            "ACCOUNT_ARCHIVED",
            `${roleLabel} account "${acc.name}" is archived.`,
          );
        }
        return acc;
      };

      try {
        let fromAccountId: mongoose.Types.ObjectId | null = null;
        let toAccountId: mongoose.Types.ObjectId | null = null;
        let fromBalanceType: BalanceType | null = null;
        let toBalanceType: BalanceType | null = null;
        let expenseCategoryId: mongoose.Types.ObjectId | null = null;
        let loanId: mongoose.Types.ObjectId | null = null;
        let adjustmentDirection: AdjustmentDirection | null = null;
        let createdOrUpdatedLoan: ILoan | null = null;

        switch (input.type) {
          case "ADD_BALANCE":
          case "INCOME": {
            const toAcc = await loadAccount(input.toAccountId, "Destination");
            const bucket = resolveBalanceType(toAcc, input.toBalanceType);
            await applyAccountDelta(
              toAcc,
              bucket,
              1,
              amountStr,
              session,
              rollbackStack,
            );
            toAccountId = toAcc._id;
            toBalanceType = bucket;
            break;
          }

          case "BANK_INTEREST": {
            const toAcc = await loadAccount(input.toAccountId, "Bank");
            const bucket = resolveBalanceType(toAcc, "INTEREST", true);
            await applyAccountDelta(
              toAcc,
              bucket,
              1,
              amountStr,
              session,
              rollbackStack,
            );
            toAccountId = toAcc._id;
            toBalanceType = bucket;
            break;
          }

          case "EXPENSE": {
            const fromAcc = await loadAccount(input.fromAccountId, "Source");
            if (!input.expenseCategoryId) {
              throw new AppError(
                400,
                "CATEGORY_REQUIRED",
                "Expense category is required.",
              );
            }
            const catObjId = toObjectId(
              input.expenseCategoryId,
              "expenseCategoryId",
            );
            const category = await ExpenseCategoryModel.findOne(
              { _id: catObjId, userId: userObjectId },
              null,
              opt,
            );
            if (!category) {
              throw new AppError(
                404,
                "CATEGORY_NOT_FOUND",
                "Expense category not found.",
              );
            }
            const bucket = resolveBalanceType(fromAcc, input.fromBalanceType);
            await applyAccountDelta(
              fromAcc,
              bucket,
              -1,
              amountStr,
              session,
              rollbackStack,
            );
            fromAccountId = fromAcc._id;
            fromBalanceType = bucket;
            expenseCategoryId = category._id;
            break;
          }

          case "ACCOUNT_TRANSFER": {
            const fromAcc = await loadAccount(input.fromAccountId, "Source");
            const toAcc = await loadAccount(input.toAccountId, "Destination");
            const fromBucket = resolveBalanceType(
              fromAcc,
              input.fromBalanceType,
            );
            const toBucket = resolveBalanceType(toAcc, input.toBalanceType);

            if (
              fromAcc._id.equals(toAcc._id) &&
              fromBucket === toBucket
            ) {
              throw new AppError(
                400,
                "SAME_ACCOUNT_TRANSFER",
                "Source and destination account balance buckets must be different.",
              );
            }

            const updatedFrom = await applyAccountDelta(
              fromAcc,
              fromBucket,
              -1,
              amountStr,
              session,
              rollbackStack,
            );
            // Reload if same account different bucket
            const effectiveTo = toAcc._id.equals(updatedFrom._id)
              ? updatedFrom
              : toAcc;
            await applyAccountDelta(
              effectiveTo,
              toBucket,
              1,
              amountStr,
              session,
              rollbackStack,
            );

            fromAccountId = fromAcc._id;
            toAccountId = toAcc._id;
            fromBalanceType = fromBucket;
            toBalanceType = toBucket;
            break;
          }

          case "LOAN_RECEIVED": {
            const lenderAcc = await loadAccount(input.fromAccountId, "Lender");
            const receivingAcc = await loadAccount(
              input.toAccountId,
              "Receiving",
            );
            if (lenderAcc._id.equals(receivingAcc._id)) {
              throw new AppError(
                400,
                "INVALID_LOAN_ACCOUNTS",
                "Lender and receiving account cannot be the same.",
              );
            }
            const bucket = resolveBalanceType(
              receivingAcc,
              input.toBalanceType,
            );
            await applyAccountDelta(
              receivingAcc,
              bucket,
              1,
              amountStr,
              session,
              rollbackStack,
            );
            fromAccountId = lenderAcc._id;
            toAccountId = receivingAcc._id;
            toBalanceType = bucket;
            break;
          }

          case "LOAN_GIVEN": {
            const disbursingAcc = await loadAccount(
              input.fromAccountId,
              "Disbursing",
            );
            const borrowerAcc = await loadAccount(
              input.toAccountId,
              "Borrower",
            );
            if (disbursingAcc._id.equals(borrowerAcc._id)) {
              throw new AppError(
                400,
                "INVALID_LOAN_ACCOUNTS",
                "Disbursing and borrower account cannot be the same.",
              );
            }
            const bucket = resolveBalanceType(
              disbursingAcc,
              input.fromBalanceType,
            );
            await applyAccountDelta(
              disbursingAcc,
              bucket,
              -1,
              amountStr,
              session,
              rollbackStack,
            );
            fromAccountId = disbursingAcc._id;
            toAccountId = borrowerAcc._id;
            fromBalanceType = bucket;
            break;
          }

          case "LOAN_REPAYMENT": {
            if (!input.loanId) {
              throw new AppError(
                400,
                "LOAN_REQUIRED",
                "Loan reference is required for repayment.",
              );
            }
            const loanObjId = toObjectId(input.loanId, "loanId");
            const loan = await LoanModel.findOne(
              { _id: loanObjId, userId: userObjectId, isDeleted: false },
              null,
              opt,
            );
            if (!loan) {
              throw new AppError(404, "LOAN_NOT_FOUND", "Loan not found.");
            }
            const outstandingStr = toMoneyString(loan.outstandingAmount);
            if (compareMoney(amountStr, outstandingStr) > 0) {
              throw new AppError(
                400,
                "LOAN_OVERPAYMENT",
                `Repayment amount (${amountStr}) cannot exceed outstanding loan balance (${outstandingStr}).`,
              );
            }

            if (loan.loanType === "RECEIVED") {
              const payingAcc = await loadAccount(
                input.fromAccountId,
                "Paying",
              );
              const bucket = resolveBalanceType(
                payingAcc,
                input.fromBalanceType,
              );
              await applyAccountDelta(
                payingAcc,
                bucket,
                -1,
                amountStr,
                session,
                rollbackStack,
              );
              fromAccountId = payingAcc._id;
              fromBalanceType = bucket;
              toAccountId = loan.counterpartyAccountId;
            } else {
              const receivingAcc = await loadAccount(
                input.toAccountId,
                "Receiving",
              );
              const bucket = resolveBalanceType(
                receivingAcc,
                input.toBalanceType,
              );
              await applyAccountDelta(
                receivingAcc,
                bucket,
                1,
                amountStr,
                session,
                rollbackStack,
              );
              fromAccountId = loan.counterpartyAccountId;
              toAccountId = receivingAcc._id;
              toBalanceType = bucket;
            }

            loanId = loan._id;
            createdOrUpdatedLoan = loan;
            break;
          }

          case "BALANCE_ADJUSTMENT": {
            const direction = input.adjustmentDirection;
            if (direction !== "INCREASE" && direction !== "DECREASE") {
              throw new AppError(
                400,
                "INVALID_ADJUSTMENT_DIRECTION",
                "Balance adjustment requires direction INCREASE or DECREASE.",
              );
            }
            adjustmentDirection = direction;
            if (direction === "INCREASE") {
              const toAcc = await loadAccount(input.toAccountId, "Target");
              const bucket = resolveBalanceType(toAcc, input.toBalanceType);
              await applyAccountDelta(
                toAcc,
                bucket,
                1,
                amountStr,
                session,
                rollbackStack,
              );
              toAccountId = toAcc._id;
              toBalanceType = bucket;
            } else {
              const fromAcc = await loadAccount(input.fromAccountId, "Target");
              const bucket = resolveBalanceType(fromAcc, input.fromBalanceType);
              await applyAccountDelta(
                fromAcc,
                bucket,
                -1,
                amountStr,
                session,
                rollbackStack,
              );
              fromAccountId = fromAcc._id;
              fromBalanceType = bucket;
            }
            break;
          }
        }

        const txId = new mongoose.Types.ObjectId();

        if (input.type === "LOAN_RECEIVED" || input.type === "LOAN_GIVEN") {
          const isReceived = input.type === "LOAN_RECEIVED";
          const counterpartyAccountId = isReceived
            ? fromAccountId!
            : toAccountId!;
          const receivingOrDisbursingAccountId = isReceived
            ? toAccountId!
            : fromAccountId!;

          const [createdLoan] = await LoanModel.create(
            [
              {
                userId: userObjectId,
                clientLoanId: input.clientLoanId || undefined,
                loanType: isReceived ? "RECEIVED" : "GIVEN",
                counterpartyAccountId,
                originalAmount:
                  mongoose.Types.Decimal128.fromString(amountStr),
                totalRepaid: mongoose.Types.Decimal128.fromString("0.00"),
                outstandingAmount:
                  mongoose.Types.Decimal128.fromString(amountStr),
                receivingOrDisbursingAccountId,
                originTransactionId: txId,
                transactionIds: [txId],
                loanDate: txDate,
                latestRepaymentDate: null,
                status: "OUTSTANDING",
                isDeleted: false,
                version: 0,
              },
            ],
            opt,
          );
          loanId = createdLoan._id;
          createdOrUpdatedLoan = createdLoan;

          if (!session) {
            rollbackStack.push(async () => {
              await LoanModel.deleteOne({ _id: createdLoan._id });
            });
          }
        } else if (input.type === "LOAN_REPAYMENT" && createdOrUpdatedLoan) {
          const loan = createdOrUpdatedLoan;
          const prevTotalRepaid = toMoneyString(loan.totalRepaid);
          const prevOutstanding = toMoneyString(loan.outstandingAmount);
          const prevStatus = loan.status;
          const prevLatestRepayment = loan.latestRepaymentDate;

          const newTotalRepaid = addMoney(prevTotalRepaid, amountStr);
          const newOutstanding = subMoney(
            toMoneyString(loan.originalAmount),
            newTotalRepaid,
          );
          const newStatus: LoanStatus =
            compareMoney(newOutstanding, "0.00") === 0
              ? "FULLY_REPAID"
              : "PARTIALLY_REPAID";

          const updatedLoan = await LoanModel.findOneAndUpdate(
            {
              _id: loan._id,
              userId: userObjectId,
              version: loan.version,
              isDeleted: false,
            },
            {
              $set: {
                totalRepaid:
                  mongoose.Types.Decimal128.fromString(newTotalRepaid),
                outstandingAmount:
                  mongoose.Types.Decimal128.fromString(newOutstanding),
                status: newStatus,
                latestRepaymentDate: txDate,
              },
              $push: { transactionIds: txId },
              $inc: { version: 1 },
            },
            { returnDocument: "after", session: session ?? undefined },
          );

          if (!updatedLoan) {
            throw new AppError(
              409,
              "CONCURRENT_MODIFICATION",
              "Loan was updated concurrently. Please retry.",
            );
          }

          createdOrUpdatedLoan = updatedLoan;

          if (!session) {
            rollbackStack.push(async () => {
              await LoanModel.updateOne(
                { _id: loan._id, userId: userObjectId },
                {
                  $set: {
                    totalRepaid:
                      mongoose.Types.Decimal128.fromString(prevTotalRepaid),
                    outstandingAmount:
                      mongoose.Types.Decimal128.fromString(prevOutstanding),
                    status: prevStatus,
                    latestRepaymentDate: prevLatestRepayment,
                  },
                  $pull: { transactionIds: txId },
                  $inc: { version: 1 },
                },
              );
            });
          }
        }

        const [createdTx] = await TransactionModel.create(
          [
            {
              _id: txId,
              clientTransactionId,
              userId: userObjectId,
              type: input.type,
              amount: mongoose.Types.Decimal128.fromString(amountStr),
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
            },
          ],
          opt,
        );

        return {
          transaction: serializeTransaction(createdTx),
          loan: createdOrUpdatedLoan
            ? serializeLoan(createdOrUpdatedLoan)
            : null,
          duplicate: false,
        };
      } catch (err) {
        if (!session && rollbackStack.length > 0) {
          for (let i = rollbackStack.length - 1; i >= 0; i--) {
            await rollbackStack[i]().catch(() => undefined);
          }
        }
        throw err;
      }
    });
  } catch (err) {
    if (isMongoDuplicateKeyError(err)) {
      // Concurrent duplicate idempotency race: safely return existing record
      const existing = await TransactionModel.findOne({
        userId: userObjectId,
        clientTransactionId,
      });
      if (existing) {
        const existingLoan = existing.loanId
          ? await LoanModel.findById(existing.loanId)
          : null;
        return {
          transaction: serializeTransaction(existing),
          loan: existingLoan ? serializeLoan(existingLoan) : null,
          duplicate: true,
        };
      }
    }
    throw err;
  }
}

/**
 * Deterministically recomputes all account balances and loan summaries from
 * opening balances and active (non-deleted) ledger transactions, enforcing all
 * non-negative balance and loan bounds inside the transaction boundary.
 */
export async function recalculateAndVerifyUserLedger(
  userObjectId: mongoose.Types.ObjectId,
  session: ClientSession | null,
): Promise<void> {
  const opt = session ? { session } : {};

  const [accounts, loans, activeTransactions] = await Promise.all([
    AccountModel.find({ userId: userObjectId }, null, opt),
    LoanModel.find({ userId: userObjectId, isDeleted: false }, null, opt),
    TransactionModel.find(
      { userId: userObjectId, isDeleted: false },
      null,
      opt,
    ).sort({ transactionDate: 1, createdAt: 1, _id: 1 }),
  ]);

  const accountBalances = new Map<
    string,
    { account: IAccount; main: string; interest: string }
  >();
  for (const acc of accounts) {
    accountBalances.set(acc._id.toString(), {
      account: acc,
      main: toMoneyString(acc.initialMainBalance),
      interest: toMoneyString(acc.initialInterestBalance),
    });
  }

  const loanStateMap = new Map<
    string,
    {
      loan: ILoan;
      originalAmount: string;
      totalRepaid: string;
      latestRepaymentDate: Date | null;
      transactionIds: mongoose.Types.ObjectId[];
      counterpartyAccountId: mongoose.Types.ObjectId;
      receivingOrDisbursingAccountId: mongoose.Types.ObjectId;
      loanDate: Date;
    }
  >();

  for (const loan of loans) {
    loanStateMap.set(loan._id.toString(), {
      loan,
      originalAmount: toMoneyString(loan.originalAmount),
      totalRepaid: "0.00",
      latestRepaymentDate: null,
      transactionIds: [loan.originTransactionId],
      counterpartyAccountId: loan.counterpartyAccountId,
      receivingOrDisbursingAccountId: loan.receivingOrDisbursingAccountId,
      loanDate: loan.loanDate,
    });
  }

  const creditBucket = (
    accId: mongoose.Types.ObjectId | null,
    bucket: BalanceType | null,
    amt: string,
  ) => {
    if (!accId) return;
    const entry = accountBalances.get(accId.toString());
    if (!entry) {
      throw new AppError(400, "MISSING_ACCOUNT", "Referenced account missing.");
    }
    if (bucket === "INTEREST") {
      entry.interest = addMoney(entry.interest, amt);
    } else {
      entry.main = addMoney(entry.main, amt);
    }
  };

  const debitBucket = (
    accId: mongoose.Types.ObjectId | null,
    bucket: BalanceType | null,
    amt: string,
  ) => {
    if (!accId) return;
    const entry = accountBalances.get(accId.toString());
    if (!entry) {
      throw new AppError(400, "MISSING_ACCOUNT", "Referenced account missing.");
    }
    if (bucket === "INTEREST") {
      entry.interest = subMoney(entry.interest, amt);
    } else {
      entry.main = subMoney(entry.main, amt);
    }
  };

  // First pass: synchronize loan origin transactions
  for (const tx of activeTransactions) {
    const amt = toMoneyString(tx.amount);
    if (tx.type === "LOAN_RECEIVED" || tx.type === "LOAN_GIVEN") {
      if (tx.loanId) {
        const lEntry = loanStateMap.get(tx.loanId.toString());
        if (lEntry) {
          lEntry.originalAmount = amt;
          lEntry.loanDate = tx.transactionDate;
          lEntry.counterpartyAccountId =
            tx.type === "LOAN_RECEIVED"
              ? tx.fromAccountId!
              : tx.toAccountId!;
          lEntry.receivingOrDisbursingAccountId =
            tx.type === "LOAN_RECEIVED"
              ? tx.toAccountId!
              : tx.fromAccountId!;
          lEntry.transactionIds = [tx._id];
        }
      }
    }
  }

  // Second pass: apply all balance impacts and repayments
  for (const tx of activeTransactions) {
    const amt = toMoneyString(tx.amount);
    switch (tx.type) {
      case "ADD_BALANCE":
      case "INCOME":
      case "BANK_INTEREST":
      case "LOAN_RECEIVED":
        creditBucket(tx.toAccountId, tx.toBalanceType, amt);
        break;

      case "EXPENSE":
      case "LOAN_GIVEN":
        debitBucket(tx.fromAccountId, tx.fromBalanceType, amt);
        break;

      case "ACCOUNT_TRANSFER":
        debitBucket(tx.fromAccountId, tx.fromBalanceType, amt);
        creditBucket(tx.toAccountId, tx.toBalanceType, amt);
        break;

      case "BALANCE_ADJUSTMENT":
        if (tx.adjustmentDirection === "INCREASE") {
          creditBucket(tx.toAccountId, tx.toBalanceType, amt);
        } else {
          debitBucket(tx.fromAccountId, tx.fromBalanceType, amt);
        }
        break;

      case "LOAN_REPAYMENT": {
        if (!tx.loanId) {
          throw new AppError(
            400,
            "LOAN_REQUIRED",
            "Repayment transaction is missing a linked loan.",
          );
        }
        const lEntry = loanStateMap.get(tx.loanId.toString());
        if (!lEntry) {
          throw new AppError(
            400,
            "LOAN_NOT_FOUND",
            "Repayment references a missing or deleted loan.",
          );
        }
        lEntry.totalRepaid = addMoney(lEntry.totalRepaid, amt);
        lEntry.transactionIds.push(tx._id);
        if (
          !lEntry.latestRepaymentDate ||
          tx.transactionDate > lEntry.latestRepaymentDate
        ) {
          lEntry.latestRepaymentDate = tx.transactionDate;
        }
        if (lEntry.loan.loanType === "RECEIVED") {
          tx.toAccountId = lEntry.counterpartyAccountId;
          debitBucket(tx.fromAccountId, tx.fromBalanceType, amt);
        } else {
          tx.fromAccountId = lEntry.counterpartyAccountId;
          creditBucket(tx.toAccountId, tx.toBalanceType, amt);
        }
        break;
      }
    }
  }

  // Verify invariants across all accounts
  for (const entry of accountBalances.values()) {
    if (!isNonNegativeMoney(entry.main)) {
      throw new AppError(
        400,
        "NEGATIVE_BALANCE_VIOLATION",
        `This change would cause "${entry.account.name}" main balance to become negative (${entry.main}).`,
      );
    }
    if (!isNonNegativeMoney(entry.interest)) {
      throw new AppError(
        400,
        "NEGATIVE_BALANCE_VIOLATION",
        `This change would cause "${entry.account.name}" interest balance to become negative (${entry.interest}).`,
      );
    }
  }

  // Verify invariants across all loans
  for (const lEntry of loanStateMap.values()) {
    if (compareMoney(lEntry.totalRepaid, lEntry.originalAmount) > 0) {
      throw new AppError(
        400,
        "LOAN_OVERPAYMENT",
        `Total repayments (${lEntry.totalRepaid}) cannot exceed the loan principal (${lEntry.originalAmount}).`,
      );
    }
  }

  // Persist recalculated balances & loans
  for (const entry of accountBalances.values()) {
    const prevMain = toMoneyString(entry.account.currentMainBalance);
    const prevInt = toMoneyString(entry.account.currentInterestBalance);
    if (prevMain !== entry.main || prevInt !== entry.interest) {
      await AccountModel.updateOne(
        { _id: entry.account._id, userId: userObjectId },
        {
          $set: {
            currentMainBalance:
              mongoose.Types.Decimal128.fromString(entry.main),
            currentInterestBalance:
              mongoose.Types.Decimal128.fromString(entry.interest),
          },
          $inc: { version: 1 },
        },
        opt,
      );
    }
  }

  for (const lEntry of loanStateMap.values()) {
    const outstanding = subMoney(lEntry.originalAmount, lEntry.totalRepaid);
    const status: LoanStatus =
      compareMoney(outstanding, "0.00") === 0
        ? "FULLY_REPAID"
        : compareMoney(lEntry.totalRepaid, "0.00") > 0
          ? "PARTIALLY_REPAID"
          : "OUTSTANDING";

    await LoanModel.updateOne(
      { _id: lEntry.loan._id, userId: userObjectId },
      {
        $set: {
          originalAmount: mongoose.Types.Decimal128.fromString(
            lEntry.originalAmount,
          ),
          totalRepaid: mongoose.Types.Decimal128.fromString(
            lEntry.totalRepaid,
          ),
          outstandingAmount: mongoose.Types.Decimal128.fromString(outstanding),
          status,
          latestRepaymentDate: lEntry.latestRepaymentDate,
          transactionIds: lEntry.transactionIds,
          counterpartyAccountId: lEntry.counterpartyAccountId,
          receivingOrDisbursingAccountId: lEntry.receivingOrDisbursingAccountId,
          loanDate: lEntry.loanDate,
        },
        $inc: { version: 1 },
      },
      opt,
    );
  }
}

export async function updateTransaction(
  userId: string,
  transactionId: string,
  input: UpdateTransactionInput,
): Promise<TransactionDTO> {
  const userObjectId = toObjectId(userId, "userId");
  const txObjectId = toObjectId(transactionId, "transactionId");

  return withDatabaseTransaction(async (session) => {
    const opt = session ? { session } : {};
    const tx = await TransactionModel.findOne(
      { _id: txObjectId, userId: userObjectId, isDeleted: false },
      null,
      opt,
    );
    if (!tx) {
      throw new AppError(
        404,
        "TRANSACTION_NOT_FOUND",
        "Transaction not found.",
      );
    }

    if (input.type && input.type !== tx.type) {
      throw new AppError(
        400,
        "TYPE_CHANGE_NOT_ALLOWED",
        "Transaction type cannot be changed directly. Delete and create a new transaction instead.",
      );
    }

    const loadAcc = async (id: string, label: string): Promise<IAccount> => {
      const objId = toObjectId(id, label);
      const acc = await AccountModel.findOne(
        { _id: objId, userId: userObjectId },
        null,
        opt,
      );
      if (!acc) {
        throw new AppError(
          404,
          "ACCOUNT_NOT_FOUND",
          `${label} account not found.`,
        );
      }
      return acc;
    };

    const snapshot = tx.toObject();

    if (input.amount !== undefined) {
      const amtStr = toMoneyString(input.amount);
      if (!isPositiveMoney(amtStr)) {
        throw new AppError(
          400,
          "INVALID_AMOUNT",
          "Amount must be greater than zero.",
        );
      }
      tx.amount = mongoose.Types.Decimal128.fromString(amtStr);
    }

    if (input.transactionDate !== undefined) {
      const parsed = new Date(input.transactionDate);
      if (Number.isNaN(parsed.getTime())) {
        throw new AppError(400, "INVALID_DATE", "Invalid transaction date.");
      }
      tx.transactionDate = parsed;
    }

    if (input.description !== undefined) tx.description = input.description;
    if (input.note !== undefined) tx.note = input.note;

    if (input.fromAccountId !== undefined) {
      if (tx.type === "LOAN_REPAYMENT" && tx.loanId) {
        const linkedLoan = await LoanModel.findOne(
          { _id: tx.loanId, userId: userObjectId },
          null,
          opt,
        );
        if (linkedLoan?.loanType === "GIVEN") {
          throw new AppError(
            400,
            "COUNTERPARTY_LOCKED",
            "Borrower account is tied to the original loan.",
          );
        }
      }
      if (input.fromAccountId) {
        const acc = await loadAcc(input.fromAccountId, "Source");
        tx.fromAccountId = acc._id;
      }
    }

    if (input.toAccountId !== undefined) {
      if (tx.type === "LOAN_REPAYMENT" && tx.loanId) {
        const linkedLoan = await LoanModel.findOne(
          { _id: tx.loanId, userId: userObjectId },
          null,
          opt,
        );
        if (linkedLoan?.loanType === "RECEIVED") {
          throw new AppError(
            400,
            "COUNTERPARTY_LOCKED",
            "Lender account is tied to the original loan.",
          );
        }
      }
      if (input.toAccountId) {
        const acc = await loadAcc(input.toAccountId, "Destination");
        tx.toAccountId = acc._id;
      }
    }

    if (input.fromBalanceType !== undefined && tx.fromAccountId) {
      const fromAcc = await loadAcc(tx.fromAccountId.toString(), "Source");
      tx.fromBalanceType = resolveBalanceType(fromAcc, input.fromBalanceType);
    } else if (tx.fromAccountId && tx.fromBalanceType) {
      const fromAcc = await loadAcc(tx.fromAccountId.toString(), "Source");
      tx.fromBalanceType = resolveBalanceType(fromAcc, tx.fromBalanceType);
    }

    if (input.toBalanceType !== undefined && tx.toAccountId) {
      const toAcc = await loadAcc(tx.toAccountId.toString(), "Destination");
      tx.toBalanceType = resolveBalanceType(
        toAcc,
        input.toBalanceType,
        tx.type === "BANK_INTEREST",
      );
    } else if (tx.toAccountId && tx.toBalanceType) {
      const toAcc = await loadAcc(tx.toAccountId.toString(), "Destination");
      tx.toBalanceType = resolveBalanceType(
        toAcc,
        tx.toBalanceType,
        tx.type === "BANK_INTEREST",
      );
    }

    if (input.expenseCategoryId !== undefined && tx.type === "EXPENSE") {
      if (!input.expenseCategoryId) {
        throw new AppError(
          400,
          "CATEGORY_REQUIRED",
          "Expense category is required.",
        );
      }
      const catId = toObjectId(input.expenseCategoryId, "expenseCategoryId");
      const cat = await ExpenseCategoryModel.findOne(
        { _id: catId, userId: userObjectId },
        null,
        opt,
      );
      if (!cat) {
        throw new AppError(
          404,
          "CATEGORY_NOT_FOUND",
          "Expense category not found.",
        );
      }
      tx.expenseCategoryId = cat._id;
    }

    if (
      tx.type === "ACCOUNT_TRANSFER" &&
      tx.fromAccountId &&
      tx.toAccountId &&
      tx.fromAccountId.equals(tx.toAccountId) &&
      tx.fromBalanceType === tx.toBalanceType
    ) {
      throw new AppError(
        400,
        "SAME_ACCOUNT_TRANSFER",
        "Source and destination account balance buckets must be different.",
      );
    }

    await tx.save(opt);

    try {
      await recalculateAndVerifyUserLedger(userObjectId, session);
    } catch (err) {
      if (!session) {
        // Restore previous transaction document on standalone failure
        await TransactionModel.updateOne(
          { _id: tx._id, userId: userObjectId },
          { $set: snapshot },
        ).catch(() => undefined);
      }
      throw err;
    }

    return serializeTransaction(tx);
  });
}

export async function deleteTransaction(
  userId: string,
  transactionId: string,
): Promise<{ deletedId: string }> {
  const userObjectId = toObjectId(userId, "userId");
  const txObjectId = toObjectId(transactionId, "transactionId");

  return withDatabaseTransaction(async (session) => {
    const opt = session ? { session } : {};
    const tx = await TransactionModel.findOne(
      { _id: txObjectId, userId: userObjectId, isDeleted: false },
      null,
      opt,
    );
    if (!tx) {
      throw new AppError(
        404,
        "TRANSACTION_NOT_FOUND",
        "Transaction not found.",
      );
    }

    let deletedLoanId: mongoose.Types.ObjectId | null = null;

    if (
      (tx.type === "LOAN_RECEIVED" || tx.type === "LOAN_GIVEN") &&
      tx.loanId
    ) {
      const repaymentCount = await TransactionModel.countDocuments({
        userId: userObjectId,
        loanId: tx.loanId,
        type: "LOAN_REPAYMENT",
        isDeleted: false,
      }).session(session);

      if (repaymentCount > 0) {
        throw new AppError(
          400,
          "LOAN_HAS_REPAYMENTS",
          "Cannot delete this loan because repayments are already recorded against it. Delete the repayments first.",
        );
      }

      deletedLoanId = tx.loanId;
      await LoanModel.updateOne(
        { _id: tx.loanId, userId: userObjectId },
        { $set: { isDeleted: true }, $inc: { version: 1 } },
        opt,
      );
    }

    tx.isDeleted = true;
    tx.deletedAt = new Date();
    await tx.save(opt);

    try {
      await recalculateAndVerifyUserLedger(userObjectId, session);
    } catch (err) {
      if (!session) {
        await TransactionModel.updateOne(
          { _id: tx._id, userId: userObjectId },
          { $set: { isDeleted: false }, $unset: { deletedAt: 1 } },
        ).catch(() => undefined);
        if (deletedLoanId) {
          await LoanModel.updateOne(
            { _id: deletedLoanId, userId: userObjectId },
            { $set: { isDeleted: false } },
          ).catch(() => undefined);
        }
      }
      throw err;
    }

    return { deletedId: tx._id.toString() };
  });
}

export interface TransactionFilterQuery {
  accountId?: string;
  categoryId?: string;
  type?: TransactionType;
  loanId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  minAmount?: string;
  maxAmount?: string;
  limit?: number;
  offset?: number;
}

export async function listTransactions(
  userId: string,
  filters: TransactionFilterQuery = {},
): Promise<{ items: TransactionDTO[]; total: number }> {
  const userObjectId = toObjectId(userId, "userId");
  const query: Record<string, unknown> = {
    userId: userObjectId,
    isDeleted: false,
  };

  if (filters.accountId && mongoose.Types.ObjectId.isValid(filters.accountId)) {
    const accId = new mongoose.Types.ObjectId(filters.accountId);
    query.$or = [{ fromAccountId: accId }, { toAccountId: accId }];
  }

  if (
    filters.categoryId &&
    mongoose.Types.ObjectId.isValid(filters.categoryId)
  ) {
    query.expenseCategoryId = new mongoose.Types.ObjectId(filters.categoryId);
  }

  if (filters.type) {
    query.type = filters.type;
  }

  if (filters.loanId && mongoose.Types.ObjectId.isValid(filters.loanId)) {
    query.loanId = new mongoose.Types.ObjectId(filters.loanId);
  }

  if (filters.startDate || filters.endDate) {
    const dateCond: Record<string, Date> = {};
    if (filters.startDate) {
      const s = new Date(filters.startDate);
      if (!Number.isNaN(s.getTime())) {
        s.setHours(0, 0, 0, 0);
        dateCond.$gte = s;
      }
    }
    if (filters.endDate) {
      const e = new Date(filters.endDate);
      if (!Number.isNaN(e.getTime())) {
        e.setHours(23, 59, 59, 999);
        dateCond.$lte = e;
      }
    }
    if (Object.keys(dateCond).length > 0) {
      query.transactionDate = dateCond;
    }
  }

  if (filters.minAmount || filters.maxAmount) {
    const amtCond: Record<string, mongoose.Types.Decimal128> = {};
    if (filters.minAmount && /^\d+(\.\d{1,2})?$/.test(filters.minAmount)) {
      amtCond.$gte = mongoose.Types.Decimal128.fromString(
        toMoneyString(filters.minAmount),
      );
    }
    if (filters.maxAmount && /^\d+(\.\d{1,2})?$/.test(filters.maxAmount)) {
      amtCond.$lte = mongoose.Types.Decimal128.fromString(
        toMoneyString(filters.maxAmount),
      );
    }
    if (Object.keys(amtCond).length > 0) {
      query.amount = amtCond;
    }
  }

  if (filters.search?.trim()) {
    const safeRegex = new RegExp(
      filters.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
    const searchCond = [{ description: safeRegex }, { note: safeRegex }];
    if (query.$or) {
      query.$and = [{ $or: query.$or }, { $or: searchCond }];
      delete query.$or;
    } else {
      query.$or = searchCond;
    }
  }

  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 500);
  const offset = Math.max(filters.offset ?? 0, 0);

  const [docs, total] = await Promise.all([
    TransactionModel.find(query)
      .sort({ transactionDate: -1, createdAt: -1, _id: -1 })
      .skip(offset)
      .limit(limit)
      .lean(),
    TransactionModel.countDocuments(query),
  ]);

  return {
    items: (docs as unknown as ITransaction[]).map(serializeTransaction),
    total,
  };
}
