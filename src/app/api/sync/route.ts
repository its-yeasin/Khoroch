import { NextResponse, type NextRequest } from "next/server";
import { requireAuthUser } from "@/lib/auth/guard";
import { handleApiError } from "@/lib/errors";
import { getFullSnapshot, processSyncBatch } from "@/lib/services/sync-service";
import { syncBatchSchema } from "@/lib/validation/schemas";

export async function GET() {
  try {
    const user = await requireAuthUser();
    const snapshot = await getFullSnapshot(user.id);
    return NextResponse.json(snapshot);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json().catch(() => null);
    const parsed = syncBatchSchema.parse(body);
    const result = await processSyncBatch(user.id, parsed.operations);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
