import mongoose, { Schema, type Document, type Model } from "mongoose";
import { ACCOUNT_CATEGORIES, type AccountCategory } from "@/lib/constants";

export interface IAccount extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  clientId?: string;
  name: string;
  category: AccountCategory;
  bankName?: string;
  encryptedAccountNumber?: string;
  accountNumberMasked?: string;
  initialMainBalance: mongoose.Types.Decimal128;
  currentMainBalance: mongoose.Types.Decimal128;
  initialInterestBalance: mongoose.Types.Decimal128;
  currentInterestBalance: mongoose.Types.Decimal128;
  interestEnabled: boolean;
  description: string;
  isDefault: boolean;
  isArchived: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const AccountSchema = new Schema<IAccount>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    clientId: {
      type: String,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    category: {
      type: String,
      enum: ACCOUNT_CATEGORIES,
      required: true,
    },
    bankName: {
      type: String,
      trim: true,
      maxlength: 80,
    },
    encryptedAccountNumber: {
      type: String,
    },
    accountNumberMasked: {
      type: String,
      maxlength: 32,
    },
    initialMainBalance: {
      type: Schema.Types.Decimal128,
      required: true,
      default: () => mongoose.Types.Decimal128.fromString("0.00"),
    },
    currentMainBalance: {
      type: Schema.Types.Decimal128,
      required: true,
      default: () => mongoose.Types.Decimal128.fromString("0.00"),
    },
    initialInterestBalance: {
      type: Schema.Types.Decimal128,
      required: true,
      default: () => mongoose.Types.Decimal128.fromString("0.00"),
    },
    currentInterestBalance: {
      type: Schema.Types.Decimal128,
      required: true,
      default: () => mongoose.Types.Decimal128.fromString("0.00"),
    },
    interestEnabled: {
      type: Boolean,
      required: true,
      default: false,
    },
    description: {
      type: String,
      default: "",
      maxlength: 300,
    },
    isDefault: {
      type: Boolean,
      required: true,
      default: false,
    },
    isArchived: {
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
    collection: "accounts",
  },
);

AccountSchema.index({ userId: 1, isArchived: 1, category: 1 });
AccountSchema.index({ userId: 1, isDefault: 1 });
AccountSchema.index(
  { userId: 1, clientId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientId: { $type: "string" } },
  },
);

export const AccountModel: Model<IAccount> =
  mongoose.models.Account || mongoose.model<IAccount>("Account", AccountSchema);
