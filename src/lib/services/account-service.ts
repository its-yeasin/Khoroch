import mongoose from "mongoose";
import {
  encryptSensitiveText,
  maskAccountNumber,
} from "@/lib/auth/crypto";
import type { AccountCategory } from "@/lib/constants";
import { AccountModel, type IAccount } from "@/lib/db/models/Account";
import { LoanModel } from "@/lib/db/models/Loan";
import {
  TransactionModel,
  type ITransaction,
} from "@/lib/db/models/Transaction";
import { AppError, isMongoDuplicateKeyError } from "@/lib/errors";
import {
  addMoney,
  compareMoney,
  toMoneyString,
} from "@/lib/money";
import {
  serializeAccount,
  serializeTransaction,
} from "@/lib/services/serializers";
import type { AccountDTO, TransactionDTO } from "@/lib/types";

export interface CreateAccountInput {
  clientId?: string;
  name: string;
  category: AccountCategory;
  bankName?: string;
  accountNumber?: string;
  initialMainBalance?: string;
  initialInterestBalance?: string;
  interestEnabled?: boolean;
  description?: string;
}

export interface UpdateAccountInput {
  name?: string;
  bankName?: string;
  accountNumber?: string;
  interestEnabled?: boolean;
  description?: string;
  isArchived?: boolean;
}

export async function listAccounts(
  userId: string,
  includeArchived = false,
): Promise<AccountDTO[]> {
  const query: Record<string, unknown> = {
    userId: new mongoose.Types.ObjectId(userId),
  };
  if (!includeArchived) {
    query.isArchived = false;
  }

  const docs = await AccountModel.find(query)
    .sort({ isDefault: -1, category: 1, createdAt: 1 })
    .lean();

  return (docs as unknown as IAccount[]).map(serializeAccount);
}

export async function createAccount(
  userId: string,
  input: CreateAccountInput,
): Promise<{ account: AccountDTO; duplicate: boolean }> {
  const userObjectId = new mongoose.Types.ObjectId(userId);

  if (input.clientId) {
    const existing = await AccountModel.findOne({
      userId: userObjectId,
      clientId: input.clientId,
    }).lean();
    if (existing) {
      return {
        account: serializeAccount(existing as unknown as IAccount),
        duplicate: true,
      };
    }
  }

  if (input.category === "CASH") {
    // Allow creating secondary cash wallets if named differently, or prevent duplicating default Cash?
    // Section 3A says Cash is auto-created; users mainly create Bank & Custom accounts,
    // but if someone creates an additional Cash envelope we set interestEnabled = false and isDefault = false.
  }

  const isBank = input.category === "BANK";
  const interestEnabled = isBank ? Boolean(input.interestEnabled) : false;
  const initialMain = toMoneyString(input.initialMainBalance ?? "0.00");
  const initialInterest = interestEnabled
    ? toMoneyString(input.initialInterestBalance ?? "0.00")
    : "0.00";

  if (compareMoney(initialMain, "0.00") < 0) {
    throw new AppError(
      400,
      "INVALID_BALANCE",
      "Initial main balance cannot be negative.",
    );
  }
  if (compareMoney(initialInterest, "0.00") < 0) {
    throw new AppError(
      400,
      "INVALID_BALANCE",
      "Initial interest balance cannot be negative.",
    );
  }

  const encryptedAccountNumber =
    isBank && input.accountNumber?.trim()
      ? encryptSensitiveText(input.accountNumber.trim())
      : undefined;
  const accountNumberMasked =
    isBank && input.accountNumber?.trim()
      ? maskAccountNumber(input.accountNumber.trim())
      : undefined;

  try {
    const created = await AccountModel.create({
      userId: userObjectId,
      clientId: input.clientId?.trim() || undefined,
      name: input.name.trim(),
      category: input.category,
      bankName: isBank ? input.bankName?.trim() || undefined : undefined,
      encryptedAccountNumber,
      accountNumberMasked,
      initialMainBalance: mongoose.Types.Decimal128.fromString(initialMain),
      currentMainBalance: mongoose.Types.Decimal128.fromString(initialMain),
      initialInterestBalance:
        mongoose.Types.Decimal128.fromString(initialInterest),
      currentInterestBalance:
        mongoose.Types.Decimal128.fromString(initialInterest),
      interestEnabled,
      description: input.description?.trim() ?? "",
      isDefault: false,
      isArchived: false,
      version: 0,
    });

    return { account: serializeAccount(created), duplicate: false };
  } catch (err) {
    if (isMongoDuplicateKeyError(err) && input.clientId) {
      const existing = await AccountModel.findOne({
        userId: userObjectId,
        clientId: input.clientId,
      }).lean();
      if (existing) {
        return {
          account: serializeAccount(existing as unknown as IAccount),
          duplicate: true,
        };
      }
    }
    throw err;
  }
}

export async function updateAccount(
  userId: string,
  accountId: string,
  input: UpdateAccountInput,
): Promise<AccountDTO> {
  if (!mongoose.Types.ObjectId.isValid(accountId)) {
    throw new AppError(400, "INVALID_ID", "Invalid account ID.");
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const acc = await AccountModel.findOne({
    _id: new mongoose.Types.ObjectId(accountId),
    userId: userObjectId,
  });
  if (!acc) {
    throw new AppError(404, "ACCOUNT_NOT_FOUND", "Account not found.");
  }

  if (input.name !== undefined) {
    acc.name = input.name.trim();
  }
  if (input.description !== undefined) {
    acc.description = input.description.trim();
  }

  if (acc.category === "BANK") {
    if (input.bankName !== undefined) {
      acc.bankName = input.bankName.trim() || undefined;
    }
    if (input.accountNumber !== undefined) {
      const trimmed = input.accountNumber.trim();
      acc.encryptedAccountNumber = trimmed
        ? encryptSensitiveText(trimmed)
        : undefined;
      acc.accountNumberMasked = trimmed
        ? maskAccountNumber(trimmed)
        : undefined;
    }
    if (input.interestEnabled !== undefined) {
      if (
        !input.interestEnabled &&
        compareMoney(toMoneyString(acc.currentInterestBalance), "0.00") > 0
      ) {
        throw new AppError(
          400,
          "INTEREST_BALANCE_NOT_ZERO",
          "Cannot disable interest while the interest balance is greater than zero. Transfer or spend the interest balance first.",
        );
      }
      acc.interestEnabled = input.interestEnabled;
    }
  }

  if (input.isArchived !== undefined) {
    if (acc.isDefault && input.isArchived) {
      throw new AppError(
        400,
        "DEFAULT_CASH_PROTECTED",
        "The default Cash account cannot be archived or deleted.",
      );
    }
    acc.isArchived = input.isArchived;
  }

  await acc.save();
  return serializeAccount(acc);
}

export async function deleteOrArchiveAccount(
  userId: string,
  accountId: string,
): Promise<{ archived: boolean; deleted: boolean }> {
  if (!mongoose.Types.ObjectId.isValid(accountId)) {
    throw new AppError(400, "INVALID_ID", "Invalid account ID.");
  }
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const accObjId = new mongoose.Types.ObjectId(accountId);

  const acc = await AccountModel.findOne({
    _id: accObjId,
    userId: userObjectId,
  });
  if (!acc) {
    throw new AppError(404, "ACCOUNT_NOT_FOUND", "Account not found.");
  }
  if (acc.isDefault) {
    throw new AppError(
      400,
      "DEFAULT_CASH_PROTECTED",
      "The default Cash account cannot be deleted.",
    );
  }

  const [txCount, loanCount] = await Promise.all([
    TransactionModel.countDocuments({
      userId: userObjectId,
      isDeleted: false,
      $or: [{ fromAccountId: accObjId }, { toAccountId: accObjId }],
    }),
    LoanModel.countDocuments({
      userId: userObjectId,
      isDeleted: false,
      $or: [
        { counterpartyAccountId: accObjId },
        { receivingOrDisbursingAccountId: accObjId },
      ],
    }),
  ]);

  if (txCount > 0 || loanCount > 0) {
    acc.isArchived = true;
    await acc.save();
    return { archived: true, deleted: false };
  }

  await AccountModel.deleteOne({ _id: accObjId, userId: userObjectId });
  return { archived: false, deleted: true };
}

export interface AccountOverviewResult {
  account: AccountDTO;
  stats: {
    totalAdded: string;
    totalExpenses: string;
    totalIncome: string;
    totalTransfersIn: string;
    totalTransfersOut: string;
    totalLoanTransactions: string;
    totalInterestAdded: string;
  };
  transactions: TransactionDTO[];
}

export async function getAccountOverview(
  userId: string,
  accountId: string,
): Promise<AccountOverviewResult> {
  if (!mongoose.Types.ObjectId.isValid(accountId)) {
    throw new AppError(400, "INVALID_ID", "Invalid account ID.");
  }
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const accObjId = new mongoose.Types.ObjectId(accountId);

  const acc = await AccountModel.findOne({
    _id: accObjId,
    userId: userObjectId,
  }).lean();
  if (!acc) {
    throw new AppError(404, "ACCOUNT_NOT_FOUND", "Account not found.");
  }

  const txDocs = await TransactionModel.find({
    userId: userObjectId,
    isDeleted: false,
    $or: [{ fromAccountId: accObjId }, { toAccountId: accObjId }],
  })
    .sort({ transactionDate: -1, createdAt: -1, _id: -1 })
    .lean();

  let totalAdded = "0.00";
  let totalExpenses = "0.00";
  let totalIncome = "0.00";
  let totalTransfersIn = "0.00";
  let totalTransfersOut = "0.00";
  let totalLoanTransactions = "0.00";
  let totalInterestAdded = "0.00";

  for (const rawTx of txDocs as unknown as ITransaction[]) {
    const amt = toMoneyString(rawTx.amount);
    const isFrom = rawTx.fromAccountId?.toString() === accountId;
    const isTo = rawTx.toAccountId?.toString() === accountId;

    switch (rawTx.type) {
      case "ADD_BALANCE":
        if (isTo) totalAdded = addMoney(totalAdded, amt);
        break;
      case "EXPENSE":
        if (isFrom) totalExpenses = addMoney(totalExpenses, amt);
        break;
      case "INCOME":
        if (isTo) totalIncome = addMoney(totalIncome, amt);
        break;
      case "BANK_INTEREST":
        if (isTo) totalInterestAdded = addMoney(totalInterestAdded, amt);
        break;
      case "ACCOUNT_TRANSFER":
        if (isTo) totalTransfersIn = addMoney(totalTransfersIn, amt);
        if (isFrom) totalTransfersOut = addMoney(totalTransfersOut, amt);
        break;
      case "LOAN_RECEIVED":
      case "LOAN_GIVEN":
      case "LOAN_REPAYMENT":
        totalLoanTransactions = addMoney(totalLoanTransactions, amt);
        break;
    }
  }

  return {
    account: serializeAccount(acc as unknown as IAccount),
    stats: {
      totalAdded,
      totalExpenses,
      totalIncome,
      totalTransfersIn,
      totalTransfersOut,
      totalLoanTransactions,
      totalInterestAdded,
    },
    transactions: (txDocs as unknown as ITransaction[]).map(
      serializeTransaction,
    ),
  };
}
