import React from "react";
import { AppShell } from "@/components/layout/AppShell";
import { getAuthenticatedUser } from "@/lib/auth/guard";
import { WalletProvider } from "@/lib/offline/wallet-store";

export default async function ProtectedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthenticatedUser().catch(() => null);

  return (
    <WalletProvider initialUser={user}>
      <AppShell>{children}</AppShell>
    </WalletProvider>
  );
}
