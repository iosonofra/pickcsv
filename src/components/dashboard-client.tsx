"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

type OrderItem = {
  id: string;
  batchId: string;
  orderReference: string;
  clientName: string | null;
  carrierName: string | null;
  notes: string | null;
  isPrinted: boolean;
  printedCount: number;
  createdAt: string | Date;
  _count: { lines: number };
};

type BatchItem = {
  id: string;
  sourceFile: string;
  totalRows: number;
  skippedRows: number;
  duplicateRows: number;
  createdAt: string | Date;
  _count: { orders: number; errors: number };
  batchPrintCount: number;
  batchLastPrintedAt: string | Date | null;
};

type ImportSummary = {
  totalRows: number;
  importedOrders: number;
  skippedRows: number;
  duplicateRows: number;
  errors: number;
};

type ImportPreview = {
  fileName: string;
  summary: ImportSummary;
  previewOrders: Array<{
    orderReference: string;
    clientName: string;
    carrierName: string;
    lines: number;
  }>;
};

type ActivityEntry = {
  id: string;
  message: string;
  createdAt: Date;
};
type CodeType = "CODE128" | "QRCODE";

const makeId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const BATCH_PAGE_SIZE = 8;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function DashboardClient({
  initialOrders,
  initialBatches
}: {
  initialOrders: OrderItem[];
  initialBatches: BatchItem[];
}) {
  const [orders, setOrders] = useState<OrderItem[]>(initialOrders);
  const [batches, setBatches] = useState<BatchItem[]>(initialBatches);
  const [search, setSearch] = useState("");
  const [carrier, setCarrier] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [batchSearch, setBatchSearch] = useState("");
  const [debouncedBatchSearch, setDebouncedBatchSearch] = useState("");
  const [batchSort, setBatchSort] = useState<"recent" | "print" | "orders" | "status">("recent");
  const [batchStatusFilter, setBatchStatusFilter] = useState<"all" | "new" | "printed" | "errors">("all");
  const [batchPage, setBatchPage] = useState(1);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [lastAction, setLastAction] = useState<string>("");
  const [undoBatchDeleteIds, setUndoBatchDeleteIds] = useState<string[] | null>(null);
  const undoBatchDeleteTimer = useRef<number | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [codeType, setCodeType] = useState<CodeType>("QRCODE");
  const [activeTab, setActiveTab] = useState<"home" | "orders">("home");
  const [ordersLoaded, setOrdersLoaded] = useState<boolean>(initialOrders.length > 0);
  const [ordersLoading, setOrdersLoading] = useState<boolean>(false);
  const [batchesLoading, setBatchesLoading] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [importStep, setImportStep] = useState<1 | 2 | 3>(1);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [confirmBulkKind, setConfirmBulkKind] = useState<"orders" | "batches" | null>(null);
  const [importTouched, setImportTouched] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  useEffect(() => { setLastUpdated(new Date()); }, []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const runPreviewImportRef = useRef<() => Promise<void>>(async () => undefined);
  const lastOrderQueryRef = useRef<string>("");
  const [isPending, startTransition] = useTransition();

  const pushActivity = (message: string) => {
    setActivities((prev) => [{ id: makeId(), message, createdAt: new Date() }, ...prev].slice(0, 8));
  };

  const carrierOptions = useMemo(() => {
    return [...new Set(orders.map((o) => o.carrierName).filter(Boolean))] as string[];
  }, [orders]);

  const kpis = useMemo(() => {
    const recentOrders = batches.reduce((acc, b) => acc + b._count.orders, 0);
    const recentErrors = batches.reduce((acc, b) => acc + b._count.errors, 0);
    return {
      recentBatches: batches.length,
      recentOrders,
      recentErrors
    };
  }, [batches]);

  const latestBatch = useMemo(() => {
    if (batches.length === 0) return null;
    return [...batches].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
  }, [batches]);

  const filteredBatches = useMemo(() => {
    const tokens = debouncedBatchSearch
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
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

  const allVisibleSelected = useMemo(
    () => visibleBatches.length > 0 && visibleBatches.every((batch) => selectedBatchIds.includes(batch.id)),
    [visibleBatches, selectedBatchIds]
  );

  const toggleBatchSelection = (batchId: string) => {
    setSelectedBatchIds((prev) => (prev.includes(batchId) ? prev.filter((x) => x !== batchId) : [...prev, batchId]));
  };

  const toggleAllVisibleBatches = () => {
    if (allVisibleSelected) {
      const visibleSet = new Set(visibleBatches.map((batch) => batch.id));
      setSelectedBatchIds((prev) => prev.filter((id) => !visibleSet.has(id)));
      return;
    }
    const next = new Set(selectedBatchIds);
    visibleBatches.forEach((batch) => next.add(batch.id));
    setSelectedBatchIds(Array.from(next));
  };

  const rememberLastAction = (message: string) => {
    setLastAction(message);
    try {
      window.sessionStorage.setItem("picking_last_action", message);
    } catch {
      void 0;
    }
  };

  const highlightFileName = (source: string) => {
    const tokens = debouncedBatchSearch.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return source;
    const pattern = new RegExp(`(${tokens.map((token) => escapeRegExp(token)).join("|")})`, "gi");
    const parts = source.split(pattern);
    return parts.map((part, index) =>
      tokens.some((token) => token.toLowerCase() === part.toLowerCase()) ? (
        <mark key={`${source}_${index}`} className="mark">
          {part}
        </mark>
      ) : (
        <span key={`${source}_${index}`}>{part}</span>
      )
    );
  };

  const refreshOrders = async () => {
    setOrdersLoading(true);
    const query = new URLSearchParams();
    if (search) query.set("search", search);
    if (carrier) query.set("carrier", carrier);
    if (dateFrom) query.set("dateFrom", dateFrom);
    if (dateTo) query.set("dateTo", dateTo);

    const res = await fetch(`/api/orders?${query.toString()}`);
    const data = await res.json();
    setOrdersLoading(false);
    if (!res.ok) {
      throw new Error(data.error ?? "Errore caricamento ordini");
    }
    setOrders(data.orders);
    setSelectedOrderIds([]);
    setOrdersLoaded(true);
    setLastUpdated(new Date());
    lastOrderQueryRef.current = JSON.stringify({
      search: search.trim(),
      carrier,
      dateFrom,
      dateTo
    });
  };

  const refreshBatches = async () => {
    setBatchesLoading(true);
    const res = await fetch("/api/batches?scope=recent");
    const data = await res.json();
    setBatchesLoading(false);
    if (!res.ok) {
      throw new Error(data.error ?? "Errore caricamento batch");
    }
    setBatches(data.batches);
    setSelectedBatchIds([]);
    setLastUpdated(new Date());
  };

  const flushScheduledBatchDelete = () => {
    if (undoBatchDeleteTimer.current !== null) {
      window.clearTimeout(undoBatchDeleteTimer.current);
      undoBatchDeleteTimer.current = null;
    }
    setUndoBatchDeleteIds(null);
  };

  const runPreviewImport = async () => {
    setError("");
    setStatus("");
    const file = selectedFile ?? fileInputRef.current?.files?.[0] ?? null;
    if (!file) {
      setImportTouched(true);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setPendingAction("preview");
    startTransition(() => {
      void (async () => {
        try {
          const res = await fetch("/api/import/preview", { method: "POST", body: formData });
          const data = (await res.json()) as ImportPreview & { error?: string };
          if (!res.ok) {
            throw new Error(data.error ?? "Anteprima non riuscita");
          }
          setImportPreview(data);
          setImportStep(2);
          setImportTouched(false);
          pushActivity(`Anteprima pronta (${data.summary.importedOrders} ordini)`);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Errore anteprima");
        } finally {
          setPendingAction(null);
        }
      })();
    });
  };
  runPreviewImportRef.current = runPreviewImport;

  const confirmImport = async () => {
    setError("");
    setStatus("");
    setSummary(null);
    const file = selectedFile ?? fileInputRef.current?.files?.[0] ?? null;
    if (!file) {
      setImportTouched(true);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setPendingAction("upload");
    startTransition(() => {
      void (async () => {
        try {
          const res = await fetch("/api/import", { method: "POST", body: formData });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error ?? "Import non riuscito");
          }
          setSummary(data.summary);
          setStatus(`Import completato: ${data.summary.importedOrders} ordini creati.`);
          rememberLastAction(`Import completato (${data.summary.importedOrders} ordini)`);
          pushActivity(`Import confermato (${data.summary.importedOrders} ordini)`);
          await refreshBatches();
          if (ordersLoaded || activeTab === "orders") {
            await refreshOrders();
          }
          setImportStep(3);
          setImportPreview(null);
          setSelectedFile(null);
          setImportTouched(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Errore import");
        } finally {
          setPendingAction(null);
        }
      })();
    });
  };

  const resetImportFlow = () => {
    setImportStep(1);
    setImportPreview(null);
    setImportTouched(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".csv")) {
      setError("Formato non supportato. Carica un file .xlsx o .csv");
      return;
    }
    setSelectedFile(file);
    setImportStep(1);
    setImportPreview(null);
    setImportTouched(false);
    setError("");
  };

  const onSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setStatus("");
    startTransition(() => {
      void (async () => {
        try {
          await refreshOrders();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Errore ricerca");
        }
      })();
    });
  };

  const generateSingle = async (orderId: string) => {
    setError("");
    setStatus("");
    setPendingAction(`order_pdf_${orderId}`);
    startTransition(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/orders/${orderId}/pdf`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ codeType })
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error ?? "Errore PDF singolo");
          }
          setStatus(`PDF ordine creato: ${data.fileName}`);
          rememberLastAction(`PDF ordine creato (${data.fileName})`);
          pushActivity(`PDF ordine generato (${data.fileName})`);
          window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
          await refreshOrders();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Errore generazione PDF");
        } finally {
          setPendingAction(null);
        }
      })();
    });
  };

  const deleteSingleOrder = async (orderId: string) => {
    if (!window.confirm("Confermi eliminazione dell'ordine selezionato?")) return;
    setError("");
    setStatus("");
    setPendingAction(`order_delete_${orderId}`);
    startTransition(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/orders/${orderId}`, { method: "DELETE" });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Errore eliminazione ordine");
          setStatus(`Ordine eliminato. PDF rimossi: ${data.deletedDocuments}.`);
          pushActivity("Ordine eliminato");
          await refreshOrders();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Errore eliminazione ordine");
        } finally {
          setPendingAction(null);
        }
      })();
    });
  };

  const deleteSelectedOrders = async () => {
    if (selectedOrderIds.length === 0) {
      setError("Seleziona almeno un ordine.");
      return;
    }
    setConfirmBulkKind("orders");
  };

  const generateBatch = async (batchId: string, quick = false) => {
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
          pushActivity(quick ? `Ristampa ultimo batch (${data.orderCount} ordini)` : `PDF batch generato (${data.orderCount} ordini)`);
          window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
          await refreshBatches();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Errore PDF batch");
        } finally {
          setPendingAction(null);
        }
      })();
    });
  };

  const executeBatchDeletion = async (ids: string[]) => {
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
          rememberLastAction(`Eliminazione batch (${data.deletedBatches})`);
          pushActivity(`Eliminazione batch (${data.deletedBatches})`);
          await refreshBatches();
          if (ordersLoaded) await refreshOrders();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Errore eliminazione batch");
        } finally {
          setPendingAction(null);
          setSelectedBatchIds((prev) => prev.filter((id) => !ids.includes(id)));
        }
      })();
    });
  };

  const scheduleBatchDeletion = (ids: string[]) => {
    flushScheduledBatchDelete();
    setUndoBatchDeleteIds(ids);
    setStatus(`Eliminazione pianificata (${ids.length}). Puoi annullare entro 8 secondi.`);
    undoBatchDeleteTimer.current = window.setTimeout(() => {
      void executeBatchDeletion(ids);
      flushScheduledBatchDelete();
    }, 8000);
  };

  const undoBatchDeletion = () => {
    flushScheduledBatchDelete();
    setStatus("Eliminazione annullata.");
  };

  const deleteSingleBatch = async (batchId: string) => {
    if (!window.confirm("Confermi eliminazione del batch selezionato?")) return;
    setError("");
    scheduleBatchDeletion([batchId]);
  };

  const deleteSelectedBatches = async () => {
    if (selectedBatchIds.length === 0) {
      setError("Seleziona almeno un batch.");
      return;
    }
    setConfirmBulkKind("batches");
  };

  const generateSelectedBatchPdfs = async () => {
    if (selectedBatchIds.length === 0) {
      setError("Seleziona almeno un batch.");
      return;
    }
    setError("");
    setStatus("");
    setPendingAction("batch_pdf_many");
    startTransition(() => {
      void (async () => {
        let successCount = 0;
        for (const batchId of selectedBatchIds) {
          const res = await fetch("/api/documents/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ batchId, codeType })
          });
          const data = await res.json();
          if (!res.ok) continue;
          successCount += 1;
          if (successCount <= 2) {
            window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
          }
        }
        setStatus(`PDF batch generati: ${successCount}/${selectedBatchIds.length}.`);
        rememberLastAction(`Generazione massiva PDF (${successCount}/${selectedBatchIds.length})`);
        pushActivity(`PDF batch multipli (${successCount})`);
        await refreshBatches();
        setPendingAction(null);
      })();
    });
  };

  const executeBulkDelete = async () => {
    if (!confirmBulkKind) return;
    setError("");
    setStatus("");
    if (confirmBulkKind === "orders") {
      setPendingAction("order_delete_many");
      startTransition(() => {
        void (async () => {
          try {
            const res = await fetch("/api/orders/delete-many", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ids: selectedOrderIds })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Errore eliminazione massiva ordini");
            setStatus(`Eliminati ${data.deletedOrders} ordini. PDF rimossi: ${data.deletedDocuments}.`);
            rememberLastAction(`Eliminazione ordini (${data.deletedOrders})`);
            pushActivity(`Eliminazione massiva ordini (${data.deletedOrders})`);
            await refreshOrders();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Errore eliminazione massiva ordini");
          } finally {
            setPendingAction(null);
            setConfirmBulkKind(null);
          }
        })();
      });
      return;
    }

    scheduleBatchDeletion(selectedBatchIds);
    setConfirmBulkKind(null);
  };

  useEffect(() => {
    if (!status && !error) return;
    const timeout = setTimeout(() => {
      setStatus("");
      setError("");
    }, 7000);
    return () => clearTimeout(timeout);
  }, [status, error]);

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
    if (activeTab !== "orders" || ordersLoaded) return;
    startTransition(() => {
      void refreshOrders().catch((err) => setError(err instanceof Error ? err.message : "Errore caricamento ordini"));
    });
  }, [activeTab, ordersLoaded]);

  useEffect(() => {
    if (activeTab !== "orders" || !ordersLoaded) return;
    const nextQueryKey = JSON.stringify({
      search: search.trim(),
      carrier,
      dateFrom,
      dateTo
    });
    if (nextQueryKey === lastOrderQueryRef.current) return;

    const timer = window.setTimeout(() => {
      startTransition(() => {
        void refreshOrders().catch((err) => setError(err instanceof Error ? err.message : "Errore ricerca"));
      });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [activeTab, ordersLoaded, search, carrier, dateFrom, dateTo]);

  useEffect(() => {
    if (ordersLoaded) return;
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (!idle) return;
    const id = idle(() => {
      void refreshOrders().catch(() => undefined);
    });
    return () => {
      void id;
    };
  }, [ordersLoaded]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const enterPressed = event.key === "Enter";
      if (!enterPressed || !event.ctrlKey) return;
      if (activeTab !== "home" || importStep !== 1) return;
      event.preventDefault();
      if (pendingAction === "preview" || pendingAction === "upload") return;
      void runPreviewImportRef.current();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTab, importStep, pendingAction]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("picking_code_type");
      if (saved === "QRCODE" || saved === "CODE128") setCodeType(saved);
    } catch {
      void 0;
    }
  }, []);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem("picking_last_action");
      if (saved) setLastAction(saved);
    } catch {
      void 0;
    }
    return () => flushScheduledBatchDelete();
  }, []);

  return (
    <div className="app-shell">
      <section className="topbar">
        <h1 className="title">Picking Logistica</h1>
        <p className="subtitle">Import rapido, stampa batch e storico operativo in un solo flusso.</p>
        <div className="row">
          <Link className="link" href="/history">
            Apri Storico Batch &gt; 24h
          </Link>
          {latestBatch ? (
            <button
              className="button secondary"
              type="button"
              onClick={() => generateBatch(latestBatch.id, true)}
              disabled={pendingAction === `batch_pdf_${latestBatch.id}`}
            >
              {pendingAction === `batch_pdf_${latestBatch.id}` ? "Ristampo..." : "Ristampa ultimo batch"}
            </button>
          ) : (
            <span className="status-inline">Nessun batch disponibile per ristampa</span>
          )}
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
            title="Usa barcode lineare Code128"
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
            title="Usa QR code quadrato"
          >
            {codeType === "QRCODE" && <span className="chip-check" aria-hidden="true">✓</span>}
            QR Code
          </button>
        </div>
      </section>

      <section className="kpi-grid">
        <article className="kpi-card">
          <p className="kpi-label">Batch recenti</p>
          <p className="kpi-value">{kpis.recentBatches}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Ordini (24h)</p>
          <p className="kpi-value">{kpis.recentOrders}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Errori import</p>
          <p className="kpi-value">{kpis.recentErrors}</p>
        </article>
      </section>
      <p className="kpi-updated">Ultimo aggiornamento: {lastUpdated?.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) ?? ""}</p>

      <div className="tabbar" role="tablist" aria-label="Navigazione dashboard">
        <button className={`tab-button ${activeTab === "home" ? "active" : ""}`} role="tab" type="button" onClick={() => setActiveTab("home")}>
          Home
        </button>
        <button className={`tab-button ${activeTab === "orders" ? "active" : ""}`} role="tab" type="button" onClick={() => setActiveTab("orders")}>
          Ordini Importati
        </button>
      </div>

      <details className="activity-card">
        <summary className="activity-summary">Attivita recenti</summary>
        {activities.length === 0 ? (
          <p className="status-inline">Nessuna attivita ancora.</p>
        ) : (
          <ul className="activity-list">
            {activities.map((a) => (
              <li key={a.id}>{`${a.message} - ${a.createdAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`}</li>
            ))}
          </ul>
        )}
        {lastAction && <p className="status-inline activity-last-action">Ultima azione: {lastAction}</p>}
      </details>

      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {status && <p className="status ok">{status}</p>}
        {error && <p className="status error">{error}</p>}
        {undoBatchDeleteIds && (
          <div className="status undo">
            <span>Batch in eliminazione: {undoBatchDeleteIds.length}</span>
            <button className="button tertiary button-sm" type="button" onClick={undoBatchDeletion}>
              Annulla
            </button>
          </div>
        )}
      </div>

      {activeTab === "home" && (
        <div className="grid">
          <section className="card">
            <h2 className="section-title">Import file Excel</h2>
            <div className="wizard-row">
              <span className={importStep === 1 ? "wizard-step active current" : "wizard-step"}>1. Carica</span>
              <span className={importStep === 2 ? "wizard-step active current" : "wizard-step"}>2. Anteprima</span>
              <span className={importStep === 3 ? "wizard-step active current" : "wizard-step"}>3. Conferma</span>
            </div>
            <p className="wizard-hint">Suggerimento: usa Ctrl+Invio per generare l&apos;anteprima quando il file è già selezionato.</p>
            <form className="upload-stack">
              <div
                className={`drop-zone ${isDragActive ? "active" : ""} ${importTouched && !selectedFile ? "warning" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragActive(true);
                }}
                onDragLeave={() => setIsDragActive(false)}
                onDrop={handleDrop}
              >
                <p>Trascina qui il file .xlsx o .csv (separatore ;)</p>
                <p className="drop-hint">oppure usa il selettore</p>
                <input
                  ref={fileInputRef}
                  className="input"
                  type="file"
                  name="file"
                  accept=".xlsx,.csv,text/csv"
                  onChange={(e) => {
                    setSelectedFile(e.target.files?.[0] ?? null);
                    setImportStep(1);
                    setImportPreview(null);
                    setImportTouched(false);
                  }}
                />
                {selectedFile && <p className="status-inline">File selezionato: {selectedFile.name}</p>}
              </div>
              <div className="row">
                {importStep === 1 && (
                  <button className="button" type="button" onClick={runPreviewImport} disabled={isPending || pendingAction === "preview" || pendingAction === "upload"}>
                    {pendingAction === "preview" ? "Analizzo..." : "Genera anteprima"}
                  </button>
                )}
                {importStep === 2 && (
                  <button className="button" type="button" onClick={confirmImport} disabled={pendingAction === "upload"}>
                    {pendingAction === "upload" ? "Import in corso..." : "Conferma import"}
                  </button>
                )}
                {importStep === 3 && (
                  <button className="button" type="button" onClick={resetImportFlow} disabled={pendingAction !== null}>
                    Nuovo import
                  </button>
                )}
                {importStep === 2 && (
                  <button className="button secondary" type="button" onClick={resetImportFlow} disabled={pendingAction !== null}>
                    Reimposta
                  </button>
                )}
              </div>
            </form>
            {importPreview && (
              <div className="preview-box">
                <p className="status-inline">
                  Anteprima: Righe {importPreview.summary.totalRows} | Ordini {importPreview.summary.importedOrders} | Righe scartate {importPreview.summary.skippedRows} | Duplicati {importPreview.summary.duplicateRows}
                </p>
                <div className="table-wrap" style={{ marginTop: 8 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Rif. ordine</th>
                        <th>Cliente</th>
                        <th>Corriere</th>
                        <th>Righe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.previewOrders.map((item) => (
                        <tr key={item.orderReference}>
                          <td>{item.orderReference}</td>
                          <td>{item.clientName}</td>
                          <td>{item.carrierName}</td>
                          <td>{item.lines}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {summary && (
              <p className="status-inline">
                Ultimo import: Righe {summary.totalRows} | Ordini {summary.importedOrders} | Righe scartate {summary.skippedRows} | Duplicati {summary.duplicateRows}
              </p>
            )}
          </section>

          <section className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2 className="section-title">Batch recenti (ultime 24h)</h2>
            </div>

            <div className="row batch-filters-row">
              <input
                className="input"
                placeholder="Cerca file batch (anche piu parole)"
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

            {selectedBatchIds.length > 0 && (
              <div className="sticky-bar command-bar">
                <span>{selectedBatchIds.length} batch selezionati</span>
                <div className="row">
                  <button
                    className="button secondary"
                    type="button"
                    title="Genera PDF per i batch selezionati"
                    disabled={pendingAction === "batch_pdf_many"}
                    onClick={generateSelectedBatchPdfs}
                  >
                    {pendingAction === "batch_pdf_many" ? "Genero..." : "Scarica PDF selezionati"}
                  </button>
                  <button
                    className="button danger"
                    type="button"
                    title="Elimina i batch selezionati"
                    disabled={pendingAction === "batch_delete_many"}
                    onClick={deleteSelectedBatches}
                  >
                    Elimina selezionati
                  </button>
                </div>
              </div>
            )}

            {batchesLoading ? (
              <div className="skeleton-table">
                <div className="skeleton-row" />
                <div className="skeleton-row" />
                <div className="skeleton-row" />
                <div className="skeleton-row short" />
              </div>
            ) : visibleBatches.length === 0 ? (
              <div className="empty-state">
                <p>Nessun batch recente.</p>
                <p className="drop-hint">Carica il primo file Excel per iniziare.</p>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    setActiveTab("home");
                    fileInputRef.current?.focus();
                  }}
                >
                  Carica file ora
                </button>
              </div>
            ) : (
              <>
                <div className="table-wrap desktop-only batch-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>
                          <input
                            aria-label="Seleziona tutti i batch"
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={toggleAllVisibleBatches}
                          />
                        </th>
                        <th>File</th>
                        <th>Ordini</th>
                        <th>Stampa</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleBatches.map((batch) => (
                        <tr key={batch.id}>
                          <td>
                            <input
                              aria-label={`Seleziona batch ${batch.sourceFile}`}
                              type="checkbox"
                              checked={selectedBatchIds.includes(batch.id)}
                              onChange={() => toggleBatchSelection(batch.id)}
                            />
                          </td>
                          <td>{highlightFileName(batch.sourceFile)}</td>
                          <td>{batch._count.orders}</td>
                          <td>
                            <div className="row">
                              {batch.batchPrintCount > 0 ? (
                                <span className="badge good">Stampato x{batch.batchPrintCount}</span>
                              ) : (
                                <span className="badge warn">Nuovo</span>
                              )}
                              {batch._count.errors > 0 && <span className="badge error">Con errori</span>}
                            </div>
                          </td>
                          <td>
                            <div className="row action-group batch-action-group">
                              <button
                                className="button secondary button-sm"
                                onClick={() => generateBatch(batch.id)}
                                type="button"
                                title="Genera PDF di picking per questo batch"
                                disabled={pendingAction === `batch_pdf_${batch.id}`}
                              >
                                {pendingAction === `batch_pdf_${batch.id}` ? "Genero..." : "Scarica PDF"}
                              </button>
                              {batch._count.errors > 0 && (
                                <Link className="button tertiary button-sm" href={`/batches/${batch.id}`} title="Apri il dettaglio righe scartate">
                                  Dettaglio errori
                                </Link>
                              )}
                              <button
                                className="button danger button-sm"
                                type="button"
                                title="Elimina questo batch"
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
      )}

      {activeTab === "orders" && (
        <div className="grid orders-grid">
          <section className="card">
            <h2 className="section-title">Filtri ordini</h2>
            <form onSubmit={onSearch} className="row">
              <input className="input" placeholder="Riferimento ordine o cliente" value={search} onChange={(e) => setSearch(e.target.value)} />
              <select className="select" value={carrier} onChange={(e) => setCarrier(e.target.value)}>
                <option value="">Tutti i corrieri</option>
                {carrierOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              <button className="button secondary" type="submit" disabled={ordersLoading}>
                {ordersLoading ? "Carico..." : "Applica"}
              </button>
            </form>
          </section>

          <section className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2 className="section-title">Ordini importati ({orders.length})</h2>
            </div>

            {selectedOrderIds.length > 0 && (
              <div className="sticky-bar">
                <span>{selectedOrderIds.length} ordini selezionati</span>
                <button className="button danger" type="button" onClick={deleteSelectedOrders}>
                  {pendingAction === "order_delete_many" ? "Elimino..." : `Elimina selezionati (${selectedOrderIds.length})`}
                </button>
              </div>
            )}

            {ordersLoading ? (
              <div className="skeleton-list">
                <div className="skeleton-row" />
                <div className="skeleton-row" />
                <div className="skeleton-row" />
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>
                        <input
                          aria-label="Seleziona tutti gli ordini"
                          type="checkbox"
                          checked={orders.length > 0 && selectedOrderIds.length === orders.length}
                          onChange={() => {
                            if (selectedOrderIds.length === orders.length) {
                              setSelectedOrderIds([]);
                            } else {
                              setSelectedOrderIds(orders.map((o) => o.id));
                            }
                          }}
                        />
                      </th>
                      <th>Rif. ordine</th>
                      <th>Cliente</th>
                      <th>Corriere</th>
                      <th>Righe</th>
                      <th>Stampa</th>
                      <th>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id}>
                        <td>
                          <input
                            aria-label={`Seleziona ordine ${order.orderReference}`}
                            type="checkbox"
                            checked={selectedOrderIds.includes(order.id)}
                            onChange={() =>
                              setSelectedOrderIds((prev) =>
                                prev.includes(order.id) ? prev.filter((x) => x !== order.id) : [...prev, order.id]
                              )
                            }
                          />
                        </td>
                        <td>{order.orderReference}</td>
                        <td>{order.clientName ?? "-"}</td>
                        <td>{order.carrierName ?? "-"}</td>
                        <td>{order._count.lines}</td>
                        <td>
                          {order.isPrinted ? <span className="badge good">Stampato x{order.printedCount}</span> : <span className="badge warn">Mai stampato</span>}
                        </td>
                        <td>
                          <div className="row">
                            <button className="button good" onClick={() => generateSingle(order.id)} type="button" disabled={pendingAction === `order_pdf_${order.id}`}>
                              {pendingAction === `order_pdf_${order.id}` ? "Genero..." : "PDF"}
                            </button>
                            <Link className="link" href={`/orders/${order.id}`}>
                              Dettaglio
                            </Link>
                            <button className="button danger" onClick={() => deleteSingleOrder(order.id)} type="button" disabled={pendingAction === `order_delete_${order.id}`}>
                              {pendingAction === `order_delete_${order.id}` ? "Elimino..." : "Elimina"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {confirmBulkKind && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3 className="section-title">Conferma eliminazione massiva</h3>
            {confirmBulkKind === "orders" ? (
              <p className="status-inline">
                Stai eliminando {selectedOrderIds.length} ordini selezionati. I PDF collegati verranno rimossi se non referenziati da altri record.
              </p>
            ) : (
              <p className="status-inline">
                Stai eliminando {selectedBatchIds.length} batch selezionati. Verranno rimossi ordini, errori import e PDF collegati.
              </p>
            )}
            <div className="row" style={{ marginTop: 10, justifyContent: "flex-end" }}>
              <button className="button secondary" type="button" onClick={() => setConfirmBulkKind(null)}>
                Annulla
              </button>
              <button className="button danger" type="button" onClick={executeBulkDelete}>
                Conferma eliminazione
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
