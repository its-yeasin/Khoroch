import { NextResponse, type NextRequest } from "next/server";
import { requireAuthUser } from "@/lib/auth/guard";
import { handleApiError } from "@/lib/errors";
import { importUserBackup } from "@/lib/services/backup-service";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json().catch(() => null);
    const result = await importUserBackup(user.id, body);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
