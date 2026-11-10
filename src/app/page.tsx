import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth/guard";

export default async function HomePage() {
  const user = await getAuthenticatedUser().catch(() => null);
  if (user) {
    redirect("/dashboard");
  }
  redirect("/login");
}
