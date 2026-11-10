import Dexie, { type Table } from "dexie";
import type {
  AccountDTO,
  ExpenseCategoryDTO,
  LoanDTO,
  PendingOperation,
  SettingsDTO,
  TransactionDTO,
  UserDTO,
} from "@/lib/types";

export interface MetaRecord {
  key: string;
  value: unknown;
}

class SelfWalletDexie extends Dexie {
  accounts!: Table<AccountDTO, string>;
  categories!: Table<ExpenseCategoryDTO, string>;
  transactions!: Table<TransactionDTO, string>;
  loans!: Table<LoanDTO, string>;
  settings!: Table<SettingsDTO, string>;
  pendingOps!: Table<PendingOperation, string>;
  users!: Table<UserDTO, string>;
  meta!: Table<MetaRecord, string>;

  constructor() {
    super("self_wallet_db");
    this.version(1).stores({
      accounts: "id, userId, clientId, category, isArchived",
      categories: "id, userId, clientId, name",
      transactions:
        "id, clientTransactionId, userId, type, transactionDate, isDeleted, syncStatus",
      loans:
        "id, userId, clientLoanId, loanType, counterpartyAccountId, isDeleted, status",
      settings: "userId",
      pendingOps: "opId, userId, status, createdAt, clientEntityId",
      users: "id, email",
      meta: "key",
    });
  }
}

let dbInstance: SelfWalletDexie | null = null;

export function getOfflineDB(): SelfWalletDexie {
  if (!dbInstance) {
    dbInstance = new SelfWalletDexie();
  }
  return dbInstance;
}

export async function resetOfflineDBInstance(): Promise<void> {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
