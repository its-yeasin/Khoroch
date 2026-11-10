import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { hashPassword } from "@/lib/auth/password";
import { resetTransactionSupportCache } from "@/lib/db/transaction";
import { AccountModel } from "@/lib/db/models/Account";
import { ExpenseCategoryModel } from "@/lib/db/models/ExpenseCategory";
import { LoanModel } from "@/lib/db/models/Loan";
import { TransactionModel } from "@/lib/db/models/Transaction";
import { UserModel } from "@/lib/db/models/User";
import {
  createAccount,
  deleteOrArchiveAccount,
  getAccountOverview,
  listAccounts,
} from "@/lib/services/account-service";
import { getDashboardSummary } from "@/lib/services/analytics-service";
import { exportUserData, importUserBackup } from "@/lib/services/backup-service";
import { ensureUserBootstrap } from "@/lib/services/bootstrap";
import {
  createCategory,
  deleteCategory,
  listCategoriesWithStats,
} from "@/lib/services/category-service";
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
} from "@/lib/services/ledger";
import { listLoansWithPeople } from "@/lib/services/loan-service";

let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  await mongoose.connect(replSet.getUri());
  resetTransactionSupportCache();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (replSet) {
    await replSet.stop();
  }
});

beforeEach(async () => {
  const collections = await mongoose.connection.db?.collections();
  if (collections) {
    for (const c of collections) {
      await c.deleteMany({});
    }
  }
});

async function createTestUser(email = "user@example.com") {
  const user = await UserModel.create({
    name: "Test User",
    email,
    passwordHash: await hashPassword("StrongPass123"),
  });
  const userId = user._id.toString();
  await ensureUserBootstrap(userId);
  return userId;
}

describe("Self Wallet Financial Ledger Scenarios", () => {
  it("Scenarios 1-6: Initial accounts, balances, expenses, loans, repayments, and separate bank interest", async () => {
    const userId = await createTestUser();

    // Scenario 1: Initial accounts (Cash auto-created, DBBL Bank, John Custom)
    const initialAccounts = await listAccounts(userId);
    const cash = initialAccounts.find((a) => a.category === "CASH" && a.isDefault)!;
    expect(cash).toBeDefined();
    expect(cash.name).toBe("Cash");
    expect(cash.currentMainBalance).toBe("0.00");

    // Cannot delete default Cash account
    await expect(deleteOrArchiveAccount(userId, cash.id)).rejects.toThrow(
      /default Cash/i,
    );

    const { account: dbbl } = await createAccount(userId, {
      name: "DBBL",
      category: "BANK",
      bankName: "Dutch-Bangla Bank",
      accountNumber: "1234567890",
      interestEnabled: true,
    });
    expect(dbbl.accountNumberMasked).toBe("•••• 7890");

    const { account: john } = await createAccount(userId, {
      name: "John",
      category: "CUSTOM",
    });
    expect(john.currentMainBalance).toBe("0.00");

    // Custom account must NOT appear in dashboard wallet account cards
    let summary = await getDashboardSummary(userId, "MONTH");
    expect(summary.walletAccounts.map((a) => a.name)).toEqual(["Cash", "DBBL"]);
    expect(summary.walletAccounts.some((a) => a.id === john.id)).toBe(false);

    // Scenario 2: Add 1000 to DBBL, 500 to Cash
    await createTransaction(userId, {
      type: "ADD_BALANCE",
      amount: "1000",
      toAccountId: dbbl.id,
      toBalanceType: "MAIN",
    });
    await createTransaction(userId, {
      type: "ADD_BALANCE",
      amount: "500",
      toAccountId: cash.id,
    });

    summary = await getDashboardSummary(userId, "MONTH");
    expect(summary.totalCash).toBe("500.00");
    expect(summary.totalBankBalance).toBe("1000.00");
    expect(summary.totalAssets).toBe("1500.00");

    // Scenario 3: Spend 200 from DBBL
    const cats = await listCategoriesWithStats(userId);
    const foodCat = cats.find((c) => c.name === "Food")!;
    await createTransaction(userId, {
      type: "EXPENSE",
      amount: "200",
      fromAccountId: dbbl.id,
      fromBalanceType: "MAIN",
      expenseCategoryId: foodCat.id,
      description: "Lunch",
    });

    const dbblAfterExp = await getAccountOverview(userId, dbbl.id);
    expect(dbblAfterExp.account.currentMainBalance).toBe("800.00");
    expect(dbblAfterExp.stats.totalExpenses).toBe("200.00");

    // Used category deletion MUST be prevented
    await expect(deleteCategory(userId, foodCat.id)).rejects.toThrow(
      /existing transaction/i,
    );

    // Unused category deletion MUST succeed
    const { category: tempCat } = await createCategory(userId, {
      name: "Temporary",
    });
    const delCatRes = await deleteCategory(userId, tempCat.id);
    expect(delCatRes.deletedId).toBe(tempCat.id);

    // Scenario 4: John (0 balance) lends 700 into Cash
    const loanRes = await createTransaction(userId, {
      type: "LOAN_RECEIVED",
      amount: "700",
      fromAccountId: john.id,
      toAccountId: cash.id,
      description: "Emergency loan from John",
    });
    expect(loanRes.loan?.outstandingAmount).toBe("700.00");

    const cashAfterLoan = await getAccountOverview(userId, cash.id);
    const johnAfterLoan = await getAccountOverview(userId, john.id);
    expect(cashAfterLoan.account.currentMainBalance).toBe("1200.00");
    expect(johnAfterLoan.account.currentMainBalance).toBe("0.00");

    // Scenario 5: Repay John 200 from Cash; prevent overpayment
    await createTransaction(userId, {
      type: "LOAN_REPAYMENT",
      amount: "200",
      loanId: loanRes.loan!.id,
      fromAccountId: cash.id,
    });

    const cashAfterRepay = await getAccountOverview(userId, cash.id);
    expect(cashAfterRepay.account.currentMainBalance).toBe("1000.00");

    const loansInfo = await listLoansWithPeople(userId, { loanType: "RECEIVED" });
    expect(loansInfo.totals.totalReceivedOutstanding).toBe("500.00");
    expect(loansInfo.loans[0].status).toBe("PARTIALLY_REPAID");

    // Prevent overpayment (> 500)
    await expect(
      createTransaction(userId, {
        type: "LOAN_REPAYMENT",
        amount: "600",
        loanId: loanRes.loan!.id,
        fromAccountId: cash.id,
      }),
    ).rejects.toThrow(/exceed outstanding/i);

    // Scenario 6: Bank interest separation (add 200 to main -> 1000, add 500 interest, spend 200 from interest)
    await createTransaction(userId, {
      type: "ADD_BALANCE",
      amount: "200",
      toAccountId: dbbl.id,
      toBalanceType: "MAIN",
    });
    await createTransaction(userId, {
      type: "BANK_INTEREST",
      amount: "500",
      toAccountId: dbbl.id,
    });

    let dbblInt = await getAccountOverview(userId, dbbl.id);
    expect(dbblInt.account.currentMainBalance).toBe("1000.00");
    expect(dbblInt.account.currentInterestBalance).toBe("500.00");
    expect(dbblInt.account.totalBalance).toBe("1500.00");

    await createTransaction(userId, {
      type: "EXPENSE",
      amount: "200",
      fromAccountId: dbbl.id,
      fromBalanceType: "INTEREST",
      expenseCategoryId: foodCat.id,
      description: "Paid from interest",
    });

    dbblInt = await getAccountOverview(userId, dbbl.id);
    expect(dbblInt.account.currentMainBalance).toBe("1000.00");
    expect(dbblInt.account.currentInterestBalance).toBe("300.00");
    expect(dbblInt.account.totalBalance).toBe("1300.00");

    // Spending 400 from INTEREST when only 300 available MUST fail even though Main has 1000
    await expect(
      createTransaction(userId, {
        type: "EXPENSE",
        amount: "400",
        fromAccountId: dbbl.id,
        fromBalanceType: "INTEREST",
        expenseCategoryId: foodCat.id,
      }),
    ).rejects.toThrow(/Insufficient interest balance/i);
  });

  it("enforces Loan Given, Transfers, Idempotency, Concurrency, Edit & Delete ledger consistency", async () => {
    const userId = await createTestUser("conc@example.com");
    const accounts = await listAccounts(userId);
    const cash = accounts.find((a) => a.isDefault)!;
    const { account: alex } = await createAccount(userId, {
      name: "Alex",
      category: "CUSTOM",
    });
    const { account: brac } = await createAccount(userId, {
      name: "BRAC Bank",
      category: "BANK",
      interestEnabled: false,
    });
    const cats = await listCategoriesWithStats(userId);
    const transport = cats.find((c) => c.name === "Transport")!;

    // Cannot use INTEREST bucket on a bank with interestEnabled = false
    await expect(
      createTransaction(userId, {
        type: "ADD_BALANCE",
        amount: "100",
        toAccountId: brac.id,
        toBalanceType: "INTEREST",
      }),
    ).rejects.toThrow(/not enabled/i);

    await createTransaction(userId, {
      type: "ADD_BALANCE",
      amount: "1000",
      toAccountId: cash.id,
    });

    // Loan Given to Alex (1000? Let's lend 400)
    const givenRes = await createTransaction(userId, {
      type: "LOAN_GIVEN",
      amount: "400",
      fromAccountId: cash.id,
      toAccountId: alex.id,
    });
    expect(givenRes.loan?.loanType).toBe("GIVEN");
    expect((await getAccountOverview(userId, cash.id)).account.totalBalance).toBe("600.00");
    expect((await getAccountOverview(userId, alex.id)).account.totalBalance).toBe("0.00");

    // Alex repays 150 into BRAC Bank
    await createTransaction(userId, {
      type: "LOAN_REPAYMENT",
      amount: "150",
      loanId: givenRes.loan!.id,
      toAccountId: brac.id,
    });
    expect((await getAccountOverview(userId, brac.id)).account.totalBalance).toBe("150.00");

    // Duplicate API idempotency test (parallel calls with same clientTransactionId)
    const idempKey = "same-client-tx-id-001";
    const [r1, r2] = await Promise.all([
      createTransaction(userId, {
        clientTransactionId: idempKey,
        type: "EXPENSE",
        amount: "100",
        fromAccountId: cash.id,
        expenseCategoryId: transport.id,
      }),
      createTransaction(userId, {
        clientTransactionId: idempKey,
        type: "EXPENSE",
        amount: "100",
        fromAccountId: cash.id,
        expenseCategoryId: transport.id,
      }),
    ]);
    expect(r1.transaction.id).toBe(r2.transaction.id);
    expect(r1.duplicate || r2.duplicate).toBe(true);
    expect((await getAccountOverview(userId, cash.id)).account.totalBalance).toBe("500.00");

    // Concurrent overdraft protection: two simultaneous 400 expenses on 500 balance
    const results = await Promise.allSettled([
      createTransaction(userId, {
        type: "EXPENSE",
        amount: "400",
        fromAccountId: cash.id,
        expenseCategoryId: transport.id,
      }),
      createTransaction(userId, {
        type: "EXPENSE",
        amount: "400",
        fromAccountId: cash.id,
        expenseCategoryId: transport.id,
      }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((await getAccountOverview(userId, cash.id)).account.totalBalance).toBe("100.00");

    // Editing that 400 expense to 250 updates Cash from 100 -> 250
    const succeededTx = (fulfilled[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof createTransaction>>>).value.transaction;
    await updateTransaction(userId, succeededTx.id, { amount: "250" });
    expect((await getAccountOverview(userId, cash.id)).account.totalBalance).toBe("250.00");

    // Deleting a loan with repayments must fail
    await expect(
      deleteTransaction(userId, givenRes.transaction.id),
    ).rejects.toThrow(/repayments are already recorded/i);

    // Deleting the 250 expense reverses Cash back to 500
    await deleteTransaction(userId, succeededTx.id);
    expect((await getAccountOverview(userId, cash.id)).account.totalBalance).toBe("500.00");

    // User isolation check: User B cannot delete User A's accounts or transactions
    const userB = await createTestUser("other@example.com");
    await expect(deleteTransaction(userB, givenRes.transaction.id)).rejects.toThrow(
      /not found/i,
    );
    await expect(getAccountOverview(userB, brac.id)).rejects.toThrow(
      /not found/i,
    );

    // Export & duplicate-safe import check
    const exported = await exportUserData(userId, "json");
    const parsedBackup = JSON.parse(exported.content);
    const import1 = await importUserBackup(userId, parsedBackup);
    expect(import1.importedTransactions).toBe(0);
    expect(import1.skippedDuplicates).toBe(parsedBackup.transactions.length);

    // Import into brand-new User C restores everything cleanly
    const userC = await createTestUser("restore@example.com");
    const importC = await importUserBackup(userC, parsedBackup);
    expect(importC.importedTransactions).toBe(parsedBackup.transactions.length);
    const summaryC = await getDashboardSummary(userC, "MONTH");
    expect(summaryC.totalCash).toBe("500.00");
    expect(summaryC.totalBankBalance).toBe("150.00");

    void AccountModel;
    void ExpenseCategoryModel;
    void LoanModel;
    void TransactionModel;
  });
});
