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
type ActiveTab = "home" | "orders" | "settings";
type DrawerState = {
  type: "order" | "batch";
  id: string;
} | null;

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
  const [batchSort, setBatchSort] = useState<"recent" | "print" | "orders" | "status" | "source">("recent");
  const [batchStatusFilter, setBatchStatusFilter] = useState<"all" | "new" | "printed" | "errors" | "auto">("all");
  const [batchPage, setBatchPage] = useState(1);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [lastAction, setLastAction] = useState<string>("");
  const [undoBatchDeleteIds, setUndoBatchDeleteIds] = useState<string[] | null>(null);
  const undoBatchDeleteTimer = useRef<number | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [codeType, setCodeType] = useState<CodeType>("QRCODE");
  const [activeTab, setActiveTab] = useState<ActiveTab>("home");
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
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "order" | "batch" | "bulk-orders" | "bulk-batches"; id?: string } | null>(null);
  const [importTouched, setImportTouched] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  // Drawer States
  const [activeDrawer, setActiveDrawer] = useState<DrawerState>(null);
  const [drawerData, setDrawerData] = useState<any>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState("");

  useEffect(() => { setLastUpdated(new Date()); }, []);
  const [autoImportToken, setAutoImportToken] = useState("");
  const [showAutoImportToken, setShowAutoImportToken] = useState(false);
  const [autoImportTokenConfigured, setAutoImportTokenConfigured] = useState<boolean | null>(null);
  const [autoImportOpenDashboard, setAutoImportOpenDashboard] = useState(false);
  const [copyCommandStatus, setCopyCommandStatus] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const runPreviewImportRef = useRef<() => Promise<void>>(async () => undefined);
  const lastOrderQueryRef = useRef<string>("");
  const [isPending, startTransition] = useTransition();

  // Theme State
  const [theme, setTheme] = useState<"dark" | "light">("light");

  useEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem("picking_theme") || "light";
      if (savedTheme === "light") {
        setTheme("light");
        document.documentElement.classList.add("light-theme");
      } else {
        setTheme("dark");
        document.documentElement.classList.remove("light-theme");
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

  const latestAutoUploadBatch = useMemo(() => {
    return batches
      .filter((batch) => batch.importSource === "auto")
      .sort((a, b) => +new Date(b.autoUploadedAt ?? b.createdAt) - +new Date(a.autoUploadedAt ?? a.createdAt))[0] ?? null;
  }, [batches]);

  const isRecentAutoUpload = (batch: BatchItem) => {
    if (batch.importSource !== "auto") return false;
    const sourceDate = new Date(batch.autoUploadedAt ?? batch.createdAt);
    return Date.now() - sourceDate.getTime() <= 5 * 60 * 1000;
  };

  const getAutoUploadLabel = (batch: BatchItem) => {
    const source = batch.autoUploadComputerName || batch.autoUploadUserName || batch.autoUploadClientId || "Windows";
    const uploadedAt = batch.autoUploadedAt ? new Date(batch.autoUploadedAt) : new Date(batch.createdAt);
    return `Upload automatico - ${source} - ${uploadedAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
  };

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
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const loadAutoImportSettings = async () => {
    setSettingsLoading(true);
    try {
      const res = await fetch("/api/settings/auto-import-token");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Errore caricamento impostazioni");
      }
      setAutoImportTokenConfigured(Boolean(data.configured));
      setAutoImportToken(typeof data.token === "string" ? data.token : "");
      setAutoImportOpenDashboard(Boolean(data.openDashboard));
    } finally {
      setSettingsLoading(false);
    }
  };

  const saveAutoImportToken = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setStatus("");

    const token = autoImportToken.trim();
    if (token.length < 16) {
      setError("Il token deve contenere almeno 16 caratteri.");
      return;
    }

    setPendingAction("save_auto_import_token");
    try {
      const res = await fetch("/api/settings/auto-import-token", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, openDashboard: autoImportOpenDashboard })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Errore salvataggio token");
      }
      setAutoImportToken(typeof data.token === "string" ? data.token : token);
      setAutoImportTokenConfigured(true);
      setAutoImportOpenDashboard(Boolean(data.openDashboard));
      setStatus("Token upload automatico salvato.");
      rememberLastAction("Token upload automatico aggiornato");
      pushActivity("Impostazioni upload automatico aggiornate");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore salvataggio token");
    } finally {
      setPendingAction(null);
    }
  };

  const saveAutoImportOpenDashboard = async (enabled: boolean) => {
    setAutoImportOpenDashboard(enabled);
    setError("");
    setStatus("");

    try {
      const res = await fetch("/api/settings/auto-import-token", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openDashboard: enabled })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Errore salvataggio impostazione");
      }
      setAutoImportOpenDashboard(Boolean(data.openDashboard));
      setStatus(enabled ? "Apertura automatica dashboard attivata." : "Apertura automatica dashboard disattivata.");
    } catch (err) {
      setAutoImportOpenDashboard((prev) => !prev);
      setError(err instanceof Error ? err.message : "Errore salvataggio impostazione");
    }
  };

  const escapedAutoImportToken = autoImportToken.trim().replace(/"/g, '`"');
  const windowsInstallCommand = escapedAutoImportToken
    ? String.raw`.\install-sendto.ps1 -Token "${escapedAutoImportToken}"`
    : String.raw`.\install-sendto.ps1 -Token "INCOLLA_IL_TOKEN"`;

  const copyWindowsInstallCommand = async () => {
    try {
      await navigator.clipboard.writeText(windowsInstallCommand);
      setCopyCommandStatus("Comando copiato.");
    } catch {
      setCopyCommandStatus("Copia non riuscita.");
    }
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
          if (activeDrawer && activeDrawer.type === "order" && activeDrawer.id === orderId) {
            // refresh active drawer data to show printed status
            const freshRes = await fetch(`/api/orders/${orderId}`);
            const freshData = await freshRes.json();
            if (freshRes.ok) setDrawerData(freshData.order);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Errore generazione PDF");
        } finally {
          setPendingAction(null);
        }
      })();
    });
  };

  const deleteSingleOrder = async (orderId: string, bypassConfirm = false) => {
    if (!bypassConfirm) {
      setDeleteConfirm({ type: "order", id: orderId });
      return;
    }
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
          if (activeDrawer?.type === "order" && activeDrawer.id === orderId) {
            setActiveDrawer(null);
          }
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
    setDeleteConfirm({ type: "bulk-orders" });
  };

  const printSelectedOrders = async () => {
    if (selectedOrderIds.length === 0) return;
    setError("");
    setStatus("");
    setPendingAction("order_print_many");
    startTransition(() => {
      void (async () => {
        try {
          const res = await fetch("/api/documents/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderIds: selectedOrderIds, codeType })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Errore stampa unificata");
          setStatus(`PDF unificato creato: ${data.fileName} (${data.orderCount} ordini).`);
          pushActivity(`Stampa unificata PDF (${data.orderCount} ordini)`);
          window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
          setSelectedOrderIds([]);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Errore stampa unificata");
        } finally {
          setPendingAction(null);
        }
      })();
    });
  };

  const resetFilters = async () => {
    setSearch("");
    setCarrier("");
    setDateFrom("");
    setDateTo("");
    setError("");
    setStatus("");
    setOrdersLoading(true);
    try {
      const res = await fetch(`/api/orders`);
      const data = await res.json();
      setOrdersLoading(false);
      if (!res.ok) {
        throw new Error(data.error ?? "Errore reset");
      }
      setOrders(data.orders);
      setSelectedOrderIds([]);
      setOrdersLoaded(true);
      setLastUpdated(new Date());
      lastOrderQueryRef.current = JSON.stringify({
        search: "",
        carrier: "",
        dateFrom: "",
        dateTo: ""
      });
    } catch (err) {
      setOrdersLoading(false);
      setError(err instanceof Error ? err.message : "Errore azzeramento filtri");
    }
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
          if (activeDrawer?.type === "batch" && ids.includes(activeDrawer.id)) {
            setActiveDrawer(null);
          }
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

  const deleteSingleBatch = async (batchId: string, bypassConfirm = false) => {
    if (!bypassConfirm) {
      setDeleteConfirm({ type: "batch", id: batchId });
      return;
    }
    setError("");
    scheduleBatchDeletion([batchId]);
  };

  const deleteSelectedBatches = async () => {
    if (selectedBatchIds.length === 0) {
      setError("Seleziona almeno un batch.");
      return;
    }
    setDeleteConfirm({ type: "bulk-batches" });
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

  const executeDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    const { type, id } = deleteConfirm;
    setDeleteConfirm(null);

    setError("");
    setStatus("");

    if (type === "order" && id) {
      await deleteSingleOrder(id, true);
    } else if (type === "batch" && id) {
      await deleteSingleBatch(id, true);
    } else if (type === "bulk-orders") {
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
          }
        })();
      });
    } else if (type === "bulk-batches") {
      scheduleBatchDeletion(selectedBatchIds);
    }
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
    if (activeTab !== "settings" || autoImportTokenConfigured !== null) return;
    void loadAutoImportSettings().catch((err) => setError(err instanceof Error ? err.message : "Errore caricamento impostazioni"));
  }, [activeTab, autoImportTokenConfigured]);

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

  // Sliding Drawer Effect for fetching details dynamically
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
        const url = activeDrawer.type === "order"
          ? `/api/orders/${activeDrawer.id}`
          : `/api/batches/${activeDrawer.id}`;
        
        const res = await fetch(url);
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error ?? "Dati non trovati.");
        }
        
        if (activeDrawer.type === "order") {
          setDrawerData(data.order);
        } else {
          setDrawerData(data.batch);
        }
      } catch (err: any) {
        setDrawerError(err.message ?? "Errore nel caricamento del dettaglio.");
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
            <div className="topbar-brand-text">Picking Logistica</div>
          </div>

          <div className="topbar-tabs">
            <button
              className={`topbar-tab ${activeTab === "home" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveTab("home")}
            >
              <span className="topbar-tab-icon" style={{ display: "inline-flex", alignSelf: "center" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              </span>
              Home
            </button>
            <button
              className={`topbar-tab ${activeTab === "orders" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveTab("orders")}
            >
              <span className="topbar-tab-icon" style={{ display: "inline-flex", alignSelf: "center" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                  <polyline points="21 8 21 21 3 21 3 8" />
                  <rect x="1" y="3" width="22" height="5" rx="1" />
                  <line x1="10" y1="12" x2="14" y2="12" />
                </svg>
              </span>
              Ordini
            </button>
            <button
              className={`topbar-tab ${activeTab === "settings" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveTab("settings")}
            >
              <span className="topbar-tab-icon" style={{ display: "inline-flex", alignSelf: "center" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l-.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </span>
              Impostazioni
            </button>
          </div>

          <div className="topbar-actions">
            <div className="segmented-control" role="radiogroup" aria-label="Tipo codice su PDF">
              <button
                className={`segmented-button ${codeType === "CODE128" ? "active" : ""}`}
                type="button"
                role="radio"
                aria-checked={codeType === "CODE128"}
                onClick={() => {
                  setCodeType("CODE128");
                  try { window.localStorage.setItem("picking_code_type", "CODE128"); } catch { void 0; }
                }}
                title="Usa barcode lineare Code128"
              >
                {codeType === "CODE128" && <span className="segmented-check" aria-hidden="true">✓</span>}
                Barcode
              </button>
              <button
                className={`segmented-button ${codeType === "QRCODE" ? "active" : ""}`}
                type="button"
                role="radio"
                aria-checked={codeType === "QRCODE"}
                onClick={() => {
                  setCodeType("QRCODE");
                  try { window.localStorage.setItem("picking_code_type", "QRCODE"); } catch { void 0; }
                }}
                title="Usa QR code quadrato"
              >
                {codeType === "QRCODE" && <span className="segmented-check" aria-hidden="true">✓</span>}
                QR Code
              </button>
            </div>

            <div className="topbar-divider" />

            <Link href="/history" className="button outlined button-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              Storico
            </Link>

            {latestBatch && (
              <button
                className="button button-sm"
                type="button"
                onClick={() => generateBatch(latestBatch.id, true)}
                disabled={pendingAction === `batch_pdf_${latestBatch.id}`}
                style={{ gap: 6 }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                {pendingAction === `batch_pdf_${latestBatch.id}` ? "Ristampo..." : "Ristampa ultimo"}
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* MAIN CONTENT AREA */}
      <main className="main-content">
        {/* PAGE HEADER */}
        <div className="page-header">
          <h1 className="title">
            {activeTab === "home" && "Dashboard Logistica"}
            {activeTab === "orders" && "Gestione Ordini"}
            {activeTab === "settings" && "Impostazioni API"}
          </h1>
          <p className="subtitle">
            {activeTab === "home" && "Import rapido, stampa batch e storico operativo in un solo flusso."}
            {activeTab === "orders" && "Filtra, esamina e gestisci l'elenco completo degli ordini logistici."}
            {activeTab === "settings" && "Configura i token di autenticazione per l'upload automatico."}
          </p>
        </div>

        {/* LOADING INDICATOR */}
        {activeTab === "home" && batchesLoading && <p className="status-inline" style={{ textAlign: "center", marginBottom: 16 }}>Aggiornamento dati in corso...</p>}

        {/* KPI MODULE */}
        {activeTab === "home" && (
          <>
            <section className="kpi-grid">
              <article className="kpi-card">
                <div className="kpi-icon batches" style={{ display: "inline-flex", alignSelf: "center", justifyContent: "center" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                </div>
                <div className="kpi-body">
                  <p className="kpi-label">Batch Recenti</p>
                  <p className="kpi-value">{kpis.recentBatches}</p>
                </div>
              </article>
              <article className="kpi-card">
                <div className="kpi-icon orders" style={{ display: "inline-flex", alignSelf: "center", justifyContent: "center" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
                    <polyline points="21 8 21 21 3 21 3 8" />
                    <rect x="1" y="3" width="22" height="5" rx="1" />
                    <line x1="10" y1="12" x2="14" y2="12" />
                  </svg>
                </div>
                <div className="kpi-body">
                  <p className="kpi-label">Ordini in Coda (24h)</p>
                  <p className="kpi-value">{kpis.recentOrders}</p>
                </div>
              </article>
              <article className="kpi-card">
                <div className="kpi-icon errors" style={{ display: "inline-flex", alignSelf: "center", justifyContent: "center" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
                <div className="kpi-body">
                  <p className="kpi-label">Errori</p>
                  <p className="kpi-value" style={{ color: kpis.recentErrors > 0 ? "var(--color-error)" : "inherit" }}>{kpis.recentErrors}</p>
                </div>
              </article>
            </section>
            
            <div className="kpi-updated-row">
              <p className="kpi-updated">Ultimo aggiornamento: {lastUpdated?.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) ?? ""}</p>
              <button
                className="button tertiary button-sm"
                type="button"
                disabled={batchesLoading}
                onClick={() => {
                  startTransition(() => {
                    void refreshBatches().catch((err) => setError(err instanceof Error ? err.message : "Errore aggiornamento"));
                  });
                }}
              >
                {batchesLoading ? "Aggiorno..." : "Aggiorna ora"}
              </button>
            </div>
          </>
        )}

        {/* RECENT ACTIVITIES COMPONENT */}
        <details className="activity-card">
          <summary className="activity-summary">Attività operative recenti</summary>
          {activities.length === 0 ? (
            <p className="status-inline" style={{ margin: 0 }}>Nessuna attività registrata in questa sessione.</p>
          ) : (
            <ul className="activity-list">
              {activities.map((a) => (
                <li key={a.id}>{`${a.message} - ${a.createdAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`}</li>
              ))}
            </ul>
          )}
          {lastAction && <p className="status-inline activity-last-action">Ultima azione confermata: {lastAction}</p>}
        </details>

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
                <span>Cancellazione batch: {undoBatchDeleteIds.length} pianificata.</span>
              </div>
              <button className="button tertiary button-sm" style={{ minHeight: "28px", padding: "4px 10px" }} type="button" onClick={undoBatchDeletion}>
                Annulla
              </button>
              <div className="toast-progress" />
            </div>
          )}
        </div>

        {/* TAB 1: HOME (IMPORT & BATCH RECENTI) */}
        {activeTab === "home" && (
          <div className="grid">
            {/* EXCEL IMPORT CARD */}
            <section className="card">
              <h2 className="section-title">Importazione File Excel / CSV</h2>
              <div className="wizard-row">
                <span className={importStep === 1 ? "wizard-step active current" : "wizard-step"}>1. Carica</span>
                <span className={importStep === 2 ? "wizard-step active current" : "wizard-step"}>2. Anteprima</span>
                <span className={importStep === 3 ? "wizard-step active current" : "wizard-step"}>3. Elaborato</span>
              </div>
              <p className="wizard-hint" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ display: "inline-flex", alignSelf: "center" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                    <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A5 5 0 0 0 8 8c0 1 .5 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
                    <line x1="9" y1="18" x2="15" y2="18" />
                    <line x1="10" y1="22" x2="14" y2="22" />
                  </svg>
                </span>
                Scorciatoia: premi Ctrl+Invio per l&apos;anteprima se il file è pronto.
              </p>
              
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
                  <div className="drop-zone-icon" style={{ display: "inline-flex", alignSelf: "center", justifyContent: "center" }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 32, height: 32, marginBottom: 8 }}>
                      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                    </svg>
                  </div>
                  <p>Trascina qui il file Excel (.xlsx) o CSV (delimitatore ;)</p>
                  <p className="drop-hint">oppure clicca per sfogliare il computer</p>
                  <input
                    ref={fileInputRef}
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
                </div>

                {selectedFile && (
                  <div className="selected-file-card">
                    <div className="file-card-info-row">
                      <div className="file-card-icon-container" style={{ display: "inline-flex", alignSelf: "center", justifyContent: "center" }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                      </div>
                      <div className="file-card-details">
                        <span className="file-card-name" title={selectedFile.name}>{selectedFile.name}</span>
                        <span className="file-card-size">{(selectedFile.size / 1024).toFixed(1)} KB • Pronto per l&apos;elaborazione</span>
                      </div>
                      <button 
                        type="button" 
                        className="file-card-remove-btn"
                        onClick={resetImportFlow}
                        title="Rimuovi file"
                      >
                        ×
                      </button>
                    </div>
                    {importStep === 1 && (
                      <div className="file-card-progress-container pending-action-required">
                        <div className="file-card-pulse-indicator" />
                        <span className="file-card-progress-text pending-cta-text">
                          👉 Clicca su &quot;Genera anteprima righe&quot; in basso per iniziare
                        </span>
                      </div>
                    )}
                    {importStep === 2 && (
                      <div className="file-card-progress-container success">
                        <div className="file-card-progress-bar-fill" style={{ width: "100%" }} />
                        <span className="file-card-progress-text">Analisi completata con successo!</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="row" style={{ marginTop: 10 }}>
                  {importStep === 1 && (
                    <button 
                      className="button pulse-cta" 
                      type="button" 
                      onClick={runPreviewImport} 
                      disabled={isPending || pendingAction === "preview" || !selectedFile}
                    >
                      {pendingAction === "preview" ? "Analisi in corso..." : "Genera anteprima righe"}
                    </button>
                  )}
                  {importStep === 2 && (
                    <button className="button good" type="button" onClick={confirmImport} disabled={pendingAction === "upload"}>
                      {pendingAction === "upload" ? "Salvataggio in database..." : "Conferma importazione ed elabora"}
                    </button>
                  )}
                  {importStep === 3 && (
                    <button className="button secondary" type="button" onClick={resetImportFlow}>
                      Importa un altro file
                    </button>
                  )}
                  {importStep === 2 && (
                    <button className="button tertiary" type="button" onClick={resetImportFlow} disabled={pendingAction !== null}>
                      Annulla e reimposta
                    </button>
                  )}
                </div>
              </form>

              {/* IMPORT PREVIEW TABLE */}
              {importPreview && (
                <div className="preview-box" style={{ marginTop: 20 }}>
                  <h3 className="section-title" style={{ fontSize: "0.95rem", marginBottom: 10 }}>Riepilogo anteprima file</h3>
                  <p className="status-inline" style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                    Righe totali: <strong>{importPreview.summary.totalRows}</strong> | Ordini pronti: <strong>{importPreview.summary.importedOrders}</strong> | Righe scartate: <strong>{importPreview.summary.skippedRows}</strong> | Duplicati: <strong>{importPreview.summary.duplicateRows}</strong>
                  </p>
                  
                  <div className="table-wrap" style={{ marginTop: 10 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Rif. Ordine</th>
                          <th>Cliente</th>
                          <th>Corriere</th>
                          <th>Righe Articolo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.previewOrders.map((item) => (
                          <tr key={item.orderReference}>
                            <td style={{ fontWeight: 700 }}>{item.orderReference}</td>
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
                <div style={{ marginTop: 15, padding: "12px 16px", borderRadius: "12px", background: "var(--color-success-glow)", border: "1px solid rgba(16, 185, 129, 0.25)", display: "flex", alignItems: "center", gap: 8 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, color: "var(--color-success)", flexShrink: 0 }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <p className="status-inline" style={{ margin: 0, color: "var(--color-success)", fontSize: "0.82rem" }}>
                    <strong>Importazione completata con successo!</strong> Righe: {summary.totalRows} | Ordini inseriti: {summary.importedOrders} | Scartati: {summary.skippedRows} | Duplicati: {summary.duplicateRows}
                  </p>
                </div>
              )}
            </section>

            {/* BATCH RECENTI (LEFT SIDE IN SPLIT SCREEN) */}
            <section className="card">
              <h2 className="section-title">Batch Recenti (Ultime 24 Ore)</h2>
              
              {latestAutoUploadBatch && (
                <div className={`auto-upload-banner ${isRecentAutoUpload(latestAutoUploadBatch) ? "fresh" : ""}`}>
                  <strong>📥 File caricato automaticamente da Windows</strong>
                  <span style={{ fontSize: "0.76rem" }}>
                    Nome: <strong>{latestAutoUploadBatch.sourceFile}</strong> | Ordini: {latestAutoUploadBatch._count.orders} | {getAutoUploadLabel(latestAutoUploadBatch)}
                  </span>
                </div>
              )}

              <div className="row batch-filters-row">
                <input
                  className="input"
                  placeholder="Cerca file batch..."
                  value={batchSearch}
                  onChange={(e) => setBatchSearch(e.target.value)}
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

              {selectedBatchIds.length > 0 && (
                <div className="sticky-bar" style={{ padding: "10px 14px", marginTop: 12 }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 700 }}>{selectedBatchIds.length} batch selezionati</span>
                  <div className="row">
                    <button
                      className="button secondary button-sm"
                      type="button"
                      disabled={pendingAction === "batch_pdf_many"}
                      onClick={generateSelectedBatchPdfs}
                    >
                      {pendingAction === "batch_pdf_many" ? "Generazione..." : "Scarica PDF"}
                    </button>
                    <button
                      className="button danger button-sm"
                      type="button"
                      disabled={pendingAction === "batch_delete_many"}
                      onClick={deleteSelectedBatches}
                    >
                      Elimina
                    </button>
                  </div>
                </div>
              )}

              {batchesLoading ? (
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
                  <p className="empty-state-title">Nessun batch caricato nelle ultime 24 ore</p>
                  <p className="drop-hint">Trascina un file Excel a sinistra per caricare subito i tuoi ordini logistici.</p>
                </div>
              ) : (
                <>
                  <div className="table-wrap batch-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: "36px" }}>
                            <input
                              aria-label="Seleziona tutti i batch"
                              type="checkbox"
                              checked={allVisibleSelected}
                              onChange={toggleAllVisibleBatches}
                            />
                          </th>
                          <th>File</th>
                          <th style={{ width: "70px" }}>Ordini</th>
                          <th>Stato</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleBatches.map((batch) => (
                          <tr key={batch.id} className={isRecentAutoUpload(batch) ? "recent-auto-row" : ""}>
                            <td>
                              <input
                                aria-label={`Seleziona batch ${batch.sourceFile}`}
                                type="checkbox"
                                checked={selectedBatchIds.includes(batch.id)}
                                onChange={() => toggleBatchSelection(batch.id)}
                              />
                            </td>
                            <td>
                              <div className="batch-file-cell">
                                <span 
                                  title={batch.sourceFile} 
                                  style={{ 
                                    fontWeight: 600, 
                                    display: "inline-block", 
                                    whiteSpace: "nowrap" 
                                  }}
                                >
                                  {highlightFileName(batch.sourceFile)}
                                </span>
                                {batch.importSource === "auto" && <span className="badge auto-upload" style={{ fontSize: "0.65rem", padding: "2px 6px" }}>Auto-uploaded</span>}
                              </div>
                            </td>
                            <td style={{ fontWeight: 700 }}>{batch._count.orders}</td>
                            <td>
                              <div className="row" style={{ gap: 6 }}>
                                {batch.batchPrintCount > 0 ? (
                                  <span className="badge good">Stampato x{batch.batchPrintCount}</span>
                                ) : (
                                  <span className="badge warn">Nuovo</span>
                                )}
                                {batch._count.errors > 0 && <span className="badge error">Errori</span>}
                              </div>
                            </td>
                            <td>
                              <div className="action-group">
                                <button
                                  className="action-btn pdf-btn"
                                  onClick={() => generateBatch(batch.id)}
                                  type="button"
                                  disabled={pendingAction === `batch_pdf_${batch.id}`}
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
                                {batch._count.errors > 0 && (
                                  <button 
                                    className="action-btn errors-btn" 
                                    type="button" 
                                    onClick={() => setActiveDrawer({ type: "batch", id: batch.id })}
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
                        ))}
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
          </div>
        )}

        {/* TAB 2: ORDINI IMPORTATI */}
        {activeTab === "orders" && (
          <div className="grid orders-grid">
            {/* ORDERS SPECIFIC KPI MODULE (M3) */}
            <section className="kpi-grid" style={{ marginBottom: 0 }}>
              <article className="kpi-card">
                <div className="kpi-icon orders" style={{ display: "inline-flex", alignSelf: "center", justifyContent: "center", background: "var(--color-primary-glow)", border: "1px solid rgba(87, 157, 255, 0.15)" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20, color: "var(--md-primary)" }}>
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                  </svg>
                </div>
                <div className="kpi-body">
                  <p className="kpi-label">Ordini Trovati</p>
                  <p className="kpi-value">{orders.length}</p>
                </div>
              </article>
              <article className="kpi-card">
                <div className="kpi-icon errors" style={{ display: "inline-flex", alignSelf: "center", justifyContent: "center", background: "var(--md-warning-container)", border: "1px solid rgba(255, 196, 0, 0.15)" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20, color: "var(--md-warning)" }}>
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                </div>
                <div className="kpi-body">
                  <p className="kpi-label">Da Stampare</p>
                  <p className="kpi-value">{orders.filter(o => !o.isPrinted).length}</p>
                </div>
              </article>
              <article className="kpi-card">
                <div className="kpi-icon batches" style={{ display: "inline-flex", alignSelf: "center", justifyContent: "center", background: "var(--md-success-container)", border: "1px solid rgba(76, 156, 108, 0.15)" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20, color: "var(--md-success)" }}>
                    <rect x="3" y="3" width="7" height="9" />
                    <rect x="14" y="3" width="7" height="5" />
                    <rect x="14" y="12" width="7" height="9" />
                    <rect x="3" y="16" width="7" height="5" />
                  </svg>
                </div>
                <div className="kpi-body">
                  <p className="kpi-label">Righe Totali</p>
                  <p className="kpi-value">{orders.reduce((sum, o) => sum + o._count.lines, 0)}</p>
                </div>
              </article>
            </section>

            {/* FILTERS PANEL */}
            <section className="card">
              <h2 className="section-title">Filtra Ordini</h2>
              <form onSubmit={onSearch} className="row" style={{ gap: 12, alignItems: "center" }}>
                
                <div className="filter-input-wrapper search" style={{ flex: 1.5, minWidth: "200px" }}>
                  <span className="filter-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 14, height: 14 }}>
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </span>
                  <input 
                    className="input filter-input-with-icon" 
                    placeholder="Riferimento ordine o cliente..." 
                    value={search} 
                    onChange={(e) => setSearch(e.target.value)} 
                  />
                </div>

                <div className="filter-input-wrapper select-wrapper" style={{ flex: 1, minWidth: "160px" }}>
                  <span className="filter-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 14, height: 14 }}>
                      <rect x="1" y="3" width="22" height="18" rx="2" ry="2" />
                      <line x1="9" y1="21" x2="9" y2="9" />
                    </svg>
                  </span>
                  <select className="select filter-input-with-icon" value={carrier} onChange={(e) => setCarrier(e.target.value)}>
                    <option value="">Tutti i corrieri</option>
                    {carrierOptions.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>

                <div className="filter-input-wrapper date" style={{ flex: 0.8, minWidth: "130px" }}>
                  <span className="filter-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 14, height: 14 }}>
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </span>
                  <input className="input filter-input-with-icon" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="Data da" />
                </div>

                <div className="filter-input-wrapper date" style={{ flex: 0.8, minWidth: "130px" }}>
                  <span className="filter-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 14, height: 14 }}>
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </span>
                  <input className="input filter-input-with-icon" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="Data a" />
                </div>

                <div style={{ display: "inline-flex", gap: 8, flexShrink: 0 }}>
                  <button className="button secondary" type="submit" disabled={ordersLoading}>
                    {ordersLoading ? "Ricerca..." : "Applica filtri"}
                  </button>
                  
                  {(!!search || !!carrier || !!dateFrom || !!dateTo) && (
                    <button className="button tertiary" type="button" onClick={resetFilters} disabled={ordersLoading}>
                      Azzera
                    </button>
                  )}
                </div>
              </form>
            </section>

            {/* ORDERS LIST */}
            <section className="card">
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
                <h2 className="section-title" style={{ marginBottom: 0 }}>Ordini Importati ({orders.length})</h2>
              </div>

              {ordersLoading && orders.length === 0 ? (
                <div className="skeleton-list">
                  <div className="skeleton-row" />
                  <div className="skeleton-row" />
                  <div className="skeleton-row" />
                </div>
              ) : orders.length === 0 ? (
                <div className="empty-state masterpiece-empty-state">
                  <div className="empty-state-svg-wrapper">
                    <svg className="empty-state-svg" viewBox="0 0 100 100" width="80" height="80">
                      <rect className="svg-folder" x="20" y="25" width="60" height="50" rx="6" />
                      <path className="svg-folder-tab" d="M20 25 L35 25 L45 35 L80 35 L80 25 Z" />
                      <line className="svg-laser" x1="15" y1="50" x2="85" y2="50" />
                    </svg>
                  </div>
                  <p className="empty-state-title">Nessun ordine trovato</p>
                  <p className="drop-hint">Prova a modificare i filtri di ricerca in alto o carica un nuovo file in Home.</p>
                </div>
              ) : (
                <div className={`table-wrap ${ordersLoading ? "loading-fade" : ""}`} style={{ position: "relative" }}>
                  {ordersLoading && <div className="live-progress-bar" />}
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: "36px" }}>
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
                        <th>Riferimento</th>
                        <th>Cliente</th>
                        <th>Corriere</th>
                        <th style={{ width: "60px" }}>Righe</th>
                        <th>Stampa</th>
                        <th style={{ textAlign: "right" }}>Azioni</th>
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
                          <td className="code-font" style={{ fontWeight: 700 }}>{order.orderReference}</td>
                          <td style={{ fontWeight: 600 }}>{order.clientName ?? "-"}</td>
                          <td>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                              <span style={{ display: "inline-flex", color: "var(--md-on-surface-variant)", opacity: 0.7 }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 13, height: 13 }}>
                                  <rect x="1" y="3" width="15" height="13" />
                                  <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                                  <circle cx="5.5" cy="18.5" r="2.5" />
                                  <circle cx="18.5" cy="18.5" r="2.5" />
                                </svg>
                              </span>
                              {order.carrierName ?? "-"}
                            </div>
                          </td>
                          <td style={{ fontWeight: 700 }}>{order._count.lines}</td>
                          <td>
                            {order.isPrinted ? (
                              <span className="badge good">Stampato x{order.printedCount}</span>
                            ) : (
                              <span className="badge warn">Da stampare</span>
                            )}
                          </td>
                          <td>
                            <div className="action-group">
                              <button
                                className="action-btn pdf-btn"
                                onClick={() => generateSingle(order.id)}
                                type="button"
                                disabled={pendingAction === `order_pdf_${order.id}`}
                                title="Scarica PDF ordine"
                              >
                                {pendingAction === `order_pdf_${order.id}` ? (
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

                              <button
                                className="action-btn errors-btn"
                                type="button"
                                onClick={() => setActiveDrawer({ type: "order", id: order.id })}
                                title="Visualizza dettaglio ordine"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12 }}>
                                  <circle cx="11" cy="11" r="8" />
                                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                </svg>
                                Dettaglio
                              </button>

                              <button
                                className="action-btn delete-btn"
                                type="button"
                                onClick={() => deleteSingleOrder(order.id)}
                                disabled={pendingAction === `order_delete_${order.id}`}
                                title="Elimina ordine"
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
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 3: IMPOSTAZIONI */}
        {activeTab === "settings" && (
          <div className="settings-grid">
            <section className="card">
              <h2 className="section-title">Integrazione Automatica Windows</h2>
              
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0 20px 0" }}>
                <span className="field-label" style={{ margin: 0 }}>Stato configurazione:</span>
                {settingsLoading ? (
                  <span className="badge info">Lettura...</span>
                ) : autoImportTokenConfigured ? (
                  <span className="badge good active-pulse" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span className="pulse-dot" />
                    Attivo e Configurato
                  </span>
                ) : (
                  <span className="badge warn">Non configurato</span>
                )}
              </div>
              
              <form className="settings-form" onSubmit={saveAutoImportToken}>
                <label className="field-label" htmlFor="auto-import-token">
                  Token di Autenticazione API
                </label>
                <p className="status-inline" style={{ fontSize: "0.78rem", color: "var(--color-text-dim)", margin: 0 }}>
                  Questo token protegge l&apos;endpoint ed è memorizzato nel database SQLite. Viene usato dagli script PowerShell su Windows.
                </p>
                
                <div className="input-with-action">
                  <input
                    id="auto-import-token"
                    className="input token-input-inline"
                    type={showAutoImportToken ? "text" : "password"}
                    value={autoImportToken}
                    placeholder="Inserisci o genera il token segreto..."
                    autoComplete="new-password"
                    onChange={(e) => setAutoImportToken(e.target.value)}
                    style={{ paddingRight: "44px" }}
                  />
                  {autoImportToken && (
                    <button
                      className="input-inline-action-btn"
                      type="button"
                      onClick={() => setShowAutoImportToken((prev) => !prev)}
                      title={showAutoImportToken ? "Nascondi token" : "Mostra token"}
                    >
                      {showAutoImportToken ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}>
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>

                <div className="row" style={{ marginTop: 8 }}>
                  <button className="button" type="submit" disabled={pendingAction === "save_auto_import_token"}>
                    {pendingAction === "save_auto_import_token" ? "Salvataggio..." : "Salva impostazioni"}
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => {
                      const bytes = new Uint8Array(32);
                      window.crypto.getRandomValues(bytes);
                      setAutoImportToken(Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""));
                      setShowAutoImportToken(true);
                    }}
                  >
                    Genera nuovo token casuale
                  </button>
                </div>

                <label className="toggle-row" style={{ marginTop: 12 }}>
                  <input
                    type="checkbox"
                    checked={autoImportOpenDashboard}
                    onChange={(event) => void saveAutoImportOpenDashboard(event.target.checked)}
                  />
                  <span>Apri automaticamente questa dashboard nel browser all&apos;arrivo di un upload da Windows</span>
                </label>
              </form>

              <div className="terminal-card" style={{ marginTop: 24 }}>
                <div className="terminal-header">
                  <div className="terminal-dots">
                    <span className="dot red" />
                    <span className="dot yellow" />
                    <span className="dot green" />
                  </div>
                  <span className="terminal-title">PowerShell (Windows)</span>
                </div>
                <div className="terminal-body">
                  <p className="terminal-description">
                    Esegui questo comando all&apos;interno della directory <code>tools/windows-sendto</code> per configurare il menu contestuale Windows:
                  </p>
                  <pre className="terminal-code">
                    <code>{windowsInstallCommand}</code>
                  </pre>
                  <div className="row" style={{ marginTop: 6 }}>
                    <button 
                      className={`button ${copyCommandStatus ? "good" : "secondary"} button-sm`}
                      type="button" 
                      onClick={copyWindowsInstallCommand}
                      style={{ gap: 6 }}
                    >
                      {copyCommandStatus ? (
                        <>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Comando Copiato!
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                          Copia comando PowerShell
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Preferenze Visive Card */}
            <section className="card">
              <h2 className="section-title">Preferenze Visive</h2>
              <p className="status-inline" style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", margin: 0 }}>
                Personalizza l&apos;aspetto visivo dell&apos;interfaccia Picking Logistica.
              </p>

              <div style={{ marginTop: 18 }}>
                <span className="field-label" style={{ display: "block", marginBottom: 12, fontSize: "0.85rem", fontWeight: 600 }}>
                  Tema dell&apos;applicazione
                </span>
                
                <div className="theme-grid">
                  <button
                    type="button"
                    className={`theme-card ${theme === "light" ? "active" : ""}`}
                    onClick={() => theme !== "light" && toggleTheme()}
                  >
                    <div className="theme-card-preview light">
                      <span className="preview-sun" />
                    </div>
                    <div className="theme-card-label">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                        <circle cx="12" cy="12" r="5" />
                        <line x1="12" y1="1" x2="12" y2="3" />
                        <line x1="12" y1="21" x2="12" y2="23" />
                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                        <line x1="1" y1="12" x2="3" y2="12" />
                        <line x1="21" y1="12" x2="23" y2="12" />
                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                      </svg>
                      Tema Chiaro
                    </div>
                  </button>
                  
                  <button
                    type="button"
                    className={`theme-card ${theme === "dark" ? "active" : ""}`}
                    onClick={() => theme !== "dark" && toggleTheme()}
                  >
                    <div className="theme-card-preview dark">
                      <span className="preview-moon" />
                    </div>
                    <div className="theme-card-label">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                      </svg>
                      Tema Scuro
                    </div>
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}
        {/* FLOATING BULK ACTIONS BAR (M3) */}
        {selectedOrderIds.length > 0 && (
          <div className="floating-bulk-bar" role="toolbar" aria-label="Azioni di massa ordini">
            <div className="floating-bulk-info">
              <span className="floating-bulk-counter">{selectedOrderIds.length}</span>
              <span className="floating-bulk-text">ordin{selectedOrderIds.length === 1 ? "e" : "i"} selezionat{selectedOrderIds.length === 1 ? "o" : "i"}</span>
            </div>
            
            <div className="floating-bulk-divider" />
            
            <div className="floating-bulk-actions">
              <button
                className="button good button-sm"
                type="button"
                disabled={pendingAction !== null}
                onClick={printSelectedOrders}
                style={{ gap: 6 }}
              >
                {pendingAction === "order_print_many" ? (
                  "Generazione..."
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                      <polyline points="6 9 6 2 18 2 18 9" />
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <rect x="6" y="14" width="12" height="8" />
                    </svg>
                    Stampa unificata PDF
                  </>
                )}
              </button>
              
              <button
                className="button danger button-sm"
                type="button"
                disabled={pendingAction !== null}
                onClick={deleteSelectedOrders}
                style={{ gap: 6 }}
              >
                {pendingAction === "order_delete_many" ? (
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
                onClick={() => setSelectedOrderIds([])}
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
                {deleteConfirm.type === "order" && (
                  <>Sei sicuro di voler eliminare definitivamente questo ordine? Questa operazione non può essere annullata e tutti i file PDF ad esso collegati verranno eliminati.</>
                )}
                {deleteConfirm.type === "batch" && (
                  <>Sei sicuro di voler eliminare definitivamente questo batch logistico? Saranno eliminati tutti gli ordini importati, scarti e file PDF associati.</>
                )}
                {deleteConfirm.type === "bulk-orders" && (
                  <>Attenzione! Stai per eliminare definitivamente <strong>{selectedOrderIds.length}</strong> ordini e tutti i file PDF ad essi collegati. Questa operazione non può essere annullata.</>
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

        {/* M3 BOTTOM SHEET */}
        <div 
          className={`bottom-sheet-overlay ${activeDrawer ? "open" : ""}`} 
          onClick={() => setActiveDrawer(null)}
        />
        <div className={`bottom-sheet ${activeDrawer ? "open" : ""}`}>
          <div className="bottom-sheet-handle" />
          <div className="bottom-sheet-header">
            <div className="bottom-sheet-title-group">
              <h3 className="bottom-sheet-title">
                {activeDrawer?.type === "order" ? "Dettaglio Ordine" : "Errori Import Batch"}
              </h3>
              <p className="bottom-sheet-subtitle">
                {activeDrawer?.type === "order" ? "Scheda logistica ed articoli" : "Righe Excel escluse dall'importazione"}
              </p>
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
              <>
                {activeDrawer?.type === "order" && (
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
                )}
                
                {activeDrawer?.type === "batch" && (
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
                          <p style={{ margin: "4px 0 0" }}>{new Date(drawerData.createdAt).toLocaleString("it-IT")}</p>
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
                                          onClick={() => handleCopyRow(err.id, err.rawData)}
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
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
