import LibrarySearchBar from "@/components/admin/LibrarySearchBar";
import LibraryTable from "@/components/admin/LibraryTable";
import { libraryItems } from "@/lib/mock-library";

export default function LibraryMoviesPage() {
  const movies = libraryItems.filter((item) => item.type === "movie");

  return (
    <div className="pb-10">
      <div className="px-6 pt-10 sm:px-10">
        <h1 className="font-display text-2xl font-bold">Library — Movies</h1>
      </div>

      <LibrarySearchBar />
      <LibraryTable items={movies} />
    </div>
  );
}
