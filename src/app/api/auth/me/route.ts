import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth/guard";
import { handleApiError } from "@/lib/errors";

export async function GET() {
  try {
    const user = await requireAuthUser();
    return NextResponse.json({ user });
  } catch (err) {
    return handleApiError(err);
  }
}
