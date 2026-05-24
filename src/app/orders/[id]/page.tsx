import Link from "next/link";
import { notFound } from "next/navigation";
import dayjs from "dayjs";
import { ensureDbSchema, prisma } from "@/lib/db";

type Props = {
  params: {
    id: string;
  };
};

export default async function OrderDetailPage({ params }: Props) {
  await ensureDbSchema();
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      batch: true,
      lines: true,
      documents: {
        orderBy: {
          createdAt: "desc"
        },
        take: 20
      }
    }
  });

  if (!order) {
    notFound();
  }

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
          <div className="sidebar-logo-text">PickCSV Dettagli</div>
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
            <h1 className="title">Dettaglio Ordine {order.orderReference}</h1>
            <p className="subtitle">
              Cliente: {order.clientName ?? "-"} | Corriere: {order.carrierName ?? "-"} | Import:{" "}
              {dayjs(order.batch.createdAt).format("DD/MM/YYYY HH:mm")}
            </p>
          </div>
        </header>

        <div style={{ display: "grid", gap: "24px" }}>
          {/* SCHEDA INFO */}
          <section className="card">
            <h2 className="section-title">Metadati di Spedizione</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", fontSize: "0.85rem" }}>
              <div style={{ background: "var(--md-surface-container-low)", padding: "12px 16px", borderRadius: "10px", border: "1px solid var(--md-outline-variant)" }}>
                <span style={{ color: "var(--color-text-muted)", fontSize: "0.78rem" }}>Barcode EAN generato:</span>
                <p style={{ margin: "4px 0 0", fontFamily: "monospace", fontSize: "0.95rem", fontWeight: "bold" }}>{order.barcodeValue}</p>
              </div>
              <div style={{ background: "var(--md-surface-container-low)", padding: "12px 16px", borderRadius: "10px", border: "1px solid var(--md-outline-variant)" }}>
                <span style={{ color: "var(--color-text-muted)", fontSize: "0.78rem" }}>Stato Stampa:</span>
                <p style={{ margin: "4px 0 0" }}>
                  {order.isPrinted ? (
                    <span className="badge good">Stampato x{order.printedCount}</span>
                  ) : (
                    <span className="badge warn">Da stampare</span>
                  )}
                </p>
              </div>
              <div style={{ background: "var(--md-surface-container-low)", padding: "12px 16px", borderRadius: "10px", border: "1px solid var(--md-outline-variant)" }}>
                <span style={{ color: "var(--color-text-muted)", fontSize: "0.78rem" }}>Note ordine:</span>
                <p style={{ margin: "4px 0 0", fontWeight: 600 }}>{order.notes ?? "-"}</p>
              </div>
            </div>
          </section>

          {/* RIGHE PRODOTTO */}
          <section className="card">
            <h2 className="section-title">Righe Prodotto ({order.lines.length})</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Descrizione Prodotto</th>
                    <th style={{ width: "100px" }}>Quantità</th>
                    <th>Codice EAN</th>
                    <th>ID Prodotto</th>
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((line) => (
                    <tr key={line.id}>
                      <td style={{ fontWeight: 600 }}>{line.productName ?? "-"}</td>
                      <td style={{ fontWeight: 700 }}>{line.quantity} pz.</td>
                      <td style={{ fontFamily: "monospace", fontSize: "0.82rem" }}>{line.ean ?? "-"}</td>
                      <td>{line.productId ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* DOCUMENTI */}
          <section className="card">
            <h2 className="section-title">File PDF Generati</h2>
            {order.documents.length === 0 ? (
              <div className="empty-state">
                <p>Nessun PDF generato per questo ordine.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tipo Documento</th>
                      <th>Nome File PDF</th>
                      <th>Data Generazione</th>
                      <th style={{ textAlign: "right" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.documents.map((doc) => (
                      <tr key={doc.id}>
                        <td>
                          <span className="badge auto-upload">{doc.type}</span>
                        </td>
                        <td style={{ fontSize: "0.82rem" }}>{doc.fileName}</td>
                        <td>{dayjs(doc.createdAt).format("DD/MM/YYYY HH:mm")}</td>
                        <td style={{ textAlign: "right" }}>
                          <a className="link" href={`/api/documents/${doc.id}/download`} target="_blank" rel="noreferrer" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                            <span>Apri PDF</span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12 }}>
                              <line x1="7" y1="17" x2="17" y2="7" />
                              <polyline points="7 7 17 7 17 17" />
                            </svg>
                          </a>
                        </td>
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
