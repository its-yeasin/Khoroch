import { AccountDetailView } from "@/components/accounts/AccountDetailView";

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  return <AccountDetailView accountId={accountId} />;
}
