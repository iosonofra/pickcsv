import { NextResponse } from "next/server";
import {
  getAutoImportApiToken,
  getAutoImportOpenDashboard,
  saveAutoImportApiToken,
  saveAutoImportOpenDashboard
} from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const token = await getAutoImportApiToken();
  const openDashboard = await getAutoImportOpenDashboard();
  return NextResponse.json({ configured: token.length > 0, token, openDashboard });
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as { token?: unknown; openDashboard?: unknown };
    if (typeof body.token !== "string" && typeof body.openDashboard !== "boolean") {
      return NextResponse.json({ error: "Token mancante" }, { status: 400 });
    }

    const token = typeof body.token === "string" ? await saveAutoImportApiToken(body.token) : await getAutoImportApiToken();
    const openDashboard =
      typeof body.openDashboard === "boolean"
        ? await saveAutoImportOpenDashboard(body.openDashboard)
        : await getAutoImportOpenDashboard();
    return NextResponse.json({ configured: true, token, openDashboard });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore salvataggio token";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
