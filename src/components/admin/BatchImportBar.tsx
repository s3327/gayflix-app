"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Import, Check, Loader2 } from "lucide-react";
import { importMultipleTitles } from "@/lib/admin-import-actions";

export default function BatchImportBar() {
  const router = useRouter();
  const [selectedCount, setSelectedCount] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleCheckChange = () => {
      const checked = document.querySelectorAll<HTMLInputElement>('input[name="tmdbIds"]:checked');
      setSelectedCount(checked.length);
    };

    document.addEventListener("change", handleCheckChange);
    return () => document.removeEventListener("change", handleCheckChange);
  }, []);

  const handleBatchImport = () => {
    const checked = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[name="tmdbIds"]:checked')
    ).map((cb) => cb.value);

    if (checked.length === 0) return;

    startTransition(async () => {
      const res = await importMultipleTitles(checked);
      if (res.ok) {
        setMessage(`Successfully imported ${res.imported} titles!`);
        setTimeout(() => {
          router.refresh();
        }, 800);
      }
    });
  };

  if (selectedCount === 0 && !message) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full border border-border-strong bg-bg-surface/95 px-5 py-2.5 shadow-2xl backdrop-blur-md flex items-center gap-3">
      {message ? (
        <span className="flex items-center gap-1.5 text-xs font-semibold text-status-success">
          <Check className="h-4 w-4" />
          {message}
        </span>
      ) : (
        <>
          <span className="text-xs font-semibold text-ink-primary">
            {selectedCount} {selectedCount === 1 ? "title" : "titles"} selected
          </span>
          <button
            type="button"
            disabled={isPending}
            onClick={handleBatchImport}
            className="flex items-center gap-1.5 rounded-full bg-brand-pink px-3.5 py-1 text-xs font-bold text-ink-onBrand hover:bg-brand-pink-light disabled:opacity-60 shadow-xs"
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Import className="h-3.5 w-3.5" />
            )}
            Import in batch
          </button>
        </>
      )}
    </div>
  );
}

