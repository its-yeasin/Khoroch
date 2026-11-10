import type { IAccount } from "@/lib/db/models/Account";
import type { IExpenseCategory } from "@/lib/db/models/ExpenseCategory";
import type { ILoan } from "@/lib/db/models/Loan";
import type { ISettings } from "@/lib/db/models/Settings";
import type { ITransaction } from "@/lib/db/models/Transaction";
import { addMoney, toMoneyString } from "@/lib/money";
import type {
  AccountDTO,
  ExpenseCategoryDTO,
  LoanDTO,
  SettingsDTO,
  TransactionDTO,
} from "@/lib/types";

type LeanLike<T> = T | (Record<string, unknown> & { _id: { toString(): string } });

export function serializeAccount(doc: LeanLike<IAccount>): AccountDTO {
  const d = doc as unknown as IAccount;
  const mainBal = toMoneyString(d.currentMainBalance);
  const interestBal = toMoneyString(d.currentInterestBalance);
  const totalBalance = d.interestEnabled
    ? addMoney(mainBal, interestBal)
    : mainBal;

  return {
    id: d._id.toString(),
    userId: d.userId.toString(),
    clientId: d.clientId,
    name: d.name,
    category: d.category,
    bankName: d.bankName,
    accountNumberMasked: d.accountNumberMasked,
    initialMainBalance: toMoneyString(d.initialMainBalance),
    currentMainBalance: mainBal,
    initialInterestBalance: toMoneyString(d.initialInterestBalance),
    currentInterestBalance: interestBal,
    totalBalance,
    interestEnabled: Boolean(d.interestEnabled),
    description: d.description ?? "",
    isDefault: Boolean(d.isDefault),
    isArchived: Boolean(d.isArchived),
    version: d.version ?? 0,
    createdAt: new Date(d.createdAt).toISOString(),
    updatedAt: new Date(d.updatedAt).toISOString(),
    syncStatus: "SYNCED",
  };
}

export function serializeCategory(
  doc: LeanLike<IExpenseCategory>,
): ExpenseCategoryDTO {
  const d = doc as unknown as IExpenseCategory;
  return {
    id: d._id.toString(),
    userId: d.userId.toString(),
    clientId: d.clientId,
    name: d.name,
    icon: d.icon,
    color: d.color,
    isDefault: Boolean(d.isDefault),
    createdAt: new Date(d.createdAt).toISOString(),
    updatedAt: new Date(d.updatedAt).toISOString(),
    syncStatus: "SYNCED",
  };
}

export function serializeTransaction(
  doc: LeanLike<ITransaction>,
): TransactionDTO {
  const d = doc as unknown as ITransaction;
  return {
    id: d._id.toString(),
    clientTransactionId: d.clientTransactionId,
    userId: d.userId.toString(),
    type: d.type,
    amount: toMoneyString(d.amount),
    fromAccountId: d.fromAccountId ? d.fromAccountId.toString() : null,
    toAccountId: d.toAccountId ? d.toAccountId.toString() : null,
    fromBalanceType: d.fromBalanceType ?? null,
    toBalanceType: d.toBalanceType ?? null,
    expenseCategoryId: d.expenseCategoryId
      ? d.expenseCategoryId.toString()
      : null,
    loanId: d.loanId ? d.loanId.toString() : null,
    adjustmentDirection: d.adjustmentDirection ?? null,
    description: d.description ?? "",
    note: d.note ?? "",
    attachmentName: d.attachmentName,
    attachmentDataUrl: d.attachmentDataUrl,
    transactionDate: new Date(d.transactionDate).toISOString(),
    isDeleted: Boolean(d.isDeleted),
    syncStatus: "SYNCED",
    createdAt: new Date(d.createdAt).toISOString(),
    updatedAt: new Date(d.updatedAt).toISOString(),
  };
}

export function serializeLoan(doc: LeanLike<ILoan>): LoanDTO {
  const d = doc as unknown as ILoan;
  return {
    id: d._id.toString(),
    userId: d.userId.toString(),
    clientLoanId: d.clientLoanId,
    loanType: d.loanType,
    counterpartyAccountId: d.counterpartyAccountId.toString(),
    originalAmount: toMoneyString(d.originalAmount),
    totalRepaid: toMoneyString(d.totalRepaid),
    outstandingAmount: toMoneyString(d.outstandingAmount),
    receivingOrDisbursingAccountId: d.receivingOrDisbursingAccountId.toString(),
    originTransactionId: d.originTransactionId.toString(),
    transactionIds: (d.transactionIds ?? []).map((id) => id.toString()),
    loanDate: new Date(d.loanDate).toISOString(),
    latestRepaymentDate: d.latestRepaymentDate
      ? new Date(d.latestRepaymentDate).toISOString()
      : null,
    status: d.status,
    isDeleted: Boolean(d.isDeleted),
    version: d.version ?? 0,
    createdAt: new Date(d.createdAt).toISOString(),
    updatedAt: new Date(d.updatedAt).toISOString(),
    syncStatus: "SYNCED",
  };
}

export function serializeSettings(doc: LeanLike<ISettings>): SettingsDTO {
  const d = doc as unknown as ISettings;
  return {
    userId: d.userId.toString(),
    currencyCode: d.currencyCode,
    currencySymbol: d.currencySymbol,
    dateFormat: d.dateFormat,
    theme: d.theme,
    defaultDashboardRange: d.defaultDashboardRange,
  };
}
