import Link from "next/link";
import dayjs from "dayjs";
import { notFound } from "next/navigation";
import { ensureDbSchema, prisma } from "@/lib/db";

type Props = {
  params: {
    id: string;
  };
};

export default async function BatchDetailPage({ params }: Props) {
  await ensureDbSchema();
  const batch = await prisma.importBatch.findUnique({
    where: { id: params.id },
    include: {
      errors: {
        orderBy: {
          rowNumber: "asc"
        },
        take: 500
      },
      _count: {
        select: {
          orders: true,
          errors: true
        }
      }
    }
  });

  if (!batch) {
    notFound();
  }

  const autoUploadSource =
    batch.autoUploadComputerName || batch.autoUploadUserName || batch.autoUploadClientId || batch.autoUploadIp || "Windows";
  const originLabel =
    batch.importSource === "auto" ? (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <span>Origine:</span>
        <span className="badge auto-upload" style={{ padding: "2px 8px", fontSize: "0.72rem" }}>Upload automatico</span>
        <span>da {autoUploadSource}{batch.autoUploadedAt ? ` (${dayjs(batch.autoUploadedAt).format("DD/MM/YYYY HH:mm")})` : ""}</span>
      </span>
    ) : (
      <span>Origine: Importazione manuale da Web</span>
    );

  return (
    <div className="app-container">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 24, height: 24, marginRight: 8, flexShrink: 0 }} aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="4" style={{ stroke: "var(--md-primary)" }} />
            <line x1="3" y1="9" x2="21" y2="9" style={{ stroke: "var(--md-primary)", opacity: 0.35 }} />
            <line x1="3" y1="15" x2="21" y2="15" style={{ stroke: "var(--md-primary)", opacity: 0.35 }} />
            <line x1="9" y1="3" x2="9" y2="21" style={{ stroke: "var(--md-primary)", opacity: 0.35 }} />
            <circle cx="6" cy="6" r="1" style={{ fill: "var(--md-primary)", opacity: 0.8 }} />
            <circle cx="6" cy="12" r="1" style={{ fill: "var(--md-primary)", opacity: 0.8 }} />
            <circle cx="15" cy="6" r="1" style={{ fill: "var(--md-primary)", opacity: 0.8 }} />
            <polyline points="12 17 14 19 18 13" style={{ stroke: "var(--md-success)", strokeWidth: 3 }} />
          </svg>
          <div className="sidebar-logo-text">PickCSV Scarti</div>
        </div>

        <nav className="sidebar-nav">
          <Link href="/" className="sidebar-nav-btn" style={{ textDecoration: "none" }}>
            <span className="sidebar-nav-btn-icon" style={{ display: "inline-flex", alignSelf: "center", justifyContent: "center" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </span>
            <span>Home Dashboard</span>
          </Link>
          <Link href="/history" className="sidebar-nav-btn" style={{ textDecoration: "none" }}>
            <span className="sidebar-nav-btn-icon" style={{ display: "inline-flex", alignSelf: "center", justifyContent: "center" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
                <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 4 2z" />
              </svg>
            </span>
            <span>Storico Batch</span>
          </Link>
        </nav>

        <div className="sidebar-footer">
          <Link href="/" className="button secondary button-sm" style={{ width: "100%", textDecoration: "none" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Torna Home</span>
          </Link>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="main-content">
        <header className="header-sticky">
          <div className="header-title-section">
            <h1 className="title">Dettaglio Errori Batch</h1>
            <p className="subtitle">
              File: {batch.sourceFile} | Data: {dayjs(batch.createdAt).format("DD/MM/YYYY HH:mm")} | Ordini:{" "}
              {batch._count.orders} | Errori totali: {batch._count.errors}
            </p>
          </div>
        </header>

        <div style={{ display: "grid", gap: "24px" }}>
          {/* INFORMAZIONI METADATI */}
          <section className="card">
            <h2 className="section-title">Canale di importazione e sorgente</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px", fontSize: "0.85rem" }}>
              <div style={{ background: "var(--md-surface-container-low)", padding: "12px 16px", borderRadius: "10px", border: "1px solid var(--md-outline-variant)" }}>
                <span style={{ color: "var(--color-text-muted)", fontSize: "0.78rem" }}>Sorgente ed IP:</span>
                <p style={{ margin: "4px 0 0", fontWeight: "bold" }}>{originLabel}</p>
              </div>
              <div style={{ background: "var(--md-surface-container-low)", padding: "12px 16px", borderRadius: "10px", border: "1px solid var(--md-outline-variant)" }}>
                <span style={{ color: "var(--color-text-muted)", fontSize: "0.78rem" }}>Riepilogo righe excel:</span>
                <p style={{ margin: "4px 0 0" }}>
                  Totali: <strong>{batch.totalRows}</strong> | Scartate:{" "}
                  <strong style={{ color: "var(--color-error)" }}>{batch.skippedRows}</strong> | Duplicati:{" "}
                  <strong style={{ color: "var(--color-warning)" }}>{batch.duplicateRows}</strong>
                </p>
              </div>
            </div>
          </section>

          {/* TABELLA ERRORI */}
          <section className="card">
            <h2 className="section-title">Elenco Righe Scartate ed Errori riscontrati ({batch.errors.length})</h2>
            {batch.errors.length === 0 ? (
              <div className="empty-state">
                <p>Nessun errore registrato in questo batch.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: "100px" }}>Riga Excel</th>
                      <th>Descrizione dell&apos;errore</th>
                      <th>Contenuto riga grezza (Raw Data)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batch.errors.map((err) => (
                      <tr key={err.id}>
                        <td style={{ fontWeight: 800 }}>{err.rowNumber}</td>
                        <td style={{ color: "var(--color-error)", fontWeight: 500 }}>{err.message}</td>
                        <td style={{ fontFamily: "monospace", fontSize: "0.76rem" }}>{err.rawData ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
