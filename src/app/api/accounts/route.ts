import { NextResponse, type NextRequest } from "next/server";
import { requireAuthUser } from "@/lib/auth/guard";
import { handleApiError } from "@/lib/errors";
import { createAccount, listAccounts } from "@/lib/services/account-service";
import { ensureUserBootstrap } from "@/lib/services/bootstrap";
import { createAccountSchema } from "@/lib/validation/schemas";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    await ensureUserBootstrap(user.id);
    const includeArchived =
      request.nextUrl.searchParams.get("includeArchived") === "true";
    const accounts = await listAccounts(user.id, includeArchived);
    return NextResponse.json({ accounts });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    await ensureUserBootstrap(user.id);
    const body = await request.json().catch(() => null);
    const parsed = createAccountSchema.parse(body);
    const result = await createAccount(user.id, parsed);
    return NextResponse.json(result, {
      status: result.duplicate ? 200 : 201,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
