"use client";

import React from "react";

interface OrderDrawerContentProps {
  drawerData: {
    orderReference: string;
    clientName?: string | null;
    carrierName?: string | null;
    isPrinted: boolean;
    printedCount: number;
    barcodeValue?: string | null;
    createdAt: string | Date;
    notes?: string | null;
    lines?: Array<{
      id: string;
      productName?: string | null;
      quantity: number;
      ean?: string | null;
      productId?: string | null;
    }>;
    documents?: Array<{
      id: string;
      fileName: string;
      createdAt: string | Date;
    }>;
  };
}

export default function OrderDrawerContent({ drawerData }: OrderDrawerContentProps) {
  return (
    <>
      <div className="bottom-sheet-section">
        <h4 className="section-title" style={{ fontSize: "0.95rem", marginBottom: 8 }}>Informazioni Logistiche</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px", fontSize: "0.82rem", background: "rgba(255,255,255,0.02)", padding: "16px", borderRadius: "12px", border: "1px solid var(--md-outline-variant)" }}>
          <div>
            <span style={{ color: "var(--color-text-muted)" }}>Riferimento Ordine:</span>
            <p style={{ margin: "4px 0 0", fontWeight: 800, fontSize: "0.95rem" }}>{drawerData.orderReference}</p>
          </div>
          <div>
            <span style={{ color: "var(--color-text-muted)" }}>Cliente:</span>
            <p style={{ margin: "4px 0 0", fontWeight: 600 }}>{drawerData.clientName ?? "-"}</p>
          </div>
          <div>
            <span style={{ color: "var(--color-text-muted)" }}>Corriere:</span>
            <p style={{ margin: "4px 0 0", fontWeight: 600 }}>{drawerData.carrierName ?? "-"}</p>
          </div>
          <div>
            <span style={{ color: "var(--color-text-muted)" }}>Stato di Stampa:</span>
            <p style={{ margin: "4px 0 0" }}>
              {drawerData.isPrinted ? (
                <span className="badge good">Stampato x{drawerData.printedCount}</span>
              ) : (
                <span className="badge warn">Da stampare</span>
              )}
            </p>
          </div>
          <div>
            <span style={{ color: "var(--color-text-muted)" }}>Codice a barre (EAN):</span>
            <p style={{ margin: "4px 0 0", fontFamily: "monospace", fontSize: "0.82rem" }}>{drawerData.barcodeValue ?? "-"}</p>
          </div>
          <div>
            <span style={{ color: "var(--color-text-muted)" }}>Creato il:</span>
            <p style={{ margin: "4px 0 0" }}>{new Date(drawerData.createdAt).toLocaleString("it-IT")}</p>
          </div>
        </div>
        
        {drawerData.notes && (
          <div style={{ marginTop: 8, padding: 12, borderRadius: 10, background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.15)", fontSize: "0.8rem" }}>
            <strong style={{ color: "var(--color-warning)" }}>Note Operatore:</strong>
            <p style={{ margin: "4px 0 0", color: "#fff" }}>{drawerData.notes}</p>
          </div>
        )}
      </div>
      
      <div className="bottom-sheet-section">
        <h4 className="section-title" style={{ fontSize: "0.95rem", marginBottom: 8 }}>Articoli in Ordine ({drawerData.lines?.length ?? 0})</h4>
        <div className="table-wrap" style={{ marginTop: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Descrizione Prodotto</th>
                <th style={{ width: "80px" }}>Qta</th>
                <th>EAN</th>
                <th>ID Articolo</th>
              </tr>
            </thead>
            <tbody>
              {drawerData.lines?.map((line: any) => (
                <tr key={line.id}>
                  <td style={{ fontWeight: 600 }}>{line.productName ?? "-"}</td>
                  <td style={{ fontWeight: 700 }}>{line.quantity} pz.</td>
                  <td style={{ fontFamily: "monospace", fontSize: "0.78rem" }}>{line.ean ?? "-"}</td>
                  <td style={{ fontSize: "0.78rem" }}>{line.productId ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="drawer-section">
        <h4 className="section-title" style={{ fontSize: "0.95rem", marginBottom: 8 }}>Storico File PDF Generati</h4>
        {drawerData.documents?.length === 0 ? (
          <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", margin: 0 }}>Nessun documento PDF generato per questo ordine.</p>
        ) : (
          <div className="table-wrap" style={{ marginTop: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Nome File</th>
                  <th>Ora Creazione</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {drawerData.documents?.map((doc: any) => (
                  <tr key={doc.id}>
                    <td style={{ fontSize: "0.78rem" }}>{doc.fileName}</td>
                    <td style={{ fontSize: "0.78rem" }}>{new Date(doc.createdAt).toLocaleTimeString("it-IT")}</td>
                    <td style={{ textAlign: "right" }}>
                      <a className="link" href={`/api/documents/${doc.id}/download`} target="_blank" rel="noreferrer">
                        Apri PDF
                      </a>
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
