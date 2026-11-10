import mongoose from "mongoose";
import type { LoanType } from "@/lib/constants";
import { AccountModel, type IAccount } from "@/lib/db/models/Account";
import { LoanModel, type ILoan } from "@/lib/db/models/Loan";
import {
  TransactionModel,
  type ITransaction,
} from "@/lib/db/models/Transaction";
import { AppError } from "@/lib/errors";
import { addMoney, toMoneyString } from "@/lib/money";
import {
  serializeAccount,
  serializeLoan,
  serializeTransaction,
} from "@/lib/services/serializers";
import type { AccountDTO, LoanDTO, TransactionDTO } from "@/lib/types";

export interface PersonLoanSummary {
  counterparty: AccountDTO;
  loanType: LoanType;
  totalPrincipal: string;
  totalRepaid: string;
  outstandingAmount: string;
  loanCount: number;
  loans: LoanDTO[];
  timeline: Array<{
    transaction: TransactionDTO;
    loanId: string;
    activity: "LOAN_RECEIVED" | "LOAN_GIVEN" | "REPAYMENT";
  }>;
}

export async function listLoansWithPeople(
  userId: string,
  filters?: { loanType?: LoanType; counterpartyAccountId?: string },
): Promise<{
  loans: LoanDTO[];
  peopleSummaries: PersonLoanSummary[];
  totals: {
    totalReceivedOutstanding: string;
    totalGivenOutstanding: string;
  };
}> {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const query: Record<string, unknown> = {
    userId: userObjectId,
    isDeleted: false,
  };
  if (filters?.loanType) {
    query.loanType = filters.loanType;
  }
  if (
    filters?.counterpartyAccountId &&
    mongoose.Types.ObjectId.isValid(filters.counterpartyAccountId)
  ) {
    query.counterpartyAccountId = new mongoose.Types.ObjectId(
      filters.counterpartyAccountId,
    );
  }

  const [loanDocs, accountDocs, loanTxDocs] = await Promise.all([
    LoanModel.find(query).sort({ loanDate: -1, createdAt: -1 }).lean(),
    AccountModel.find({ userId: userObjectId }).lean(),
    TransactionModel.find({
      userId: userObjectId,
      isDeleted: false,
      type: { $in: ["LOAN_RECEIVED", "LOAN_GIVEN", "LOAN_REPAYMENT"] },
    })
      .sort({ transactionDate: 1, createdAt: 1 })
      .lean(),
  ]);

  const accountMap = new Map<string, AccountDTO>();
  for (const a of accountDocs as unknown as IAccount[]) {
    const serialized = serializeAccount(a);
    accountMap.set(serialized.id, serialized);
  }

  const loans = (loanDocs as unknown as ILoan[]).map(serializeLoan);
  const txByLoanId = new Map<string, TransactionDTO[]>();
  for (const rawTx of loanTxDocs as unknown as ITransaction[]) {
    const tx = serializeTransaction(rawTx);
    if (!tx.loanId) continue;
    const arr = txByLoanId.get(tx.loanId) ?? [];
    arr.push(tx);
    txByLoanId.set(tx.loanId, arr);
  }

  let totalReceivedOutstanding = "0.00";
  let totalGivenOutstanding = "0.00";

  const summaryMap = new Map<string, PersonLoanSummary>();

  for (const loan of loans) {
    if (loan.loanType === "RECEIVED") {
      totalReceivedOutstanding = addMoney(
        totalReceivedOutstanding,
        loan.outstandingAmount,
      );
    } else {
      totalGivenOutstanding = addMoney(
        totalGivenOutstanding,
        loan.outstandingAmount,
      );
    }

    const key = `${loan.loanType}:${loan.counterpartyAccountId}`;
    const counterparty = accountMap.get(loan.counterpartyAccountId);
    if (!counterparty) continue;

    let group = summaryMap.get(key);
    if (!group) {
      group = {
        counterparty,
        loanType: loan.loanType,
        totalPrincipal: "0.00",
        totalRepaid: "0.00",
        outstandingAmount: "0.00",
        loanCount: 0,
        loans: [],
        timeline: [],
      };
      summaryMap.set(key, group);
    }

    group.totalPrincipal = addMoney(group.totalPrincipal, loan.originalAmount);
    group.totalRepaid = addMoney(group.totalRepaid, loan.totalRepaid);
    group.outstandingAmount = addMoney(
      group.outstandingAmount,
      loan.outstandingAmount,
    );
    group.loanCount += 1;
    group.loans.push(loan);

    const linkedTxs = txByLoanId.get(loan.id) ?? [];
    for (const tx of linkedTxs) {
      group.timeline.push({
        transaction: tx,
        loanId: loan.id,
        activity:
          tx.type === "LOAN_REPAYMENT"
            ? "REPAYMENT"
            : tx.type === "LOAN_RECEIVED"
              ? "LOAN_RECEIVED"
              : "LOAN_GIVEN",
      });
    }
  }

  const peopleSummaries = Array.from(summaryMap.values()).map((g) => ({
    ...g,
    timeline: g.timeline.sort(
      (a, b) =>
        new Date(b.transaction.transactionDate).getTime() -
        new Date(a.transaction.transactionDate).getTime(),
    ),
  }));

  return {
    loans,
    peopleSummaries,
    totals: {
      totalReceivedOutstanding,
      totalGivenOutstanding,
    },
  };
}

export async function getLoanDetail(
  userId: string,
  loanId: string,
): Promise<{
  loan: LoanDTO;
  counterparty: AccountDTO | null;
  transactions: TransactionDTO[];
}> {
  if (!mongoose.Types.ObjectId.isValid(loanId)) {
    throw new AppError(400, "INVALID_ID", "Invalid loan ID.");
  }
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const loanObjId = new mongoose.Types.ObjectId(loanId);

  const loan = await LoanModel.findOne({
    _id: loanObjId,
    userId: userObjectId,
    isDeleted: false,
  }).lean();
  if (!loan) {
    throw new AppError(404, "LOAN_NOT_FOUND", "Loan not found.");
  }

  const [counterpartyDoc, txDocs] = await Promise.all([
    AccountModel.findOne({
      _id: loan.counterpartyAccountId,
      userId: userObjectId,
    }).lean(),
    TransactionModel.find({
      userId: userObjectId,
      loanId: loanObjId,
      isDeleted: false,
    })
      .sort({ transactionDate: 1, createdAt: 1 })
      .lean(),
  ]);

  return {
    loan: serializeLoan(loan as unknown as ILoan),
    counterparty: counterpartyDoc
      ? serializeAccount(counterpartyDoc as unknown as IAccount)
      : null,
    transactions: (txDocs as unknown as ITransaction[]).map(
      serializeTransaction,
    ),
  };
}

export function computeLoanTotalsFromList(loans: LoanDTO[]): {
  receivedOutstanding: string;
  givenOutstanding: string;
} {
  let receivedOutstanding = "0.00";
  let givenOutstanding = "0.00";
  for (const loan of loans) {
    if (loan.isDeleted) continue;
    if (loan.loanType === "RECEIVED") {
      receivedOutstanding = addMoney(
        receivedOutstanding,
        toMoneyString(loan.outstandingAmount),
      );
    } else {
      givenOutstanding = addMoney(
        givenOutstanding,
        toMoneyString(loan.outstandingAmount),
      );
    }
  }
  return { receivedOutstanding, givenOutstanding };
}
