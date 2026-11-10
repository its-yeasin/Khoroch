import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
  ADJUSTMENT_DIRECTIONS,
  BALANCE_TYPES,
  TRANSACTION_TYPES,
  type AdjustmentDirection,
  type BalanceType,
  type TransactionType,
} from "@/lib/constants";

export interface ITransaction extends Document {
  _id: mongoose.Types.ObjectId;
  clientTransactionId: string;
  userId: mongoose.Types.ObjectId;
  type: TransactionType;
  amount: mongoose.Types.Decimal128;
  fromAccountId: mongoose.Types.ObjectId | null;
  toAccountId: mongoose.Types.ObjectId | null;
  fromBalanceType: BalanceType | null;
  toBalanceType: BalanceType | null;
  expenseCategoryId: mongoose.Types.ObjectId | null;
  loanId: mongoose.Types.ObjectId | null;
  adjustmentDirection: AdjustmentDirection | null;
  description: string;
  note: string;
  attachmentName?: string;
  attachmentDataUrl?: string;
  transactionDate: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    clientTransactionId: {
      type: String,
      required: true,
      trim: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: TRANSACTION_TYPES,
      required: true,
    },
    amount: {
      type: Schema.Types.Decimal128,
      required: true,
    },
    fromAccountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },
    toAccountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },
    fromBalanceType: {
      type: String,
      enum: [...BALANCE_TYPES, null],
      default: null,
    },
    toBalanceType: {
      type: String,
      enum: [...BALANCE_TYPES, null],
      default: null,
    },
    expenseCategoryId: {
      type: Schema.Types.ObjectId,
      ref: "ExpenseCategory",
      default: null,
    },
    loanId: {
      type: Schema.Types.ObjectId,
      ref: "Loan",
      default: null,
    },
    adjustmentDirection: {
      type: String,
      enum: [...ADJUSTMENT_DIRECTIONS, null],
      default: null,
    },
    description: {
      type: String,
      default: "",
      maxlength: 200,
    },
    note: {
      type: String,
      default: "",
      maxlength: 1000,
    },
    attachmentName: {
      type: String,
      maxlength: 160,
    },
    attachmentDataUrl: {
      type: String,
      maxlength: 300000,
    },
    transactionDate: {
      type: Date,
      required: true,
    },
    isDeleted: {
      type: Boolean,
      required: true,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: "transactions",
  },
);

TransactionSchema.index(
  { userId: 1, clientTransactionId: 1 },
  { unique: true },
);
TransactionSchema.index({
  userId: 1,
  isDeleted: 1,
  transactionDate: -1,
  createdAt: -1,
});
TransactionSchema.index({
  userId: 1,
  isDeleted: 1,
  fromAccountId: 1,
  transactionDate: -1,
});
TransactionSchema.index({
  userId: 1,
  isDeleted: 1,
  toAccountId: 1,
  transactionDate: -1,
});
TransactionSchema.index({ userId: 1, isDeleted: 1, type: 1, transactionDate: -1 });
TransactionSchema.index({ userId: 1, isDeleted: 1, expenseCategoryId: 1 });
TransactionSchema.index({ userId: 1, isDeleted: 1, loanId: 1 });

export const TransactionModel: Model<ITransaction> =
  mongoose.models.Transaction ||
  mongoose.model<ITransaction>("Transaction", TransactionSchema);
