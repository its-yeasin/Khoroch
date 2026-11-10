import { RateLimitModel } from "@/lib/db/models/RateLimit";
import { AppError } from "@/lib/errors";

const memoryBucket = new Map<string, { count: number; expireAt: number }>();

export async function enforceRateLimit(
  key: string,
  maxRequests = 15,
  windowMs = 15 * 60 * 1000,
): Promise<void> {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  const now = Date.now();
  const expireAt = new Date(now + windowMs);

  try {
    await RateLimitModel.deleteOne({ key, expireAt: { $lte: new Date(now) } });

    const doc = await RateLimitModel.findOneAndUpdate(
      { key },
      {
        $inc: { count: 1 },
        $setOnInsert: { expireAt },
      },
      {
        upsert: true,
        returnDocument: "after",
      },
    );

    if (doc && doc.count > maxRequests) {
      throw new AppError(
        429,
        "RATE_LIMITED",
        "Too many attempts. Please wait a few minutes and try again.",
      );
    }
    return;
  } catch (err) {
    if (err instanceof AppError) throw err;
    // Fallback to in-memory limiter if DB check fails transiently
    const existing = memoryBucket.get(key);
    if (!existing || existing.expireAt <= now) {
      memoryBucket.set(key, { count: 1, expireAt: now + windowMs });
      return;
    }
    existing.count += 1;
    if (existing.count > maxRequests) {
      throw new AppError(
        429,
        "RATE_LIMITED",
        "Too many attempts. Please wait a few minutes and try again.",
      );
    }
  }
}
