import { NextResponse } from "next/server";
import { findOrders } from "@/lib/orders";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? undefined;
  const carrier = searchParams.get("carrier") ?? undefined;
  const dateFrom = searchParams.get("dateFrom") ?? undefined;
  const dateTo = searchParams.get("dateTo") ?? undefined;

  const orders = await findOrders({ search, carrier, dateFrom, dateTo });
  return NextResponse.json({ orders });
}
