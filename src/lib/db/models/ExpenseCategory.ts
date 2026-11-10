import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IExpenseCategory extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  clientId?: string;
  name: string;
  nameLower: string;
  icon: string;
  color: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ExpenseCategorySchema = new Schema<IExpenseCategory>(
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
      maxlength: 60,
    },
    nameLower: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    icon: {
      type: String,
      required: true,
      default: "tag",
    },
    color: {
      type: String,
      required: true,
      default: "#64748B",
    },
    isDefault: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  {
    timestamps: true,
    collection: "expense_categories",
  },
);

ExpenseCategorySchema.index({ userId: 1, nameLower: 1 }, { unique: true });
ExpenseCategorySchema.index(
  { userId: 1, clientId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientId: { $type: "string" } },
  },
);

export const ExpenseCategoryModel: Model<IExpenseCategory> =
  mongoose.models.ExpenseCategory ||
  mongoose.model<IExpenseCategory>("ExpenseCategory", ExpenseCategorySchema);
