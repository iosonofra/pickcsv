"use client";

import React from "react";

interface BatchDrawerContentProps {
  drawerData: {
    sourceFile: string;
    importSource: string;
    _count?: {
      orders: number;
    };
    createdAt: string | Date;
    errors?: Array<{
      id: string;
      rowNumber: number;
      message: string;
      rawData?: string | null;
    }>;
  };
  copiedRowId: string | null;
  onCopyRow: (errId: string, rawData: string) => void;
}

export default function BatchDrawerContent({ drawerData, copiedRowId, onCopyRow }: BatchDrawerContentProps) {
  return (
    <>
      <div className="bottom-sheet-section">
        <h4 className="section-title" style={{ fontSize: "0.95rem", marginBottom: 8 }}>Riepilogo Importazione</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px", fontSize: "0.82rem", background: "rgba(255,255,255,0.02)", padding: "16px", borderRadius: "12px", border: "1px solid var(--md-outline-variant)" }}>
          <div>
            <span style={{ color: "var(--color-text-muted)" }}>File Elaborato:</span>
            <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{drawerData.sourceFile}</p>
          </div>
          <div>
            <span style={{ color: "var(--color-text-muted)" }}>Canale Upload:</span>
            <p style={{ margin: "4px 0 0" }}>
              {drawerData.importSource === "auto" ? (
                <span className="badge auto-upload">Upload Automatico (SendTo)</span>
              ) : (
                <span className="badge secondary">Caricamento Manuale Web</span>
              )}
            </p>
          </div>
          <div>
            <span style={{ color: "var(--color-text-muted)" }}>Ordini Importati:</span>
            <p style={{ margin: "4px 0 0", fontWeight: 600 }}>{drawerData._count?.orders ?? 0} ordini inseriti</p>
          </div>
          <div>
            <span style={{ color: "var(--color-text-muted)" }}>Data Operazione:</span>
            <p style={{ margin: "4px 0 0" }}>{new Date(drawerData.createdAt).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</p>
          </div>
        </div>
      </div>
      
      <div className="bottom-sheet-section">
        <h4 className="section-title" style={{ fontSize: "0.95rem", marginBottom: 8 }}>Errori e Record Invalidi ({drawerData.errors?.length ?? 0})</h4>
        {drawerData.errors?.length === 0 ? (
          <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", margin: 0 }}>Nessun errore riscontrato durante l&apos;importazione.</p>
        ) : (
          <div className="table-wrap" style={{ marginTop: 0 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: "60px" }}>Riga</th>
                  <th>Dettaglio Errore</th>
                  <th>Contenuto Riga Originale</th>
                </tr>
              </thead>
              <tbody>
                {drawerData.errors?.map((err: any) => (
                  <tr key={err.id}>
                    <td style={{ fontWeight: 800 }}>{err.rowNumber}</td>
                    <td style={{ color: "var(--color-error)", fontWeight: 500 }}>{err.message}</td>
                    <td style={{ position: "relative" }}>
                      <div className="row" style={{ justifyItems: "center", flexWrap: "nowrap", gap: 8 }}>
                        <span 
                          className="raw-data-text" 
                          title={err.rawData}
                          style={{ fontFamily: "monospace", fontSize: "0.72rem", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}
                        >
                          {err.rawData ?? "-"}
                        </span>
                        {err.rawData && (
                          <button
                            type="button"
                            className="button tertiary button-sm copy-row-btn"
                            title="Copia riga originale"
                            style={{ minHeight: "26px", padding: "2px 8px", fontSize: "0.7rem", borderRadius: "6px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                            onClick={() => onCopyRow(err.id, err.rawData)}
                          >
                            {copiedRowId === err.id ? (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12 }}>
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12 }}>
                                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                              </svg>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
