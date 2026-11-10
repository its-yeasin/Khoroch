import { NextResponse, type NextRequest } from "next/server";
import { requireAuthUser } from "@/lib/auth/guard";
import { handleApiError } from "@/lib/errors";
import {
  deleteOrArchiveAccount,
  getAccountOverview,
  updateAccount,
} from "@/lib/services/account-service";
import { updateAccountSchema } from "@/lib/validation/schemas";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ accountId: string }> },
) {
  try {
    const user = await requireAuthUser();
    const { accountId } = await context.params;
    const overview = await getAccountOverview(user.id, accountId);
    return NextResponse.json(overview);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ accountId: string }> },
) {
  try {
    const user = await requireAuthUser();
    const { accountId } = await context.params;
    const body = await request.json().catch(() => null);
    const parsed = updateAccountSchema.parse(body);
    const account = await updateAccount(user.id, accountId, parsed);
    return NextResponse.json({ account });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ accountId: string }> },
) {
  try {
    const user = await requireAuthUser();
    const { accountId } = await context.params;
    const result = await deleteOrArchiveAccount(user.id, accountId);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
