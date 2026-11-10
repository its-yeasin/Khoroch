import mongoose from "mongoose";
import { AccountModel, type IAccount } from "@/lib/db/models/Account";
import {
  ExpenseCategoryModel,
  type IExpenseCategory,
} from "@/lib/db/models/ExpenseCategory";
import { LoanModel, type ILoan } from "@/lib/db/models/Loan";
import { SettingsModel, type ISettings } from "@/lib/db/models/Settings";
import {
  TransactionModel,
  type ITransaction,
} from "@/lib/db/models/Transaction";
import { UserModel } from "@/lib/db/models/User";
import { AppError } from "@/lib/errors";
import { createAccount } from "@/lib/services/account-service";
import { ensureUserBootstrap } from "@/lib/services/bootstrap";
import { createCategory } from "@/lib/services/category-service";
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
} from "@/lib/services/ledger";
import {
  serializeAccount,
  serializeCategory,
  serializeLoan,
  serializeSettings,
  serializeTransaction,
} from "@/lib/services/serializers";
import {
  createAccountSchema,
  createCategorySchema,
  createTransactionSchema,
  updateTransactionSchema,
} from "@/lib/validation/schemas";

export interface SyncBatchOperationInput {
  opId: string;
  opType:
    | "CREATE_ACCOUNT"
    | "CREATE_CATEGORY"
    | "CREATE_TRANSACTION"
    | "UPDATE_TRANSACTION"
    | "DELETE_TRANSACTION";
  clientEntityId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface SyncOpResult {
  opId: string;
  opType: SyncBatchOperationInput["opType"];
  clientEntityId: string;
  status: "SYNCED" | "FAILED";
  serverEntityId?: string;
  duplicate?: boolean;
  code?: string;
  message?: string;
}

export async function getFullSnapshot(userId: string) {
  await ensureUserBootstrap(userId);
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const [user, accounts, categories, transactions, loans, settings] =
    await Promise.all([
      UserModel.findById(userObjectId).lean(),
      AccountModel.find({ userId: userObjectId })
        .sort({ isDefault: -1, category: 1, createdAt: 1 })
        .lean(),
      ExpenseCategoryModel.find({ userId: userObjectId })
        .sort({ isDefault: -1, name: 1 })
        .lean(),
      TransactionModel.find({ userId: userObjectId, isDeleted: false })
        .sort({ transactionDate: -1, createdAt: -1, _id: -1 })
        .lean(),
      LoanModel.find({ userId: userObjectId, isDeleted: false })
        .sort({ loanDate: -1, createdAt: -1 })
        .lean(),
      SettingsModel.findOne({ userId: userObjectId }).lean(),
    ]);

  return {
    user: user
      ? {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          createdAt: user.createdAt.toISOString(),
        }
      : null,
    accounts: (accounts as unknown as IAccount[]).map(serializeAccount),
    categories: (categories as unknown as IExpenseCategory[]).map(
      serializeCategory,
    ),
    transactions: (transactions as unknown as ITransaction[]).map(
      serializeTransaction,
    ),
    loans: (loans as unknown as ILoan[]).map(serializeLoan),
    settings: settings
      ? serializeSettings(settings as unknown as ISettings)
      : null,
    syncedAt: new Date().toISOString(),
  };
}

export async function processSyncBatch(
  userId: string,
  operations: SyncBatchOperationInput[],
) {
  await ensureUserBootstrap(userId);
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const accountIdMap = new Map<string, string>();
  const categoryIdMap = new Map<string, string>();
  const loanIdMap = new Map<string, string>();
  const txIdMap = new Map<string, string>();

  // Pre-seed resolution maps with any existing client-created entities
  const [existingAccounts, existingCategories, existingLoans, existingTxs] =
    await Promise.all([
      AccountModel.find({
        userId: userObjectId,
        clientId: { $exists: true, $ne: null },
      })
        .select("_id clientId")
        .lean(),
      ExpenseCategoryModel.find({
        userId: userObjectId,
        clientId: { $exists: true, $ne: null },
      })
        .select("_id clientId")
        .lean(),
      LoanModel.find({
        userId: userObjectId,
        clientLoanId: { $exists: true, $ne: null },
      })
        .select("_id clientLoanId")
        .lean(),
      TransactionModel.find({ userId: userObjectId })
        .select("_id clientTransactionId")
        .lean(),
    ]);

  for (const a of existingAccounts) {
    if (a.clientId) accountIdMap.set(a.clientId, a._id.toString());
  }
  for (const c of existingCategories) {
    if (c.clientId) categoryIdMap.set(c.clientId, c._id.toString());
  }
  for (const l of existingLoans) {
    if (l.clientLoanId) loanIdMap.set(l.clientLoanId, l._id.toString());
  }
  for (const t of existingTxs) {
    txIdMap.set(t.clientTransactionId, t._id.toString());
  }

  const resolveRef = (
    val: unknown,
    map: Map<string, string>,
  ): string | null | undefined => {
    if (val === null || val === undefined) return val as null | undefined;
    const str = String(val);
    return map.get(str) ?? str;
  };

  const results: SyncOpResult[] = [];

  for (const op of operations) {
    try {
      switch (op.opType) {
        case "CREATE_ACCOUNT": {
          const parsed = createAccountSchema.parse({
            ...op.payload,
            clientId: op.clientEntityId,
          });
          const res = await createAccount(userId, parsed);
          accountIdMap.set(op.clientEntityId, res.account.id);
          results.push({
            opId: op.opId,
            opType: op.opType,
            clientEntityId: op.clientEntityId,
            status: "SYNCED",
            serverEntityId: res.account.id,
            duplicate: res.duplicate,
          });
          break;
        }

        case "CREATE_CATEGORY": {
          const parsed = createCategorySchema.parse({
            ...op.payload,
            clientId: op.clientEntityId,
          });
          const res = await createCategory(userId, parsed);
          categoryIdMap.set(op.clientEntityId, res.category.id);
          results.push({
            opId: op.opId,
            opType: op.opType,
            clientEntityId: op.clientEntityId,
            status: "SYNCED",
            serverEntityId: res.category.id,
            duplicate: res.duplicate,
          });
          break;
        }

        case "CREATE_TRANSACTION": {
          const resolvedPayload = {
            ...op.payload,
            clientTransactionId: op.clientEntityId,
            fromAccountId: resolveRef(op.payload.fromAccountId, accountIdMap),
            toAccountId: resolveRef(op.payload.toAccountId, accountIdMap),
            expenseCategoryId: resolveRef(
              op.payload.expenseCategoryId,
              categoryIdMap,
            ),
            loanId: resolveRef(op.payload.loanId, loanIdMap),
          };
          const parsed = createTransactionSchema.parse(resolvedPayload);
          const res = await createTransaction(userId, parsed);
          txIdMap.set(op.clientEntityId, res.transaction.id);
          if (res.loan && parsed.clientLoanId) {
            loanIdMap.set(parsed.clientLoanId, res.loan.id);
          }
          results.push({
            opId: op.opId,
            opType: op.opType,
            clientEntityId: op.clientEntityId,
            status: "SYNCED",
            serverEntityId: res.transaction.id,
            duplicate: res.duplicate,
          });
          break;
        }

        case "UPDATE_TRANSACTION": {
          const targetId =
            txIdMap.get(op.clientEntityId) ?? op.clientEntityId;
          const resolvedPayload = {
            ...op.payload,
            fromAccountId: resolveRef(op.payload.fromAccountId, accountIdMap),
            toAccountId: resolveRef(op.payload.toAccountId, accountIdMap),
            expenseCategoryId: resolveRef(
              op.payload.expenseCategoryId,
              categoryIdMap,
            ),
          };
          const parsed = updateTransactionSchema.parse(resolvedPayload);
          const updated = await updateTransaction(userId, targetId, parsed);
          results.push({
            opId: op.opId,
            opType: op.opType,
            clientEntityId: op.clientEntityId,
            status: "SYNCED",
            serverEntityId: updated.id,
          });
          break;
        }

        case "DELETE_TRANSACTION": {
          const targetId =
            txIdMap.get(op.clientEntityId) ?? op.clientEntityId;
          const res = await deleteTransaction(userId, targetId);
          results.push({
            opId: op.opId,
            opType: op.opType,
            clientEntityId: op.clientEntityId,
            status: "SYNCED",
            serverEntityId: res.deletedId,
          });
          break;
        }
      }
    } catch (err) {
      const code =
        err instanceof AppError ? err.code : "SYNC_OPERATION_FAILED";
      const message =
        err instanceof Error
          ? err.message
          : "Operation could not be synchronized.";
      results.push({
        opId: op.opId,
        opType: op.opType,
        clientEntityId: op.clientEntityId,
        status: "FAILED",
        code,
        message,
      });
    }
  }

  const snapshot = await getFullSnapshot(userId);
  return { results, snapshot };
}
