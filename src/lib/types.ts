import type {
  AccountCategory,
  AdjustmentDirection,
  BalanceType,
  DashboardRange,
  DateFormatOption,
  LoanStatus,
  LoanType,
  SyncStatus,
  ThemeOption,
  TransactionType,
} from "./constants";

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface AccountDTO {
  id: string;
  userId: string;
  clientId?: string;
  name: string;
  category: AccountCategory;
  bankName?: string;
  accountNumberMasked?: string;
  initialMainBalance: string;
  currentMainBalance: string;
  initialInterestBalance: string;
  currentInterestBalance: string;
  totalBalance: string;
  interestEnabled: boolean;
  description: string;
  isDefault: boolean;
  isArchived: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  syncStatus?: SyncStatus;
}

export interface ExpenseCategoryDTO {
  id: string;
  userId: string;
  clientId?: string;
  name: string;
  icon: string;
  color: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  syncStatus?: SyncStatus;
}

export interface TransactionDTO {
  id: string;
  clientTransactionId: string;
  userId: string;
  type: TransactionType;
  amount: string;
  fromAccountId: string | null;
  toAccountId: string | null;
  fromBalanceType: BalanceType | null;
  toBalanceType: BalanceType | null;
  expenseCategoryId: string | null;
  loanId: string | null;
  adjustmentDirection: AdjustmentDirection | null;
  description: string;
  note: string;
  attachmentName?: string;
  attachmentDataUrl?: string;
  transactionDate: string;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoanDTO {
  id: string;
  userId: string;
  clientLoanId?: string;
  loanType: LoanType;
  counterpartyAccountId: string;
  originalAmount: string;
  totalRepaid: string;
  outstandingAmount: string;
  receivingOrDisbursingAccountId: string;
  originTransactionId: string;
  transactionIds: string[];
  loanDate: string;
  latestRepaymentDate: string | null;
  status: LoanStatus;
  isDeleted: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  syncStatus?: SyncStatus;
}

export interface SettingsDTO {
  userId: string;
  currencyCode: string;
  currencySymbol: string;
  dateFormat: DateFormatOption;
  theme: ThemeOption;
  defaultDashboardRange: Exclude<DashboardRange, "CUSTOM">;
}

export interface PendingOperation {
  opId: string;
  userId: string;
  opType:
    | "CREATE_ACCOUNT"
    | "CREATE_CATEGORY"
    | "CREATE_TRANSACTION"
    | "UPDATE_TRANSACTION"
    | "DELETE_TRANSACTION";
  clientEntityId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  status: "PENDING" | "SYNCING" | "FAILED";
  errorCode?: string;
  errorMessage?: string;
  retryCount: number;
}
