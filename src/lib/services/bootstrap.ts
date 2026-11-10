import mongoose, { type ClientSession } from "mongoose";
import { DEFAULT_EXPENSE_CATEGORIES } from "@/lib/constants";
import { AccountModel } from "@/lib/db/models/Account";
import { ExpenseCategoryModel } from "@/lib/db/models/ExpenseCategory";
import { SettingsModel } from "@/lib/db/models/Settings";

/**
 * Ensures every user automatically has:
 * 1. A default non-deletable Cash account (balance 0.00).
 * 2. Default expense categories (seeded once if user has none).
 * 3. Default Settings document.
 */
export async function ensureUserBootstrap(
  userId: string,
  session: ClientSession | null = null,
): Promise<void> {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const opt = session ? { session } : {};

  // 1. Ensure default Cash account exists (idempotent)
  const existingCash = await AccountModel.findOne(
    { userId: userObjectId, isDefault: true, category: "CASH" },
    null,
    opt,
  );

  if (!existingCash) {
    try {
      await AccountModel.create(
        [
          {
            userId: userObjectId,
            name: "Cash",
            category: "CASH",
            initialMainBalance: mongoose.Types.Decimal128.fromString("0.00"),
            currentMainBalance: mongoose.Types.Decimal128.fromString("0.00"),
            initialInterestBalance:
              mongoose.Types.Decimal128.fromString("0.00"),
            currentInterestBalance:
              mongoose.Types.Decimal128.fromString("0.00"),
            interestEnabled: false,
            description: "Default cash wallet",
            isDefault: true,
            isArchived: false,
            version: 0,
          },
        ],
        opt,
      );
    } catch {
      // Safe against concurrent bootstrap race
    }
  }

  // 2. Ensure default Expense Categories exist if none created yet
  const categoryCount = await ExpenseCategoryModel.countDocuments({
    userId: userObjectId,
  }).session(session);

  if (categoryCount === 0) {
    for (const seed of DEFAULT_EXPENSE_CATEGORIES) {
      await ExpenseCategoryModel.updateOne(
        { userId: userObjectId, nameLower: seed.name.toLowerCase() },
        {
          $setOnInsert: {
            userId: userObjectId,
            name: seed.name,
            nameLower: seed.name.toLowerCase(),
            icon: seed.icon,
            color: seed.color,
            isDefault: true,
          },
        },
        { upsert: true, ...(session ? { session } : {}) },
      );
    }
  }

  // 3. Ensure default Settings exist
  await SettingsModel.updateOne(
    { userId: userObjectId },
    {
      $setOnInsert: {
        userId: userObjectId,
        currencyCode: "BDT",
        currencySymbol: "৳",
        dateFormat: "DD MMM YYYY",
        theme: "system",
        defaultDashboardRange: "MONTH",
      },
    },
    { upsert: true, ...(session ? { session } : {}) },
  );
}
