import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
  LOAN_STATUSES,
  LOAN_TYPES,
  type LoanStatus,
  type LoanType,
} from "@/lib/constants";

export interface ILoan extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  clientLoanId?: string;
  loanType: LoanType;
  counterpartyAccountId: mongoose.Types.ObjectId;
  originalAmount: mongoose.Types.Decimal128;
  totalRepaid: mongoose.Types.Decimal128;
  outstandingAmount: mongoose.Types.Decimal128;
  receivingOrDisbursingAccountId: mongoose.Types.ObjectId;
  originTransactionId: mongoose.Types.ObjectId;
  transactionIds: mongoose.Types.ObjectId[];
  loanDate: Date;
  latestRepaymentDate: Date | null;
  status: LoanStatus;
  isDeleted: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const LoanSchema = new Schema<ILoan>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    clientLoanId: {
      type: String,
      trim: true,
    },
    loanType: {
      type: String,
      enum: LOAN_TYPES,
      required: true,
    },
    counterpartyAccountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    originalAmount: {
      type: Schema.Types.Decimal128,
      required: true,
    },
    totalRepaid: {
      type: Schema.Types.Decimal128,
      required: true,
      default: () => mongoose.Types.Decimal128.fromString("0.00"),
    },
    outstandingAmount: {
      type: Schema.Types.Decimal128,
      required: true,
    },
    receivingOrDisbursingAccountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    originTransactionId: {
      type: Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
    },
    transactionIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Transaction",
      },
    ],
    loanDate: {
      type: Date,
      required: true,
    },
    latestRepaymentDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: LOAN_STATUSES,
      required: true,
      default: "OUTSTANDING",
    },
    isDeleted: {
      type: Boolean,
      required: true,
      default: false,
    },
    version: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: "loans",
  },
);

LoanSchema.index({ userId: 1, isDeleted: 1, loanType: 1, status: 1 });
LoanSchema.index({
  userId: 1,
  isDeleted: 1,
  counterpartyAccountId: 1,
  loanDate: -1,
});
LoanSchema.index({ userId: 1, originTransactionId: 1 });
LoanSchema.index(
  { userId: 1, clientLoanId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientLoanId: { $type: "string" } },
  },
);

export const LoanModel: Model<ILoan> =
  mongoose.models.Loan || mongoose.model<ILoan>("Loan", LoanSchema);
