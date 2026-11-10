import { NextResponse, type NextRequest } from "next/server";
import { requireAuthUser } from "@/lib/auth/guard";
import { DASHBOARD_RANGES, type DashboardRange } from "@/lib/constants";
import { handleApiError } from "@/lib/errors";
import { getDashboardSummary } from "@/lib/services/analytics-service";
import { ensureUserBootstrap } from "@/lib/services/bootstrap";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    await ensureUserBootstrap(user.id);
    const sp = request.nextUrl.searchParams;
    const rangeParam = sp.get("range");
    const range: DashboardRange =
      rangeParam && (DASHBOARD_RANGES as readonly string[]).includes(rangeParam)
        ? (rangeParam as DashboardRange)
        : "MONTH";

    const summary = await getDashboardSummary(
      user.id,
      range,
      sp.get("startDate") || undefined,
      sp.get("endDate") || undefined,
    );
    return NextResponse.json(summary);
  } catch (err) {
    return handleApiError(err);
  }
}
