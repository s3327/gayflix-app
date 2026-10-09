import ImportSearchBar from "@/components/admin/ImportSearchBar";

export default function ImportPage() {
  return (
    <div>
      <div className="px-6 pt-10 sm:px-10">
        <h1 className="font-display text-2xl font-bold">Import</h1>
      </div>

      <ImportSearchBar />

      {/* Results grid (10 columns × 4 rows, 40 cards, pagination) —
          not built yet, per instruction. */}
    </div>
  );
}
