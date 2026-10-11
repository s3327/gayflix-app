import AddTitlePage from "@/components/admin/AddTitlePage";
import { requireAdmin } from "@/lib/session";

export default async function UploadMoviesPage() {
  await requireAdmin();
  return <AddTitlePage type="movie" />;
}
