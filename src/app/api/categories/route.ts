import { NextResponse, type NextRequest } from "next/server";
import { requireAuthUser } from "@/lib/auth/guard";
import { handleApiError } from "@/lib/errors";
import { ensureUserBootstrap } from "@/lib/services/bootstrap";
import {
  createCategory,
  listCategoriesWithStats,
} from "@/lib/services/category-service";
import { createCategorySchema } from "@/lib/validation/schemas";

export async function GET() {
  try {
    const user = await requireAuthUser();
    await ensureUserBootstrap(user.id);
    const categories = await listCategoriesWithStats(user.id);
    return NextResponse.json({ categories });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    await ensureUserBootstrap(user.id);
    const body = await request.json().catch(() => null);
    const parsed = createCategorySchema.parse(body);
    const result = await createCategory(user.id, parsed);
    return NextResponse.json(result, {
      status: result.duplicate ? 200 : 201,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
