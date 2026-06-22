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

const OrderDrawerContent = dynamic(() => import("./order-drawer-content"), {
  loading: () => (
    <div className="skeleton-table">
      <div className="skeleton-row" />
      <div className="skeleton-row" />
      <div className="skeleton-row" />
    </div>
  )
});

const BatchDrawerContent = dynamic(() => import("./batch-drawer-content"), {
  loading: () => (
    <div className="skeleton-table">
      <div className="skeleton-row" />
      <div className="skeleton-row" />
      <div className="skeleton-row" />
    </div>
  )
});


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
  const [orderPage, setOrderPage] = useState(1);
  const ORDER_PAGE_SIZE = 15;
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
  const [isStatsExpanded, setIsStatsExpanded] = useState<boolean>(false);
  
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
  
  // Stati Gestione Backup Database
  const [backupEnabled, setBackupEnabled] = useState<boolean>(true);
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(null);
  const [backupsList, setBackupsList] = useState<any[]>([]);
  const [backupActionLoading, setBackupActionLoading] = useState<boolean>(false);

  // Stati Prestashop
  const [prestashopUrl, setPrestashopUrl] = useState("");
  const [prestashopApiKey, setPrestashopApiKey] = useState("");
  const [prestashopConfigured, setPrestashopConfigured] = useState<boolean | null>(null);
  const [prestashopShowApiKey, setPrestashopShowApiKey] = useState(false);
  const [prestashopImportSourceTab, setPrestashopImportSourceTab] = useState<"excel" | "prestashop">("excel");
  const [prestashopQuery, setPrestashopQuery] = useState("");
  const [prestashopImportError, setPrestashopImportError] = useState("");
  const [prestashopCustomNote, setPrestashopCustomNote] = useState("");
  const [prestashopFailedQueries, setPrestashopFailedQueries] = useState<string[]>([]);
  const [prestashopPills, setPrestashopPills] = useState<any[]>([]);
  const [prestashopSearchResults, setPrestashopSearchResults] = useState<any[]>([]);
  const [prestashopSearchLoading, setPrestashopSearchLoading] = useState(false);
  const [prestashopPreviewMode, setPrestashopPreviewMode] = useState(false);
  const [expandedPreviewOrders, setExpandedPreviewOrders] = useState<Record<string, boolean>>({});
  const [editingPillQuery, setEditingPillQuery] = useState<string | null>(null);
  const [editingPillValue, setEditingPillValue] = useState("");
  const [isInputFocused, setIsInputFocused] = useState(false);
  const textInputRef = useRef<HTMLInputElement | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const runPreviewImportRef = useRef<() => Promise<void>>(async () => undefined);
  const lastOrderQueryRef = useRef<string>("");
  const [isPending, startTransition] = useTransition();

  // Theme State
  const [theme, setTheme] = useState<"dark" | "light">("light");

  // Stati aggiuntivi per il restyling Impostazioni
  const [copyTokenSuccess, setCopyTokenSuccess] = useState<Record<string, boolean>>({});
  const [isConfirmRestoreModalOpen, setIsConfirmRestoreModalOpen] = useState(false);
  const [confirmRestoreFilename, setConfirmRestoreFilename] = useState("");
  const [confirmRestoreTypedText, setConfirmRestoreTypedText] = useState("");
  const [confirmRestoreUploadedFile, setConfirmRestoreUploadedFile] = useState<File | null>(null);
  const [isDragOverBackup, setIsDragOverBackup] = useState(false);
  const [prestashopTesting, setPrestashopTesting] = useState(false);


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
    return `Upload automatico - ${source} - ${uploadedAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
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

  const totalOrderPages = useMemo(() => Math.max(1, Math.ceil(orders.length / ORDER_PAGE_SIZE)), [orders.length]);

  const visibleOrders = useMemo(() => {
    const start = (orderPage - 1) * ORDER_PAGE_SIZE;
    return orders.slice(start, start + ORDER_PAGE_SIZE);
  }, [orders, orderPage]);

  const allVisibleOrdersSelected = useMemo(
    () => visibleOrders.length > 0 && visibleOrders.every((o) => selectedOrderIds.includes(o.id)),
    [visibleOrders, selectedOrderIds]
  );

  const toggleAllVisibleOrders = () => {
    if (allVisibleOrdersSelected) {
      const visibleSet = new Set(visibleOrders.map((o) => o.id));
      setSelectedOrderIds((prev) => prev.filter((id) => !visibleSet.has(id)));
      return;
    }
    const next = new Set(selectedOrderIds);
    visibleOrders.forEach((o) => next.add(o.id));
    setSelectedOrderIds(Array.from(next));
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

  const loadBackupSettings = async () => {
    setSettingsLoading(true);
    try {
      const res = await fetch("/api/settings/backup");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Errore caricamento backup");
      }
      setBackupEnabled(Boolean(data.enabled));
      setLastBackupTime(data.lastBackup || null);
      setBackupsList(Array.isArray(data.backups) ? data.backups : []);
    } catch (err) {
      console.error("Errore caricamento backup:", err);
    } finally {
      setSettingsLoading(false);
    }
  };

  const loadPrestashopSettings = async () => {
    setSettingsLoading(true);
    try {
      const res = await fetch("/api/settings/prestashop");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Errore caricamento impostazioni Prestashop");
      }
      setPrestashopUrl(data.url ?? "");
      setPrestashopConfigured(Boolean(data.hasApiKey && data.url));
    } catch (err) {
      console.error(err);
    } finally {
      setSettingsLoading(false);
    }
  };

  const savePrestashopSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setStatus("");
    setPendingAction("save_prestashop");
    try {
      const res = await fetch("/api/settings/prestashop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: prestashopUrl, apiKey: prestashopApiKey })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Errore salvataggio impostazioni Prestashop");
      }
      setStatus("Impostazioni Prestashop salvate con successo.");
      setPrestashopConfigured(Boolean(prestashopUrl && (prestashopApiKey || prestashopConfigured)));
      setPrestashopApiKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore salvataggio");
    } finally {
      setPendingAction(null);
    }
  };

  const copyToClipboard = async (text: string, type: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyTokenSuccess((prev) => ({ ...prev, [type]: true }));
      setTimeout(() => {
        setCopyTokenSuccess((prev) => ({ ...prev, [type]: false }));
      }, 2000);
    } catch (err) {
      console.error("Errore copia negli appunti:", err);
    }
  };

  const testPrestashopConnection = async () => {
    setError("");
    setStatus("");
    setPrestashopTesting(true);
    try {
      const res = await fetch("/api/settings/prestashop/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: prestashopUrl, apiKey: prestashopApiKey })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Connessione non riuscita.");
      }
      setStatus(data.message ?? "Connessione stabilita con successo!");
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Errore durante il test di connessione.");
    } finally {
      setPrestashopTesting(false);
    }
  };

  const triggerBackgroundSearch = async (tag: string) => {
    try {
      const res = await fetch("/api/import/prestashop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "search", query: tag })
      });
      
      if (!res.ok) {
        throw new Error("Errore API");
      }
      
      const data = await res.json();
      const foundOrders = data.orders || [];
      
      if (foundOrders.length > 0) {
        const order = foundOrders[0];
        const initialNote = [order.customerNote, order.privateNote].filter(Boolean).join(" | ");
        
        setPrestashopPills(prev => prev.map(p => 
          p.query.toLowerCase() === tag.toLowerCase() 
            ? {
                ...p,
                status: "success",
                reference: order.reference,
                clientName: order.clientName,
                carrierName: order.carrierName,
                customerNote: order.customerNote,
                privateNote: order.privateNote,
                editedNotes: initialNote,
                lines: order.lines
              }
            : p
        ));
      } else {
        setPrestashopPills(prev => prev.map(p => 
          p.query.toLowerCase() === tag.toLowerCase() 
            ? { ...p, status: "error", errorMessage: "Non trovato" }
            : p
        ));
      }
    } catch (err) {
      setPrestashopPills(prev => prev.map(p => 
        p.query.toLowerCase() === tag.toLowerCase() 
          ? { ...p, status: "error", errorMessage: "Errore rete" }
          : p
      ));
    }
  };

  const handleAddTag = (inputValue: string) => {
    const cleanInput = inputValue.trim();
    if (!cleanInput) return;

    // Split by commas or spaces to support batch pasting
    const tags = cleanInput
      .split(/[\s,]+/)
      .map(t => t.trim())
      .filter(Boolean);

    setPrestashopQuery("");

    tags.forEach(tag => {
      setPrestashopPills(prev => {
        // Avoid duplicates
        if (prev.some(p => p.query.toLowerCase() === tag.toLowerCase())) {
          return prev;
        }
        
        const newPill = {
          query: tag,
          status: "loading",
          reference: tag,
          clientName: "",
          carrierName: "",
          lines: []
        };
        
        // Trigger async background search
        void triggerBackgroundSearch(tag);
        
        return [...prev, newPill];
      });
    });
  };

  const handleQueryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      handleAddTag(prestashopQuery);
    } else if (e.key === "Backspace" && !prestashopQuery && prestashopPills.length > 0) {
      const lastPill = prestashopPills[prestashopPills.length - 1];
      removeOrderFromPills(lastPill.query);
    }
  };

  const handleStartEditPill = (pill: any) => {
    setEditingPillQuery(pill.query);
    setEditingPillValue(pill.query);
  };

  const handleSaveEditPill = (oldQuery: string) => {
    const newVal = editingPillValue.trim();
    if (!newVal) {
      removeOrderFromPills(oldQuery);
      setEditingPillQuery(null);
      return;
    }

    if (newVal.toLowerCase() === oldQuery.toLowerCase()) {
      setEditingPillQuery(null);
      return;
    }

    setPrestashopPills(prev => prev.map(p => 
      p.query.toLowerCase() === oldQuery.toLowerCase()
        ? {
            ...p,
            query: newVal,
            reference: newVal,
            status: "loading",
            clientName: "",
            carrierName: "",
            lines: []
          }
        : p
    ));

    void triggerBackgroundSearch(newVal);
    setEditingPillQuery(null);
  };

  const handleEditPillKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, oldQuery: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveEditPill(oldQuery);
    } else if (e.key === "Escape") {
      setEditingPillQuery(null);
    }
  };

  const removeOrderFromPills = (query: string) => {
    setPrestashopPills(prev => prev.filter(p => p.query !== query));
  };

  const updatePrestashopLineQty = (orderRef: string, lineIndex: number, qty: number) => {
    setPrestashopPills(prev => prev.map(p => {
      if (p.reference === orderRef) {
        const newLines = p.lines.map((l: any, idx: number) => 
          idx === lineIndex ? { ...l, quantity: qty } : l
        );
        return { ...p, lines: newLines };
      }
      return p;
    }));
  };

  const updatePrestashopLineName = (orderRef: string, lineIndex: number, name: string) => {
    setPrestashopPills(prev => prev.map(p => {
      if (p.reference === orderRef) {
        const newLines = p.lines.map((l: any, idx: number) => 
          idx === lineIndex ? { ...l, productName: name } : l
        );
        return { ...p, lines: newLines };
      }
      return p;
    }));
  };

  const updatePrestashopLineEan = (orderRef: string, lineIndex: number, ean: string) => {
    setPrestashopPills(prev => prev.map(p => {
      if (p.reference === orderRef) {
        const newLines = p.lines.map((l: any, idx: number) => 
          idx === lineIndex ? { ...l, ean: ean } : l
        );
        return { ...p, lines: newLines };
      }
      return p;
    }));
  };

  const deletePrestashopLine = (orderRef: string, lineIndex: number) => {
    setPrestashopPills(prev => prev.map(p => {
      if (p.reference === orderRef) {
        const newLines = p.lines.filter((_: any, idx: number) => idx !== lineIndex);
        return { ...p, lines: newLines };
      }
      return p;
    }));
  };

  const importSelectedPrestashopOrders = async () => {
    if (prestashopPills.length === 0) {
      setPrestashopImportError("Nessun ordine selezionato da importare.");
      return;
    }

    setPendingAction("import_prestashop");
    setError("");
    setStatus("");
    startTransition(() => {
      void (async () => {
        try {
          const ordersPayload = prestashopPills.map(p => ({
            orderReference: p.reference,
            clientName: p.clientName,
            carrierName: p.carrierName,
            notes: p.editedNotes || null,
            lines: p.lines
          }));

          const res = await fetch("/api/import/prestashop", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "import", orders: ordersPayload })
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error ?? "Importazione fallita.");
          }

          let successMsg = `Importazione Prestashop completata: ${data.ordersCount} ordini creati.`;
          setStatus(successMsg);
          rememberLastAction(`Import Prestashop completato (${data.ordersCount} ordini)`);
          pushActivity(`Import Prestashop (${data.ordersCount} ordini)`);

          await refreshBatches();
          if (ordersLoaded || activeTab === "orders") {
            await refreshOrders();
          }

          setPrestashopPills([]);
          setPrestashopSearchResults([]);
          setPrestashopQuery("");
          setPrestashopPreviewMode(false);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Errore importazione Prestashop");
        } finally {
          setPendingAction(null);
        }
      })();
    });
  };

  const handleBackupToggle = async (enabled: boolean) => {
    setBackupEnabled(enabled);
    try {
      const res = await fetch("/api/settings/backup", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Errore salvataggio impostazioni backup");
      }
      pushActivity(`Backup automatico ${enabled ? "abilitato" : "disabilitato"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore salvataggio impostazioni backup");
      setBackupEnabled(!enabled); // ripristina stato precedente
    }
  };

  const handleCreateBackup = async () => {
    setBackupActionLoading(true);
    setError("");
    setStatus("");
    try {
      const res = await fetch("/api/settings/backup", {
        method: "POST"
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Errore esecuzione backup");
      }
      setLastBackupTime(data.lastBackup || null);
      setBackupsList(Array.isArray(data.backups) ? data.backups : []);
      setStatus("Backup del database SQLite completato con successo!");
      pushActivity("Backup database manuale eseguito");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossibile completare il backup");
    } finally {
      setBackupActionLoading(false);
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    if (!window.confirm(`Sei sicuro di voler eliminare permanentemente il backup "${filename}"?`)) {
      return;
    }
    setBackupActionLoading(true);
    setError("");
    setStatus("");
    try {
      const res = await fetch(`/api/settings/backup?file=${encodeURIComponent(filename)}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Errore eliminazione backup");
      }
      setBackupsList(Array.isArray(data.backups) ? data.backups : []);
      setStatus(`Backup ${filename} eliminato.`);
      pushActivity(`Backup ${filename} eliminato`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossibile eliminare il backup");
    } finally {
      setBackupActionLoading(false);
    }
  };

  const handleRestoreBackup = (filename: string) => {
    setConfirmRestoreFilename(filename);
    setConfirmRestoreUploadedFile(null);
    setConfirmRestoreTypedText("");
    setIsConfirmRestoreModalOpen(true);
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
    setOrderPage(1);
  }, [search, carrier, dateFrom, dateTo]);

  useEffect(() => {
    if (orderPage <= totalOrderPages) return;
    setOrderPage(totalOrderPages);
  }, [orderPage, totalOrderPages]);

  useEffect(() => {
    if (activeTab !== "orders" || ordersLoaded) return;
    startTransition(() => {
      void refreshOrders().catch((err) => setError(err instanceof Error ? err.message : "Errore caricamento ordini"));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, ordersLoaded]);


  useEffect(() => {
    if (prestashopConfigured === null) {
      void loadPrestashopSettings().catch((err) => console.error("Errore mount prestashop:", err));
    }
  }, [prestashopConfigured]);

  useEffect(() => {
    if (activeTab !== "settings") return;
    if (autoImportTokenConfigured === null) {
      void loadAutoImportSettings().catch((err) => setError(err instanceof Error ? err.message : "Errore caricamento impostazioni"));
    }
    void loadBackupSettings().catch((err) => console.error("Errore caricamento backup:", err));
    void loadPrestashopSettings().catch((err) => console.error("Errore ricarica prestashop:", err));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const saved = window.localStorage.getItem("picking_stats_expanded");
      if (saved !== null) {
        setIsStatsExpanded(saved === "true");
      }
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

        {/* RECENT ACTIVITIES & STATISTICS COMPONENT */}
        {activeTab !== "settings" && (
          <details 
            className="activity-card" 
            open={isStatsExpanded}
            onToggle={(e) => {
              const nextOpen = e.currentTarget.open;
              setIsStatsExpanded(nextOpen);
              try {
                window.localStorage.setItem("picking_stats_expanded", String(nextOpen));
              } catch {
                void 0;
              }
            }}
          >
            <summary 
              className="activity-summary" 
              style={{ 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "space-between", 
                width: "100%", 
                flexWrap: "wrap", 
                gap: "8px" 
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span>Attività Recente e Statistiche</span>
                {activeTab === "home" && kpis.recentErrors > 0 && (
                  <span className="error-dot-pulse" title="Ci sono errori attivi!" />
                )}
              </div>
              
              {!isStatsExpanded && activeTab === "home" && (
                <div 
                  className="summary-badges-preview" 
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "0.74rem",
                    fontWeight: 500,
                    marginLeft: "auto",
                    color: "var(--md-on-surface-variant)"
                  }}
                >
                  <span className="badge-preview-item" style={{ background: "var(--md-surface-container-high)", padding: "2px 8px", borderRadius: "6px", border: "1px solid var(--md-outline-variant)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    📦 {kpis.recentBatches} <span style={{ opacity: 0.8 }}>Batch</span>
                  </span>
                  <span className="badge-preview-item" style={{ background: "var(--md-surface-container-high)", padding: "2px 8px", borderRadius: "6px", border: "1px solid var(--md-outline-variant)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    🛒 {kpis.recentOrders} <span style={{ opacity: 0.8 }}>Ordini</span>
                  </span>
                  <span className="badge-preview-item" style={{
                    background: kpis.recentErrors > 0 ? "var(--md-error-container)" : "var(--md-surface-container-high)",
                    color: kpis.recentErrors > 0 ? "var(--md-error)" : "inherit",
                    padding: "2px 8px",
                    borderRadius: "6px",
                    border: `1px solid ${kpis.recentErrors > 0 ? "rgba(239, 68, 68, 0.2)" : "var(--md-outline-variant)"}`,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px"
                  }}>
                    ⚠️ {kpis.recentErrors} <span style={{ opacity: 0.8 }}>{kpis.recentErrors === 1 ? "Errore" : "Errori"}</span>
                  </span>
                </div>
              )}

              {!isStatsExpanded && activeTab === "orders" && (
                <div 
                  className="summary-badges-preview" 
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "0.74rem",
                    fontWeight: 500,
                    marginLeft: "auto",
                    color: "var(--md-on-surface-variant)"
                  }}
                >
                  <span className="badge-preview-item" style={{ background: "var(--md-surface-container-high)", padding: "2px 8px", borderRadius: "6px", border: "1px solid var(--md-outline-variant)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    🔍 {orders.length} <span style={{ opacity: 0.8 }}>Trovati</span>
                  </span>
                  <span className="badge-preview-item" style={{ background: "var(--md-surface-container-high)", padding: "2px 8px", borderRadius: "6px", border: "1px solid var(--md-outline-variant)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    🖨️ {orders.filter(o => !o.isPrinted).length} <span style={{ opacity: 0.8 }}>Da Stampare</span>
                  </span>
                  <span className="badge-preview-item" style={{ background: "var(--md-surface-container-high)", padding: "2px 8px", borderRadius: "6px", border: "1px solid var(--md-outline-variant)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    📋 {orders.reduce((sum, o) => sum + o._count.lines, 0)} <span style={{ opacity: 0.8 }}>Righe</span>
                  </span>
                </div>
              )}
            </summary>
            
            {/* HOME KPI MODULE */}
            {activeTab === "home" && (
              <div style={{ marginTop: "16px", marginBottom: "16px" }}>
                <section className="kpi-grid" style={{ marginBottom: "16px" }}>
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
                
                <div className="kpi-updated-row" style={{ marginBottom: "16px" }}>
                  <p className="kpi-updated">Ultimo aggiornamento: {lastUpdated?.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", hour12: false }) ?? ""}</p>
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
              </div>
            )}

            {/* ORDERS KPI MODULE */}
            {activeTab === "orders" && (
              <div style={{ marginTop: "16px", marginBottom: "16px" }}>
                <section className="kpi-grid" style={{ marginBottom: "16px" }}>
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
              </div>
            )}

            <div style={{ borderTop: "1px solid var(--md-outline-variant)", paddingTop: "16px", marginTop: "12px" }}>
              <p className="field-label" style={{ marginBottom: "8px", fontSize: "0.8rem", fontWeight: 700, color: "var(--md-on-surface-variant)", marginTop: 0 }}>Attività Recenti Sessione</p>
              {activities.length === 0 ? (
                <p className="status-inline" style={{ margin: 0 }}>Nessuna attività registrata in questa sessione.</p>
              ) : (
                <ul className="activity-list">
                  {activities.map((a) => (
                    <li key={a.id}>{`${a.message} - ${a.createdAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", hour12: false })}`}</li>
                  ))}
                </ul>
              )}
              {lastAction && <p className="status-inline activity-last-action" style={{ marginTop: "8px" }}>Ultima azione confermata: {lastAction}</p>}
            </div>
          </details>
        )}

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
              <div className="tab-menu" style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--md-outline-variant)", marginBottom: "16px" }}>
                <button
                  type="button"
                  className={`tab-btn ${prestashopImportSourceTab === "excel" ? "active" : ""}`}
                  onClick={() => setPrestashopImportSourceTab("excel")}
                  style={{
                    background: "none",
                    border: "none",
                    borderBottom: prestashopImportSourceTab === "excel" ? "2px solid var(--md-primary)" : "2px solid transparent",
                    padding: "8px 16px",
                    fontWeight: 600,
                    color: prestashopImportSourceTab === "excel" ? "var(--md-primary)" : "var(--color-text-muted)",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                >
                  Importa da Excel / CSV
                </button>
                <button
                  type="button"
                  className={`tab-btn ${prestashopImportSourceTab === "prestashop" ? "active" : ""}`}
                  onClick={() => setPrestashopImportSourceTab("prestashop")}
                  style={{
                    background: "none",
                    border: "none",
                    borderBottom: prestashopImportSourceTab === "prestashop" ? "2px solid var(--md-primary)" : "2px solid transparent",
                    padding: "8px 16px",
                    fontWeight: 600,
                    color: prestashopImportSourceTab === "prestashop" ? "var(--md-primary)" : "var(--color-text-muted)",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                >
                  Importa da PrestaShop
                </button>
              </div>

              {prestashopImportSourceTab === "excel" ? (
                <>
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
                      className={`drop-zone ${isDragActive ? "active" : ""} ${importTouched && !selectedFile ? "warning" : ""} ${selectedFile ? "has-file" : ""}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragActive(true);
                      }}
                      onDragLeave={() => setIsDragActive(false)}
                      onDrop={handleDrop}
                    >
                      {selectedFile ? (
                        <div className="drop-zone-file-preview">
                          <div className="file-preview-header">
                            <div className={`file-preview-icon-wrapper ${selectedFile.name.toLowerCase().endsWith('.xlsx') ? 'excel' : 'csv'}`}>
                              {selectedFile.name.toLowerCase().endsWith('.xlsx') ? (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="file-icon-svg">
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                  <polyline points="14 2 14 8 20 8" />
                                  <line x1="8" y1="13" x2="16" y2="13" />
                                  <line x1="8" y1="17" x2="16" y2="17" />
                                </svg>
                              ) : (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="file-icon-svg">
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                  <polyline points="14 2 14 8 20 8" />
                                  <line x1="16" y1="13" x2="8" y2="13" />
                                  <line x1="16" y1="17" x2="8" y2="17" />
                                </svg>
                              )}
                              <div className="file-preview-icon-pulse" />
                            </div>
                            <div className="file-preview-meta">
                              <h4 className="file-preview-name" title={selectedFile.name}>{selectedFile.name}</h4>
                              <span className="file-preview-size">
                                {(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.name.toLowerCase().endsWith('.xlsx') ? 'Foglio Excel' : 'File CSV'}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="file-preview-remove-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                resetImportFlow();
                              }}
                              title="Rimuovi file"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </div>

                          {importStep === 1 && (
                            <div className="file-preview-status-banner pending">
                              <div className="status-banner-pulse" />
                              <span>👉 Clicca su &quot;Genera anteprima righe&quot; in basso per iniziare</span>
                            </div>
                          )}
                          {importStep === 2 && (
                            <div className="file-preview-status-banner success">
                              <div className="status-banner-pulse" />
                              <span>Analisi completata con successo! Anteprima pronta.</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
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
                        </>
                      )}
                    </div>

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
                </>
              ) : (
                <>
                  {!prestashopConfigured ? (
                    <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--color-text-muted)" }}>
                      <div style={{ fontSize: "2rem", marginBottom: "12px" }}>⚙️</div>
                      <h3 style={{ fontSize: "1.05rem", fontWeight: 600, color: "var(--color-text)", marginBottom: "8px" }}>PrestaShop non configurato</h3>
                      <p style={{ fontSize: "0.85rem", maxWidth: "420px", margin: "0 auto 16px auto", lineHeight: "1.4" }}>
                        Per abilitare l&apos;importazione diretta, inserisci l&apos;URL del negozio e la chiave API nella scheda Impostazioni.
                      </p>
                      <button type="button" className="button secondary button-sm" onClick={() => setActiveTab("settings")}>
                        Vai alle Impostazioni
                      </button>
                    </div>
                  ) : prestashopPreviewMode ? (
                    /* SCREEN 2: PREVIEW & EDIT NOTES */
                    <div className="upload-stack" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <h3 style={{ fontSize: "1.02rem", fontWeight: 700, color: "var(--color-text)" }}>
                          Anteprima Ordini da Importare ({prestashopPills.length})
                        </h3>
                        <button
                          type="button"
                          className="button secondary button-sm"
                          onClick={() => setPrestashopPreviewMode(false)}
                          disabled={pendingAction === "import_prestashop"}
                        >
                          Torna alla ricerca
                        </button>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxHeight: "400px", overflowY: "auto", paddingRight: "4px" }}>
                        {prestashopPills.map((order, idx) => (
                          <div
                            key={order.reference}
                            style={{
                              padding: "14px",
                              borderRadius: "10px",
                              background: "var(--color-background-card, #ffffff)",
                              border: "1px solid var(--color-border, #e2e8f0)",
                              display: "flex",
                              flexDirection: "column",
                              gap: "10px"
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                              <div>
                                <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--color-primary, #1e3a8a)" }}>
                                  {idx + 1}. Rif: {order.reference}
                                </span>
                                <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: "2px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px" }}>
                                  <span>Cliente: <strong style={{ color: "var(--color-text)" }}>{order.clientName}</strong></span>
                                  <span>|</span>
                                  <span style={{ display: "inline-flex", alignItems: "center" }}>
                                    Corriere:
                                    <input
                                      type="text"
                                      className="input"
                                      style={{
                                        display: "inline-block",
                                        width: "140px",
                                        height: "24px",
                                        minHeight: "24px",
                                        padding: "2px 6px",
                                        fontSize: "0.78rem",
                                        borderRadius: "4px",
                                        marginLeft: "4px",
                                        border: "1px solid var(--md-outline)",
                                        background: "transparent",
                                        color: "var(--color-text)"
                                      }}
                                      value={order.carrierName || ""}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setPrestashopPills(prev => prev.map(p => p.reference === order.reference ? { ...p, carrierName: val } : p));
                                      }}
                                      disabled={pendingAction === "import_prestashop"}
                                      title="Modifica corriere"
                                    />
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "var(--color-danger, #ef4444)",
                                  cursor: "pointer",
                                  fontSize: "0.8rem",
                                  fontWeight: 600,
                                  padding: "4px"
                                }}
                                onClick={() => {
                                  removeOrderFromPills(order.reference);
                                  if (prestashopPills.length <= 1) {
                                    setPrestashopPreviewMode(false);
                                  }
                                }}
                                disabled={pendingAction === "import_prestashop"}
                              >
                                Rimuovi
                              </button>
                            </div>

                            {/* EDIT NOTE AREA */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-muted)" }}>
                                Note ordine per il prelievo (Modificabili)
                              </label>
                              <textarea
                                className="input"
                                style={{
                                  fontSize: "0.82rem",
                                  minHeight: "44px",
                                  resize: "vertical",
                                  padding: "6px 10px",
                                  fontFamily: "inherit"
                                }}
                                value={order.editedNotes || ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setPrestashopPills(prev => prev.map(p => p.reference === order.reference ? { ...p, editedNotes: val } : p));
                                }}
                                placeholder="Nessuna nota. Scrivi qui per aggiungere o modificare..."
                                disabled={pendingAction === "import_prestashop"}
                              />
                            </div>

                            {/* COLLAPSIBLE PRODUCTS LIST */}
                            <div>
                              <button
                                type="button"
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "var(--color-primary)",
                                  fontSize: "0.75rem",
                                  cursor: "pointer",
                                  padding: "2px 0",
                                  fontWeight: 600,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px"
                                }}
                                onClick={() => {
                                  setExpandedPreviewOrders(prev => ({
                                    ...prev,
                                    [order.reference]: !prev[order.reference]
                                  }));
                                }}
                              >
                                <span>{expandedPreviewOrders[order.reference] ? "▼ Nascondi Articoli" : `▶ Mostra Articoli (${order.lines.length})`}</span>
                              </button>

                              {expandedPreviewOrders[order.reference] && (
                                <div style={{
                                  marginTop: "8px",
                                  padding: "10px",
                                  borderRadius: "6px",
                                  background: "var(--color-light-bg, #f8fafc)",
                                  border: "1px solid var(--color-border, #e2e8f0)",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "8px"
                                }}>
                                  {order.lines.length === 0 ? (
                                    <div style={{ color: "var(--color-text-muted)", fontSize: "0.78rem", fontStyle: "italic", textAlign: "center" }}>
                                      Nessun articolo rimasto in questo ordine.
                                    </div>
                                  ) : (
                                    order.lines.map((line: any, lIdx: number) => (
                                      <div
                                        key={lIdx}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "6px",
                                          flexWrap: "wrap"
                                        }}
                                      >
                                        {/* Qty Input */}
                                        <input
                                          type="number"
                                          className="input"
                                          style={{
                                            width: "55px",
                                            padding: "4px 6px",
                                            fontSize: "0.76rem",
                                            textAlign: "center",
                                            flexShrink: 0
                                          }}
                                          value={line.quantity}
                                          min="1"
                                          onChange={(e) => {
                                            const qty = parseInt(e.target.value, 10) || 1;
                                            updatePrestashopLineQty(order.reference, lIdx, qty);
                                          }}
                                          disabled={pendingAction === "import_prestashop"}
                                          title="Quantità"
                                        />
                                        <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", flexShrink: 0 }}>pz.</span>
                                        
                                        {/* Product Name Input */}
                                        <input
                                          type="text"
                                          className="input"
                                          style={{
                                            flex: 1,
                                            minWidth: "150px",
                                            padding: "4px 8px",
                                            fontSize: "0.76rem"
                                          }}
                                          value={line.productName || ""}
                                          onChange={(e) => updatePrestashopLineName(order.reference, lIdx, e.target.value)}
                                          disabled={pendingAction === "import_prestashop"}
                                          title="Nome Prodotto"
                                        />

                                        {/* EAN Input */}
                                        <input
                                          type="text"
                                          className="input"
                                          style={{
                                            width: "120px",
                                            padding: "4px 8px",
                                            fontSize: "0.76rem",
                                            flexShrink: 0
                                          }}
                                          value={line.ean || ""}
                                          onChange={(e) => updatePrestashopLineEan(order.reference, lIdx, e.target.value)}
                                          placeholder="Codice EAN"
                                          disabled={pendingAction === "import_prestashop"}
                                          title="EAN"
                                        />

                                        {/* Delete Button */}
                                        <button
                                          type="button"
                                          style={{
                                            background: "none",
                                            border: "none",
                                            color: "var(--color-danger, #ef4444)",
                                            cursor: "pointer",
                                            fontSize: "0.85rem",
                                            fontWeight: 700,
                                            padding: "4px 6px",
                                            flexShrink: 0,
                                            display: "inline-flex",
                                            alignItems: "center"
                                          }}
                                          onClick={() => deletePrestashopLine(order.reference, lIdx)}
                                          disabled={pendingAction === "import_prestashop"}
                                          title="Rimuovi articolo"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                        <button
                          type="button"
                          className="button pulse-cta"
                          style={{ flex: 1 }}
                          onClick={importSelectedPrestashopOrders}
                          disabled={pendingAction === "import_prestashop" || isPending || prestashopPills.length === 0}
                        >
                          {pendingAction === "import_prestashop" ? "Importazione in corso..." : `Conferma e importa ${prestashopPills.length} ordini`}
                        </button>
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => {
                            setPrestashopPills([]);
                            setPrestashopPreviewMode(false);
                          }}
                          disabled={pendingAction === "import_prestashop"}
                        >
                          Annulla
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* SCREEN 1: SEARCH & PILLS SELECTION */
                    <div className="upload-stack" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                      <p className="status-inline" style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", margin: 0, lineHeight: "1.4" }}>
                        Inserisci gli ID o Riferimenti ordine da PrestaShop nel campo integrato. Premi Invio, Virgola o Spazio per confermare ogni codice. Clicca su un codice per modificarlo.
                      </p>

                      <div 
                        style={{
                          border: isInputFocused ? "1px solid var(--md-primary)" : "1px solid var(--md-outline)",
                          borderRadius: "var(--md-shape-sm)",
                          minHeight: "48px",
                          padding: "8px 12px",
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "8px",
                          alignItems: "center",
                          background: isInputFocused ? "var(--md-surface-container-lowest)" : "var(--md-surface-container-low, #f8fafc)",
                          boxShadow: isInputFocused ? "0 0 0 3px var(--color-primary-glow)" : "none",
                          transition: "all 0.15s ease",
                          cursor: "text"
                        }}
                        onClick={(e) => {
                          if (e.target === e.currentTarget || (e.target as HTMLElement).getAttribute("data-tag-container")) {
                            textInputRef.current?.focus();
                          }
                        }}
                        data-tag-container="true"
                      >
                        {/* Selected Pills inside the input box */}
                        {prestashopPills.map((pill, pIdx) => {
                          const isEditing = editingPillQuery === pill.query;
                          
                          if (isEditing) {
                            return (
                              <input
                                key={`edit-${pill.query}-${pIdx}`}
                                type="text"
                                style={{
                                  padding: "2px 8px",
                                  height: "26px",
                                  fontSize: "0.78rem",
                                  borderRadius: "12px",
                                  width: "110px",
                                  border: "1px solid var(--md-primary)",
                                  outline: "none",
                                  background: "var(--md-surface-container-lowest)",
                                  color: "var(--color-text)"
                                }}
                                value={editingPillValue}
                                onChange={(e) => setEditingPillValue(e.target.value)}
                                onKeyDown={(e) => handleEditPillKeyDown(e, pill.query)}
                                onBlur={() => handleSaveEditPill(pill.query)}
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                              />
                            );
                          }

                          // Define colors based on status
                          let pillBg = "var(--md-surface-container-high, #e2e8f0)";
                          let pillColor = "var(--md-on-surface, #334155)";
                          let pillBorder = "1px solid var(--md-outline-variant, #cbd5e1)";
                          let statusIndicator = null;

                          if (pill.status === "loading") {
                            pillBg = "var(--color-primary-glow, #eff6ff)";
                            pillColor = "var(--color-primary-dark, #1d4ed8)";
                            pillBorder = "1px solid var(--color-primary, #3b82f6)";
                            statusIndicator = <span className="spinner-mini" style={{ marginRight: 2 }} />;
                          } else if (pill.status === "success") {
                            pillBg = "var(--md-success-container, #e6f4ea)";
                            pillColor = "var(--md-success, #137333)";
                            pillBorder = "1px solid rgba(19, 115, 51, 0.2)";
                            statusIndicator = <span style={{ marginRight: 2, fontSize: "0.75rem" }}>✓</span>;
                          } else if (pill.status === "error") {
                            pillBg = "var(--md-error-container, #fce8e6)";
                            pillColor = "var(--md-error, #c5221f)";
                            pillBorder = "1px solid rgba(197, 34, 31, 0.2)";
                            statusIndicator = <span style={{ marginRight: 2, fontSize: "0.75rem" }}>⚠️</span>;
                          }

                          return (
                            <div
                              key={`${pill.query}-${pIdx}`}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                padding: "4px 10px",
                                borderRadius: "14px",
                                background: pillBg,
                                border: pillBorder,
                                color: pillColor,
                                fontSize: "0.78rem",
                                fontWeight: 600,
                                cursor: "pointer",
                                userSelect: "none",
                                transition: "all 0.2s"
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartEditPill(pill);
                              }}
                              title={
                                pill.status === "success" 
                                  ? `Rif: ${pill.reference}\nCliente: ${pill.clientName}\nCorriere: ${pill.carrierName}\nClicca per modificare` 
                                  : pill.status === "error" 
                                    ? `${pill.errorMessage || "Non trovato"}. Clicca per modificare o riprovare.`
                                    : "Ricerca in corso..."
                              }
                            >
                              {statusIndicator}
                              <span>{pill.reference}</span>
                              
                              {pill.status === "error" && (
                                <button
                                  type="button"
                                  style={{
                                    border: "none",
                                    background: "none",
                                    padding: 0,
                                    cursor: "pointer",
                                    color: "currentColor",
                                    fontSize: "0.72rem",
                                    fontWeight: 700,
                                    display: "inline-flex",
                                    alignItems: "center"
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPrestashopPills(prev => prev.map(p => 
                                      p.query === pill.query ? { ...p, status: "loading" } : p
                                    ));
                                    void triggerBackgroundSearch(pill.query);
                                  }}
                                  title="Riprova la ricerca"
                                >
                                  🔄
                                </button>
                              )}

                              <button
                                type="button"
                                style={{
                                  border: "none",
                                  background: "none",
                                  padding: 0,
                                  cursor: "pointer",
                                  color: "currentColor",
                                  fontWeight: 700,
                                  fontSize: "0.8rem",
                                  display: "inline-flex",
                                  alignItems: "center"
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeOrderFromPills(pill.query);
                                }}
                                title="Rimuovi"
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })}

                        {/* Borderless input field for typing */}
                        <input
                          ref={textInputRef}
                          type="text"
                          style={{
                            border: "none",
                            outline: "none",
                            background: "transparent",
                            flex: "1 1 120px",
                            minWidth: "120px",
                            color: "var(--color-text)",
                            padding: 0,
                            margin: 0,
                            fontSize: "0.85rem",
                            height: "26px"
                          }}
                          placeholder={prestashopPills.length === 0 ? "es. MNMZURQBU, 202357 o 202753..." : ""}
                          value={prestashopQuery}
                          onChange={(e) => setPrestashopQuery(e.target.value)}
                          onKeyDown={handleQueryKeyDown}
                          onFocus={() => setIsInputFocused(true)}
                          onBlur={() => setIsInputFocused(false)}
                          disabled={pendingAction === "import_prestashop"}
                        />
                      </div>

                      {prestashopImportError && (
                        <p style={{ color: "var(--color-danger)", fontSize: "0.78rem", margin: 0, fontWeight: 500 }}>
                          {prestashopImportError}
                        </p>
                      )}

                      {/* ACTIONS */}
                      <div className="row" style={{ marginTop: 6 }}>
                        <button
                          type="button"
                          className="button pulse-cta"
                          onClick={() => setPrestashopPreviewMode(true)}
                          disabled={prestashopPills.length === 0 || prestashopPills.some(p => p.status === "loading")}
                          style={{ flex: 1 }}
                        >
                          Genera Anteprima ({prestashopPills.filter(p => p.status === "success").length} ordini pronti)
                        </button>
                      </div>
                    </div>

                  )}

                  {prestashopFailedQueries.length > 0 && (
                    <div style={{ marginTop: 15, padding: "12px 16px", borderRadius: "12px", background: "var(--color-warning-glow)", border: "1px solid rgba(255, 196, 0, 0.25)", display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, color: "var(--color-warning)", flexShrink: 0, marginTop: 2 }}>
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <p className="status-inline" style={{ margin: 0, color: "var(--color-warning)", fontSize: "0.82rem", lineHeight: "1.4" }}>
                        <strong>Attenzione!</strong> I seguenti ID/Riferimenti ordine non sono stati trovati su PrestaShop: <strong>{prestashopFailedQueries.join(", ")}</strong>
                      </p>
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
                </>
              )}
            </section>

            {/* BATCH RECENTI (LEFT SIDE IN SPLIT SCREEN) */}
            <section className="card">
              <h2 className="section-title">Batch Recenti (Ultime 24 Ore)</h2>
              
              {latestAutoUploadBatch && (
                <div className={`auto-upload-banner ${isRecentAutoUpload(latestAutoUploadBatch) ? "fresh" : ""}`}>
                  <strong>📥 File caricato automaticamente da Windows</strong>
                  <span style={{ fontSize: "0.76rem", display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: "6px 8px", marginTop: 4 }}>
                    <span>Nome: <strong>{latestAutoUploadBatch.sourceFile}</strong></span>
                    <span>|</span>
                    <span>Ordini: <strong>{latestAutoUploadBatch._count.orders}</strong></span>
                    <span>|</span>
                    <span className="badge auto-upload" style={{ padding: "2px 8px", fontSize: "0.68rem" }}>Upload automatico</span>
                    <span>da {latestAutoUploadBatch.autoUploadComputerName || latestAutoUploadBatch.autoUploadUserName || latestAutoUploadBatch.autoUploadClientId || latestAutoUploadBatch.autoUploadIp || "Windows"} alle {new Date(latestAutoUploadBatch.autoUploadedAt ?? latestAutoUploadBatch.createdAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                  </span>
                </div>
              )}

              <div className="row batch-filters-row">
                <DebouncedInput
                  className="input"
                  placeholder="Cerca file batch..."
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
                          <th style={{ width: "100%" }}>File</th>
                          <th style={{ width: "80px", textAlign: "center" }}>Ordini</th>
                          <th style={{ width: "130px", textAlign: "center" }}>Stato</th>
                          <th style={{ width: "230px" }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleBatches.map((batch) => {
                          const isAuto = batch.importSource === "auto";
                          const isRecent = isRecentAutoUpload(batch);
                          return (
                            <tr
                              key={batch.id}
                              className={`auto-batch-row ${isAuto ? "is-auto" : ""} ${isRecent ? "recent" : ""}`}
                            >
                              <td>
                                <input
                                  aria-label={`Seleziona batch ${batch.sourceFile}`}
                                  type="checkbox"
                                  checked={selectedBatchIds.includes(batch.id)}
                                  onChange={() => toggleBatchSelection(batch.id)}
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
                                     <div className={`auto-upload-badge ${isRecent ? "recent" : ""}`}>
                                       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="auto-upload-badge-icon">
                                         <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                         <polyline points="17 8 12 3 7 8" />
                                         <line x1="12" y1="3" x2="12" y2="15" />
                                       </svg>
                                       <strong>Upload automatico</strong>
                                       <span style={{ opacity: 0.85, fontSize: "0.68rem" }}>
                                         {batch.autoUploadComputerName || batch.autoUploadUserName || batch.autoUploadClientId || batch.autoUploadIp || "Windows"} {new Date(batch.autoUploadedAt ?? batch.createdAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", hour12: false })}
                                       </span>
                                     </div>
                                   )}
                                </div>
                              </td>
                            <td style={{ fontWeight: 700, textAlign: "center" }}>{batch._count.orders}</td>
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
          </div>
        )}

        {/* TAB 2: ORDINI IMPORTATI */}
        {activeTab === "orders" && (
          <div className="grid orders-grid">
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
                  <DebouncedInput 
                    className="input filter-input-with-icon" 
                    placeholder="Riferimento ordine o cliente..." 
                    value={search} 
                    onChange={setSearch} 
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
                            checked={visibleOrders.length > 0 && visibleOrders.every((o) => selectedOrderIds.includes(o.id))}
                            onChange={toggleAllVisibleOrders}
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
                      {visibleOrders.map((order) => (
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

                  <div className="row pagination-row" style={{ marginTop: 16 }}>
                    <button className="button tertiary button-sm" type="button" onClick={() => setOrderPage((prev) => Math.max(1, prev - 1))} disabled={orderPage === 1}>
                      Precedente
                    </button>
                    <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                      Pagina {orderPage} di {totalOrderPages}
                    </span>
                    <button
                      className="button tertiary button-sm"
                      type="button"
                      onClick={() => setOrderPage((prev) => Math.min(totalOrderPages, prev + 1))}
                      disabled={orderPage === totalOrderPages}
                    >
                      Successiva
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="settings-grid">
            {/* Card: Integrazione Automatica Windows */}
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
                <p className="status-inline" style={{ fontSize: "0.78rem", color: "var(--color-text-dim)", margin: "0 0 8px 0" }}>
                  Questo token protegge l&apos;endpoint ed è memorizzato nel database SQLite. Viene usato dagli script PowerShell su Windows.
                </p>
                
                <div className="input-container-relative">
                  <span className="input-icon-left">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </span>
                  <input
                    id="auto-import-token"
                    className={`input token-input-inline input-with-icon-left ${autoImportToken ? "has-copy-btn" : ""}`}
                    type={showAutoImportToken ? "text" : "password"}
                    value={autoImportToken}
                    placeholder="Inserisci o genera il token segreto..."
                    autoComplete="new-password"
                    onChange={(e) => setAutoImportToken(e.target.value)}
                  />
                  {autoImportToken && (
                    <button
                      className="button-copy-token"
                      type="button"
                      onClick={() => void copyToClipboard(autoImportToken, "token")}
                      title={copyTokenSuccess["token"] ? "Copiato!" : "Copia token negli appunti"}
                    >
                      {copyTokenSuccess["token"] ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="var(--md-success, #4c9c6c)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      )}
                    </button>
                  )}
                  {autoImportToken && (
                    <button
                      className="input-inline-action-btn"
                      type="button"
                      onClick={() => setShowAutoImportToken((prev) => !prev)}
                      title={showAutoImportToken ? "Nascondi token" : "Mostra token"}
                      style={{ right: 12 }}
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

                <div className="row" style={{ marginTop: 12 }}>
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

                <label className="toggle-row" style={{ marginTop: 14 }}>
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

            {/* Card: Integrazione Webservice Prestashop */}
            <section className="card">
              <h2 className="section-title">Integrazione Webservice Prestashop</h2>
              <p className="status-inline" style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", margin: 0 }}>
                Configura i dati di connessione per scaricare in tempo reale gli ordini dal tuo e-commerce Prestashop.
              </p>

              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0 20px 0" }}>
                <span className="field-label" style={{ margin: 0 }}>Stato integrazione:</span>
                {settingsLoading ? (
                  <span className="badge info">Lettura...</span>
                ) : prestashopConfigured ? (
                  <span className="badge good active-pulse" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span className="pulse-dot" />
                    Collegato e Cifrato
                  </span>
                ) : (
                  <span className="badge warn">Non configurato</span>
                )}
              </div>

              <form className="settings-form" onSubmit={savePrestashopSettings}>
                <label className="field-label" htmlFor="prestashop-url">
                  URL del Negozio Prestashop
                </label>
                <div className="input-container-relative" style={{ marginBottom: 16 }}>
                  <span className="input-icon-left">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  </span>
                  <input
                    id="prestashop-url"
                    className="input input-with-icon-left"
                    type="url"
                    value={prestashopUrl}
                    placeholder="https://www.tuonegozio.com"
                    onChange={(e) => setPrestashopUrl(e.target.value)}
                  />
                </div>

                <label className="field-label" htmlFor="prestashop-api-key">
                  Chiave API Webservice (Cifrata nel database)
                </label>
                <div className="input-container-relative">
                  <span className="input-icon-left">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </span>
                  <input
                    id="prestashop-api-key"
                    className={`input token-input-inline input-with-icon-left ${prestashopApiKey ? "has-copy-btn" : ""}`}
                    type={prestashopShowApiKey ? "text" : "password"}
                    value={prestashopApiKey}
                    placeholder={prestashopConfigured ? "•••••••••••••••••••••••••••••••• (Chiave già salvata)" : "Inserisci la chiave API..."}
                    onChange={(e) => setPrestashopApiKey(e.target.value)}
                  />
                  {prestashopApiKey && (
                    <button
                      className="button-copy-token"
                      type="button"
                      onClick={() => void copyToClipboard(prestashopApiKey, "apikey")}
                      title={copyTokenSuccess["apikey"] ? "Copiata!" : "Copia chiave API"}
                    >
                      {copyTokenSuccess["apikey"] ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="var(--md-success, #4c9c6c)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      )}
                    </button>
                  )}
                  <button
                    className="input-inline-action-btn"
                    type="button"
                    onClick={() => setPrestashopShowApiKey((prev) => !prev)}
                    title={prestashopShowApiKey ? "Nascondi chiave" : "Mostra chiave"}
                    style={{ right: 12 }}
                  >
                    {prestashopShowApiKey ? (
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
                </div>

                <div className="row" style={{ marginTop: 16 }}>
                  <button className="button" type="submit" disabled={pendingAction === "save_prestashop"}>
                    {pendingAction === "save_prestashop" ? "Salvataggio..." : "Salva configurazione"}
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={prestashopTesting || (!prestashopUrl && !prestashopConfigured)}
                    onClick={testPrestashopConnection}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    {prestashopTesting ? (
                      <>
                        <span className="spinner-mini" />
                        Verifica in corso...
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                          <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                        Test Connessione
                      </>
                    )}
                  </button>
                </div>
              </form>
            </section>

            {/* Card: Gestione Backup Database SQLite */}
            <section className="card">
              <h2 className="section-title" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, color: "var(--color-primary)" }}>
                  <ellipse cx="12" cy="5" rx="9" ry="3" />
                  <path d="M3 5V19A9 3 0 0 0 21 19V5" />
                  <path d="M3 12A9 3 0 0 0 21 12" />
                </svg>
                Backup Database SQLite
              </h2>
              <p className="status-inline" style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", margin: "0 0 16px 0" }}>
                Gestisci, scarica o carica le copie di sicurezza del database per prevenire perdite accidentali di dati durante aggiornamenti, migrazioni o operazioni git pull.
              </p>

              <label className="toggle-row" style={{ marginTop: 12 }}>
                <input
                  type="checkbox"
                  checked={backupEnabled}
                  onChange={(e) => void handleBackupToggle(e.target.checked)}
                />
                <span>Consenti backup automatico del database locale ogni 24 ore</span>
              </label>

              <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", borderRadius: "8px", backgroundColor: "var(--color-bg-alt)", border: "1px solid var(--color-border-dim)" }}>
                <div>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, display: "block" }}>Ultimo backup eseguito</span>
                  <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {lastBackupTime ? (
                      <>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12, color: "var(--color-text-dim)" }}>
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        {new Date(lastBackupTime).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                      </>
                    ) : (
                      "Nessun backup registrato su questo dispositivo"
                    )}
                  </span>
                </div>
                <button
                  className="button good button-sm"
                  type="button"
                  disabled={backupActionLoading}
                  onClick={handleCreateBackup}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  {backupActionLoading ? (
                    "Creazione..."
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      Esegui backup ora
                    </>
                  )}
                </button>
              </div>

              {/* Drag-and-Drop Backup Database Area */}
              <div
                className={`backup-upload-zone ${isDragOverBackup ? "active" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOverBackup(true);
                }}
                onDragLeave={() => setIsDragOverBackup(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOverBackup(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) {
                    if (!file.name.endsWith(".db")) {
                      setError("Il file caricato deve avere estensione .db");
                      return;
                    }
                    setConfirmRestoreUploadedFile(file);
                    setConfirmRestoreFilename("");
                    setConfirmRestoreTypedText("");
                    setIsConfirmRestoreModalOpen(true);
                  }
                }}
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".db";
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) {
                      if (!file.name.endsWith(".db")) {
                        setError("Il file selezionato deve avere estensione .db");
                        return;
                      }
                      setConfirmRestoreUploadedFile(file);
                      setConfirmRestoreFilename("");
                      setConfirmRestoreTypedText("");
                      setIsConfirmRestoreModalOpen(true);
                    }
                  };
                  input.click();
                }}
              >
                <div className="backup-upload-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 24, height: 24 }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <p className="backup-upload-title">Carica database esterno (.db)</p>
                <p className="backup-upload-subtitle">Trascina qui il file o fai clic per sfogliare</p>
              </div>

              <div style={{ marginTop: 24 }}>
                <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 12, color: "var(--color-text)" }}>
                  Copie di Sicurezza Disponibili ({backupsList.length} di 10)
                </h3>

                {backupsList.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "24px 0", color: "var(--color-text-dim)", fontSize: "0.85rem", backgroundColor: "var(--color-bg-alt)", borderRadius: "8px", border: "1px dashed var(--color-border-dim)" }}>
                    Nessun file di backup presente. Clicca su &quot;Esegui backup ora&quot; o carica un file esterno per iniziare.
                  </div>
                ) : (
                  <div style={{ overflowX: "auto", border: "1px solid var(--color-border-dim)", borderRadius: "8px" }}>
                    <table className="table" style={{ width: "100%", margin: 0, borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ backgroundColor: "var(--color-bg-alt)", borderBottom: "1px solid var(--color-border-dim)" }}>
                          <th style={{ fontSize: "0.75rem", padding: "10px 12px", textAlign: "left" }}>File di Backup</th>
                          <th style={{ fontSize: "0.75rem", padding: "10px 12px", textAlign: "left", width: "140px" }}>Data Creazione</th>
                          <th style={{ fontSize: "0.75rem", padding: "10px 12px", textAlign: "left", width: "90px" }}>Dimensione</th>
                          <th style={{ fontSize: "0.75rem", padding: "10px 12px", textAlign: "right", width: "100px" }}>Azioni</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backupsList.map((backup) => (
                          <tr key={backup.filename} style={{ borderBottom: "1px solid var(--color-border-dim)" }} className="table-row-hover">
                            <td style={{ fontSize: "0.8rem", padding: "10px 12px", fontWeight: 500, fontFamily: "monospace" }}>
                              {backup.filename}
                            </td>
                            <td style={{ fontSize: "0.78rem", padding: "10px 12px", color: "var(--color-text-muted)" }}>
                              {new Date(backup.createdAt).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
                            </td>
                            <td style={{ fontSize: "0.78rem", padding: "10px 12px", color: "var(--color-text-muted)" }}>
                              {backup.sizeFormatted}
                            </td>
                            <td style={{ fontSize: "0.8rem", padding: "10px 12px", textAlign: "right" }}>
                              <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
                                <a
                                  className="button secondary button-sm"
                                  href={`/api/settings/backup/download?file=${encodeURIComponent(backup.filename)}`}
                                  download
                                  title="Scarica file di backup"
                                  style={{ padding: "4px 8px", minWidth: "auto", display: "inline-flex", alignItems: "center" }}
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                  </svg>
                                </a>
                                <button
                                  className="button secondary button-sm"
                                  type="button"
                                  disabled={backupActionLoading}
                                  onClick={() => handleRestoreBackup(backup.filename)}
                                  title="Ripristina database da questo backup"
                                  style={{ padding: "4px 8px", minWidth: "auto", display: "inline-flex", alignItems: "center", color: "#eab308" }}
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                                    <polyline points="23 4 23 10 17 10" />
                                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                                  </svg>
                                </button>
                                <button
                                  className="button danger secondary button-sm"
                                  type="button"
                                  disabled={backupActionLoading}
                                  onClick={() => void handleDeleteBackup(backup.filename)}
                                  title="Elimina backup"
                                  style={{ padding: "4px 8px", minWidth: "auto", display: "inline-flex", alignItems: "center", color: "var(--color-danger)" }}
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
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
              </div>
            </section>

            {/* Card: Preferenze Visive */}
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
                      <div className="mini-dashboard">
                        <div className="mini-header">
                          <span className="mini-header-dot" />
                          <span className="mini-header-line" />
                        </div>
                        <div className="mini-body">
                          <div className="mini-sidebar">
                            <span className="mini-sidebar-item active" />
                            <span className="mini-sidebar-item" />
                            <span className="mini-sidebar-item" />
                          </div>
                          <div className="mini-content-grid">
                            <div className="mini-widget">
                              <span className="mini-widget-title" />
                              <span className="mini-widget-val" />
                            </div>
                            <div className="mini-widget">
                              <span className="mini-widget-title" />
                              <span className="mini-widget-val" />
                            </div>
                          </div>
                        </div>
                      </div>
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
                      <div className="mini-dashboard">
                        <div className="mini-header">
                          <span className="mini-header-dot" />
                          <span className="mini-header-line" />
                        </div>
                        <div className="mini-body">
                          <div className="mini-sidebar">
                            <span className="mini-sidebar-item active" />
                            <span className="mini-sidebar-item" />
                            <span className="mini-sidebar-item" />
                          </div>
                          <div className="mini-content-grid">
                            <div className="mini-widget">
                              <span className="mini-widget-title" />
                              <span className="mini-widget-val" />
                            </div>
                            <div className="mini-widget">
                              <span className="mini-widget-title" />
                              <span className="mini-widget-val" />
                            </div>
                          </div>
                        </div>
                      </div>
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
                onClick={generateSelectedBatchPdfs}
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
                    Scarica PDF
                  </>
                )}
              </button>
              
              <button
                className="button danger button-sm"
                type="button"
                disabled={pendingAction !== null}
                onClick={deleteSelectedBatches}
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
                  <OrderDrawerContent drawerData={drawerData} />
                )}
                
                {activeDrawer?.type === "batch" && (
                  <BatchDrawerContent
                    drawerData={drawerData}
                    copiedRowId={copiedRowId}
                    onCopyRow={handleCopyRow}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {isConfirmRestoreModalOpen && (
          <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="modal-container">
              <div className="modal-header">
                <div className="modal-icon-wrapper danger">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
                <h3 className="modal-title" id="modal-title">Ripristino Database</h3>
              </div>
              <div className="modal-body">
                <p>
                  <strong>ATTENZIONE!</strong> Stai per sovrascrivere l&apos;intero database corrente di Picking Logistica. 
                  Questa operazione eliminerà permanentemente tutti gli ordini correnti, i lotti importati e lo storico recente.
                </p>
                <p>
                  Sorgente ripristino: <code>{confirmRestoreFilename || confirmRestoreUploadedFile?.name}</code>
                </p>
                <p style={{ marginTop: 8 }}>
                  Per procedere, digita la parola <strong>RIPRISTINA</strong> nel campo sottostante per confermare la tua identità e intenzione.
                </p>
                <input
                  type="text"
                  className="input modal-confirm-input"
                  placeholder="Digita RIPRISTINA..."
                  value={confirmRestoreTypedText}
                  onChange={(e) => setConfirmRestoreTypedText(e.target.value)}
                />
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setIsConfirmRestoreModalOpen(false);
                    setConfirmRestoreFilename("");
                    setConfirmRestoreUploadedFile(null);
                    setConfirmRestoreTypedText("");
                  }}
                  disabled={backupActionLoading}
                >
                  Annulla
                </button>
                <button
                  type="button"
                  className="button danger"
                  disabled={confirmRestoreTypedText !== "RIPRISTINA" || backupActionLoading}
                  onClick={async () => {
                    if (confirmRestoreFilename) {
                      setBackupActionLoading(true);
                      setError("");
                      setStatus("");
                      setIsConfirmRestoreModalOpen(false);
                      try {
                        const res = await fetch("/api/settings/backup/restore", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ filename: confirmRestoreFilename })
                        });
                        const data = await res.json();
                        if (!res.ok) {
                          throw new Error(data.error ?? "Errore ripristino database");
                        }
                        setStatus("Database ripristinato con successo! Ricaricamento in corso...");
                        pushActivity(`Database ripristinato dal backup ${confirmRestoreFilename}`);
                        setTimeout(() => {
                          window.location.reload();
                        }, 1500);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Impossibile ripristinare il backup");
                        setBackupActionLoading(false);
                      }
                    } else if (confirmRestoreUploadedFile) {
                      setBackupActionLoading(true);
                      setError("");
                      setStatus("");
                      setIsConfirmRestoreModalOpen(false);
                      try {
                        const formData = new FormData();
                        formData.append("file", confirmRestoreUploadedFile);
                        const res = await fetch("/api/settings/backup/upload", {
                          method: "POST",
                          body: formData
                        });
                        const data = await res.json();
                        if (!res.ok) {
                          throw new Error(data.error ?? "Errore caricamento database");
                        }
                        setStatus("Database ripristinato con successo! Ricaricamento in corso...");
                        pushActivity(`Database ripristinato da file caricato: ${confirmRestoreUploadedFile.name}`);
                        setTimeout(() => {
                          window.location.reload();
                        }, 1500);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Impossibile ripristinare il database caricato");
                        setBackupActionLoading(false);
                      }
                    }
                  }}
                >
                  {backupActionLoading ? "Ripristino..." : "Conferma Ripristino"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
