import mongoose from "mongoose";
import {
  ExpenseCategoryModel,
  type IExpenseCategory,
} from "@/lib/db/models/ExpenseCategory";
import { TransactionModel } from "@/lib/db/models/Transaction";
import { AppError, isMongoDuplicateKeyError } from "@/lib/errors";
import { addMoney, toMoneyString } from "@/lib/money";
import { serializeCategory } from "@/lib/services/serializers";
import type { ExpenseCategoryDTO } from "@/lib/types";

export interface CategoryWithStatsDTO extends ExpenseCategoryDTO {
  transactionCount: number;
  totalSpent: string;
}

export async function listCategoriesWithStats(
  userId: string,
): Promise<CategoryWithStatsDTO[]> {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const [cats, expenseTxs] = await Promise.all([
    ExpenseCategoryModel.find({ userId: userObjectId })
      .sort({ isDefault: -1, name: 1 })
      .lean(),
    TransactionModel.find({
      userId: userObjectId,
      isDeleted: false,
      type: "EXPENSE",
      expenseCategoryId: { $ne: null },
    })
      .select("expenseCategoryId amount")
      .lean(),
  ]);

  const statsMap = new Map<string, { count: number; total: string }>();
  for (const tx of expenseTxs) {
    const catId = tx.expenseCategoryId?.toString();
    if (!catId) continue;
    const prev = statsMap.get(catId) ?? { count: 0, total: "0.00" };
    statsMap.set(catId, {
      count: prev.count + 1,
      total: addMoney(prev.total, toMoneyString(tx.amount)),
    });
  }

  return (cats as unknown as IExpenseCategory[]).map((cat) => {
    const base = serializeCategory(cat);
    const stat = statsMap.get(base.id) ?? { count: 0, total: "0.00" };
    return {
      ...base,
      transactionCount: stat.count,
      totalSpent: stat.total,
    };
  });
}

export async function createCategory(
  userId: string,
  input: { clientId?: string; name: string; icon?: string; color?: string },
): Promise<{ category: ExpenseCategoryDTO; duplicate: boolean }> {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const name = input.name.trim();
  const nameLower = name.toLowerCase();

  if (input.clientId) {
    const byClient = await ExpenseCategoryModel.findOne({
      userId: userObjectId,
      clientId: input.clientId,
    }).lean();
    if (byClient) {
      return {
        category: serializeCategory(byClient as unknown as IExpenseCategory),
        duplicate: true,
      };
    }
  }

  const existingName = await ExpenseCategoryModel.findOne({
    userId: userObjectId,
    nameLower,
  }).lean();
  if (existingName) {
    if (input.clientId) {
      return {
        category: serializeCategory(
          existingName as unknown as IExpenseCategory,
        ),
        duplicate: true,
      };
    }
    throw new AppError(
      409,
      "DUPLICATE_CATEGORY",
      `Category "${name}" already exists.`,
    );
  }

  try {
    const created = await ExpenseCategoryModel.create({
      userId: userObjectId,
      clientId: input.clientId?.trim() || undefined,
      name,
      nameLower,
      icon: input.icon?.trim() || "tag",
      color: input.color?.trim() || "#64748B",
      isDefault: false,
    });
    return { category: serializeCategory(created), duplicate: false };
  } catch (err) {
    if (isMongoDuplicateKeyError(err)) {
      if (input.clientId) {
        const byClient = await ExpenseCategoryModel.findOne({
          userId: userObjectId,
          clientId: input.clientId,
        }).lean();
        if (byClient) {
          return {
            category: serializeCategory(
              byClient as unknown as IExpenseCategory,
            ),
            duplicate: true,
          };
        }
      }
      throw new AppError(
        409,
        "DUPLICATE_CATEGORY",
        `Category "${name}" already exists.`,
      );
    }
    throw err;
  }
}

export async function updateCategory(
  userId: string,
  categoryId: string,
  input: { name?: string; icon?: string; color?: string },
): Promise<ExpenseCategoryDTO> {
  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    throw new AppError(400, "INVALID_ID", "Invalid category ID.");
  }
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const cat = await ExpenseCategoryModel.findOne({
    _id: new mongoose.Types.ObjectId(categoryId),
    userId: userObjectId,
  });
  if (!cat) {
    throw new AppError(404, "CATEGORY_NOT_FOUND", "Category not found.");
  }

  if (input.name !== undefined) {
    const nextName = input.name.trim();
    const nextLower = nextName.toLowerCase();
    const collision = await ExpenseCategoryModel.findOne({
      userId: userObjectId,
      nameLower: nextLower,
      _id: { $ne: cat._id },
    }).lean();
    if (collision) {
      throw new AppError(
        409,
        "DUPLICATE_CATEGORY",
        `Category "${nextName}" already exists.`,
      );
    }
    cat.name = nextName;
    cat.nameLower = nextLower;
  }

  if (input.icon !== undefined) cat.icon = input.icon.trim();
  if (input.color !== undefined) cat.color = input.color.trim();

  await cat.save();
  return serializeCategory(cat);
}

export async function deleteCategory(
  userId: string,
  categoryId: string,
): Promise<{ deletedId: string }> {
  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    throw new AppError(400, "INVALID_ID", "Invalid category ID.");
  }
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const catObjId = new mongoose.Types.ObjectId(categoryId);

  const cat = await ExpenseCategoryModel.findOne({
    _id: catObjId,
    userId: userObjectId,
  });
  if (!cat) {
    throw new AppError(404, "CATEGORY_NOT_FOUND", "Category not found.");
  }

  const usedCount = await TransactionModel.countDocuments({
    userId: userObjectId,
    expenseCategoryId: catObjId,
    isDeleted: false,
  });

  if (usedCount > 0) {
    throw new AppError(
      400,
      "CATEGORY_IN_USE",
      `Cannot delete "${cat.name}" because it is assigned to ${usedCount} existing transaction${usedCount === 1 ? "" : "s"}. Historical transaction categories cannot be deleted or silently reassigned.`,
    );
  }

  await ExpenseCategoryModel.deleteOne({ _id: catObjId, userId: userObjectId });
  return { deletedId: categoryId };
}
