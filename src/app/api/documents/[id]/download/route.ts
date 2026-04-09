import fs from "node:fs";
import { NextResponse } from "next/server";
import { ensureDbSchema, prisma } from "@/lib/db";

export const runtime = "nodejs";

type Params = {
  params: {
    id: string;
  };
};

export async function GET(_: Request, { params }: Params) {
  await ensureDbSchema();
  const document = await prisma.generatedDocument.findUnique({
    where: { id: params.id }
  });

  if (!document) {
    return NextResponse.json({ error: "Documento non trovato" }, { status: 404 });
  }
  if (!fs.existsSync(document.filePath)) {
    return NextResponse.json({ error: "File PDF non presente su disco" }, { status: 404 });
  }

  const bytes = await fs.promises.readFile(document.filePath);
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${document.fileName}"`
    }
  });
}
