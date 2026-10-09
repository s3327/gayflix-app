import LibrarySearchBar from "@/components/admin/LibrarySearchBar";
import LibraryTable from "@/components/admin/LibraryTable";
import { libraryItems } from "@/lib/mock-library";

export default function LibrarySeriesPage() {
  const seriesItems = libraryItems.filter((item) => item.type === "series");

  return (
    <div className="pb-10">
      <div className="px-6 pt-10 sm:px-10">
        <h1 className="font-display text-2xl font-bold">Library — Series</h1>
      </div>

      <LibrarySearchBar />
      <LibraryTable items={seriesItems} showEpisodes />
    </div>
  );
}
