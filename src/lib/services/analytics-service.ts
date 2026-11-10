import mongoose from "mongoose";
import {
  buildDashboardSummaryFromData,
  type DashboardSummary,
} from "@/lib/analytics";
import type { DashboardRange } from "@/lib/constants";
import { AccountModel, type IAccount } from "@/lib/db/models/Account";
import {
  ExpenseCategoryModel,
  type IExpenseCategory,
} from "@/lib/db/models/ExpenseCategory";
import { LoanModel, type ILoan } from "@/lib/db/models/Loan";
import {
  TransactionModel,
  type ITransaction,
} from "@/lib/db/models/Transaction";
import {
  serializeAccount,
  serializeCategory,
  serializeLoan,
  serializeTransaction,
} from "@/lib/services/serializers";

export { buildDashboardSummaryFromData, type DashboardSummary };

export async function getDashboardSummary(
  userId: string,
  range: DashboardRange = "MONTH",
  customStart?: string,
  customEnd?: string,
): Promise<DashboardSummary> {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const [accountDocs, categoryDocs, loanDocs, txDocs] = await Promise.all([
    AccountModel.find({ userId: userObjectId })
      .sort({ isDefault: -1, category: 1, createdAt: 1 })
      .lean(),
    ExpenseCategoryModel.find({ userId: userObjectId }).lean(),
    LoanModel.find({ userId: userObjectId, isDeleted: false }).lean(),
    TransactionModel.find({ userId: userObjectId, isDeleted: false })
      .sort({ transactionDate: -1, createdAt: -1 })
      .lean(),
  ]);

  return buildDashboardSummaryFromData({
    accounts: (accountDocs as unknown as IAccount[]).map(serializeAccount),
    categories: (categoryDocs as unknown as IExpenseCategory[]).map(
      serializeCategory,
    ),
    loans: (loanDocs as unknown as ILoan[]).map(serializeLoan),
    transactions: (txDocs as unknown as ITransaction[]).map(
      serializeTransaction,
    ),
    range,
    customStart,
    customEnd,
  });
}
