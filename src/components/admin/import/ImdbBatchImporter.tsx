"use client";

import { useState, useRef, useMemo } from "react";
import Link from "next/link";
import {
  Upload,
  FileText,
  Play,
  Pause,
  Square,
  RotateCcw,
  Download,
  ExternalLink,
  Film,
  Tv,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { parseImdbExport, type ImdbExportResult } from "@/lib/imdb-csv";
import {
  calculateEta,
  chunkArray,
  filterImportItems,
  generateBatchReportCsv,
} from "@/lib/imdb-batch";
import {
  checkExistingImdbBatch,
  importImdbBatchChunk,
  type ImdbItemImportResult,
} from "@/lib/admin-imdb-batch-actions";
import { libraryPath } from "@/lib/title-form";

type RunnerStatus = "idle" | "running" | "paused" | "stopped" | "completed";

export default function ImdbBatchImporter() {
  const [activeInputTab, setActiveInputTab] = useState<"file" | "paste">("file");
  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);

  // Parsed dataset
  const [parsedData, setParsedData] = useState<ImdbExportResult | null>(null);
  const [existingImdbIds, setExistingImdbIds] = useState<Set<string>>(new Set());
  const [isCheckingExisting, setIsCheckingExisting] = useState(false);

  // Runner settings
  const [skipExisting, setSkipExisting] = useState(true);
  const [typeFilter, setTypeFilter] = useState<"all" | "movie" | "series">("all");
  const [chunkSize, setChunkSize] = useState(10);

  // Runner state
  const [runnerStatus, setRunnerStatus] = useState<RunnerStatus>("idle");
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [totalItemsToProcess, setTotalItemsToProcess] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [alreadyExistsCount, setAlreadyExistsCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [resultsLog, setResultsLog] = useState<ImdbItemImportResult[]>([]);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const isPausedRef = useRef(false);
  const isStoppedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compute items matching active filters
  const filteredItems = useMemo(() => {
    if (!parsedData || parsedData.items.length === 0) return [];
    return filterImportItems(parsedData.items, {
      skipExisting,
      existingIds: existingImdbIds,
      typeFilter,
    });
  }, [parsedData, skipExisting, existingImdbIds, typeFilter]);

  // Handle incoming file
  const handleFileUpload = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      handleContentParse(content);
    };
    reader.readAsText(file);
  };

  const handleContentParse = async (content: string) => {
    const result = parseImdbExport(content);
    setParsedData(result);
    setRunnerStatus("idle");
    setResultsLog([]);
    setProcessedCount(0);
    setImportedCount(0);
    setAlreadyExistsCount(0);
    setFailedCount(0);

    // Pre-check IDs against database in background
    if (result.items.length > 0) {
      setIsCheckingExisting(true);
      try {
        const ids = result.items.map((i) => i.imdbId);
        const checkRes = await checkExistingImdbBatch(ids);
        if (checkRes.ok) {
          setExistingImdbIds(new Set(checkRes.existingImdbIds.map((id) => id.toLowerCase())));
        }
      } finally {
        setIsCheckingExisting(false);
      }
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].name.endsWith(".csv")) {
      handleFileUpload(files[0]);
    }
  };

  // Start / Resume batch runner
  const startBatchRun = async (fromIndex = 0) => {
    const chunks = chunkArray(filteredItems, chunkSize);
    if (chunks.length === 0) return;

    setRunnerStatus("running");
    isPausedRef.current = false;
    isStoppedRef.current = false;

    let localProcessed = fromIndex === 0 ? 0 : processedCount;
    let localImported = fromIndex === 0 ? 0 : importedCount;
    let localExisting = fromIndex === 0 ? 0 : alreadyExistsCount;
    let localFailed = fromIndex === 0 ? 0 : failedCount;

    if (fromIndex === 0) {
      setTotalItemsToProcess(filteredItems.length);
      setProcessedCount(0);
      setImportedCount(0);
      setAlreadyExistsCount(0);
      setFailedCount(0);
      setResultsLog([]);
      setStartTime(Date.now());
      setElapsedMs(0);
    }

    const startTimestamp = startTime ?? Date.now();

    for (let i = fromIndex; i < chunks.length; i++) {
      if (isStoppedRef.current) {
        setRunnerStatus("stopped");
        break;
      }
      if (isPausedRef.current) {
        setCurrentChunkIndex(i);
        setRunnerStatus("paused");
        break;
      }

      setCurrentChunkIndex(i);
      const chunk = chunks[i];

      try {
        const res = await importImdbBatchChunk(chunk);
        if (res.ok) {
          localProcessed += chunk.length;
          localImported += res.importedCount;
          localExisting += res.alreadyExistsCount;
          localFailed += res.failedCount;

          setProcessedCount(localProcessed);
          setImportedCount(localImported);
          setAlreadyExistsCount(localExisting);
          setFailedCount(localFailed);

          setResultsLog((prev) => [...res.results, ...prev]);
        } else {
          localProcessed += chunk.length;
          localFailed += chunk.length;
          setProcessedCount(localProcessed);
          setFailedCount(localFailed);

          const errorResults: ImdbItemImportResult[] = chunk.map((item) => ({
            imdbId: item.imdbId,
            title: item.title,
            status: "failed",
            error: res.error || "Batch chunk failed",
          }));
          setResultsLog((prev) => [...errorResults, ...prev]);
        }
      } catch (err: unknown) {
        localProcessed += chunk.length;
        localFailed += chunk.length;
        setProcessedCount(localProcessed);
        setFailedCount(localFailed);

        const errorResults: ImdbItemImportResult[] = chunk.map((item) => ({
          imdbId: item.imdbId,
          title: item.title,
          status: "failed",
          error: err instanceof Error ? err.message : "Unexpected batch error",
        }));
        setResultsLog((prev) => [...errorResults, ...prev]);
      }

      setElapsedMs(Date.now() - startTimestamp);

      // If finished all chunks
      if (i === chunks.length - 1 && !isPausedRef.current && !isStoppedRef.current) {
        setRunnerStatus("completed");
      }
    }
  };

  const handlePause = () => {
    isPausedRef.current = true;
    setRunnerStatus("paused");
  };

  const handleResume = () => {
    startBatchRun(currentChunkIndex);
  };

  const handleStop = () => {
    isStoppedRef.current = true;
    setRunnerStatus("stopped");
  };

  const handleReset = () => {
    setRunnerStatus("idle");
    setParsedData(null);
    setFileName(null);
    setRawText("");
    setResultsLog([]);
    setProcessedCount(0);
    setImportedCount(0);
    setAlreadyExistsCount(0);
    setFailedCount(0);
  };

  // Download run report
  const handleDownloadReport = () => {
    if (resultsLog.length === 0) return;
    const csvContent = generateBatchReportCsv(resultsLog);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `imdb-import-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Progress metrics calculation
  const percentComplete =
    totalItemsToProcess > 0
      ? Math.min(100, Math.round((processedCount / totalItemsToProcess) * 100))
      : 0;

  const eta = calculateEta(totalItemsToProcess, processedCount, elapsedMs);

  const formatSeconds = (sec: number) => {
    if (sec <= 0) return "0s";
    const mins = Math.floor(sec / 60);
    const rem = sec % 60;
    if (mins === 0) return `${rem}s`;
    return `${mins}m ${rem}s`;
  };

  return (
    <div className="space-y-6">
      {/* File Upload & Input Area */}
      {!parsedData && (
        <div className="rounded-xl border border-border-subtle bg-bg-surface p-6 shadow-xs">
          <div className="flex border-b border-border-subtle pb-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveInputTab("file")}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
                  activeInputTab === "file"
                    ? "bg-bg-elevated text-brand-pink border border-border-subtle"
                    : "text-ink-secondary hover:text-ink-primary"
                }`}
              >
                <Upload className="h-4 w-4" />
                Upload IMDb CSV
              </button>
              <button
                type="button"
                onClick={() => setActiveInputTab("paste")}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
                  activeInputTab === "paste"
                    ? "bg-bg-elevated text-brand-pink border border-border-subtle"
                    : "text-ink-secondary hover:text-ink-primary"
                }`}
              >
                <FileText className="h-4 w-4" />
                Paste CSV or IMDb IDs
              </button>
            </div>
          </div>

          <div className="pt-6">
            {activeInputTab === "file" ? (
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border-strong bg-bg-base/60 p-10 text-center transition-colors hover:border-brand-pink/60 hover:bg-bg-elevated/40"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                  className="hidden"
                />
                <div className="rounded-full bg-brand-pink/10 p-3 text-brand-pink">
                  <Upload className="h-6 w-6" />
                </div>
                <h3 className="mt-3 text-sm font-bold text-ink-primary">
                  Click to select or drag &amp; drop your IMDb CSV
                </h3>
                <p className="mt-1 text-xs text-ink-muted">
                  Supports IMDb Watchlists, Ratings, and custom export CSV files (e.g. 1,600+ titles)
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Paste your IMDb CSV content or list of IMDb IDs (e.g. tt17076682, tt21110704...)"
                  rows={8}
                  className="w-full rounded-xl border border-border-subtle bg-bg-base p-4 font-mono text-xs text-ink-primary placeholder:text-ink-muted focus:border-brand-pink focus:outline-none"
                />
                <button
                  type="button"
                  disabled={!rawText.trim()}
                  onClick={() => handleContentParse(rawText)}
                  className="flex items-center gap-2 rounded-lg bg-brand-pink px-4 py-2 text-xs font-bold text-ink-onBrand hover:bg-brand-pink-light disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Analyze and Prepare Import
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dataset Summary & Configuration */}
      {parsedData && (
        <div className="space-y-6">
          <div className="rounded-xl border border-border-subtle bg-bg-surface p-6 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border-subtle pb-5">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-ink-primary">
                    {fileName ? fileName : "Parsed IMDb Dataset"}
                  </h2>
                  <span className="rounded-full bg-brand-pink/15 px-2.5 py-0.5 text-2xs font-bold text-brand-pink">
                    {parsedData.validCount.toLocaleString("en-US")} titles ready
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  Configure batch filters and chunk size, then start importing titles as drafts.
                </p>
              </div>

              {runnerStatus === "idle" && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-1.5 text-xs font-medium text-ink-secondary hover:text-ink-primary"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Upload different file
                </button>
              )}
            </div>

            {/* Metric Statistics */}
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="rounded-lg border border-border-subtle bg-bg-base p-3">
                <span className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
                  Total Titles
                </span>
                <p className="mt-1 text-lg font-bold text-ink-primary">
                  {parsedData.validCount.toLocaleString("en-US")}
                </p>
              </div>
              <div className="rounded-lg border border-border-subtle bg-bg-base p-3">
                <div className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
                  <Film className="h-3 w-3" /> Movies
                </div>
                <p className="mt-1 text-lg font-bold text-ink-primary">
                  {parsedData.movieCount.toLocaleString("en-US")}
                </p>
              </div>
              <div className="rounded-lg border border-border-subtle bg-bg-base p-3">
                <div className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
                  <Tv className="h-3 w-3" /> Series
                </div>
                <p className="mt-1 text-lg font-bold text-ink-primary">
                  {parsedData.seriesCount.toLocaleString("en-US")}
                </p>
              </div>
              <div className="rounded-lg border border-border-subtle bg-bg-base p-3">
                <span className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
                  Shorts
                </span>
                <p className="mt-1 text-lg font-bold text-ink-primary">
                  {parsedData.shortCount.toLocaleString("en-US")}
                </p>
              </div>
              <div className="rounded-lg border border-border-subtle bg-bg-base p-3">
                <span className="text-2xs font-semibold uppercase tracking-wider text-amber-400">
                  Already in Library
                </span>
                <p className="mt-1 text-lg font-bold text-ink-primary">
                  {isCheckingExisting ? (
                    <Loader2 className="h-4 w-4 animate-spin text-ink-muted" />
                  ) : (
                    existingImdbIds.size.toLocaleString("en-US")
                  )}
                </p>
              </div>
            </div>

            {/* Configuration Controls */}
            {runnerStatus === "idle" && (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border-subtle bg-bg-base p-4">
                <div className="flex flex-wrap items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-ink-primary">
                    <input
                      type="checkbox"
                      checked={skipExisting}
                      onChange={(e) => setSkipExisting(e.target.checked)}
                      className="h-4 w-4 rounded-sm border-border-strong bg-bg-surface accent-brand-pink"
                    />
                    Skip titles already in catalog ({existingImdbIds.size})
                  </label>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ink-muted">Type:</span>
                    <select
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value as "all" | "movie" | "series")}
                      className="rounded-md border border-border-subtle bg-bg-surface px-2.5 py-1 text-xs font-medium text-ink-primary"
                    >
                      <option value="all">All Media</option>
                      <option value="movie">Movies Only</option>
                      <option value="series">Series Only</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ink-muted">Chunk Size:</span>
                    <select
                      value={chunkSize}
                      onChange={(e) => setChunkSize(Number(e.target.value))}
                      className="rounded-md border border-border-subtle bg-bg-surface px-2.5 py-1 text-xs font-medium text-ink-primary"
                    >
                      <option value={10}>10 items/chunk</option>
                      <option value={15}>15 items/chunk</option>
                      <option value={20}>20 items/chunk</option>
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={filteredItems.length === 0}
                  onClick={() => startBatchRun(0)}
                  className="flex items-center gap-2 rounded-lg bg-brand-pink px-5 py-2 text-xs font-bold text-ink-onBrand shadow-xs hover:bg-brand-pink-light disabled:opacity-50"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Start Batch Import ({filteredItems.length.toLocaleString("en-US")} titles)
                </button>
              </div>
            )}
          </div>

          {/* Runner Active State & Live Progress Bar */}
          {runnerStatus !== "idle" && (
            <div className="rounded-xl border border-border-subtle bg-bg-surface p-6 shadow-xs space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      runnerStatus === "running"
                        ? "bg-brand-pink/20 text-brand-pink animate-pulse"
                        : runnerStatus === "completed"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-amber-500/20 text-amber-400"
                    }`}
                  >
                    {runnerStatus === "running" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : runnerStatus === "completed" ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Pause className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold capitalize text-ink-primary">
                      {runnerStatus === "running"
                        ? "Batch Import in Progress..."
                        : runnerStatus === "paused"
                          ? "Batch Import Paused"
                          : runnerStatus === "completed"
                            ? "Batch Import Completed!"
                            : "Batch Import Stopped"}
                    </h3>
                    <p className="text-xs text-ink-muted">
                      Processed {processedCount.toLocaleString("en-US")} of{" "}
                      {totalItemsToProcess.toLocaleString("en-US")} titles ({percentComplete}%)
                    </p>
                  </div>
                </div>

                {/* Control Action Buttons */}
                <div className="flex items-center gap-2">
                  {runnerStatus === "running" && (
                    <button
                      type="button"
                      onClick={handlePause}
                      className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-1.5 text-xs font-semibold text-ink-primary hover:bg-bg-elevated/80"
                    >
                      <Pause className="h-3.5 w-3.5" />
                      Pause
                    </button>
                  )}
                  {runnerStatus === "paused" && (
                    <button
                      type="button"
                      onClick={handleResume}
                      className="flex items-center gap-1.5 rounded-lg bg-brand-pink px-3.5 py-1.5 text-xs font-bold text-ink-onBrand hover:bg-brand-pink-light"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      Resume
                    </button>
                  )}
                  {(runnerStatus === "running" || runnerStatus === "paused") && (
                    <button
                      type="button"
                      onClick={handleStop}
                      className="flex items-center gap-1.5 rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-1.5 text-xs font-semibold text-status-error hover:bg-status-error/20"
                    >
                      <Square className="h-3.5 w-3.5 fill-current" />
                      Stop
                    </button>
                  )}
                  {(runnerStatus === "completed" || runnerStatus === "stopped") && (
                    <>
                      <Link
                        href="/admin/library?status=draft"
                        className="flex items-center gap-1.5 rounded-lg bg-brand-pink px-3.5 py-1.5 text-xs font-bold text-ink-onBrand hover:bg-brand-pink-light"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        View Drafts in Library
                      </Link>
                      <button
                        type="button"
                        onClick={handleDownloadReport}
                        className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-1.5 text-xs font-medium text-ink-primary hover:bg-bg-elevated/80"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download Report (.csv)
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Animated Progress Bar */}
              <div className="space-y-1.5">
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-bg-base">
                  <div
                    className="h-full bg-brand-pink transition-all duration-300 ease-out"
                    style={{ width: `${percentComplete}%` }}
                  />
                </div>
                <div className="flex justify-between text-2xs text-ink-muted">
                  <span>
                    {eta.itemsPerSecond > 0 ? `${eta.itemsPerSecond} titles/sec` : "Running..."}
                  </span>
                  <span>
                    {runnerStatus === "running" && eta.secondsRemaining > 0
                      ? `~${formatSeconds(eta.secondsRemaining)} remaining`
                      : runnerStatus === "completed"
                        ? "Done"
                        : ""}
                  </span>
                </div>
              </div>

              {/* Progress Count Badges */}
              <div className="grid grid-cols-3 gap-3">
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <div>
                    <span className="text-2xs uppercase tracking-wider font-semibold">
                      Drafts Created
                    </span>
                    <p className="text-base font-bold text-ink-primary">
                      {importedCount.toLocaleString("en-US")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-amber-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <div>
                    <span className="text-2xs uppercase tracking-wider font-semibold">
                      Already in Library
                    </span>
                    <p className="text-base font-bold text-ink-primary">
                      {alreadyExistsCount.toLocaleString("en-US")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-lg border border-status-error/20 bg-status-error/10 p-3 text-status-error">
                  <Square className="h-4 w-4 shrink-0" />
                  <div>
                    <span className="text-2xs uppercase tracking-wider font-semibold">
                      Failed / Skipped
                    </span>
                    <p className="text-base font-bold text-ink-primary">
                      {failedCount.toLocaleString("en-US")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Live Activity Feed Log */}
          {resultsLog.length > 0 && (
            <div className="rounded-xl border border-border-subtle bg-bg-surface p-6 shadow-xs">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
                  Recent Import Activity ({resultsLog.length.toLocaleString("en-US")})
                </h3>
                <button
                  type="button"
                  onClick={handleDownloadReport}
                  className="flex items-center gap-1 text-2xs font-semibold text-brand-pink hover:underline"
                >
                  <Download className="h-3 w-3" />
                  Export log (.csv)
                </button>
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-border-subtle rounded-lg border border-border-subtle bg-bg-base font-mono text-xs">
                {resultsLog.map((res, idx) => (
                  <div
                    key={`${res.imdbId}-${idx}`}
                    className="flex items-center justify-between gap-4 p-2.5 transition-colors hover:bg-bg-elevated/40"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wider ${
                          res.status === "imported"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : res.status === "already_exists"
                              ? "bg-amber-500/20 text-amber-400"
                              : "bg-status-error/20 text-status-error"
                        }`}
                      >
                        {res.status === "imported"
                          ? "Draft Created"
                          : res.status === "already_exists"
                            ? "In Library"
                            : "Failed"}
                      </span>
                      <span className="truncate font-sans font-semibold text-ink-primary">
                        {res.title}
                      </span>
                      <a
                        href={`https://www.imdb.com/title/${res.imdbId}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-3xs text-ink-muted hover:text-ink-brand flex items-center gap-0.5"
                      >
                        {res.imdbId}
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </div>

                    <div className="shrink-0 text-2xs">
                      {res.status === "imported" && res.mediaId ? (
                        <Link
                          href={`${libraryPath(res.mediaType ?? "movie")}/${res.mediaId}`}
                          className="flex items-center gap-1 font-sans text-brand-pink hover:underline"
                        >
                          Review draft
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      ) : res.error ? (
                        <span className="text-3xs text-status-error max-w-xs truncate" title={res.error}>
                          {res.error}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
