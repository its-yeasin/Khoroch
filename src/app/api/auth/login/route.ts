import { NextResponse, type NextRequest } from "next/server";
import { verifyPassword } from "@/lib/auth/password";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { setSessionCookie, signSessionToken } from "@/lib/auth/session";
import { connectDB } from "@/lib/db/connect";
import { UserModel } from "@/lib/db/models/User";
import { AppError, handleApiError } from "@/lib/errors";
import { ensureUserBootstrap } from "@/lib/services/bootstrap";
import { loginSchema } from "@/lib/validation/schemas";

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const body = await request.json().catch(() => null);
    const parsed = loginSchema.parse(body);
    const email = parsed.email.toLowerCase();

    await enforceRateLimit(`login:${ip}:${email}`, 12, 15 * 60 * 1000);

    const user = await UserModel.findOne({ email });
    if (!user) {
      throw new AppError(
        401,
        "INVALID_CREDENTIALS",
        "Invalid email or password.",
      );
    }

    const valid = await verifyPassword(parsed.password, user.passwordHash);
    if (!valid) {
      throw new AppError(
        401,
        "INVALID_CREDENTIALS",
        "Invalid email or password.",
      );
    }

    await ensureUserBootstrap(user._id.toString());

    const token = await signSessionToken({
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
    });
    await setSessionCookie(token);

    return NextResponse.json({
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
