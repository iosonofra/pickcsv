import { NextResponse } from "next/server";
import { previewOrdersWorkbook } from "@/lib/orders";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File mancante" }, { status: 400 });
    }
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".csv")) {
      return NextResponse.json({ error: "Formato non supportato. Carica un file .xlsx o .csv" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const preview = previewOrdersWorkbook({
      fileName: file.name,
      buffer
    });
    return NextResponse.json(preview);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore anteprima import";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
