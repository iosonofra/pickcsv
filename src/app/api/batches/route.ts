import { NextResponse } from "next/server";
import { listBatchesWithPrintStatus } from "@/lib/batches";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawScope = searchParams.get("scope");
  const scope = rawScope === "history" ? "history" : "recent";
  const batches = await listBatchesWithPrintStatus(scope);

  return NextResponse.json({ batches });
}
