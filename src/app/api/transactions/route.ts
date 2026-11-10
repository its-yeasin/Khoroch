import { NextResponse, type NextRequest } from "next/server";
import { requireAuthUser } from "@/lib/auth/guard";
import { TRANSACTION_TYPES, type TransactionType } from "@/lib/constants";
import { handleApiError } from "@/lib/errors";
import { ensureUserBootstrap } from "@/lib/services/bootstrap";
import { createTransaction, listTransactions } from "@/lib/services/ledger";
import { createTransactionSchema } from "@/lib/validation/schemas";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const sp = request.nextUrl.searchParams;
    const typeParam = sp.get("type");
    const type =
      typeParam &&
      (TRANSACTION_TYPES as readonly string[]).includes(typeParam)
        ? (typeParam as TransactionType)
        : undefined;

    const result = await listTransactions(user.id, {
      accountId: sp.get("accountId") || undefined,
      categoryId: sp.get("categoryId") || undefined,
      type,
      loanId: sp.get("loanId") || undefined,
      search: sp.get("search") || undefined,
      startDate: sp.get("startDate") || undefined,
      endDate: sp.get("endDate") || undefined,
      minAmount: sp.get("minAmount") || undefined,
      maxAmount: sp.get("maxAmount") || undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
      offset: sp.get("offset") ? Number(sp.get("offset")) : undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    await ensureUserBootstrap(user.id);
    const body = await request.json().catch(() => null);
    const idempotencyHeader = request.headers.get("idempotency-key")?.trim();
    const parsed = createTransactionSchema.parse({
      ...(body && typeof body === "object" ? body : {}),
      clientTransactionId:
        (body as Record<string, unknown> | null)?.clientTransactionId ||
        idempotencyHeader ||
        undefined,
    });

    const result = await createTransaction(user.id, parsed);
    return NextResponse.json(result, {
      status: result.duplicate ? 200 : 201,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
