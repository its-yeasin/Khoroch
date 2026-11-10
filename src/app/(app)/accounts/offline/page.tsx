"use client";

import React, { useMemo } from "react";
import { AccountDetailView } from "@/components/accounts/AccountDetailView";

export default function OfflineAccountDetailPage() {
  const accountId = useMemo(() => {
    if (typeof window === "undefined") return "";
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  }, []);

  return <AccountDetailView accountId={accountId} />;
}
