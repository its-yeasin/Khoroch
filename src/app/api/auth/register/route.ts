import { NextResponse, type NextRequest } from "next/server";
import { hashPassword } from "@/lib/auth/password";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { setSessionCookie, signSessionToken } from "@/lib/auth/session";
import { connectDB } from "@/lib/db/connect";
import { UserModel } from "@/lib/db/models/User";
import { AppError, handleApiError } from "@/lib/errors";
import { ensureUserBootstrap } from "@/lib/services/bootstrap";
import { registerSchema } from "@/lib/validation/schemas";

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    await enforceRateLimit(`register:${ip}`, 10, 15 * 60 * 1000);

    const body = await request.json().catch(() => null);
    const parsed = registerSchema.parse(body);

    const email = parsed.email.toLowerCase();
    const existing = await UserModel.findOne({ email }).lean();
    if (existing) {
      throw new AppError(
        409,
        "EMAIL_IN_USE",
        "An account with this email already exists.",
      );
    }

    const passwordHash = await hashPassword(parsed.password);
    const user = await UserModel.create({
      name: parsed.name,
      email,
      passwordHash,
    });

    await ensureUserBootstrap(user._id.toString());

    const token = await signSessionToken({
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
    });
    await setSessionCookie(token);

    return NextResponse.json(
      {
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          createdAt: user.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return handleApiError(err);
  }
}
