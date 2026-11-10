import { connectDB } from "@/lib/db/connect";
import { UserModel } from "@/lib/db/models/User";
import { AppError } from "@/lib/errors";
import type { UserDTO } from "@/lib/types";
import { getSessionFromCookies } from "./session";

export async function getAuthenticatedUser(): Promise<UserDTO | null> {
  const session = await getSessionFromCookies();
  if (!session) return null;

  await connectDB();
  const user = await UserModel.findById(session.userId).lean();
  if (!user) return null;

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function requireAuthUser(): Promise<UserDTO> {
  const user = await getAuthenticatedUser();
  if (!user) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required.");
  }
  return user;
}
