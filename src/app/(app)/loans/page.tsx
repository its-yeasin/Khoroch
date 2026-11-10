import React, { Suspense } from "react";
import { LoansView } from "@/components/loans/LoansView";
import { Skeleton } from "@/components/ui/Skeleton";

export default function LoansPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-3xl" />}>
      <LoansView />
    </Suspense>
  );
}
