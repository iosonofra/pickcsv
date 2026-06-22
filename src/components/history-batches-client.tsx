"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";

type DebouncedInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
};

export function DebouncedInput({
  value,
  onChange,
  placeholder,
  className,
  style,
  title
}: DebouncedInputProps) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      onChange(localValue);
    }, 220);
    return () => clearTimeout(timer);
  }, [localValue, onChange]);

  return (
    <input
      className={className}
      placeholder={placeholder}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      style={style}
      title={title}
    />
  );
}

const BatchDrawerContent = dynamic(() => import("./batch-drawer-content"), {
  loading: () => (
    <div className="skeleton-table">
      <div className="skeleton-row" />
      <div className="skeleton-row" />
      <div className="skeleton-row" />
    </div>
  )
});


type BatchItem = {
  id: string;
  sourceFile: string;
  importSource?: "manual" | "auto" | string;
  autoUploadComputerName?: string | null;
  autoUploadUserName?: string | null;
  autoUploadClientId?: string | null;
  autoUploadIp?: string | null;
  autoUploadedAt?: string | Date | null;
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

type CodeType = "CODE128" | "QRCODE";
type DrawerState = {
  id: string;
} | null;

const makeId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const BATCH_PAGE_SIZE = 8;
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function HistoryBatchesClient({ initialBatches }: { initialBatches: BatchItem[] }) {
  const [batches, setBatches] = useState<BatchItem[]>(initialBatches);
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [batchSearch, setBatchSearch] = useState("");
  const [debouncedBatchSearch, setDebouncedBatchSearch] = useState("");
  const [batchSort, setBatchSort] = useState<"recent" | "print" | "orders" | "status" | "source">("recent");
  const [batchStatusFilter, setBatchStatusFilter] = useState<"all" | "new" | "printed" | "errors" | "auto">("all");
  const [batchPage, setBatchPage] = useState(1);
  const [undoBatchDeleteIds, setUndoBatchDeleteIds] = useState<string[] | null>(null);
  const undoBatchDeleteTimer = useRef<number | null>(null);
  const [codeType, setCodeType] = useState<CodeType>("QRCODE");
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "batch" | "bulk-batches"; id?: string } | null>(null);
  const [, startTransition] = useTransition();

  // Theme State
  const [theme, setTheme] = useState<"dark" | "light">("light");

  useEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem("picking_theme") || "light";
      if (savedTheme === "light") {
        setTheme("light");
        document.documentElement.classList.add("light-theme");
        document.cookie = "picking_theme=light; path=/; max-age=31536000; SameSite=Lax";
      } else {
        setTheme("dark");
        document.documentElement.classList.remove("light-theme");
        document.cookie = "picking_theme=dark; path=/; max-age=31536000; SameSite=Lax";
      }
    } catch {
      void 0;
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    try {
      window.localStorage.setItem("picking_theme", nextTheme);
      document.cookie = `picking_theme=${nextTheme}; path=/; max-age=31536000; SameSite=Lax`;
      if (nextTheme === "light") {
        document.documentElement.classList.add("light-theme");
        pushActivity("Tema chiaro attivato");
      } else {
        document.documentElement.classList.remove("light-theme");
        pushActivity("Tema scuro attivato");
      }
    } catch {
      void 0;
    }
  };

  // Drawer states
  const [activeDrawer, setActiveDrawer] = useState<DrawerState>(null);
  const [drawerData, setDrawerData] = useState<any>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState("");

  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);

  const handleCopyRow = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedRowId(id);
      setTimeout(() => setCopiedRowId(null), 2000);
    } catch {
      void 0;
    }
  };

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
      if (batchStatusFilter === "auto") return b.importSource === "auto";
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
    if (batchSort === "source") {
      return [...filtered].sort((a, b) => Number(b.importSource === "auto") - Number(a.importSource === "auto"));
    }
    return [...filtered].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [batches, debouncedBatchSearch, batchSort, batchStatusFilter]);

  const getAutoUploadLabel = (batch: BatchItem) => {
    const source = batch.autoUploadComputerName || batch.autoUploadUserName || batch.autoUploadClientId || "Windows";
    const uploadedAt = batch.autoUploadedAt ? new Date(batch.autoUploadedAt) : new Date(batch.createdAt);
    return `Upload automatico - ${source} - ${uploadedAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  };

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
          if (activeDrawer && ids.includes(activeDrawer.id)) {
            setActiveDrawer(null);
          }
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

  const deleteSingleBatch = (batchId: string, bypassConfirm = false) => {
    if (!bypassConfirm) {
      setDeleteConfirm({ type: "batch", id: batchId });
      return;
    }

    setError("");
    setStatus("");
    scheduleBatchDelete([batchId]);
  };

  const deleteSelectedBatches = (bypassConfirm = false) => {
    if (selectedBatchIds.length === 0) {
      setError("Seleziona almeno un batch da eliminare.");
      return;
    }
    if (!bypassConfirm) {
      setDeleteConfirm({ type: "bulk-batches" });
      return;
    }

    setError("");
    setStatus("");
    scheduleBatchDelete(selectedBatchIds);
  };

  const executeDeleteConfirm = () => {
    if (!deleteConfirm) return;
    const { type, id } = deleteConfirm;
    setDeleteConfirm(null);

    if (type === "batch" && id) {
      deleteSingleBatch(id, true);
    } else if (type === "bulk-batches") {
      deleteSelectedBatches(true);
    }
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

  // Sliding Drawer Effect
  useEffect(() => {
    if (!activeDrawer) {
      setDrawerData(null);
      setDrawerError("");
      return;
    }

    const fetchDrawerDetails = async () => {
      setDrawerLoading(true);
      setDrawerError("");
      try {
        const res = await fetch(`/api/batches/${activeDrawer.id}`);
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error ?? "Dati non trovati.");
        }
        
        setDrawerData(data.batch);
      } catch (err: any) {
        setDrawerError(err.message ?? "Errore nel caricamento dei dati.");
      } finally {
        setDrawerLoading(false);
      }
    };

    void fetchDrawerDetails();
  }, [activeDrawer]);

  return (
    <div className="app-container">
      {/* M3 TOP APP BAR */}
      <nav className="topbar">
        <div className="topbar-inner">
          <div className="topbar-brand">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 28, height: 28, flexShrink: 0 }} aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="4" style={{ stroke: "var(--md-primary)" }} />
              <line x1="3" y1="9" x2="21" y2="9" style={{ stroke: "var(--md-primary)", opacity: 0.35 }} />
              <line x1="3" y1="15" x2="21" y2="15" style={{ stroke: "var(--md-primary)", opacity: 0.35 }} />
              <line x1="9" y1="3" x2="9" y2="21" style={{ stroke: "var(--md-primary)", opacity: 0.35 }} />
              <circle cx="6" cy="6" r="1" style={{ fill: "var(--md-primary)", opacity: 0.8 }} />
              <circle cx="6" cy="12" r="1" style={{ fill: "var(--md-primary)", opacity: 0.8 }} />
              <circle cx="15" cy="6" r="1" style={{ fill: "var(--md-primary)", opacity: 0.8 }} />
              <polyline points="12 17 14 19 18 13" style={{ stroke: "var(--md-success)", strokeWidth: 3 }} />
            </svg>
            <div className="topbar-brand-text">PickCSV Archivio</div>
          </div>

          <div className="topbar-tabs">
            <Link href="/" className="topbar-tab" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span className="topbar-tab-icon" style={{ display: "inline-flex", alignSelf: "center" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              </span>
              Dashboard
            </Link>
            <button className="topbar-tab active" type="button" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span className="topbar-tab-icon" style={{ display: "inline-flex", alignSelf: "center" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              Storico Batch
            </button>
          </div>

          <div className="topbar-actions">
            <div style={{ display: "inline-flex", flexWrap: "nowrap", alignItems: "center", gap: 6 }} role="radiogroup" aria-label="Tipo codice su PDF">
              <button
                className={`chip ${codeType === "CODE128" ? "active" : ""}`}
                type="button"
                role="radio"
                aria-checked={codeType === "CODE128"}
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
                role="radio"
                aria-checked={codeType === "QRCODE"}
                onClick={() => {
                  setCodeType("QRCODE");
                  try { window.localStorage.setItem("picking_code_type", "QRCODE"); } catch { void 0; }
                }}
              >
                {codeType === "QRCODE" && <span className="chip-check" aria-hidden="true">✓</span>}
                QR Code
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* MAIN CONTENT AREA */}
      <main className="main-content">
        {/* PAGE HEADER */}
        <div className="page-header">
          <h1 className="title">Storico Batch</h1>
          <p className="subtitle">Archivio storico ed elaborazione massiva dei batch logistici oltre le 24 ore.</p>
        </div>

        {/* RECENT ACTIVITIES COMPONENT */}
        <section className="activity-card">
          <h3 className="section-title">Attività nel database storico</h3>
          {activities.length === 0 ? (
            <p className="status-inline" style={{ margin: 0 }}>Nessuna attività recente registrata nello storico.</p>
          ) : (
            <ul className="activity-list">
              {activities.map((a) => (
                <li key={a.id}>{`${a.message} - ${a.createdAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", hour12: false })}`}</li>
              ))}
            </ul>
          )}
        </section>

        {/* TOAST SYSTEM */}
        <div className="toast-stack" aria-live="polite" aria-atomic="true">
          {status && (
            <div className="toast ok">
              <div className="toast-content">
                <span className="toast-icon" style={{ display: "inline-flex", alignSelf: "center" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <span>{status}</span>
              </div>
              <div className="toast-progress" />
            </div>
          )}
          {error && (
            <div className="toast error">
              <div className="toast-content">
                <span className="toast-icon" style={{ display: "inline-flex", alignSelf: "center" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </span>
                <span>{error}</span>
              </div>
              <div className="toast-progress" />
            </div>
          )}
          {undoBatchDeleteIds && (
            <div className="toast undo">
              <div className="toast-content">
                <span className="toast-icon" style={{ display: "inline-flex", alignSelf: "center" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </span>
                <span>Batch in eliminazione: {undoBatchDeleteIds.length}</span>
              </div>
              <button className="button tertiary button-sm" style={{ minHeight: "28px", padding: "4px 10px" }} type="button" onClick={undoBatchDelete}>
                Annulla
              </button>
              <div className="toast-progress" />
            </div>
          )}
        </div>

        {/* MAIN DATA CARD */}
        <section className="card" style={{ marginTop: 10 }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <h2 className="section-title" style={{ marginBottom: 0 }}>Archivio Storico ({filteredBatches.length})</h2>
          </div>

          <div className="row batch-filters-row">
            <DebouncedInput
              className="input"
              placeholder="Cerca file storico (anche più parole)..."
              value={batchSearch}
              onChange={setBatchSearch}
              style={{ flex: 1 }}
            />
            <select className="select" value={batchSort} onChange={(e) => setBatchSort(e.target.value as any)}>
              <option value="recent">Più recenti</option>
              <option value="print">Più stampati</option>
              <option value="orders">Più ordini</option>
              <option value="status">Per stato</option>
              <option value="source">Origine</option>
            </select>
          </div>

          <div className="row quick-filters" style={{ marginTop: 10 }}>
            <button className={`chip ${batchStatusFilter === "all" ? "active" : ""}`} type="button" onClick={() => setBatchStatusFilter("all")}>Tutti</button>
            <button className={`chip ${batchStatusFilter === "new" ? "active" : ""}`} type="button" onClick={() => setBatchStatusFilter("new")}>Solo nuovi</button>
            <button className={`chip ${batchStatusFilter === "printed" ? "active" : ""}`} type="button" onClick={() => setBatchStatusFilter("printed")}>Solo stampati</button>
            <button className={`chip ${batchStatusFilter === "errors" ? "active" : ""}`} type="button" onClick={() => setBatchStatusFilter("errors")}>Solo con errori</button>
            <button className={`chip ${batchStatusFilter === "auto" ? "active" : ""}`} type="button" onClick={() => setBatchStatusFilter("auto")}>Automatici</button>
          </div>

          {selectedBatchIds.length === 0 && (
            <div className="sticky-bar" style={{ marginTop: 15, padding: "10px 14px" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                Mostrati {visibleBatches.length}/{filteredBatches.length}
              </span>
            </div>
          )}

          {isLoading ? (
            <div className="skeleton-table">
              <div className="skeleton-row" />
              <div className="skeleton-row" />
              <div className="skeleton-row" />
            </div>
          ) : visibleBatches.length === 0 ? (
            <div className="empty-state masterpiece-empty-state" style={{ marginTop: 16 }}>
                  <div className="empty-state-svg-wrapper">
                    <svg className="empty-state-svg" viewBox="0 0 100 100" width="80" height="80">
                      <rect className="svg-folder" x="20" y="25" width="60" height="50" rx="6" />
                      <path className="svg-folder-tab" d="M20 25 L35 25 L45 35 L80 35 L80 25 Z" />
                      <line className="svg-laser" x1="15" y1="50" x2="85" y2="50" />
                    </svg>
                  </div>
                  <p className="empty-state-title">Nessun batch archiviato nello storico</p>
                  <p className="drop-hint">I batch operativi più vecchi di 24 ore compaiono automaticamente in questa sezione d&apos;archivio.</p>
                </div>
          ) : (
            <>
              <div className="table-wrap batch-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: "36px" }}>
                        <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Seleziona tutti i batch storici" />
                      </th>
                      <th style={{ width: "100%" }}>File</th>
                      <th style={{ width: "90px", textAlign: "center" }}>Ordini</th>
                      <th style={{ width: "120px", textAlign: "center" }}>Stampa</th>
                      <th style={{ width: "80px", textAlign: "center" }}>PDF</th>
                      <th style={{ width: "120px", textAlign: "right" }}>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleBatches.map((batch) => {
                      const isAuto = batch.importSource === "auto";
                      return (
                        <tr
                          key={batch.id}
                          className={`auto-batch-row ${isAuto ? "is-auto" : ""}`}
                        >
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedBatchIds.includes(batch.id)}
                              onChange={() => toggleBatch(batch.id)}
                              aria-label={`Seleziona batch storico ${batch.sourceFile}`}
                            />
                          </td>
                          <td>
                            <div className="batch-file-cell" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                              <span 
                                style={{ 
                                  fontWeight: 600,
                                  display: "inline-block",
                                  whiteSpace: "nowrap",
                                  verticalAlign: "middle"
                                }}
                              >
                                {highlightFileName(batch.sourceFile)}
                              </span>
                              {isAuto && (
                                <div className="auto-upload-badge">
                                   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="auto-upload-badge-icon">
                                     <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                     <polyline points="17 8 12 3 7 8" />
                                     <line x1="12" y1="3" x2="12" y2="15" />
                                   </svg>
                                  <strong>Upload automatico</strong>
                                  <span style={{ opacity: 0.85, fontSize: "0.68rem" }}>
                                    &nbsp;{batch.autoUploadComputerName || batch.autoUploadUserName || batch.autoUploadClientId || batch.autoUploadIp || "Windows"}&nbsp;{new Date(batch.autoUploadedAt ?? batch.createdAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", hour12: false })}
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td style={{ fontWeight: 700, textAlign: "center" }}>{batch._count.orders}</td>
                        <td>
                          {batch.batchPrintCount > 0 ? (
                            <span className="badge good">Stampato x{batch.batchPrintCount}</span>
                          ) : (
                            <span className="badge warn">Mai stampato</span>
                          )}
                        </td>
                        <td>
                          <button
                            className="action-btn pdf-btn"
                            type="button"
                            onClick={() => generateBatch(batch.id)}
                            disabled={!!pendingAction}
                            title="Scarica PDF del batch"
                          >
                            {pendingAction === `batch_pdf_${batch.id}` ? (
                              "⏳"
                            ) : (
                              <>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12 }}>
                                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                  <polyline points="7 10 12 15 17 10" />
                                  <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                PDF
                              </>
                            )}
                          </button>
                        </td>
                        <td>
                          <div className="action-group">
                            {batch._count.errors > 0 && (
                              <button
                                className="action-btn errors-btn"
                                type="button"
                                onClick={() => setActiveDrawer({ id: batch.id })}
                                title="Visualizza errori"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12 }}>
                                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                  <line x1="12" y1="9" x2="12" y2="13" />
                                  <line x1="12" y1="17" x2="12.01" y2="17" />
                                </svg>
                                Errori
                              </button>
                            )}
                            <button
                              className="action-btn delete-btn"
                              type="button"
                              onClick={() => deleteSingleBatch(batch.id)}
                              disabled={pendingAction === "batch_delete_many"}
                              title="Elimina batch"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12 }}>
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                </table>
              </div>

              <div className="row pagination-row">
                <button className="button tertiary button-sm" type="button" onClick={() => setBatchPage((prev) => Math.max(1, prev - 1))} disabled={batchPage === 1}>
                  Precedente
                </button>
                <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
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

        {/* M3 BOTTOM SHEET */}
        <div 
          className={`bottom-sheet-overlay ${activeDrawer ? "open" : ""}`} 
          onClick={() => setActiveDrawer(null)}
        />
        <div className={`bottom-sheet ${activeDrawer ? "open" : ""}`}>
          <div className="bottom-sheet-handle" />
          <div className="bottom-sheet-header">
            <div className="bottom-sheet-title-group">
              <h3 className="bottom-sheet-title">Errori Import Batch Storico</h3>
              <p className="bottom-sheet-subtitle">Righe del foglio di calcolo che sono state escluse dal database</p>
            </div>
            <button className="bottom-sheet-close" onClick={() => setActiveDrawer(null)}>×</button>
          </div>
          
          <div className="bottom-sheet-body">
            {drawerLoading && (
              <div className="skeleton-table">
                <div className="skeleton-row" />
                <div className="skeleton-row" />
                <div className="skeleton-row" />
                <div className="skeleton-row short" />
              </div>
            )}
            
            {drawerError && (
              <p className="status error" style={{ width: "100%" }}>{drawerError}</p>
            )}
            
            {!drawerLoading && !drawerError && drawerData && (
              <BatchDrawerContent
                drawerData={drawerData}
                copiedRowId={copiedRowId}
                onCopyRow={handleCopyRow}
              />
            )}
          </div>
        </div>

        {/* FLOATING BULK ACTIONS BAR FOR BATCHES (M3) */}
        {selectedBatchIds.length > 0 && (
          <div className="floating-bulk-bar" role="toolbar" aria-label="Azioni di massa batch">
            <div className="floating-bulk-info">
              <span className="floating-bulk-counter">{selectedBatchIds.length}</span>
              <span className="floating-bulk-text">batch selezionat{selectedBatchIds.length === 1 ? "o" : "i"}</span>
            </div>
            
            <div className="floating-bulk-divider" />
            
            <div className="floating-bulk-actions">
              <button
                className="button secondary button-sm"
                type="button"
                disabled={pendingAction !== null}
                onClick={generateSelectedBatches}
                style={{ gap: 6 }}
              >
                {pendingAction === "batch_pdf_many" ? (
                  "Generazione..."
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Stampa selezionati
                  </>
                )}
              </button>
              
              <button
                className="button danger button-sm"
                type="button"
                disabled={pendingAction !== null}
                onClick={() => deleteSelectedBatches()}
                style={{ gap: 6 }}
              >
                {pendingAction === "batch_delete_many" ? (
                  "Eliminazione..."
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                    Elimina selezionati
                  </>
                )}
              </button>

              <button
                className="button tertiary button-sm"
                type="button"
                onClick={() => setSelectedBatchIds([])}
                disabled={pendingAction !== null}
              >
                Annulla
              </button>
            </div>
          </div>
        )}

        {/* DELETE ACTIONS CONFIRMATION MODAL */}
        {deleteConfirm && (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <div className="modal-card">
              <h3 className="section-title" style={{ color: "var(--color-error)" }}>
                {deleteConfirm.type.startsWith("bulk-") ? "Conferma Eliminazione Massiva" : "Conferma Eliminazione"}
              </h3>
              <p className="status-inline">
                {deleteConfirm.type === "batch" && (
                  <>Sei sicuro di voler eliminare definitivamente questo batch logistico? Saranno eliminati tutti gli ordini importati, scarti e file PDF associati.</>
                )}
                {deleteConfirm.type === "bulk-batches" && (
                  <>Attenzione! Stai per pianificare l&apos;eliminazione di <strong>{selectedBatchIds.length}</strong> batch caricati, inclusi tutti gli ordini importati, scarti e file PDF associati.</>
                )}
              </p>
              <div className="row" style={{ marginTop: 20, justifyContent: "flex-end", gap: 10 }}>
                <button className="button secondary button-sm" type="button" onClick={() => setDeleteConfirm(null)}>
                  Annulla
                </button>
                <button className="button danger button-sm" type="button" onClick={executeDeleteConfirm}>
                  Conferma ed elimina ora
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
