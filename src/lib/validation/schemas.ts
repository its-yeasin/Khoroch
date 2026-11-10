import { z } from "zod";
import {
  ACCOUNT_CATEGORIES,
  ADJUSTMENT_DIRECTIONS,
  BALANCE_TYPES,
  DATE_FORMATS,
  THEME_OPTIONS,
  TRANSACTION_TYPES,
} from "@/lib/constants";

const moneyAmountSchema = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), {
    message: "Amount must be a valid non-negative number with up to 2 decimal places.",
  });

const positiveMoneySchema = moneyAmountSchema.refine((v) => Number(v) > 0, {
  message: "Amount must be greater than zero.",
});

const optionalIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .nullable()
  .optional();

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Enter a valid email address").max(254),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required").max(128),
});

export const createAccountSchema = z.object({
  clientId: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1, "Account name is required").max(80),
  category: z.enum(ACCOUNT_CATEGORIES),
  bankName: z.string().trim().max(80).optional(),
  accountNumber: z.string().trim().max(40).optional(),
  initialMainBalance: moneyAmountSchema.default("0.00"),
  initialInterestBalance: moneyAmountSchema.default("0.00"),
  interestEnabled: z.boolean().default(false),
  description: z.string().trim().max(300).default(""),
});

export const updateAccountSchema = z.object({
  name: z.string().trim().min(1, "Account name is required").max(80).optional(),
  bankName: z.string().trim().max(80).optional(),
  accountNumber: z.string().trim().max(40).optional(),
  interestEnabled: z.boolean().optional(),
  description: z.string().trim().max(300).optional(),
  isArchived: z.boolean().optional(),
});

export const createCategorySchema = z.object({
  clientId: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1, "Category name is required").max(60),
  icon: z.string().trim().min(1).max(40).default("tag"),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a 6-digit hex code")
    .default("#64748B"),
});

export const updateCategorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required").max(60).optional(),
  icon: z.string().trim().min(1).max(40).optional(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a 6-digit hex code")
    .optional(),
});

export const createTransactionSchema = z.object({
  clientTransactionId: z.string().trim().min(1).max(80).optional(),
  clientLoanId: z.string().trim().min(1).max(80).optional(),
  type: z.enum(TRANSACTION_TYPES),
  amount: positiveMoneySchema,
  fromAccountId: optionalIdSchema,
  toAccountId: optionalIdSchema,
  fromBalanceType: z.enum(BALANCE_TYPES).nullable().optional(),
  toBalanceType: z.enum(BALANCE_TYPES).nullable().optional(),
  expenseCategoryId: optionalIdSchema,
  loanId: optionalIdSchema,
  adjustmentDirection: z.enum(ADJUSTMENT_DIRECTIONS).nullable().optional(),
  description: z.string().trim().max(200).default(""),
  note: z.string().trim().max(1000).default(""),
  attachmentName: z.string().trim().max(160).optional(),
  attachmentDataUrl: z.string().max(300000).optional(),
  transactionDate: z.string().datetime().or(z.string().min(4)).optional(),
});

export const updateTransactionSchema = z.object({
  type: z.enum(TRANSACTION_TYPES).optional(),
  amount: positiveMoneySchema.optional(),
  fromAccountId: optionalIdSchema,
  toAccountId: optionalIdSchema,
  fromBalanceType: z.enum(BALANCE_TYPES).nullable().optional(),
  toBalanceType: z.enum(BALANCE_TYPES).nullable().optional(),
  expenseCategoryId: optionalIdSchema,
  loanId: optionalIdSchema,
  adjustmentDirection: z.enum(ADJUSTMENT_DIRECTIONS).nullable().optional(),
  description: z.string().trim().max(200).optional(),
  note: z.string().trim().max(1000).optional(),
  transactionDate: z.string().min(4).optional(),
});

export const updateSettingsSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  currencyCode: z.string().trim().min(1).max(10).optional(),
  currencySymbol: z.string().trim().min(1).max(8).optional(),
  dateFormat: z.enum(DATE_FORMATS).optional(),
  theme: z.enum(THEME_OPTIONS).optional(),
  defaultDashboardRange: z.enum(["TODAY", "WEEK", "MONTH", "YEAR"]).optional(),
});

export const syncBatchSchema = z.object({
  operations: z
    .array(
      z.object({
        opId: z.string().trim().min(1).max(80),
        opType: z.enum([
          "CREATE_ACCOUNT",
          "CREATE_CATEGORY",
          "CREATE_TRANSACTION",
          "UPDATE_TRANSACTION",
          "DELETE_TRANSACTION",
        ]),
        clientEntityId: z.string().trim().min(1).max(80),
        payload: z.record(z.string(), z.unknown()),
        createdAt: z.string(),
      }),
    )
    .max(200),
});
