import { NextResponse, type NextRequest } from "next/server";
import { requireAuthUser } from "@/lib/auth/guard";
import { handleApiError } from "@/lib/errors";
import { getLoanDetail } from "@/lib/services/loan-service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ loanId: string }> },
) {
  try {
    const user = await requireAuthUser();
    const { loanId } = await context.params;
    const result = await getLoanDetail(user.id, loanId);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
