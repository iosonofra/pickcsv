import { NextResponse } from "next/server";
import { importOrdersFromWorkbook } from "@/lib/orders";
import { getAutoImportApiToken, getAutoImportOpenDashboard, tokenMatches } from "@/lib/settings";

export const runtime = "nodejs";

const getBearerToken = (req: Request) => {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
};

const isAuthorized = async (req: Request) => {
  const expected = await getAutoImportApiToken();
  const actual = getBearerToken(req);
  return tokenMatches(expected, actual);
};

const getHeaderValue = (req: Request, key: string) => {
  const value = req.headers.get(key)?.trim();
  return value ? value.slice(0, 180) : undefined;
};

const getClientIp = (req: Request) => {
  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwardedFor || req.headers.get("x-real-ip") || "").slice(0, 80) || undefined;
};

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Token API mancante o non valido" }, { status: 401 });
  }

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
    const imported = await importOrdersFromWorkbook({
      fileName: file.name,
      buffer: Buffer.from(arrayBuffer),
      importSource: "auto",
      autoUploadComputerName: getHeaderValue(req, "x-pickcsv-computer-name"),
      autoUploadUserName: getHeaderValue(req, "x-pickcsv-user-name"),
      autoUploadClientId: getHeaderValue(req, "x-pickcsv-client-id"),
      autoUploadIp: getClientIp(req),
      autoUploadedAt: new Date()
    });
    const openDashboard = await getAutoImportOpenDashboard();

    return NextResponse.json(
      {
        ok: true,
        batchId: imported.batch.id,
        sourceFile: imported.batch.sourceFile,
        summary: imported.summary,
        openDashboard,
        upload: {
          computerName: imported.batch.autoUploadComputerName,
          userName: imported.batch.autoUploadUserName,
          clientId: imported.batch.autoUploadClientId,
          ip: imported.batch.autoUploadIp,
          uploadedAt: imported.batch.autoUploadedAt
        }
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore import automatico";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
