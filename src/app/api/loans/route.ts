import { NextResponse, type NextRequest } from "next/server";
import { requireAuthUser } from "@/lib/auth/guard";
import { LOAN_TYPES, type LoanType } from "@/lib/constants";
import { handleApiError } from "@/lib/errors";
import { listLoansWithPeople } from "@/lib/services/loan-service";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const sp = request.nextUrl.searchParams;
    const typeParam = sp.get("loanType");
    const loanType =
      typeParam && (LOAN_TYPES as readonly string[]).includes(typeParam)
        ? (typeParam as LoanType)
        : undefined;
    const counterpartyAccountId =
      sp.get("counterpartyAccountId") || undefined;

    const result = await listLoansWithPeople(user.id, {
      loanType,
      counterpartyAccountId,
    });
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
