import { NextResponse, type NextRequest } from "next/server";
import { requireAuthUser } from "@/lib/auth/guard";
import { handleApiError } from "@/lib/errors";
import { exportUserData } from "@/lib/services/backup-service";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const formatParam = request.nextUrl.searchParams.get("format");
    const format = formatParam === "csv" ? "csv" : "json";
    const result = await exportUserData(user.id, format);

    return new NextResponse(result.content, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${result.filename}"`,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
