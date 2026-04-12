"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

type BatchItem = {
  id: string;
  sourceFile: string;
  totalRows: number;
  skippedRows: number;
  duplicateRows: number;
  createdAt: string | Date;
  _count: {
    orders: number;
    errors: number;
  };
  batchPrintCount: number;
  batchLastPrintedAt: string | Date | null;
};

type ActivityEntry = {
  id: string;
  message: string;
  createdAt: Date;
};

const makeId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const BATCH_PAGE_SIZE = 8;
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
type CodeType = "CODE128" | "QRCODE";

export function HistoryBatchesClient({ initialBatches }: { initialBatches: BatchItem[] }) {
  const [batches, setBatches] = useState<BatchItem[]>(initialBatches);
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [batchSearch, setBatchSearch] = useState("");
  const [debouncedBatchSearch, setDebouncedBatchSearch] = useState("");
  const [batchSort, setBatchSort] = useState<"recent" | "print" | "orders" | "status">("recent");
  const [batchStatusFilter, setBatchStatusFilter] = useState<"all" | "new" | "printed" | "errors">("all");
  const [batchPage, setBatchPage] = useState(1);
  const [undoBatchDeleteIds, setUndoBatchDeleteIds] = useState<string[] | null>(null);
  const undoBatchDeleteTimer = useRef<number | null>(null);
  const [codeType, setCodeType] = useState<CodeType>("QRCODE");
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [, startTransition] = useTransition();

  const pushActivity = (message: string) => {
    setActivities((prev) => [{ id: makeId(), message, createdAt: new Date() }, ...prev].slice(0, 8));
  };

  const filteredBatches = useMemo(() => {
    const tokens = debouncedBatchSearch.toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = batches.filter((b) => {
      const fileName = b.sourceFile.toLowerCase();
      const matchesSearch = tokens.every((token) => fileName.includes(token));
      if (!matchesSearch) return false;
      if (batchStatusFilter === "errors") return b._count.errors > 0;
      if (batchStatusFilter === "new") return b.batchPrintCount === 0;
      if (batchStatusFilter === "printed") return b.batchPrintCount > 0;
      return true;
    });
    const statusWeight = (item: BatchItem) => {
      if (item._count.errors > 0) return 3;
      if (item.batchPrintCount === 0) return 2;
      return 1;
    };
    if (batchSort === "print") {
      return [...filtered].sort((a, b) => b.batchPrintCount - a.batchPrintCount);
    }
    if (batchSort === "orders") {
      return [...filtered].sort((a, b) => b._count.orders - a._count.orders);
    }
    if (batchSort === "status") {
      return [...filtered].sort((a, b) => statusWeight(b) - statusWeight(a));
    }
    return [...filtered].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [batches, debouncedBatchSearch, batchSort, batchStatusFilter]);

  const totalBatchPages = useMemo(() => Math.max(1, Math.ceil(filteredBatches.length / BATCH_PAGE_SIZE)), [filteredBatches.length]);
  const visibleBatches = useMemo(() => {
    const start = (batchPage - 1) * BATCH_PAGE_SIZE;
    return filteredBatches.slice(start, start + BATCH_PAGE_SIZE);
  }, [filteredBatches, batchPage]);

  const selectedCount = selectedBatchIds.length;
  const allSelected = useMemo(() => {
    return visibleBatches.length > 0 && visibleBatches.every((batch) => selectedBatchIds.includes(batch.id));
  }, [visibleBatches, selectedBatchIds]);

  const highlightFileName = (source: string) => {
    const tokens = debouncedBatchSearch.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return source;
    const pattern = new RegExp(`(${tokens.map((token) => escapeRegExp(token)).join("|")})`, "gi");
    return source.split(pattern).map((part, idx) =>
      tokens.some((token) => token.toLowerCase() === part.toLowerCase()) ? (
        <mark className="mark" key={`${source}_${idx}`}>
          {part}
        </mark>
      ) : (
        <span key={`${source}_${idx}`}>{part}</span>
      )
    );
  };

  const refreshHistory = async () => {
    setIsLoading(true);
    const res = await fetch("/api/batches?scope=history");
    const data = await res.json();
    setIsLoading(false);
    if (!res.ok) {
      throw new Error(data.error ?? "Errore caricamento storico batch");
    }
    setBatches(data.batches);
    setSelectedBatchIds([]);
  };

  const toggleBatch = (id: string) => {
    setSelectedBatchIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleAll = () => {
    if (allSelected) {
      const visibleSet = new Set(visibleBatches.map((batch) => batch.id));
      setSelectedBatchIds((prev) => prev.filter((id) => !visibleSet.has(id)));
      return;
    }
    const next = new Set(selectedBatchIds);
    visibleBatches.forEach((batch) => next.add(batch.id));
    setSelectedBatchIds(Array.from(next));
  };

  const flushScheduledBatchDelete = () => {
    if (undoBatchDeleteTimer.current !== null) {
      window.clearTimeout(undoBatchDeleteTimer.current);
      undoBatchDeleteTimer.current = null;
    }
    setUndoBatchDeleteIds(null);
  };

  const executeBatchDelete = (ids: string[]) => {
    setPendingAction("batch_delete_many");
    startTransition(() => {
      void (async () => {
        try {
          const res = await fetch("/api/batches/delete-many", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Errore eliminazione batch");
          setStatus(`Eliminati ${data.deletedBatches} batch. PDF rimossi: ${data.deletedDocuments}.`);
          pushActivity(`Eliminazione batch (${data.deletedBatches})`);
          await refreshHistory();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Errore eliminazione batch");
        } finally {
          setPendingAction(null);
          setSelectedBatchIds((prev) => prev.filter((id) => !ids.includes(id)));
        }
      })();
    });
  };

  const scheduleBatchDelete = (ids: string[]) => {
    flushScheduledBatchDelete();
    setUndoBatchDeleteIds(ids);
    setStatus(`Eliminazione pianificata (${ids.length}). Annulla entro 8 secondi.`);
    undoBatchDeleteTimer.current = window.setTimeout(() => {
      executeBatchDelete(ids);
      flushScheduledBatchDelete();
    }, 8000);
  };

  const undoBatchDelete = () => {
    flushScheduledBatchDelete();
    setStatus("Eliminazione annullata.");
  };

  const generateBatch = (batchId: string) => {
    setError("");
    setStatus("");
    setPendingAction(`batch_pdf_${batchId}`);
    startTransition(() => {
      void (async () => {
        try {
          const res = await fetch("/api/documents/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ batchId, codeType })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Errore PDF batch");
          setStatus(`PDF batch creato: ${data.fileName} (${data.orderCount} ordini).`);
          pushActivity(`PDF batch generato (${data.orderCount} ordini)`);
          window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
          await refreshHistory();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Errore PDF batch");
        } finally {
          setPendingAction(null);
        }
      })();
    });
  };

  const generateSelectedBatches = () => {
    if (selectedBatchIds.length === 0) {
      setError("Seleziona almeno un batch da stampare.");
      return;
    }
    setError("");
    setStatus("");
    setPendingAction("batch_pdf_many");
    startTransition(() => {
      void (async () => {
        try {
          let count = 0;
          for (const batchId of selectedBatchIds) {
            const r = await fetch("/api/documents/batch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ batchId, codeType })
            });
            const d = await r.json();
            if (r.ok) {
              window.open(d.downloadUrl, "_blank", "noopener,noreferrer");
              count++;
            }
          }
          setStatus(`Stampati ${count} batch.`);
          pushActivity(`Stampa massiva storico (${count} batch)`);
          await refreshHistory();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Errore stampa batch");
        } finally {
          setPendingAction(null);
        }
      })();
    });
  };

  const deleteSingleBatch = (batchId: string) => {
    if (!window.confirm("Confermi eliminazione del batch selezionato?")) {
      return;
    }

    setError("");
    setStatus("");
    scheduleBatchDelete([batchId]);
  };

  const deleteSelectedBatches = () => {
    if (selectedBatchIds.length === 0) {
      setError("Seleziona almeno un batch da eliminare.");
      return;
    }
    if (!window.confirm(`Confermi eliminazione di ${selectedBatchIds.length} batch?`)) {
      return;
    }

    setError("");
    setStatus("");
    scheduleBatchDelete(selectedBatchIds);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedBatchSearch(batchSearch.trim());
    }, 220);
    return () => window.clearTimeout(timer);
  }, [batchSearch]);

  useEffect(() => {
    setBatchPage(1);
  }, [debouncedBatchSearch, batchSort, batchStatusFilter]);

  useEffect(() => {
    if (batchPage <= totalBatchPages) return;
    setBatchPage(totalBatchPages);
  }, [batchPage, totalBatchPages]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("picking_code_type");
      if (saved === "QRCODE" || saved === "CODE128") setCodeType(saved);
    } catch {
      void 0;
    }
  }, []);

  useEffect(() => () => flushScheduledBatchDelete(), []);

  return (
    <div className="app-shell">
      <section className="topbar">
        <h1 className="title">Storico Batch</h1>
        <p className="subtitle">Archivio import oltre 24 ore con gestione pulizia massiva.</p>
        <div className="row">
          <Link className="link" href="/">
            Torna Home
          </Link>
        </div>
      </section>

      <section className="activity-card">
        <h3 className="section-title">Attivita recenti</h3>
        {activities.length === 0 ? (
          <p className="status-inline">Nessuna attivita nello storico.</p>
        ) : (
          <ul className="activity-list">
            {activities.map((a) => (
              <li key={a.id}>{`${a.message} - ${a.createdAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`}</li>
            ))}
          </ul>
        )}
      </section>

      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {status && <p className="status ok">{status}</p>}
        {error && <p className="status error">{error}</p>}
        {undoBatchDeleteIds && (
          <div className="status undo">
            <span>Batch in eliminazione: {undoBatchDeleteIds.length}</span>
            <button className="button tertiary button-sm" type="button" onClick={undoBatchDelete}>
              Annulla
            </button>
          </div>
        )}
      </div>

      <section className="card" style={{ marginTop: 10 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 className="section-title">Storico ({filteredBatches.length})</h2>
        </div>
        <div className="row code-toggle-row">
          <span className="status-inline">Codice su PDF:</span>
          <button
            className={`chip ${codeType === "CODE128" ? "active" : ""}`}
            type="button"
            onClick={() => {
              setCodeType("CODE128");
              try { window.localStorage.setItem("picking_code_type", "CODE128"); } catch { void 0; }
            }}
          >
            {codeType === "CODE128" && <span className="chip-check" aria-hidden="true">✓</span>}
            Barcode
          </button>
          <button
            className={`chip ${codeType === "QRCODE" ? "active" : ""}`}
            type="button"
            onClick={() => {
              setCodeType("QRCODE");
              try { window.localStorage.setItem("picking_code_type", "QRCODE"); } catch { void 0; }
            }}
          >
            {codeType === "QRCODE" && <span className="chip-check" aria-hidden="true">✓</span>}
            QR Code
          </button>
        </div>

        <div className="row batch-filters-row">
          <input
            className="input"
            placeholder="Cerca file storico (anche piu parole)"
            value={batchSearch}
            onChange={(e) => setBatchSearch(e.target.value)}
          />
          <select className="select" value={batchSort} onChange={(e) => setBatchSort(e.target.value as "recent" | "print" | "orders" | "status") }>
            <option value="recent">Piu recenti</option>
            <option value="print">Piu stampati</option>
            <option value="orders">Piu ordini</option>
            <option value="status">Per stato</option>
          </select>
        </div>
        <div className="row quick-filters">
          <button className={`chip ${batchStatusFilter === "all" ? "active" : ""}`} type="button" onClick={() => setBatchStatusFilter("all")}>
            Tutti
          </button>
          <button className={`chip ${batchStatusFilter === "new" ? "active" : ""}`} type="button" onClick={() => setBatchStatusFilter("new")}>
            Solo nuovi
          </button>
          <button className={`chip ${batchStatusFilter === "printed" ? "active" : ""}`} type="button" onClick={() => setBatchStatusFilter("printed")}>
            Solo stampati
          </button>
          <button className={`chip ${batchStatusFilter === "errors" ? "active" : ""}`} type="button" onClick={() => setBatchStatusFilter("errors")}>
            Solo con errori
          </button>
        </div>

        <div className="sticky-bar command-bar">
          <span>{selectedBatchIds.length > 0 ? `${selectedCount} batch selezionati` : `Mostrati ${visibleBatches.length}/${filteredBatches.length}`}</span>
          <button className="button secondary" type="button" onClick={generateSelectedBatches} disabled={!!pendingAction || selectedBatchIds.length === 0}>
            {pendingAction === "batch_pdf_many" ? "Stampo..." : "Stampa selezionati"}
          </button>
          <button className="button danger" type="button" onClick={deleteSelectedBatches} disabled={pendingAction === "batch_delete_many" || selectedBatchIds.length === 0}>
            {pendingAction === "batch_delete_many" ? "Elimino..." : `Elimina selezionati`}
          </button>
        </div>

        {isLoading ? (
          <div className="skeleton-table">
            <div className="skeleton-row" />
            <div className="skeleton-row" />
            <div className="skeleton-row" />
            <div className="skeleton-row short" />
          </div>
        ) : visibleBatches.length === 0 ? (
          <div className="empty-state">
            <p>Nessun batch nello storico.</p>
            <p className="drop-hint">Quando i batch superano 24 ore li troverai qui.</p>
          </div>
        ) : (
          <>
            <div className="table-wrap desktop-only">
              <table>
                <thead>
                  <tr>
                    <th>
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Seleziona tutti i batch storici" />
                    </th>
                    <th>File</th>
                    <th>Ordini</th>
                    <th>Stampa</th>
                    <th>PDF</th>
                    <th>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleBatches.map((batch) => (
                    <tr key={batch.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedBatchIds.includes(batch.id)}
                          onChange={() => toggleBatch(batch.id)}
                          aria-label={`Seleziona batch storico ${batch.sourceFile}`}
                        />
                      </td>
                      <td>{highlightFileName(batch.sourceFile)}</td>
                      <td>{batch._count.orders}</td>
                      <td>
                        {batch.batchPrintCount > 0 ? (
                          <span className="badge good">Stampato x{batch.batchPrintCount}</span>
                        ) : (
                          <span className="badge warn">Mai stampato</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="button secondary"
                          type="button"
                          title="Genera PDF per questo batch"
                          onClick={() => generateBatch(batch.id)}
                          disabled={!!pendingAction}
                        >
                          {pendingAction === `batch_pdf_${batch.id}` ? "Genero..." : "Stampa PDF"}
                        </button>
                      </td>
                      <td>
                        <div className="row">
                          {batch._count.errors > 0 && (
                            <Link className="link" href={`/batches/${batch.id}`}>
                              Errori
                            </Link>
                          )}
                          <button
                            className="button danger"
                            type="button"
                            title="Elimina questo batch storico"
                            onClick={() => deleteSingleBatch(batch.id)}
                            disabled={pendingAction === "batch_delete_many"}
                          >
                            {pendingAction === "batch_delete_many" ? "Elimino..." : "Elimina"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-only card-list">
              {visibleBatches.map((batch) => (
                <article key={batch.id} className="mini-card">
                  <p className="mini-title">{highlightFileName(batch.sourceFile)}</p>
                  <p className="mini-meta">Ordini: {batch._count.orders}</p>
                  <p className="mini-meta">{batch.batchPrintCount > 0 ? `Stampato x${batch.batchPrintCount}` : "Mai stampato"}</p>
                  <div className="row">
                    {batch._count.errors > 0 && (
                      <Link className="link" href={`/batches/${batch.id}`}>
                        Errori
                      </Link>
                    )}
                    <button className="button secondary" type="button" onClick={() => generateBatch(batch.id)} disabled={!!pendingAction}>
                      {pendingAction === `batch_pdf_${batch.id}` ? "Genero..." : "Stampa PDF"}
                    </button>
                    <button className="button danger" type="button" onClick={() => deleteSingleBatch(batch.id)} disabled={!!pendingAction}>
                      Elimina
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <div className="row pagination-row">
              <button className="button tertiary button-sm" type="button" onClick={() => setBatchPage((prev) => Math.max(1, prev - 1))} disabled={batchPage === 1}>
                Precedente
              </button>
              <span className="status-inline">
                Pagina {batchPage} di {totalBatchPages}
              </span>
              <button
                className="button tertiary button-sm"
                type="button"
                onClick={() => setBatchPage((prev) => Math.min(totalBatchPages, prev + 1))}
                disabled={batchPage === totalBatchPages}
              >
                Successiva
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
