import { listBatchesWithPrintStatus } from "@/lib/batches";
import { DashboardClient } from "@/components/dashboard-client";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const batches = await listBatchesWithPrintStatus("recent");

  return <DashboardClient initialOrders={[]} initialBatches={batches} />;
}
