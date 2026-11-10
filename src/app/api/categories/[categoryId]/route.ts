import { NextResponse, type NextRequest } from "next/server";
import { requireAuthUser } from "@/lib/auth/guard";
import { handleApiError } from "@/lib/errors";
import {
  deleteCategory,
  updateCategory,
} from "@/lib/services/category-service";
import { updateCategorySchema } from "@/lib/validation/schemas";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ categoryId: string }> },
) {
  try {
    const user = await requireAuthUser();
    const { categoryId } = await context.params;
    const body = await request.json().catch(() => null);
    const parsed = updateCategorySchema.parse(body);
    const category = await updateCategory(user.id, categoryId, parsed);
    return NextResponse.json({ category });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ categoryId: string }> },
) {
  try {
    const user = await requireAuthUser();
    const { categoryId } = await context.params;
    const result = await deleteCategory(user.id, categoryId);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
