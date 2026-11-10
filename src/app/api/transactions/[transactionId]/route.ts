import { NextResponse, type NextRequest } from "next/server";
import mongoose from "mongoose";
import { requireAuthUser } from "@/lib/auth/guard";
import {
  TransactionModel,
  type ITransaction,
} from "@/lib/db/models/Transaction";
import { AppError, handleApiError } from "@/lib/errors";
import { deleteTransaction, updateTransaction } from "@/lib/services/ledger";
import { serializeTransaction } from "@/lib/services/serializers";
import { updateTransactionSchema } from "@/lib/validation/schemas";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ transactionId: string }> },
) {
  try {
    const user = await requireAuthUser();
    const { transactionId } = await context.params;
    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      throw new AppError(400, "INVALID_ID", "Invalid transaction ID.");
    }
    const tx = await TransactionModel.findOne({
      _id: new mongoose.Types.ObjectId(transactionId),
      userId: new mongoose.Types.ObjectId(user.id),
      isDeleted: false,
    }).lean();
    if (!tx) {
      throw new AppError(
        404,
        "TRANSACTION_NOT_FOUND",
        "Transaction not found.",
      );
    }
    return NextResponse.json({
      transaction: serializeTransaction(tx as unknown as ITransaction),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ transactionId: string }> },
) {
  try {
    const user = await requireAuthUser();
    const { transactionId } = await context.params;
    const body = await request.json().catch(() => null);
    const parsed = updateTransactionSchema.parse(body);
    const transaction = await updateTransaction(
      user.id,
      transactionId,
      parsed,
    );
    return NextResponse.json({ transaction });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ transactionId: string }> },
) {
  try {
    const user = await requireAuthUser();
    const { transactionId } = await context.params;
    const result = await deleteTransaction(user.id, transactionId);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
