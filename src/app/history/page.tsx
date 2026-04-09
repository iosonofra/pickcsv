import { listBatchesWithPrintStatus } from "@/lib/batches";
import { HistoryBatchesClient } from "@/components/history-batches-client";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const batches = await listBatchesWithPrintStatus("history");

  return <HistoryBatchesClient initialBatches={batches} />;
}
